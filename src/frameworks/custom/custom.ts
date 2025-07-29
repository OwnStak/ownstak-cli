import { logger } from '../../logger.js';
import { FrameworkAdapter } from '../../config.js';
import { FRAMEWORKS, NAME } from '../../constants.js';
import { runCommand } from '../../utils/processUtils.js';
import { INPUT_CONFIG_FILE } from '../../constants.js';
import { CliError } from '../../cliError.js';

export const customFrameworkAdapter: FrameworkAdapter = {
    name: FRAMEWORKS.Custom,
    hooks: {
        'build:start': async ({ config }) => {
            if (config.buildCommand) return runCommand(config.buildCommand);
            logger.debug(`No build command specified in ${INPUT_CONFIG_FILE}`);
        },
        'build:routes:finish': async ({ config }) => {
            // Create fallback route that proxies all requests to the app
            config.router.any([{ type: 'serveApp' }], true);
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
        // Never auto-detect custom framework. User needs to specify it explicitly.
        return false;
    },
};
