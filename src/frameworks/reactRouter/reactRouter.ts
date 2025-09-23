import { logger, LogLevel } from '../../logger.js';
import type { FrameworkAdapter } from '../../config.js';
import { BRAND, FRAMEWORKS } from '../../constants.js';
import { runCommand } from '../../utils/processUtils.js';
import { CliError } from '../../cliError.js';
import { bundleRequire } from 'bundle-require';
import { existsSync } from 'fs';
import { writeFile, copyFile } from 'fs/promises';
import { join, resolve, dirname } from 'path';
import chalk from 'chalk';
import { fileURLToPath } from 'url';
import { isModulePresent, installDependency } from '../../utils/moduleUtils.js';
import { normalizePath } from '../../utils/pathUtils.js';

export interface ReactRouterConfig {
    basename?: string;
    appDirectory?: string;
    buildDirectory?: string;
    serverBuildFile?: string;
    serverModuleFormat?: 'esm' | 'cjs';
    ssr?: boolean;
}

let basename: string = '/';
let outputMode: 'server' | 'static' = 'static';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * The framework adapter for the React Router v7 (formerly Remix)
 * (both SSR and Static output modes)
 */
export const reactRouterFrameworkAdapter: FrameworkAdapter = {
    name: FRAMEWORKS.ReactRouter,
    hooks: {
        'build:start': async ({ config }) => {
            const reactRouterConfig = await loadReactRouterConfig();
            const buildDirectory = reactRouterConfig.buildDirectory || 'build';
            const clientBuildDirectory = `${buildDirectory}/client`;
            const serverBuildDirectory = `${buildDirectory}/server`;
            const serverBuildPackageJson = join(serverBuildDirectory, 'package.json');
            const serverBuildFile = reactRouterConfig.serverBuildFile || 'index.js';
            const serverModuleFormat = reactRouterConfig.serverModuleFormat || 'esm';

            // Construct normalized base path: docs => /docs/, /docs => /docs/, '' => '/'
            basename = normalizePath(`/${reactRouterConfig.basename ?? ''}/`);

            logger.debug(`React Router config: ${JSON.stringify(reactRouterConfig, null, 2)}`);
            logger.debug(`Basename: ${basename}`);
            logger.debug(`Build directory: ${buildDirectory}`);
            logger.debug(`Client build directory: ${clientBuildDirectory}`);
            logger.debug(`Server build directory: ${serverBuildDirectory}`);
            logger.debug(`Server build package.json: ${serverBuildPackageJson}`);
            logger.debug(`Server build file: ${serverBuildFile}`);
            logger.debug(`Server module format: ${serverModuleFormat}`);

            if (!(await isModulePresent('@react-router/node'))) {
                try {
                    logger.info('The @react-router/node adapter was not found. Installing...');
                    await installDependency('@react-router/node');
                } catch (e) {
                    throw new CliError(
                        `Failed to install @react-router/node adapter: ${e}\r\n` +
                            `Please install it manually: ${chalk.cyan(`npm i @react-router/node`)}\r\n` +
                            `See more at: ${chalk.cyan(`https://reactrouter.com/docs/en/react-router-config`)}`,
                    );
                }
            }

            if (config.skipFrameworkBuild) {
                logger.info(`Skipping React Router build and using existing build output...`);
            } else {
                try {
                    logger.info('Building React Router...');
                    await runCommand(config.buildCommand || `npx react-router build`);
                } catch (e) {
                    throw new CliError(`Failed to build React Router project: ${e}`);
                }
            }

            if (!existsSync(serverBuildDirectory)) {
                throw new CliError(
                    `The ${BRAND} failed to find '${serverBuildDirectory}' directory with the React Router build output. ` +
                        `Please try the following steps to fix the issue:\r\n` +
                        `- Make sure that '${buildDirectory}' directory exists and the build was successful.\r\n` +
                        `- Create 'react-router.config.js' file first and define 'buildDirectory' option or change the 'buildDirectory' back to default 'build' name, so ${BRAND} can find it.\r\n`,
                );
            }

            // Create package.json with correct module format if it doesn't exist
            outputMode = existsSync(serverBuildDirectory) ? 'server' : 'static';
            if (outputMode === 'server' && !existsSync(serverBuildPackageJson)) {
                await writeFile(
                    serverBuildPackageJson,
                    JSON.stringify({
                        type: serverModuleFormat === 'esm' ? 'module' : 'commonjs',
                    }),
                );
            }

            // Include astro.config.mjs in debugAssets for debugging
            config.debugAssets.include[`./react-router.config.{js,ts,mjs,cjs}`] = true;

            // Configure assets
            config.assets.convertHtmlToFolders = true;
            config.assets.include[clientBuildDirectory] = `./`;
            config.assets.include[join(clientBuildDirectory, '**', '*.{html,json}')] = `.${basename}`;

            // Configure app if SSR is enabled
            if (outputMode === 'server') {
                // Create a copy of the server build file with index.js name in the react-router build directory
                await copyFile(resolve(serverBuildDirectory, serverBuildFile), join(serverBuildDirectory, 'index.js'));
                // Copy the ownstak entrypoint with HTTP server to the react-router build directory
                await copyFile(
                    resolve(__dirname, '..', '..', 'templates', 'reactRouter', 'ownstak.entrypoint.js'),
                    join(serverBuildDirectory, 'entrypoint.mjs'),
                );

                // Set entrypoint to the ownstak entrypoint file and include/copy all dependencies.
                // The entrypoint file creates HTTP server with the React Router Request handler from the index.js file.
                config.app.entrypoint = config.app.entrypoint || join(serverBuildDirectory, 'entrypoint.mjs');
                config.app.include[buildDirectory] = true;
                config.app.include[clientBuildDirectory] = false;
                config.app.include['node_modules/@react-router'] = true;
                config.app.include['node_modules/@react-router/dev'] = false;
                config.app.include['node_modules/react-router'] = true;
                config.app.copyDependencies = true;
            }
        },
        'build:routes:finish': async ({ config }) => {
            if (outputMode === 'server') {
                // Proxy all other requests to the React Router SSR server if SSR is enabled
                config.router.any([
                    {
                        type: 'serveApp',
                        description: 'Serve React Router SSR server by default',
                    },
                ]);
            } else {
                // Configure static not found page if SSR is disabled
                config.router.any([
                    {
                        type: 'serveAsset',
                        path: `${basename}404.html`,
                        description: 'Serve React Router static not found page by default',
                    },
                ]);
            }
        },
        'dev:start': async ({ config }) => {
            try {
                logger.info('Starting React Router development server...');
                await runCommand(config.devCommand || `npx react-router dev --port ${process.env.PORT || '3000'}`);
            } catch (e) {
                throw new CliError(`Failed to start React Router development server: ${e}`);
            }
        },
    },
    async isPresent() {
        return (await isModulePresent('react-router')) || (await isModulePresent('@react-router/dev'));
    },
};

