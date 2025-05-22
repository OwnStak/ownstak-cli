import chalk from 'chalk';
import ConsoleClient from '../api/ConsoleClient.js';
import { CliConfig } from '../cliConfig.js';
import { CliError } from '../cliError.js';
import { BRAND, CONSOLE_API_URL, CONSOLE_URL, NAME_SHORT } from '../constants.js';
import { logger, LogLevel } from '../logger.js';
import os from 'os';

export interface LoginCommandOptions {
    apiUrl: string;
    apiToken?: string;
}

export async function login(options: LoginCommandOptions) {
    const cliConfig = CliConfig.load();
    const apiUrl = options.apiUrl || CONSOLE_API_URL;
    const existingApiToken = cliConfig.getToken(apiUrl);

    if (existingApiToken) {
        const maskedExistingApiToken = `${existingApiToken.slice(0, 3)}******${existingApiToken.slice(-4)}`;
        logger.info(`You're already logged in ${BRAND}`);
        logger.info(`API token: ${chalk.cyan(maskedExistingApiToken)}`);
        logger.info(`API URL: ${chalk.cyan(apiUrl)}`);
        logger.info(chalk.gray(`If you want to login to a different account, please logout by running \`npx ${NAME_SHORT} logout\` first.`));
        return;
    }

    let apiToken = options.apiToken;
    if (!apiToken) {
        const deviceName = os.hostname();
        const name = `${BRAND} CLI on ${deviceName}`;
        const clientName = `${BRAND} CLI v${CliConfig.getCurrentVersion()}`;
        const unauthenticatedApiClient = new ConsoleClient({ url: apiUrl });
        let apiKeyRequest = await unauthenticatedApiClient.createApiKeyRequest({
            client_name: clientName,
            name: name,
        });
        const apiKeyRequestSecret = apiKeyRequest.secret;
        const expiresAt = new Date(apiKeyRequest.expires_at);
        const lifetime = expiresAt.getTime() - Date.now();

        const timeout = setTimeout(() => {
            throw new CliError(`The link has expired. Please try it again.`);
        }, lifetime);

        logger.info(
            `Please open the below link in your browser and follow the instructions. The link will expire at: ${chalk.gray(expiresAt.toLocaleTimeString())}`,
        );
        logger.info(`Link: ${chalk.cyan.underline(apiKeyRequest.url)}`);
        logger.info(``);

        logger.startSpinner(`Waiting for authentication to complete...`);
        while (true) {
            await new Promise((resolve) => setTimeout(resolve, 2000));
            apiKeyRequest = await unauthenticatedApiClient.getApiKeyRequest(apiKeyRequest.id);
            if (apiKeyRequest.status === 'approved') {
                break;
            }
        }
        // Retrieve the API key from the api key request using the secret
        const apiKey = await unauthenticatedApiClient.retrieveApiKeyFromRequest(apiKeyRequest.id, apiKeyRequestSecret);
        apiToken = apiKey.token;
        logger.stopSpinner(`Authentication complete!`, LogLevel.SUCCESS);
        clearTimeout(timeout);
    }

    if (!apiToken) {
        throw new CliError(`Failed to authenticate. Please try again.`);
    }

    try {
        const apiClient = new ConsoleClient({ url: apiUrl, token: apiToken });
        const _organizations = await apiClient.getOrganizations();
    } catch (error) {
        throw new CliError(`Invalid API token. Please check your API token and try again: ${error}`);
    }

    cliConfig.setToken(apiToken, apiUrl);
    cliConfig.save();
    logger.success(`Successfully logged in to ${BRAND}.`);
}
