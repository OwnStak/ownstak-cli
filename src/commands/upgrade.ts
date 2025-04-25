import { resolve } from 'path';
import { logger } from '../logger.js';
import { VERSION, NAME } from '../constants.js';
import { readFile, writeFile } from 'fs/promises';
import { installDependencies } from '../utils/moduleUtils.js';
import { CliError } from '../cliError.js';

export interface UpgradeCommandOptions {
    version?: string;
}

export async function upgrade(options: UpgradeCommandOptions) {
    const currentVersion = VERSION;
    const [currentMajor, _currentMinor, _currentPatch] = currentVersion.split('.');
    const tag = options.version || `v${currentMajor}`;

    const res = await fetch(`https://registry.npmjs.org/-/package/${NAME}/dist-tags`);
    if (!res.ok) {
        throw new CliError(`Failed to fetch latest version of ${NAME} from NPM. Please try it again later.`);
    }

    const tags = (await res.json()) as Record<string, string>;
    const latestVersion = tags.latest;
    const selectedVersion = tags[tag || `v${currentMajor}`] || latestVersion;

    if (currentVersion === latestVersion) {
        logger.info(`You are on the latest version of ${NAME} ${currentVersion}`);
        return;
    }

    logger.info(`Upgrading ${NAME} from ${currentVersion} to ${selectedVersion}`);
    const packageJsonPath = resolve('package.json');
    const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf-8')) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
    };
    Object.keys({
        ...(packageJson.dependencies || {}),
        ...(packageJson.devDependencies || {}),
    }).forEach((name) => {
        if (name != NAME) return;
        if (packageJson.dependencies?.[name]) {
            packageJson.dependencies[name] = selectedVersion;
        }
        if (packageJson.devDependencies?.[name]) {
            packageJson.devDependencies[name] = selectedVersion;
        }
    });

    logger.info(`Writing package.json`);
    await writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2));

    logger.info(`Installing dependencies`);
    if (installDependencies()) {
        logger.info(`${NAME} upgraded to ${selectedVersion}!`);
        logger.info(`Upgrade completed successfully.`);
        return;
    }

    logger.info(`We're done! Now it's your turn.`);
    logger.info(`Please run 'npm install', 'yarn install' etc.. with your favorite package manager to finish the upgrade.`);
}
