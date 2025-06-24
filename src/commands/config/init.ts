import { getProjectType } from '../../utils/moduleUtils.js';
import { logger } from '../../logger.js';
import { dirname, resolve } from 'path';
import { readFile, writeFile, copyFile } from 'fs/promises';
import { existsSync } from 'fs';
import { BRAND, CONSOLE_API_URL, CONSOLE_URL, INPUT_CONFIG_FILE, NAME } from '../../constants.js';
import { fileURLToPath } from 'url';
import { installDependencies } from '../../utils/moduleUtils.js';
import { CliError } from '../../cliError.js';
import { CliConfig } from '../../cliConfig.js';
import { login } from '../login.js';
import { Config } from '../../config.js';
import ConsoleClient from '../../api/ConsoleClient.js';
import { input } from '@inquirer/prompts';
import { select } from '@inquirer/prompts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface ConfigInitCommandOptions {
    organization?: string;
    project?: string;
    apiUrl?: string;
    apiKey?: string;
    displaySummary?: boolean;
}

export async function configInit(options: ConfigInitCommandOptions = {}) {
    await setupCli();
    await setupConfig(options);
}

export async function setupCli() {
    const cliVersion = CliConfig.getCurrentVersion();

    // Install the current version of CLI into the project
    const packageJsonPath = resolve('package.json');
    if (!existsSync(packageJsonPath)) {
        logger.info(`Creating package.json file...`);
        await writeFile(
            packageJsonPath,
            JSON.stringify(
                {
                    dependencies: {},
                    devDependencies: {},
                },
                null,
                2,
            ),
        );
    }

    const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf-8'));
    packageJson.dependencies ??= {};
    packageJson.devDependencies ??= {};

    if (!packageJson.devDependencies?.[NAME]) {
        delete packageJson.dependencies[NAME];
        logger.info(`Installing ${NAME} ${cliVersion} into the project...`);
        packageJson.devDependencies[NAME] = cliVersion;
        await writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2));
        await installDependencies();
    }
}

export async function setupConfig(options: ConfigInitCommandOptions = {}) {
    const projectType = getProjectType();

    const configTemplateExtension = projectType === 'typescript' ? 'ts' : 'js';
    const configTemplatePath = resolve(__dirname, `../../templates/config/ownstak.config.${configTemplateExtension}`);
    if (!existsSync(configTemplatePath)) {
        throw new Error(`The ${BRAND} project config template was not found at ${configTemplatePath}`);
    }

    const destConfigExtension = projectType === 'typescript' ? 'ts' : 'mjs';
    const destConfigPath =
        [INPUT_CONFIG_FILE, INPUT_CONFIG_FILE.replace(`.js`, `.mjs`), INPUT_CONFIG_FILE.replace(`.js`, `.cjs`), INPUT_CONFIG_FILE.replace(`.js`, `.ts`)].find(
            existsSync,
        ) || INPUT_CONFIG_FILE.replace(`.js`, `.${destConfigExtension}`);
    // Copy the config template to the destination path if it doesn't exist
    if (!existsSync(destConfigPath)) {
        await copyFile(configTemplatePath, destConfigPath);
    }

    const cliConfig = CliConfig.load();
    const apiUrl = options.apiUrl || CONSOLE_API_URL;
    let apiKey = options.apiKey || cliConfig.getApiKey(apiUrl);

    if (!apiKey) {
        await login({ apiUrl });
        apiKey = cliConfig.reload().getApiKey(apiUrl);
    }

    const api = new ConsoleClient({ apiUrl, apiKey });
    const organizations = await api.getOrganizations();
    if (organizations.length === 0) {
        throw new CliError(`You're not a member of any organization. Please create new organization at ${CONSOLE_URL}/organizations and come back.`);
    }

    const defaultOrganizationSlug = organizations[0]?.slug;
    const defaultProjectSlug = Config.getDefaultProject();

    const config = await Config.loadFromSource();
    let organizationSlug = options.organization || config.organization;
    let projectSlug = options.project || config.project;

    // Prompt for organization if not provided
    if (!organizationSlug) {
        if (!defaultOrganizationSlug) {
            throw new CliError(`No organizations are available. Please create an organization at ${CONSOLE_URL}/organizations and come back.`);
        }

        logger.info('');
        organizationSlug = await select({
            message: `Which organization do you want use for this project? (default: ${defaultOrganizationSlug})`,
            choices: organizations.map((org) => ({
                name: org.slug,
                value: org.slug,
            })),
        });
    }

    // Prompt for project if not provided
    if (!projectSlug) {
        projectSlug = await input({
            message: `What's the name of your project? (default: ${defaultProjectSlug}):`,
            default: defaultProjectSlug,
            validate: (value) => {
                if (!value || value.trim() === '') return 'Project name cannot be empty';
                return true;
            },
        });
    }

    const configSource = await readFile(destConfigPath, 'utf-8');
    const optionsToSet: Record<string, string | number | boolean> = {};

    // Set only options that are not already set in the config
    if (!config.organization) optionsToSet.organization = organizationSlug;
    if (!config.project) optionsToSet.project = projectSlug;

    await writeFile(destConfigPath, modifyConfigSource(configSource, optionsToSet));
    logger.success(`And we're all set! You can check your project config at '${destConfigPath}'`);
}

