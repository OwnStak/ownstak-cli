import { readFileSync, existsSync } from 'fs';
import { writeFile, mkdir } from 'fs/promises';
import { CLI_CONFIG_FILE_PATH, CONSOLE_API_URL, NAME } from './constants.js';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

export interface PackageJson {
    version: string;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
let cachedPackageJson: PackageJson | undefined;

export interface CliConfigOptions {
    apiKeys?: Record<string, string>;
}

export class CliConfig {
    apiKeys: Record<string, string> = {};

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
        // Just for backward compatibility, so users don't have to login again,
        // load the API keys from the tokens field too.
        // TODO: Remove this after reasonable time has passed.
        const config = JSON.parse(configFile);
        if (config.tokens) config.apiKeys = config.tokens;
        return new CliConfig(config);
    }

    /**
     * Reloads the CLI config from the persistent CLI config file
     */
    reload() {
        const config = CliConfig.load();
        Object.assign(this, config);
        return this;
    }

    /**
     * Returns the API key for a given API URL
     */
    getApiKey(url = CONSOLE_API_URL) {
        if (this.apiKeys) {
            return this.apiKeys[url];
        }
        return undefined;
    }

    /**
     * Sets the API key for a given API URL
     */
    setApiKey(apiKey: string, url = CONSOLE_API_URL) {
        this.apiKeys[url] = apiKey;
    }

    /**
     * Deletes the API key for a given API URL
     */
    deleteApiKey(url = CONSOLE_API_URL) {
        delete this.apiKeys[url];
    }

    /**
     * Deletes all the API keys
     */
    deleteApiKeys() {
        this.apiKeys = {};
    }

    /**
     * Saves the current config to the CLI config file
     */
    async save() {
        await mkdir(dirname(CLI_CONFIG_FILE_PATH), { recursive: true });
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
