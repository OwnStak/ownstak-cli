import chalk from 'chalk';
import ConsoleClient from '../api/ConsoleClient.js';
import { CliConfig } from '../cliConfig.js';
import { CliError } from '../cliError.js';
import { BRAND, CONSOLE_API_URL, NAME } from '../constants.js';
import { logger, LogLevel } from '../logger.js';
import os from 'os';

export interface LoginCommandOptions {
    apiUrl: string;
    apiKey?: string;
}

export async function login(options: LoginCommandOptions) {
    const cliConfig = CliConfig.load();
    const apiUrl = options.apiUrl || CONSOLE_API_URL;
    const existingApiKey = cliConfig.getApiKey(apiUrl);

    if (existingApiKey) {
        logger.info(`Found existing ${BRAND} API key`);
        const maskedExistingApiKey = `${existingApiKey.slice(0, 3)}******${existingApiKey.slice(-4)}`;

        try {
            logger.startSpinner(`Verifying your current API key...`);
            const apiClient = new ConsoleClient({ apiUrl, apiKey: existingApiKey });
            await apiClient.getOrganizations();

            logger.stopSpinner(`API key: ${chalk.cyan(maskedExistingApiKey)} (${chalk.greenBright('active')})`, LogLevel.INFO);
            if (apiUrl !== CONSOLE_API_URL) logger.info(`API URL: ${chalk.cyan(apiUrl)}`);
            logger.info(chalk.gray(`If you want to login to a different account, please logout by running \`npx ${NAME} logout\` first.`));
        } catch (error: any) {
            if (error?.message?.includes('401')) {
                throw new CliError(
                    `Your current API key (${maskedExistingApiKey}) is invalid or expired. Please logout by running \`npx ${NAME} logout\` first and then login again.`,
                );
            }
            throw error;
        }
        return;
    }

    let apiKey = options.apiKey;
    if (!apiKey) {
        const deviceName = os.hostname();
        const name = `${BRAND} CLI on ${deviceName}`;
        const clientName = `${BRAND} CLI v${CliConfig.getCurrentVersion()}`;
        const unauthenticatedApiClient = new ConsoleClient({ apiUrl });
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
        const { token: newApiKey } = await unauthenticatedApiClient.retrieveApiKeyFromRequest(apiKeyRequest.id, apiKeyRequestSecret);
        apiKey = newApiKey;
        logger.stopSpinner(`Authentication complete!`, LogLevel.SUCCESS);
        clearTimeout(timeout);
    }

    if (!apiKey) {
        throw new CliError(`Failed to authenticate. Please try again.`);
    }

    try {
        const apiClient = new ConsoleClient({ apiUrl, apiKey });
        await apiClient.getOrganizations();
    } catch (error) {
        throw new CliError(`Invalid API key. Please check your API key and try again: ${error}`);
    }

    cliConfig.setApiKey(apiKey, apiUrl);
    await cliConfig.save();
    logger.success(`Successfully logged in to ${BRAND}.`);
}
