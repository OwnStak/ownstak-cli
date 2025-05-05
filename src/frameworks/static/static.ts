import { logger } from '../../logger.js';
import { Config, FrameworkAdapter } from '../../config.js';
import { BRAND, FRAMEWORKS, NAME, NAME_SHORT } from '../../constants.js';
import { readFile } from 'fs/promises';
import { resolve } from 'path';
import { spawn } from 'child_process';
import { CliError } from '../../cliError.js';

export const staticFrameworkAdapter: FrameworkAdapter = {
    name: FRAMEWORKS.Static,
    hooks: {
        'build:start': async ({ config }): Promise<void> => {
            logger.info('Building static project...');
            if (Object.keys(config.assets.include).length == 0) {
                throw new CliError(
                    `Looks like you are trying to build static project without any assets. \r\n` +
                        `- Please specify the folder with static assets in the build command. \r\n` +
                        `  For example: 'npx ${NAME_SHORT} build static --assets-dir ./assets'\r\n` +
                        `- Or create custom ${BRAND} project config by running 'npx ${NAME_SHORT} config init'.`,
                );
            }

            logger.info('Static project built successfully!');
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
