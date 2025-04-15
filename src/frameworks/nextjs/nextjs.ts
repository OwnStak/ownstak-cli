import { existsSync, readFileSync } from 'fs';
import { readFile } from 'fs/promises';
import { resolve } from 'path';
import { spawn } from 'child_process';
import { logger } from '../../logger.js';
import { findMonorepoRoot } from '../../utils/pathUtils.js';
import semver from 'semver';
import { Config, FrameworkAdapter } from '../../config.js';
import { getModuleFileUrl } from '../../utils/moduleUtils.js';
import { FRAMEWORKS } from '../../constants.js';

export const nextjsFrameworkAdapter: FrameworkAdapter = {
    name: FRAMEWORKS.NextJs,
    async build(config: Config): Promise<void> {
        const monorepoRoot = (await findMonorepoRoot()) || process.cwd();
        const packageJsonPath = resolve('package.json');
        const monorepoPackageJsonPath = resolve(monorepoRoot, 'package.json');
        const nextVersion = getNextVersion(packageJsonPath) || getNextVersion(monorepoPackageJsonPath);
        if (!nextVersion) {
            throw new Error(`Failed to detect installed Next.js version. Please install Next.js first.`);
        }

        const minSupportedVersion = '13.4.0';
        if (semver.lt(nextVersion, minSupportedVersion)) {
            throw new Error(`Next.js version ${nextVersion} is not supported. Please upgrade to ${minSupportedVersion} or higher.`);
        }

        if (!config.skipFrameworkBuild) {
            logger.info('Building Next.js application...');

            const buildArgs = ['next', 'build'];
            logger.debug(`Running: npx ${buildArgs.join(' ')}`);

            // Run Next.js build
            await new Promise<void>((resolve, reject) => {
                const buildProcess = spawn('npx', buildArgs, {
                    stdio: 'inherit',
                    shell: true,
                    env: {
                        ...process.env,
                        NEXT_PRIVATE_STANDALONE: 'true',
                        NEXT_PRIVATE_OUTPUT_TRACE_ROOT: monorepoRoot,
                    },
                });

                buildProcess.on('close', (code) => {
                    if (code === 0) {
                        logger.info('Next.js build completed successfully!');
                        resolve();
                    } else {
                        reject(new Error(`Next.js build failed with exit code ${code}`));
                    }
                });

                buildProcess.on('error', (err) => {
                    reject(new Error(`Failed to start Next.js build: ${err.message}`));
                });
            });
        } else {
            logger.info(`Skipping Next.js build and using existing build output...`);
        }

        const nextConfig = await loadNextConfig();
        const distDir = nextConfig.distDir || '.next';

        // Include next.config.js in debugAssets,
        // so we can debug customer's issues with their next.config.js file.
        config.debugAssets.include[`./next.config.{js,ts,mjs,cjs}`] = true;

        config.assets.htmlToFolders = true;
        config.assets.include[`./public`] = `./`;
        config.assets.include[`${distDir}/standalone/${distDir}/server/pages/**/*.{html,htm,json,rsc}`] = `./**`;
        config.assets.include[`${distDir}/standalone/${distDir}/server/app/**/*.{html,htm,json,rsc}`] = `./**`;

        config.persistentAssets.include[`${distDir}/static/**`] = `./_next/static/**`;

        config.app.include[`${distDir}/standalone/`] = `./`;
        config.app.include[`${distDir}/standalone/${distDir}/server/pages/**/*.{html,htm,json,rsc}`] = false;
        config.app.include[`${distDir}/standalone/${distDir}/server/app/**/*.{html,htm,json,rsc}`] = false;
        config.app.entrypoint = `./server.js`;

        // Proxy all other requests to the Next.js server
        config.router.addRoute({}, [
            {
                type: 'serveApp',
            },
        ]);
    },

    dev() {
        logger.info('Starting Next.js development server...');
    },

    async isPresent() {
        const packageJsonPath = resolve('package.json');
        if (!existsSync(packageJsonPath)) {
            return false;
        }
        const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf-8'));
        const hasNextDep = (packageJson.dependencies && packageJson.dependencies.next) || (packageJson.devDependencies && packageJson.devDependencies.next);
        return hasNextDep;
    },
};

/**
 * Get the version of Next.js from the package.json file
 * @param packageJsonPath - The path to the package.json file
 * @returns The version of Next.js
 */
export function getNextVersion(packageJsonPath: string) {
    if (!existsSync(packageJsonPath)) {
        return undefined;
    }
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
    return packageJson.dependencies.next || packageJson.devDependencies.next;
}

/**
 * Load the Next.js config with defaults from the Next.js server.
 * This methods works with all types of Next.js configs (js, ts, mjs, cjs).
 * @returns The Next.js config
 */
async function loadNextConfig() {
    try {
        const configUrl = await getModuleFileUrl('next', 'dist/server/config.js');
        const mod = await import(configUrl);
        const loadConfig = mod.default?.default || mod.default;
        const nextConfig = await loadConfig('phase-production-server', process.cwd());
        return nextConfig;
    } catch (error) {
        console.error('Failed to load Next.js config. Using default config...', error);
        return {
            distDir: '.next',
        };
    }
}
