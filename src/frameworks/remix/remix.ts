import { logger, LogLevel } from '../../logger.js';
import type { FrameworkAdapter } from '../../config.js';
import { BRAND, FRAMEWORKS } from '../../constants.js';
import { runCommand } from '../../utils/processUtils.js';
import { CliError } from '../../cliError.js';
import { bundleRequire } from 'bundle-require';
import { existsSync } from 'fs';
import { writeFile, copyFile } from 'fs/promises';
import { join, resolve, dirname, basename as filename } from 'path';
import chalk from 'chalk';
import { fileURLToPath } from 'url';
import { isModulePresent, installDependency } from '../../utils/moduleUtils.js';
import { normalizePath } from '../../utils/pathUtils.js';

/**
 * See: https://remix.run/docs/en/main/file-conventions/remix-config
 */
export interface RemixConfig {
    // Vite plugin options
    basename?: string;
    appDirectory?: string;
    buildDirectory?: string;
    serverBuildFile?: string;
    serverModuleFormat?: 'esm' | 'cjs';
    serverPlatform?: 'node' | 'neutral';

    // Classic builder options
    assetsBuildDirectory?: string;
    serverBuildPath?: string;
    publicPath?: string;
}

let basename: string = '/';
let outputMode: 'server' | 'static' = 'static';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * The Remix framework is now rebranded as React Router v7.
 * We still maintain the separate adapter for the old Remix v2
 * with the similar logic as the React Router v7 adapter,
 * so we don't accidentally break the support for the older Remix v2.
 *
 * Remix is not receiving any new features aor updates.
 * This adapter is going to stay like this.
 */
