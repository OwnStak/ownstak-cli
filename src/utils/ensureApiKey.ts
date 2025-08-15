import { CliConfig } from '../cliConfig.js';
import { CliError } from '../cliError.js';
import { BRAND, CONSOLE_URL, NAME } from '../constants.js';
import { logger } from '../logger.js';
import { login } from '../commands/login.js';

export async function ensureAuthenticated(options: any) {
    const cliConfig = CliConfig.load();

    const apiUrl = options?.apiUrl;
    const initialApiKey = options?.apiKey || cliConfig.getApiKey(apiUrl);

    if (!initialApiKey) {
        logger.info(`You'll need to login to ${BRAND} first.`);
        await login({ apiUrl });
        cliConfig.reload();
        logger.info('');
    }

    const apiKey = initialApiKey || cliConfig.getApiKey(apiUrl);
    if (!apiKey) {
        throw new CliError(
            `Oops! The API key is missing possibly because of an error in the interactive login process. ` +
                `Please create new API key at ${CONSOLE_URL}/settings and pass it to logs command manually. ` +
                `Example: npx ${NAME} logs --api-key <key>`,
        );
    }

    return { apiKey, apiUrl };
}
