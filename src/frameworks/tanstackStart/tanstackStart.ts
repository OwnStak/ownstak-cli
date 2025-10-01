import { logger, LogLevel } from '../../logger.js';
import type { FrameworkAdapter } from '../../config.js';
import { BRAND, FRAMEWORKS } from '../../constants.js';
import { runCommand } from '../../utils/processUtils.js';
import { CliError } from '../../cliError.js';
import { existsSync } from 'fs';
import { copyFile } from 'fs/promises';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { isModulePresent } from '../../utils/moduleUtils.js';
import { createRequire } from 'module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface TanstackViteConfig {
    build?: {
        outDir?: string; // e.g. "dist"
        assetsDir?: string; // e.g. "assets"
    };
}

let outputMode: 'server' | 'static' = 'static';

/**
 * The framework adapter for the Tanstack Start
 */
export const tanstackStartFrameworkAdapter: FrameworkAdapter = {
    name: FRAMEWORKS.TanstackStart,
    hooks: {
        'build:start': async ({ config }) => {
            if (config.skipFrameworkBuild) {
                logger.info(`Skipping Tanstack Start build and using existing build output...`);
            } else {
                try {
                    logger.info('Building Tanstack Start...');
                    await runCommand(config.buildCommand || `npx vite build`);
                } catch (e) {
                    throw new CliError(`Failed to build Tanstack Start project: ${e}`);
                }
            }

            const tanstackViteConfig = await loadTanstackViteConfig();
            const outDir = tanstackViteConfig.build?.outDir || 'dist';
            if (!existsSync(outDir)) {
                throw new CliError(
                    `The ${BRAND} failed to find '${outDir}' directory with the Tanstack Start build output. ` +
                        `Please try the following steps to fix the issue:\r\n` +
                        `- Make sure that '${outDir}' directory exists and the build was successful.\r\n` +
                        `- Create 'vite.config.js' file first and define 'build.outDir' option or change the 'build.outDir' back to default 'dist' name, so ${BRAND} can find it.\r\n`,
                );
            }

            outputMode = existsSync(join(outDir, 'server')) ? 'server' : 'static';
            const clientOutDir = outputMode === 'server' ? join(outDir, 'client') : outDir;
            const serverOutDir = outputMode === 'server' ? join(outDir, 'server') : outDir;

            // Verify that the server.js file is present
            // to catch most of the errors during the build and give users exact instructions how to fix it.
            const serverPath = [join(serverOutDir, 'server.js'), join(serverOutDir, 'server.mjs'), join(serverOutDir, 'server.cjs')].find(existsSync);
            if (!serverPath) {
                throw new CliError(
                    `The Tanstack Start server.js file was not found inside the output directory '${serverOutDir}'. ` +
                        `Please try the following steps to fix the issue:\r\n` +
                        `- Make sure the build was successful.\r\n` +
                        `- Rename your entry file inside 'vite.config.js' back to default 'server.js'.\r\n` +
                        '- Install @tanstack/react-start or @tanstack/solid-start into project and put it into your vite.config.js: npm i @tanstack/react-start\r\n' +
                        `\r\n` +
                        `Example vite.config.js: \r\n` +
                        `import { tanstackStart } from '@tanstack/react-start/plugin/vite';\r\n` +
                        `\r\n` +
                        `export default {\r\n` +
                        `  plugins: [tanstackStart({ server: { entry: './server.js' } })],\r\n` +
                        `};\r\n`,
                );
            }

            // Tanstack Start in server mode with server-side rendered pages
            if (outputMode === 'server') {
                // Copy the ownstak entrypoint with HTTP server to the tanstack start build directory
                await copyFile(
                    resolve(__dirname, '..', '..', 'templates', 'tanstackStart', 'ownstak.entrypoint.js'),
                    resolve(serverOutDir, 'ownstak.entrypoint.mjs'),
                );

                // Set entrypoint to the ownstak entrypoint file and include/copy all dependencies.
                // The entrypoint file creates HTTP server with the Tanstack Start Request handler from the server.js file.
                config.app.entrypoint = config.app.entrypoint || join(serverOutDir, 'ownstak.entrypoint.mjs');
                config.app.copyDependencies = true;

                // Configure app
                config.app.include[serverOutDir] = true;
                config.app.include[clientOutDir] = false;
            }

            // Include vite.config.js in debugAssets for debugging
            config.debugAssets.include[`./vite.config.{js,ts,mjs,cjs}`] = true;

            // Configure static assets
            config.assets.convertHtmlToFolders = true;
            config.assets.include[clientOutDir] = `./`;
        },
        'build:routes:finish': ({ config }) => {
            if (outputMode === 'server') {
                // Proxy all other requests to the Tanstack Start server
                config.router.any([
                    {
                        type: 'serveApp',
                        description: 'Serve Tanstack Start server by default',
                    },
                ]);
            } else {
                // Configure static not found page in static mode
                config.router.any([
                    {
                        type: 'serveAsset',
                        path: `/404.html`,
                        description: 'Serve Tanstack Start static not found page by default',
                    },
                    {
                        type: 'setResponseStatus',
                        statusCode: 404,
                    },
                ]);
            }
        },
        'dev:start': async ({ config }) => {
            try {
                logger.info('Starting Tanstack Start development server...');
                await runCommand(config.devCommand || `npx vite dev --port ${process.env.PORT || '3000'}`);
            } catch (e) {
                throw new CliError(`Failed to start Tanstack Start development server: ${e}`);
            }
        },
    },
    async isPresent() {
        const dependencies = ['@tanstack/start', '@tanstack/react-start', '@tanstack/solid-start'];
        for (const dependency of dependencies) {
            if (await isModulePresent(dependency)) return true;
        }
        return false;
    },
};

async function loadTanstackViteConfig(): Promise<TanstackViteConfig> {
    // Try to get the Tanstack Start plugin config from the Vite config
    logger.debug('Loading Tanstack Start Vite config...');
    const viteConfigPath = [resolve('vite.config.ts'), resolve('vite.config.mjs'), resolve('vite.config.cjs'), resolve('vite.config.js')].find(existsSync);
    if (!viteConfigPath) {
        logger.debug('No Tanstack Start Vite config file found, using default config...');
        return {};
    }

    try {
        // Dynamically import vite and load vite.config.js from the project file with it,
        // so we get the final config after all the plugins are applied.
        // NOTE: do not use import("vite") here, it would try to import it from the ownstak package instead of the project's node_modules.
        const require = createRequire(import.meta.url);
        const { resolveConfig } = await import(require.resolve('vite', { paths: [process.cwd()] }));
        const viteConfig = await resolveConfig({}, 'build', 'production');
        return viteConfig?.config || {};
    } catch (e) {
        logger.drawTable(
            [
                `${BRAND} failed to load the Tanstack Start Vite config from '${viteConfigPath}' file.`,
                `The customized 'build.outDir' config options won't work.`,
                `The ${BRAND} will look for the Tanstack Start build output in the default 'dist' directory.`,
                `Please run the build command again with the --debug flag to see more details.`,
            ],
            {
                logLevel: LogLevel.WARN,
                title: 'Warning',
            },
        );
        logger.debug(`Tanstack Start Vite config error: ${e}`);
        return {};
    }
}
