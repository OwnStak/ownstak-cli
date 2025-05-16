import { readFileSync, existsSync } from 'fs';
import { writeFile } from 'fs/promises';
import { CLI_CONFIG_FILE_PATH, NAME } from './constants.js';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

export interface PackageJson {
    version: string;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
let cachedPackageJson: PackageJson | undefined;

export interface CliConfigOptions {
    tokens?: Record<string, string>;
}

export class CliConfig {
    tokens: Record<string, string> = {};

    constructor(configObject: CliConfigOptions = {}) {
        Object.assign(this, configObject);
    }

    /**
     * Loads the CLI config from the persistent CLI config file
     * in the user's home directory.
     */
    static load() {
        if (!existsSync(CLI_CONFIG_FILE_PATH)) {
            return new CliConfig();
        }
        const configFile = readFileSync(CLI_CONFIG_FILE_PATH, 'utf8');
        return new CliConfig(JSON.parse(configFile));
    }

    /**
     * Returns the token for a given Console API URL
     */
    tokenForUrl(url: string) {
        if (this.tokens) {
            return this.tokens[url];
        }
    }

    /**
     * Saves the current config to the CLI config file
     */
    async save() {
        await writeFile(CLI_CONFIG_FILE_PATH, JSON.stringify(this, null, 2));
    }

    /**
     * Returns the current version of Ownstak CLI
     */
    static getCurrentVersion() {
        return CliConfig.getPackageJson().version;
    }

    /**
     * Returns the package.json file content of the Ownstak CLI
     */
    static getPackageJson(cache: boolean = true) {
        if (cache && cachedPackageJson) {
            return cachedPackageJson;
        }
        const packageJsonPath = resolve(__dirname, '..', 'package.json');
        if (!existsSync(packageJsonPath)) {
            throw new Error(`${NAME} package.json file was not found at: ${packageJsonPath}`);
        }

        cachedPackageJson ||= JSON.parse(readFileSync(packageJsonPath, 'utf8'));
        return cachedPackageJson as PackageJson;
    }
}
