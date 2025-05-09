import { existsSync } from 'fs';
import { readFile, writeFile } from 'fs/promises';
import { CLI_CONFIG_FILE_PATH, CONSOLE_API_URL } from './constants.js';

export class CliConfig {
    apiUrl: string = CONSOLE_API_URL;
    apiToken?: string;

    async load() {
        if (!existsSync(CLI_CONFIG_FILE_PATH)) {
            return;
        }
        const configFile = await readFile(CLI_CONFIG_FILE_PATH, 'utf8');
        Object.assign(this, JSON.parse(configFile));
    }

    async save() {
        await writeFile(CLI_CONFIG_FILE_PATH, JSON.stringify(this, null, 2));
    }
}
