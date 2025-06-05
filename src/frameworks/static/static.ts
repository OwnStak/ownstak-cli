import { logger } from '../../logger.js';
import { FrameworkAdapter } from '../../config.js';
import { ASSETS_DIR_PATH, BRAND, FRAMEWORKS, NAME, PERMANENT_ASSETS_DIR_PATH } from '../../constants.js';
import { readFile } from 'fs/promises';
import { resolve } from 'path';
import { spawn } from 'child_process';
import { CliError } from '../../cliError.js';
import { normalizePath } from '../../utils/pathUtils.js';
import { existsSync } from 'fs';

export const staticFrameworkAdapter: FrameworkAdapter = {
    name: FRAMEWORKS.Static,
    hooks: {
        'build:start': async ({ config }): Promise<void> => {
            logger.info('Building static project...');
            if (Object.keys(config.assets.include).length == 0) {
                throw new CliError(
                    `Looks like you are trying to build static project without any assets. \r\n` +
                        `- Please specify the folder with static assets in the build command. \r\n` +
                        `  For example: 'npx ${NAME} build static --assets-dir ./assets'\r\n` +
                        `- Or create custom ${BRAND} project config by running 'npx ${NAME} config init'.`,
                );
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

        'dev:start': async () => {
            const packageJson = await readFile(resolve('package.json'), 'utf8');
            const packageJsonObject = JSON.parse(packageJson);
            const scripts = packageJsonObject.scripts || {};
            if (!scripts.dev) {
                const devScriptExample = JSON.stringify(
                    {
                        name: 'my-static-project',
                        version: '1.0.0',
                        scripts: {
                            dev: 'npx vite dev',
                        },
                    },
                    null,
                    2,
                );

                throw new CliError(
                    `No dev script found in package.json. Please add a dev script if you want to run the project in development mode. \r\n` +
                        `For example: ${devScriptExample}`,
                );
            }

            const [programName, ...programArgs] = scripts.dev.split(' ');
            logger.debug(`Running: ${programName} ${programArgs.join(' ')}`);
            const child = spawn(programName, programArgs, {
                stdio: 'inherit',
                cwd: process.cwd(),
                env: process.env,
            });
            child.on('close', (code) => {
                process.exit(code);
            });
        },
    },

    async isPresent() {
        // Static framework is always present. It needs to be the last framework in the list.
        return true;
    },
};
