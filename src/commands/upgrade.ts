import { resolve } from 'path';
import { logger, LogLevel } from '../logger.js';
import { BRAND, NAME, NAME_SHORT } from '../constants.js';
import { readFile, writeFile } from 'fs/promises';
import { installDependencies } from '../utils/moduleUtils.js';
import { CliError } from '../cliError.js';
import chalk from 'chalk';
import semver from 'semver';
import { CliConfig } from '../cliConfig.js';

export interface UpgradeCommandOptions {
    version?: string;
}

export async function upgrade(options: UpgradeCommandOptions) {
    logger.info(`Checking for latest version of ${NAME}...`);

    const currentVersion = CliConfig.getCurrentVersion();
    const latestMinorVersion = await getLatestVersion(currentVersion);
    const latestVersion = await getLatestVersion(currentVersion, 'latest');
    const upgradeVersion = options.version ?? latestMinorVersion;

    if (currentVersion === upgradeVersion) {
        logger.info(`The ${NAME} is up to date!`);
        return;
    }

    if (currentVersion === upgradeVersion && upgradeVersion === latestMinorVersion) {
        logger.info(`The ${NAME} is using the latest minor version! ${latestVersion}`);
        logger.info(`If you're ready to upgrade to latest minor version, run ${chalk.cyan(`npx ${NAME} upgrade latest`)}`);
        return;
    }

    logger.info(`Upgrading ${NAME} from ${currentVersion} to ${latestVersion}`);
    const packageJsonPath = resolve('package.json');
    const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf-8')) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
    };

    packageJson.dependencies = packageJson.dependencies || {};
    packageJson.devDependencies = packageJson.devDependencies || {};
    delete packageJson.dependencies[NAME];
    packageJson.devDependencies[NAME] = upgradeVersion;

    logger.info(`Updating ${packageJsonPath}...`);
    await writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2));

    logger.info(`Installing dependencies`);
    if (installDependencies()) {
        logger.info(`${NAME} upgraded to ${upgradeVersion}!`);
        logger.info(`Upgrade completed successfully.`);
        return;
    }

    logger.info(`We're done! Now it's your turn.`);
    logger.info(`Please run 'npm install', 'yarn install' etc.. with your favorite package manager to finish the upgrade.`);
}

/**
 * Returns the latest available version of Ownstak CLI
 * for the current major version tag or latest tag.
 * @param currentVersion - The current version of Ownstak CLI.
 * @param tag - The tag to use for the latest version.
 * @returns The latest version of Ownstak CLI.
 */
export async function getLatestVersion(currentVersion = CliConfig.getCurrentVersion(), tag?: string) {
    const [currentMajor, _currentMinor, _currentPatch] = currentVersion.split('.');
    const res = await fetch(`https://registry.npmjs.org/-/package/${NAME}/dist-tags`);
    if (!res.ok) {
        throw new CliError(`Failed to fetch latest version of ${NAME} from NPM. Please check your internet connection and try again.`);
    }

    const tags = (await res.json()) as Record<string, string>;
    const latestVersion = tags.latest;

    // We'll first try to find the latest version for the specified tag,
    // then use latest version for the current major version tag and finally
    // use latest version if no tag is specified.
    // e.g.: 1.0.0 -> v1 -> 1.0.1
    const upgradeVersion = tags[tag || `v${currentMajor}`] || latestVersion;

    // If current version is even higher than the latest version,
    // just return the current version. We're probably using next release candidate locally.
    if (semver.valid(currentVersion) && semver.valid(upgradeVersion) && semver.gt(currentVersion, upgradeVersion)) {
        return currentVersion;
    }

    return upgradeVersion;
}

export async function displayUpgradeNotice(currentVersion = CliConfig.getCurrentVersion(), ignoreErrors = true) {
    try {
        const upgradeVersion = await getLatestVersion(currentVersion);
        if (currentVersion !== upgradeVersion) {
            logger.drawTable(
                [
                    `The new version ${upgradeVersion} of ${BRAND} CLI is available.`,
                    `When you're ready to upgrade, run: ${chalk.cyan(`npx ${NAME_SHORT} upgrade ${upgradeVersion}`)}`,
                ],
                {
                    title: 'Upgrade available',
                    logLevel: LogLevel.SUCCESS,
                },
            );
        }
    } catch (e) {
        if (!ignoreErrors) throw e;
        logger.debug(`Upgrade check failed: ${e}`);
    }
}
