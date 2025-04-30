import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { join, resolve } from 'path';
import { spawn } from 'child_process';
import { logger } from '../../logger.js';
import { Config, FrameworkAdapter } from '../../config.js';
import { BRAND, FRAMEWORKS } from '../../constants.js';
import { bundleRequire } from 'bundle-require';
import { nodeFileTrace } from '@vercel/nft';
import { CliError } from '../../cliError.js';
import chalk from 'chalk';

export type AstroConfig = {
    adapter?: {
        name: string;
    };
    outputDir?: string;
    publicDir?: string;
};

export const astroFrameworkAdapter: FrameworkAdapter = {
    name: FRAMEWORKS.Astro,
    hooks: {
        'build:start': async (config: Config): Promise<void> => {
            const astroConfig = await loadAstroConfig();
            const adapterName = astroConfig.adapter?.name;
            const outputMode = adapterName === '@astrojs/node' ? 'server' : 'static';
            const outputDir: string = astroConfig.outputDir || 'dist';
            const publicDir: string = astroConfig.publicDir || 'public';
            const clientOutputDir: string = outputMode === 'server' ? `${outputDir}/client` : outputDir;
            const serverOutputDir: string = outputMode === 'server' ? `${outputDir}/server` : outputDir;

            logger.info(`Astro adapter: ${adapterName ?? 'None'}`);
            if (adapterName && adapterName !== '@astrojs/node') {
                throw new CliError(
                    `Looks like your project use ${adapterName} adapter instead of @astrojs/node. Please replace your current adapter with @astrojs/node to build your project for ${BRAND}.\r\n` +
                        `You can do this by running: npx astro add node\r\n` +
                        `See more at: https://docs.astro.build/en/guides/integrations-guide/node/`,
                );
            }

            if (outputMode === 'server') {
                // Check if @astrojs/node adapter is installed
                if (!(await hasAstroNodeAdapter())) {
                    logger.info('The @astrojs/node adapter was not found. Installing...');
                    await new Promise<void>((resolve, reject) => {
                        const child = spawn('npx', ['astro', 'add', 'node', '--yes'], {
                            stdio: 'inherit',
                            cwd: process.cwd(),
                        });
                        child.on('close', (code) => {
                            if (code === 0) {
                                resolve();
                            } else {
                                reject(new Error(`Failed to install @astrojs/node adapter: ${code}`));
                            }
                        });
                    });
                }
            }

            if (config.skipFrameworkBuild) {
                logger.info(`Skipping Astro build and using existing build output...`);
            } else {
                logger.info('Building Astro project...');
                const buildArgs = ['astro', 'build'];
                logger.debug(`Running: npx ${buildArgs.join(' ')}`);

                // Run Astro build
                await new Promise<void>((resolve, reject) => {
                    const buildProcess = spawn('npx', buildArgs, {
                        stdio: 'inherit',
                        shell: true,
                    });

                    buildProcess.on('close', (code) => {
                        if (code === 0) {
                            logger.info('Astro build completed successfully!');
                            resolve();
                        } else {
                            reject(new Error(`Astro build failed with exit code ${code}`));
                        }
                    });

                    buildProcess.on('error', (err) => {
                        reject(new Error(`Failed to start Astro build: ${err.message}`));
                    });
                });
            }

            // Astro in server mode with server-side rendered pages
            if (outputMode === 'server') {
                logger.info(`Tracing dependencies...`);
                const entrypoint = resolve(outputDir, 'server', 'entry.mjs');
                const { fileList } = await nodeFileTrace([entrypoint]);
                for (const file of fileList) {
                    // Skip files that are already in the output directory
                    if (file.startsWith(outputDir)) continue;
                    // Skip files from src directory. They are in dynamic imports, but never imported by the astro server
                    if (file.startsWith('src')) continue;
                    config.app.include[file] = true;
                }

                // Configure app
                config.app.include[serverOutputDir] = true;
                config.app.entrypoint = join(serverOutputDir, 'entry.mjs');

                // Proxy all other requests to the Astro server
                config.router.any([
                    {
                        type: 'serveApp',
                        description: 'Serve Astro server by default',
                    },
                ]);
            }

            // Astro in static mode with just prerendered pages
            if (outputMode === 'static') {
                // Return static 404.html page for all requests that are not handled by the router
                config.router.any([
                    {
                        type: 'serveAsset',
                        path: '404.html',
                        description: 'Serve 404.html page by default',
                    },
                ]);
            }

            // Include astro.config.mjs in debugAssets for debugging
            config.debugAssets.include[`./astro.config.{js,ts,mjs,cjs}`] = true;

            // Configure assets
            config.assets.htmlToFolders = true;
            config.assets.include[publicDir] = `./`;
            config.assets.include[clientOutputDir] = `./`;
            config.assets.include[`./_astro`] = false;

            // Configure persistent assets
            config.permanentAssets.include[join(clientOutputDir, '_astro')] = `./_astro`;

            if (outputMode === 'static') {
                logger.info('');
                logger.drawTable(
                    [
                        `Looks like your project uses Astro in static mode without server-side rendering support.`,
                        `If you want to use all the features of SSR rendering, please install @astrojs/node adapter.`,
                        `You can do this by running: ${chalk.cyan(`npx astro add node`)}`,
                        `See more at: ${chalk.cyan(`https://docs.astro.build/en/guides/integrations-guide/node/`)}`,
                    ],
                    {
                        title: "Hint",
                        borderColor: 'brand'
                    },
                );
            }
        },

        'dev:start': async () => {
            logger.info('Starting Astro development server...');
            const devArgs = ['astro', 'dev'];
            logger.debug(`Running: npx ${devArgs.join(' ')}`);

            const devProcess = spawn('npx', devArgs, {
                stdio: 'inherit',
                shell: true,
            });

            devProcess.on('close', (code) => {
                process.exit(code || 0);
            });
        },
    },

    async isPresent() {
        const packageJsonPath = resolve('package.json');
        if (!existsSync(packageJsonPath)) {
            return false;
        }
        const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf-8'));
        const hasAstroDep = (packageJson.dependencies && packageJson.dependencies.astro) || (packageJson.devDependencies && packageJson.devDependencies.astro);
        return hasAstroDep;
    },
};

async function hasAstroNodeAdapter() {
    const packageJsonPath = resolve('package.json');
    const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf-8'));
    const hasAstroNodeAdapter =
        (packageJson.dependencies && packageJson.dependencies['@astrojs/node']) ||
        (packageJson.devDependencies && packageJson.devDependencies['@astrojs/node']);
    return hasAstroNodeAdapter;
}

async function loadAstroConfig(): Promise<AstroConfig> {
    const astroConfigPath = [resolve('astro.config.mjs'), resolve('astro.config.ts'), resolve('astro.config.js'), resolve('astro.config.cjs')].find(existsSync);
    if (!astroConfigPath) {
        throw new CliError('Astro config file was not found. Please create an astro.config.mjs file.');
    }
    const { mod } = await bundleRequire({
        filepath: astroConfigPath,
    });
    const astroConfig = mod.default?.default || mod.default || mod;
    if (typeof astroConfig === 'function') {
        return astroConfig();
    }
    return astroConfig;
}
