import { logger, LogLevel } from '../../logger.js';
import type { FrameworkAdapter } from '../../config.js';
import { BRAND, FRAMEWORKS } from '../../constants.js';
import { runCommand } from '../../utils/processUtils.js';
import { CliError } from '../../cliError.js';
import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { isModulePresent } from '../../utils/moduleUtils.js';
import { dirname, join, resolve } from 'path';
import { copyFile } from 'fs/promises';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface AngularProjectConfig {
    name: string;
    root: string;
    sourceRoot: string;
    architect?: {
        build?: {
            options?: {
                outputPath?: string;
                outputMode?: 'server' | 'static';
                main?: string;
                tsConfig?: string;
            };
        };
    };
}

export interface AngularConfig {
    projects: Record<string, AngularProjectConfig>;
    defaultProject?: string;
}

let angularConfig: AngularConfig | undefined;
let outputMode: 'server' | 'static' | undefined;

/**
 * The framework adapter for the Angular
 */
export const angularFrameworkAdapter: FrameworkAdapter = {
    name: FRAMEWORKS.Angular,
    hooks: {
        'build:start': async ({ config }) => {
            // Load Angular config to get project-specific settings
            angularConfig = await loadAngularConfig();
            if (Object.keys(angularConfig.projects).length === 0) {
                throw new CliError(`No projects found in Angular config. Please specify the projects in your 'angular.json' file.`);
            }
            const angularProjectName = angularConfig.defaultProject || Object.keys(angularConfig.projects)[0];
            if (!angularConfig.defaultProject) {
                logger.info('No default project found in Angular config. Using first project as default...');
            }
            const angularProjectConfig = angularConfig.projects[angularProjectName];
            if (!angularProjectConfig) {
                throw new CliError(`Project '${angularProjectName}' does not exist in 'angular.json' file. Please specify correct project name.`);
            }

            outputMode = angularProjectConfig.architect?.build?.options?.outputMode || 'static';
            logger.info(`Angular project: ${angularProjectName} (output mode: ${outputMode})`);

            if (config.skipFrameworkBuild) {
                logger.info(`Skipping Angular build and using existing build output...`);
            } else {
                try {
                    logger.info('Building Angular...');
                    await runCommand(config.buildCommand || `npx ng build`);
                } catch (e) {
                    throw new CliError(`Failed to build Angular project: ${e}`);
                }
            }

            const outDir = angularProjectConfig.architect?.build?.options?.outputPath || `dist/${angularProjectName}`;
            if (!existsSync(outDir)) {
                throw new CliError(
                    `Angular build output directory '${outDir}' does not exist. Please make sure the build was successful.` +
                        `Please try the following steps to fix the issue:\r\n` +
                        `- Make sure the build was successful.\r\n` +
                        `- Change the architect.build.options.outputPath option in your 'angular.json' back to default 'dist/${angularProjectName}' name, so ${BRAND} can find it.\r\n`,
                );
            }
            const assetsOutDir = join(outDir, 'browser');
            const serverOutDir = join(outDir, 'server');

            // Configure app if output mode is server
            if (outputMode === 'server') {
                if (!existsSync(join(serverOutDir, 'server.mjs'))) {
                    throw new CliError(
                        `Angular server build file '${join(serverOutDir, 'server.mjs')}' does not exist. ` +
                            `Please try the following steps to fix the issue:\r\n` +
                            `- Make sure the build was successful.\r\n` +
                            `- Set your architect.build.options.ssr.entry back to default 'server.mjs' in your 'angular.json' file.\r\n`,
                    );
                }

                // Copy the ownstak entrypoint with HTTP server to the angular build directory
                await copyFile(resolve(__dirname, '..', '..', 'templates', 'angular', 'ownstak.entrypoint.js'), join(serverOutDir, 'ownstak.entrypoint.mjs'));

                // Set entrypoint to the ownstak entrypoint file and include/copy all dependencies.
                // The entrypoint file creates HTTP server with the Angular Request handler from the index.js file.
                config.app.entrypoint = config.app.entrypoint || join(serverOutDir, 'ownstak.entrypoint.mjs');
                config.app.copyDependencies = true;
                config.app.include[serverOutDir] = true;
                config.app.include[assetsOutDir] = false;
            }

            // Configure assets
            config.assets.convertHtmlToFolders = true;
            config.assets.include[assetsOutDir] = './';
            config.assets.include[serverOutDir] = false;
        },
        'build:routes:finish': async ({ config }) => {
            if (outputMode === 'server') {
                // Proxy all other requests to the Angular server
                config.router.any([
                    {
                        type: 'serveApp',
                        description: 'Serve Angular server by default',
                    },
                ]);
            } else {
                // Configure static SPA index.html page in static mode
                config.router.any([
                    {
                        type: 'serveAsset',
                        path: `/index.html`,
                        description: 'Serve Angular static SPA index.html page by default',
                    },
                ]);
            }
        },
        'dev:start': async ({ config }) => {
            try {
                logger.info('Starting Angular development server...');
                await runCommand(config.devCommand || `npx ng serve --port ${process.env.PORT || '3000'}`);
            } catch (e) {
                throw new CliError(`Failed to start Angular development server: ${e}`);
            }
        },
    },
    async isPresent() {
        const dependencies = ['@angular/core', '@angular/cli', '@angular/common'];
        for (const dependency of dependencies) {
            if (await isModulePresent(dependency)) return true;
        }
        return false;
    },
};

/**
 * Loads Angular configuration from angular.json file
 */
async function loadAngularConfig(): Promise<AngularConfig> {
    logger.debug('Loading Angular config...');
    const angularConfigPath = [resolve('angular.json')].find(existsSync);
    if (!angularConfigPath) {
        logger.debug('No Angular config file found, using default config...');
        return { projects: {} };
    }

    try {
        return JSON.parse(await readFile(angularConfigPath, 'utf-8'));
    } catch (e) {
        logger.drawTable(
            [
                `${BRAND} failed to load the Angular config from '${angularConfigPath}' file.`,
                `The customized 'outputPath', 'main' or 'tsConfig' config options won't work.`,
                `The ${BRAND} will look for the Angular build output in the default 'dist' directory.`,
                `Please run the build command again with the --debug flag to see more details.`,
            ],
            {
                logLevel: LogLevel.WARN,
                title: 'Warning',
            },
        );
        logger.debug(`Angular config error: ${e}`);
        return { projects: {} };
    }
}