export const remixFrameworkAdapter: FrameworkAdapter = {
    name: FRAMEWORKS.Remix,
    hooks: {
        'build:start': async ({ config }) => {
            const builder = getViteConfigPath() ? 'vite' : 'classic';
            logger.info(`Detected Remix builder: ${builder}`);

            const remixConfig = await loadRemixConfig();
            const publicPath = remixConfig.publicPath?.startsWith('/') ? remixConfig.publicPath : `/build/`;
            const buildDirectory = builder === 'vite' ? remixConfig.buildDirectory || 'build' : dirname(remixConfig.serverBuildPath || `build/index.js`);
            const clientBuildDirectory = builder === 'vite' ? `${buildDirectory}/client` : remixConfig.assetsBuildDirectory || `public/build/`;
            const serverBuildDirectory = builder === 'vite' ? `${buildDirectory}/server` : dirname(remixConfig.serverBuildPath || `build/index.js`);
            const serverBuildFile = builder === 'vite' ? remixConfig.serverBuildFile || 'index.js' : filename(remixConfig.serverBuildPath || `index.js`);
            const serverBuildPackageJson = join(serverBuildDirectory, 'package.json');
            const serverModuleFormat = remixConfig.serverModuleFormat || 'esm';

            logger.debug(`Remix config: ${JSON.stringify(remixConfig, null, 2)}`);
            logger.debug(`Build directory: ${buildDirectory}`);
            logger.debug(`Client build directory: ${clientBuildDirectory}`);
            logger.debug(`Server build directory: ${serverBuildDirectory}`);
            logger.debug(`Server build file: ${serverBuildFile}`);
            logger.debug(`Server build package.json: ${serverBuildPackageJson}`);
            logger.debug(`Server module format: ${serverModuleFormat}`);

            // Construct normalized base path: docs => /docs/, /docs => /docs/, '' => '/'
            basename = normalizePath(`/${remixConfig.basename ?? ''}/`);

            if (!(await isModulePresent('@remix-run/node'))) {
                try {
                    logger.info('The @remix-run/node adapter was not found. Installing...');
                    await installDependency('@remix-run/node');
                } catch (e) {
                    throw new CliError(
                        `Failed to install @remix-run/node adapter: ${e}\r\n` +
                            `Please install it manually: ${chalk.cyan(`npm i @remix-run/node`)}\r\n` +
                            `See more at: ${chalk.cyan(`https://remix.run/docs/en/main/other-api/node`)}`,
                    );
                }
            }

            if (config.skipFrameworkBuild) {
                logger.info(`Skipping Remix build and using existing build output...`);
            } else {
                try {
                    logger.info('Building Remix...');
                    await runCommand(config.buildCommand || `npx remix ${builder === 'vite' ? 'vite:build' : 'build'}`);
                } catch (e) {
                    throw new CliError(`Failed to build Remix project: ${e}`);
                }
            }

            if (!existsSync(serverBuildDirectory)) {
                throw new CliError(
                    `The ${BRAND} failed to find '${serverBuildDirectory}' directory with the Remix build output. ` +
                        `Please try the following steps to fix the issue:\r\n` +
                        `- Make sure that '${buildDirectory}' directory exists and the build was successful.\r\n` +
                        `- Create 'remix.config.js' file first and define 'buildDirectory' option or change the 'buildDirectory' back to default 'build' name, so ${BRAND} can find it.\r\n` +
                        `- If you use Remix v2 with Vite, please change the remix() plugin 'buildDirectory' option back to default 'build' name, so ${BRAND} can find it.\r\n`,
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

            // Include remix.config.mjs in debugAssets for debugging
            config.debugAssets.include[`./remix.config.{js,ts,mjs,cjs}`] = true;

            // Configure assets
            config.assets.convertHtmlToFolders = true;
            config.assets.include.public = './';
            config.assets.include[clientBuildDirectory] = `.${publicPath}`;
            config.assets.include[join(clientBuildDirectory, '**', '*.{html,json}')] = `.${basename}`;

            // Configure app if SSR is enabled
            if (outputMode === 'server') {
                // Create a copy of the server build file with index.js name in the remix build directory
                await copyFile(resolve(serverBuildDirectory, serverBuildFile), resolve(serverBuildDirectory, 'index.js'));
                // Copy the ownstak entrypoint with HTTP server to the remix build directory
                await copyFile(resolve(__dirname, '..', '..', 'templates', 'remix', 'ownstak.entrypoint.js'), resolve(serverBuildDirectory, 'entrypoint.mjs'));

                // Set entrypoint to the ownstak entrypoint file and include/copy all dependencies.
                // The entrypoint file creates HTTP server with the Remix Request handler from the index.js file.
                config.app.entrypoint = config.app.entrypoint || join(serverBuildDirectory, 'entrypoint.mjs');
                config.app.include[buildDirectory] = true;
                config.app.include[clientBuildDirectory] = false;
                config.app.include['node_modules/@remix-run'] = true;
                config.app.include['node_modules/@remix-run/dev'] = false;
                config.app.include['node_modules/remix-run'] = true;
                config.app.copyDependencies = true;
            }
        },
        'build:routes:finish': async ({ config }) => {
            if (outputMode === 'server') {
                // Proxy all other requests to the Remix SSR server if SSR is enabled
                config.router.any([
                    {
                        type: 'serveApp',
                        description: 'Serve Remix SSR server by default',
                    },
                ]);
            } else {
                // Configure static not found page if SSR is disabled
                config.router.any([
                    {
                        type: 'serveAsset',
                        path: `${basename}404.html`,
                        description: 'Serve Remix static not found page by default',
                    },
                ]);
            }
        },
        'build:finish': () => {
            logger.info('');
            logger.drawTable(
                [
                    `Remix v2 is no longer receiving any updates. The Remix project was renamed to React Router v7 with similar API. ` +
                        `If you're starting a new ${BRAND} project, please use React Router v7 instead. \r\n\r\n` +
                        `See more at: ${chalk.cyan(`https://docs.ownstak.com/frameworks/react-router`)}`,
                ],
                {
                    title: `Support notice`,
                    logLevel: LogLevel.WARN,
                    maxWidth: 65,
                },
            );
        },
        'dev:start': async ({ config }) => {
            try {
                logger.info('Starting Remix development server...');
                await runCommand(config.devCommand || `npx remix dev --port ${process.env.PORT || '3000'}`);
            } catch (e) {
                throw new CliError(`Failed to start Remix development server: ${e}`);
            }
        },
    },
    async isPresent() {
        return (await isModulePresent('remix')) || (await isModulePresent('@remix-run/dev'));
    },
};

async function loadRemixConfig(): Promise<RemixConfig> {
    // Try to get the Remix plugin config from the Vite config
    logger.debug('Loading Remix config from Vite config...');
    const viteConfigPath = getViteConfigPath();
    if (viteConfigPath) {
        try {
            const { mod: viteConfigMod } = await bundleRequire({
                filepath: viteConfigPath,
                externalNodeModules: true,
                format: 'cjs',
            });
            const viteConfig = viteConfigMod.default?.default || viteConfigMod.default || viteConfigMod;
            const viteConfigOutput = typeof viteConfig === 'function' ? await viteConfig() : viteConfig;
            const viteConfigPlugins = viteConfigOutput?.plugins.flat() || [];

            const remixPlugin = viteConfigPlugins.find((plugin: any) => plugin.name === 'remix');
            const remixPluginConfig = await remixPlugin.config({}, { command: 'build', mode: 'production' });
            const remixConfig = remixPluginConfig?.__remixPluginContext?.remixConfig || {};

            if (Object.keys(remixConfig).length === 0) {
                throw new CliError(`Remix config is empty`);
            }

            return remixConfig;
        } catch (e) {
            logger.drawTable(
                [
                    `${BRAND} failed to load the Remix plugin config from '${viteConfigPath}' file.`,
                    `The customized 'basename', 'buildDirectory' or 'serverBuildFile' config options won't work.`,
                    `The ${BRAND} will look for the Remix build output in the default 'build' directory.`,
                    `Please run the build command again with the --debug flag to see more details.`,
                ],
                {
                    logLevel: LogLevel.WARN,
                    title: 'Warning',
                },
            );
            logger.debug(`Vite config error: ${e}`);
        }
    }

    // Try to load the Remix config from the remix.config.js file.
    // This config file is optional and used for remix setup with Classic Remix Compiler.
    const remixConfigPath = getRemixConfigPath();
    if (remixConfigPath) {
        try {
            const { mod: remixConfigModule } = await bundleRequire({
                filepath: remixConfigPath,
                externalNodeModules: true,
                format: 'cjs',
            });
            const remixConfig = remixConfigModule.default?.default || remixConfigModule.default || remixConfigModule;
            const remixConfigOutput = typeof remixConfig === 'function' ? await remixConfig() : remixConfig;
            return remixConfigOutput;
        } catch (e: any) {
            logger.drawTable(
                [
                    `${BRAND} failed to load the Remix config from '${remixConfigPath}' file.`,
                    `The customized 'assetsBuildDirectory', or 'serverBuildPath' config options won't work.`,
                    `The ${BRAND} will look for the Remix build output in the default 'build' directory.`,
                    `Please run the build command again with the --debug flag to see more details.`,
                ],
                {
                    logLevel: LogLevel.WARN,
                    title: 'Warning',
                },
            );
            logger.debug(`Remix config error: ${e.message}`);
            logger.debug(`Stack: ${e.stack}`);
        }
    }

    return {};
}

function getViteConfigPath() {
    return [resolve('vite.config.ts'), resolve('vite.config.mjs'), resolve('vite.config.cjs'), resolve('vite.config.js')].find(existsSync);
}

function getRemixConfigPath() {
    return [resolve('remix.config.ts'), resolve('remix.config.mjs'), resolve('remix.config.cjs'), resolve('remix.config.js')].find(existsSync);
}