async function loadReactRouterConfig(): Promise<ReactRouterConfig> {
    const reactRouterConfigPath = [
        resolve('react-router.config.ts'),
        resolve('react-router.config.mjs'),
        resolve('react-router.config.cjs'),
        resolve('react-router.config.js'),
    ].find(existsSync);
    if (!reactRouterConfigPath) {
        // react-router.config.js is optional file, we fallback to config defaults
        // if the file doesn't exist
        return {};
    }

    try {
        const { mod: reactRouterConfigModule } = await bundleRequire({
            filepath: reactRouterConfigPath,
        });
        const reactRouterConfig = reactRouterConfigModule.default?.default || reactRouterConfigModule.default || reactRouterConfigModule;

        if (typeof reactRouterConfig === 'function') {
            return reactRouterConfig();
        }
        return reactRouterConfig;
    } catch (e: any) {
        logger.drawTable(
            [
                `${BRAND} failed to load the React Router config from '${reactRouterConfigPath}' file.`,
                `The customized 'basename', 'buildDirectory' or 'serverBuildFile' config options won't work.`,
                `The ${BRAND} will look for the React Router build output in the default 'build' directory.`,
                `Please run the build command again with the --debug flag to see more details.`,
            ],
            {
                logLevel: LogLevel.WARN,
                title: 'Warning',
            },
        );
        logger.debug(`React Router config error: ${e.message}`);
        logger.debug(`Stack: ${e.stack}`);
    }

    return {};
}
