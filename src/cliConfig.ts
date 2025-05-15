import { readFileSync, existsSync } from 'fs';
import { writeFile } from 'fs/promises';
import { CLI_CONFIG_FILE_PATH } from './constants.js';

export class CliConfig {
    tokens: Record<string, string> = {};

    constructor(configObject: Record<string, any>) {
        Object.assign(this, configObject);
    }

    static load() {
        if (!existsSync(CLI_CONFIG_FILE_PATH)) {
            return new CliConfig({});
        }
        const configFile = readFileSync(CLI_CONFIG_FILE_PATH, 'utf8');
        return new CliConfig(JSON.parse(configFile));
    }

    tokenForUrl(url: string) {
        if (this.tokens) {
            return this.tokens[url];
        }
    }

    async save() {
        await writeFile(CLI_CONFIG_FILE_PATH, JSON.stringify(this, null, 2));
    }
}
