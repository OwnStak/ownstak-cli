import { existsSync } from 'fs';
import { readFile, writeFile } from 'fs/promises';
import { CLI_CONFIG_FILE_PATH, CONSOLE_API_URL } from './constants.js';

export class CliConfig {
    apiToken?: string;
    apiUrl?: string;

    async load() {
        if (!existsSync(CLI_CONFIG_FILE_PATH)) {
            return;
        }
        const configFile = await readFile(CLI_CONFIG_FILE_PATH, 'utf8');
        Object.assign(
            this,
            {
                apiUrl: CONSOLE_API_URL,
            },
            JSON.parse(configFile),
        );
    }

    async save() {
        await writeFile(CLI_CONFIG_FILE_PATH, JSON.stringify(this, null, 2));
    }
}
