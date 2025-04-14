import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { logger } from '../logger.js';
import { VERSION, NAME } from '../constants.js';
import { readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface UpgradeCommandOptions {
    version?: string;
}

export async function upgrade(options: UpgradeCommandOptions) {
    const currentVersion = VERSION;
    const [currentMajor, _currentMinor, _currentPatch] = currentVersion.split('.');
    const tag = options.version || `v${currentMajor}`;

    const res = await fetch(`https://registry.npmjs.org/-/package/${NAME}/dist-tags`);
    if (!res.ok) {
        logger.error(`ERROR: Failed to fetch latest version of ${NAME} from NPM. Please try it again later.`);
        process.exit(1);
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
    }).forEach(name => {
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
        logger.info(`Well done!`);
        return;
    }
    
    logger.info(`We're done! Now it's your turn.`);
    logger.info(
        `Please run 'npm install', 'yarn install' etc.. with your favorite package manager to finish the upgrade.`
    );
}


export function installDependencies() {
    if (existsSync('package-lock.json')) {
        execSync('npm install', { stdio: 'inherit' });
        return true;
    }
    if (existsSync('yarn.lock')) {
        execSync('yarn install', { stdio: 'inherit' });
        return true;
    }
    if (existsSync('pnpm-lock.yaml')) {
        execSync('pnpm install', { stdio: 'inherit' });
        return true;
    }
    return false;
}
  