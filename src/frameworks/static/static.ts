import { logger } from '../../logger.js';
import type { FrameworkAdapter } from '../../config.js';
import { ASSETS_DIR_PATH, FRAMEWORKS, INPUT_CONFIG_FILE, NAME, PERMANENT_ASSETS_DIR_PATH, ARCHS } from '../../constants.js';
import { resolve } from 'path';
import { CliError } from '../../cliError.js';
import { normalizePath } from '../../utils/pathUtils.js';
import { existsSync } from 'fs';
import { Config } from '../../config.js';
import { runCommand } from '../../utils/processUtils.js';

/**
 * The framework adapter for any static SPA/MPA projects
 * such as: Docusaurus, Vitepress, Vite React SPA, Preact SPA, Vue SPA, Solid SPA, plain HTML+CSS+JS, etc...
 *
 * NOTE: This adapter is the default one and will be used if no other framework is detected.
 */
export const staticFrameworkAdapter: FrameworkAdapter = {
    name: FRAMEWORKS.Static,
    hooks: {
        'build:start': async ({ config }): Promise<void> => {
            logger.info('Building static project...');
            if (Object.keys(config.assets.include).length === 0) {
                throw new CliError(
                    `Looks like you are trying to build static project without any assets. \r\n` +
                        `Please specify the folder with static assets in your project config. \r\n\r\n` +
                        `Example ${INPUT_CONFIG_FILE}:\r\n` +
                        `import { Config } from '${NAME}';\r\n` +
                        `export default new Config().includeAsset("./static")\r\n\r\n` +
                        `Or\r\n\r\n` +
                        `export default new Config(\r\n` +
                        `    assets: {\r\n` +
                        `        include: { './static': true },\r\n` +
                        `    },\r\n` +
                        `);`,
                );
            }

            // Lower the default memory for static projects to save costs.
            // The Node.js itself usually needs around 70MiB.
            config.memory = config.memory === Config.getDefaultMemory() ? 128 : config.memory;
            // Set the CPU arch for static projects to arm64 to save costs (up to 20% cheaper).
            // Our own JS code can run on any arch. We don't use any native libs/dependencies.
            config.arch = config.arch === Config.getDefaultArch() ? ARCHS.ARM64 : config.arch;

            if (config.buildCommand) {
                await runCommand(config.buildCommand);
            } else {
                logger.debug(`No build command specified in ${INPUT_CONFIG_FILE}`);
            }

            logger.info('Static project built successfully!');
        },

        'build:routes:finish': async ({ config }) => {
            // Create fallback route with default file and status if specified
            // NOTE: This allows to serve index.html with 200 status code for all paths in SPA applications
            // and custom 404.html with 404 status code for not found paths in MPA applications such as Docusaurus.
            const defaultNotFoundFile = '404.html';
            const defaultFile = config.assets.defaultFile || config.permanentAssets.defaultFile || defaultNotFoundFile;
            const defaultStatus = Number(config.assets.defaultStatus || config.permanentAssets.defaultStatus || 404);

            const defaultFilePath = normalizePath(defaultFile);
            const isAsset = existsSync(resolve(ASSETS_DIR_PATH, defaultFilePath));
            const isPermanentAsset = existsSync(resolve(PERMANENT_ASSETS_DIR_PATH, defaultFilePath));

            // Throw error if user specified default file that doesn't exist
            if (defaultFile !== defaultNotFoundFile && !isAsset && !isPermanentAsset) {
                throw new CliError(
                    `The default file '${defaultFile}' was not found in the assets or permanent assets directory. Make sure the specified file path is relative to the --assets-dir and file exists.\r\n\r\n` +
                        `For example to build SPA with index.html as default file and 200 status code for all paths, run: npx ${NAME} build --assets-dir=dist --default-file=index.html --default-status=200`,
                );
            }

            // Set correct action type based on the default file location
            const actionType = isPermanentAsset ? 'servePermanentAsset' : 'serveAsset';
            config.router.any(
                [
                    {
                        type: actionType,
                        path: defaultFilePath,
                    },
                    {
                        type: 'setResponseStatus',
                        statusCode: defaultStatus,
                    },
                ],
                true,
            );

            logger.debug(`Default file: ${defaultFile}`);
            logger.debug(`Default status: ${defaultStatus}`);
            logger.debug(`Default action: ${actionType}`);
        },

        'dev:start': async ({ config }) => {
            if (config.devCommand) return runCommand(config.devCommand);
            throw new CliError(
                `No dev command was specified in the project config. \r\n` +
                    `Please specify the dev command in your ${INPUT_CONFIG_FILE}. \r\n` +
                    `For example: \r\n` +
                    `import { Config } from '${NAME}';\r\n` +
                    `export default new Config(\r\n` +
                    `    devCommand: 'npx vite dev',\r\n` +
                    `);`,
            );
        },
    },

    async isPresent() {
        // Static framework is always present. It needs to be the last framework in the list.
        return true;
    },
};
