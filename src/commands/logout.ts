import { BRAND } from '../constants.js';
import { CliConfig } from '../cliConfig.js';
import { CONSOLE_API_URL } from '../constants.js';
import { logger } from '../logger.js';
import chalk from 'chalk';

export interface LogoutCommandOptions {
    apiUrl: string;
}

export async function logout(options: LogoutCommandOptions) {
    const cliConfig = CliConfig.load();
    const apiUrl = options.apiUrl || CONSOLE_API_URL;
    const existingApiKey = cliConfig.getApiKey(apiUrl);

    if (!existingApiKey) {
        logger.info(`You're not logged in to ${BRAND}.`);
        logger.info(`API URL: ${chalk.cyan(apiUrl)}`);
        logger.info(chalk.gray(`If you want to logout of different Console instance, please provide the API URL using the --api-url option.`));
        return;
    }

    cliConfig.deleteApiKey(apiUrl);
    cliConfig.save();
    logger.info(`Successfully logged out from ${BRAND}.`);
    logger.info(`API URL: ${chalk.cyan(apiUrl)}`);
}