export function modifyConfigSource(sourceCode: string, setOptions: Record<string, string | number | boolean> = {}) {
    const newConfigRegex = /new\s+Config\s*\(/g;

    function findFullNewConfig(startIndex: number) {
        let index = startIndex;
        let openParens = 0;
        let foundStart = false;
        let inSingleLineComment = false;
        let inMultiLineComment = false;
        let inString = false;
        let stringChar = '';

        while (index < sourceCode.length) {
            const char = sourceCode[index];
            const nextChar = sourceCode[index + 1] || '';

            // Handle string literals
            if (!inSingleLineComment && !inMultiLineComment && (char === '"' || char === "'" || char === '`')) {
                if (!inString) {
                    inString = true;
                    stringChar = char;
                } else if (stringChar === char) {
                    // Check for escaped quotes
                    if (sourceCode[index - 1] !== '\\') {
                        inString = false;
                        stringChar = '';
                    }
                }
            }

            // Handle single-line comments
            if (!inString && !inMultiLineComment && char === '/' && nextChar === '/') {
                inSingleLineComment = true;
                index++; // Skip the next character
            } else if (inSingleLineComment && char === '\n') {
                inSingleLineComment = false;
            }

            // Handle multi-line comments
            if (!inString && !inSingleLineComment && char === '/' && nextChar === '*') {
                inMultiLineComment = true;
                index++; // Skip the next character
            } else if (inMultiLineComment && char === '*' && nextChar === '/') {
                inMultiLineComment = false;
                index++; // Skip the next character
            }

            // Only process parentheses if not in comments or strings
            if (!inSingleLineComment && !inMultiLineComment && !inString) {
                if (char === '(') {
                    openParens++;
                    foundStart = true;
                } else if (char === ')') {
                    openParens--;
                    if (openParens === 0 && foundStart) {
                        return index + 1;
                    }
                }
            }

            index++;
        }

        return index;
    }

    function isInComment(index: number): boolean {
        let i = 0;
        let inSingleLineComment = false;
        let inMultiLineComment = false;
        let inString = false;
        let stringChar = '';

        while (i < index) {
            const char = sourceCode[i];
            const nextChar = sourceCode[i + 1] || '';

            // Handle string literals
            if (!inSingleLineComment && !inMultiLineComment && (char === '"' || char === "'" || char === '`')) {
                if (!inString) {
                    inString = true;
                    stringChar = char;
                } else if (stringChar === char) {
                    // Check for escaped quotes
                    if (sourceCode[i - 1] !== '\\') {
                        inString = false;
                        stringChar = '';
                    }
                }
            }

            // Handle single-line comments
            if (!inString && !inMultiLineComment && char === '/' && nextChar === '/') {
                inSingleLineComment = true;
                i++; // Skip the next character
            } else if (inSingleLineComment && char === '\n') {
                inSingleLineComment = false;
            }

            // Handle multi-line comments
            if (!inString && !inSingleLineComment && char === '/' && nextChar === '*') {
                inMultiLineComment = true;
                i++; // Skip the next character
            } else if (inMultiLineComment && char === '*' && nextChar === '/') {
                inMultiLineComment = false;
                i++; // Skip the next character
            }

            i++;
        }

        return inSingleLineComment || inMultiLineComment;
    }

    const inserts: Array<{ start: number; end: number }> = [];
    let match;
    while ((match = newConfigRegex.exec(sourceCode)) !== null) {
        // Skip if the match is inside a comment
        if (isInComment(match.index)) {
            continue;
        }

        const start = match.index;
        const end = findFullNewConfig(newConfigRegex.lastIndex - 1);
        inserts.push({ start, end });
    }

    for (let i = inserts.length - 1; i >= 0; i--) {
        const { start, end } = inserts[i];
        const expr = sourceCode.slice(start, end);

        // Build chained .setX(value) calls from options
        const methodCalls = Object.entries(setOptions)
            .map(([key, value]) => `.set${capitalize(key)}(${JSON.stringify(value)})`)
            .join('');
        sourceCode = sourceCode.slice(0, start) + `${expr}${methodCalls}` + sourceCode.slice(end);
    }

    return sourceCode;

    function capitalize(str: string) {
        return str.charAt(0).toUpperCase() + str.slice(1);
    }
}
