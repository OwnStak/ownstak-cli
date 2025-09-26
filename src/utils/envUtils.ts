import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { resolve } from 'path';
import { logger } from '../logger.js';

/**
 * Loads environment variables from .env file(s)
 * @param filePath - Optional path to .env file. Defaults to '.env' in current directory
 * @returns Object containing loaded environment variables
 */
export async function loadEnvVariables(
    paths: string | string[] = [
        resolve('.env'),
        resolve(`.env.${process.env.NODE_ENV || 'development'}`),
        ...(process.env.LOCAL ? [resolve('.env.local'), resolve(`.env.${process.env.NODE_ENV || 'development'}.local`)] : []),
        // The .env.ownstak file is added by the OwnStak Console on every deployment
        // and contains all the user-controlled ENV variables.
        resolve('.env.ownstak'),
    ],
    throwOnError: boolean = false,
) {
    const envVars: Record<string, string> = {};
    const normalizedPaths = Array.isArray(paths) ? paths : [paths];

    for (const path of normalizedPaths) {
        logger.debug(`Loading ENV variables from '${path}' file`);
        if (!existsSync(path)) {
            if (throwOnError) throw new Error(`The ENV variables file at '${path}' does not exist`);
            continue;
        }

        try {
            const content = await readFile(path, 'utf-8');
            const vars = parseEnvVariables(content);
            Object.assign(envVars, vars);
            Object.entries(envVars).forEach(([key, value]) => (process.env[key] = value));
        } catch (error) {
            const errorMsg = `Failed to parse ENV variables from '${path}' file: ${error}`;
            if (throwOnError) throw new Error(errorMsg);
            logger.warn(errorMsg);
        }
    }

    return envVars;
}

/**
 * Parses a .env file content and returns key-value pairs
 * @param content - The content of the .env file
 * @returns Object containing environment variables
 */
function parseEnvVariables(content: string) {
    const envVars: Record<string, string> = {};
    const lines = content.split(/\r?\n/);

    for (const line of lines) {
        // Skip empty lines and comments
        const trimmedLine = line.trim();
        if (!trimmedLine || trimmedLine.startsWith('#')) {
            continue;
        }

        // Find the first = sign
        const equalIndex = trimmedLine.indexOf('=');
        if (equalIndex === -1) {
            continue;
        }

        const key = trimmedLine.substring(0, equalIndex).trim();
        let value = trimmedLine.substring(equalIndex + 1).trim();

        // Remove surrounding quotes if present
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
        }

        // Skip if key is empty
        if (key) {
            envVars[key] = value;
        }
    }

    return envVars;
}
