import { logger, LogLevel } from '../logger.js';
import { BRAND, NAME } from '../constants.js';
import { installDependencies, installDependency } from '../utils/moduleUtils.js';
import { CliConfig } from '../cliConfig.js';
import { CliError } from '../cliError.js';
import chalk from 'chalk';
import semver from 'semver';

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
        logger.info(`The ${NAME} CLI is up to date!`);
        return;
    }

    if (currentVersion === upgradeVersion && upgradeVersion === latestMinorVersion) {
        logger.info(`The ${NAME} is using the latest minor version! ${latestVersion}`);
        logger.info(`If you're ready to upgrade to latest minor version, run ${chalk.cyan(`npx ${NAME} upgrade latest`)}`);
        return;
    }

    const actionName = semver.lt(currentVersion, upgradeVersion) ? 'Upgrading' : 'Downgrading';
    logger.info(`${actionName} ${NAME} from ${currentVersion} to ${upgradeVersion}...`);
    await installDependency(NAME, upgradeVersion);
    logger.info(`The ${NAME} CLI v${upgradeVersion} installed successfully.`);
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
                    `When you're ready to upgrade, run: ${chalk.cyan(`npx ${NAME} upgrade ${upgradeVersion}`)}`,
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
