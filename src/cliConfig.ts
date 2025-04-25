import { existsSync } from 'fs';
import { readFile, writeFile } from 'fs/promises';
import { CLI_CONFIG_FILE_PATH } from './constants.js';

export class CliConfig {
    apiToken?: string;
    apiUrl?: string;

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
