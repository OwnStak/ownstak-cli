import { existsSync, readFileSync } from 'fs';
import { readFile, rm, mkdir, cp } from 'fs/promises';
import { resolve } from 'path';
import { spawn } from 'child_process';
import { Framework, registerFramework } from '../index.js';
import { logger } from '../../logger.js';
import { findMonorepoRoot } from '../../utils/pathUtils.js';
import semver from 'semver';
import { Config } from '../../config.js';
import { getModuleFileUrl } from '../../utils/moduleUtils.js'
import { FRAMEWORK_NAMES } from '../../config.js';
import { glob } from 'glob';

export const nextFramework: Framework = {
  name: FRAMEWORK_NAMES.Next,
  async build(config: Config): Promise<void> {
    logger.info('Building Next.js application...');
    
    const monorepoRoot = await findMonorepoRoot() || process.cwd();
    const packageJsonPath = resolve('package.json');
    const monorepoPackageJsonPath = resolve(monorepoRoot, 'package.json');
    const nextVersion = getNextVersion(packageJsonPath) || getNextVersion(monorepoPackageJsonPath);
    if(!nextVersion) {
      throw new Error(`Failed to detect installed Next.js version. Please install Next.js first.`);
    }

    const minSupportedVersion = '13.4.0';
    if(semver.lt(nextVersion, minSupportedVersion)) {
      throw new Error(`Next.js version ${nextVersion} is not supported. Please upgrade to ${minSupportedVersion} or higher.`);
    }

    // Determine build command
    const buildArgs = ['next', 'build'];
    
    // Log build command
    logger.debug(`Running: npx ${buildArgs.join(' ')}`);
    
    // Run Next.js build
    await new Promise<void>((resolve, reject) => {
      const buildProcess = spawn('npx', buildArgs, {
        stdio: 'inherit',
        shell: true,
        env: {
          ...process.env,
          NEXT_PRIVATE_STANDALONE: "true",
          NEXT_PRIVATE_OUTPUT_TRACE_ROOT: monorepoRoot
        }
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

    const nextConfig = await loadNextConfig();
    const distDir = nextConfig.distDir || '.next';

    config.assets.include.push(`public/**`);
    config.assets.include.push(`${distDir}/standalone/pages/**/*.{html,htm,json,rsc}`);
    config.assets.include.push(`${distDir}/standalone/app/**/*.{html,htm,json,rsc}`);

    config.persistentAssets.include.push(`${distDir}/static/**`);

    config.compute.include.push(`${distDir}/standalone/`);
    config.compute.exclude.push(`${distDir}/standalone/pages/**/*.{html,htm,json,rsc}`);
    config.compute.exclude.push(`${distDir}/standalone/app/**/*.{html,htm,json,rsc}`);
    config.compute.entrypoint = `${distDir}/standalone/server.js`;

    const persistentAssets = await glob.glob(`${distDir}/static/**`);
    for(const asset of persistentAssets) {

      config.router.addRoute({
        done: true,
        condition: {
          path: asset.replace(`${distDir}/`, '/_next/'),
        },
        actions: [
          {
            type: 'servePersistentAsset',
            path: asset,
          }
        ]
      });
    }

    const assets = [
      ...await glob.glob(`public/**`),
      ...await glob.glob(`${distDir}/standalone/pages/**/*.{html,htm,json,rsc}`),
      ...await glob.glob(`${distDir}/standalone/app/**/*.{html,htm,json,rsc}`),
    ]
    for(const asset of assets) {
      config.router.addRoute({
        done: true,
        condition: {
          path: asset.replace(`${distDir}/standalone/pages/`, '/').replace(`${distDir}/standalone/app/`, '/').replace(`public/`, '/'),
        },
        actions: [
          {
            type: 'serveAsset',
            path: asset,
          }
        ]
      });
    }

    // Proxy all other requests to the Next.js server
    config.router.addRoute({
      done: true,
      actions: [
        {
          type: 'serveApp',
        }
      ]
    });
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
    const hasNextDep = 
      (packageJson.dependencies && packageJson.dependencies.next) || 
      (packageJson.devDependencies && packageJson.devDependencies.next);
    return hasNextDep;
  }
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
        }
    }
}

// Register the Next.js framework
registerFramework(nextFramework);