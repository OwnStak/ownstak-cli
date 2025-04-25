import { getProjectType } from '../../utils/moduleUtils.js';
import { logger } from '../../logger.js';
import { dirname, resolve } from 'path';
import { copyFile, readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { BRAND, NAME, VERSION } from '../../constants.js';
import { fileURLToPath } from 'url';
import { installDependencies } from '../../utils/moduleUtils.js';
import { CliError } from '../../cliError.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export async function configInit() {
    const projectType = getProjectType();

    const configTemplateExtension = projectType === 'typescript' ? 'ts' : 'js';
    const configTemplatePath = resolve(__dirname, `../../templates/config/ownstak.config.${configTemplateExtension}`);
    if (!existsSync(configTemplatePath)) {
        throw new Error(`The ${BRAND} project config template was not found at ${configTemplatePath}`);
    }

    const destConfigExtension = projectType === 'typescript' ? 'ts' : 'mjs';
    const destConfigPath = resolve(`ownstak.config.${destConfigExtension}`);
    if (existsSync(destConfigPath)) {
        logger.warn(`The ${BRAND} project config file already exists at '${destConfigPath}'. \r\nNothing to do here.`);
        return;
    }

    // Install the current version of CLI into the project
    const packageJsonPath = resolve('package.json');
    if (!existsSync(packageJsonPath)) {
        throw new CliError(`The package.json file was not found at '${packageJsonPath}'. Please run this command in the root of your project.`);
    }

    const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf-8'));
    packageJson.dependencies ??= {};
    packageJson.devDependencies ??= {};

    if (!packageJson.devDependencies?.[NAME]) {
        delete packageJson.dependencies[NAME];
        logger.info(`Installing ${NAME} ${VERSION} into the project...`);
        packageJson.devDependencies[NAME] = VERSION;
        await writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2));
        installDependencies();
    } else {
        logger.info(`${NAME} ${packageJson.devDependencies[NAME]} is already installed in the project. Skipping installation...`);
    }

    await copyFile(configTemplatePath, destConfigPath);
    logger.info(`The ${BRAND} project config file was created at '${destConfigPath}' 🚀`);
    logger.info(`Now you can edit it to override the default config`);
}
