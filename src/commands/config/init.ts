import { getProjectType } from '../../utils/moduleUtils.js';
import { logger } from '../../logger.js';
import { dirname, resolve } from 'path';
import { readFile, writeFile, copyFile } from 'fs/promises';
import { existsSync } from 'fs';
import { BRAND, NAME } from '../../constants.js';
import { fileURLToPath } from 'url';
import { installDependencies } from '../../utils/moduleUtils.js';
import { CliError } from '../../cliError.js';
import chalk from 'chalk';
import { CliConfig } from '../../cliConfig.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export async function configInit() {
    const projectType = getProjectType();
    const cliVersion = CliConfig.getCurrentVersion();

    const configTemplateExtension = projectType === 'typescript' ? 'ts' : 'js';
    const configTemplatePath = resolve(__dirname, `../../templates/config/ownstak.config.${configTemplateExtension}`);
    if (!existsSync(configTemplatePath)) {
        throw new Error(`The ${BRAND} project config template was not found at ${configTemplatePath}`);
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
        logger.info(`Installing ${NAME} ${cliVersion} into the project...`);
        packageJson.devDependencies[NAME] = cliVersion;
        await writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2));
        installDependencies();
    }

    const destConfigExtension = projectType === 'typescript' ? 'ts' : 'mjs';
    const destConfigPath = `ownstak.config.${destConfigExtension}`;
    if (existsSync(destConfigPath)) {
        logger.warn(`The ${BRAND} project config file exists at '${destConfigPath}'. \r\nNothing to do here.`);
        return;
    }

    await copyFile(configTemplatePath, destConfigPath);
    logger.success(`New ${BRAND} project config was created at '${destConfigPath}'`);

    // Display what to do next ibfo
    logger.info('');
    logger.drawTable(
        [
            `Now you can edit the ${BRAND} project config '${destConfigPath}' to customize the project behavior. ` +
                `\r\n\r\n` +
                `For example:\r\n` +
                chalk.cyan(`import { Config } from '${NAME}';\r\n`) +
                chalk.cyan(`export default new Config({ runtime: 'nodejs20.x' });`),
        ],
        {
            title: "What's Next",
            borderColor: 'brand',
            maxWidth: 65,
        },
    );
}
