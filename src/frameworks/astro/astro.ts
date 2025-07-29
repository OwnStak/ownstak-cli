import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { join, resolve } from 'path';
import { logger } from '../../logger.js';
import { FrameworkAdapter, HookArgs } from '../../config.js';
import { BRAND, FRAMEWORKS } from '../../constants.js';
import { bundleRequire } from 'bundle-require';
import { CliError } from '../../cliError.js';
import chalk from 'chalk';
import { filenameToPath } from '../../utils/pathUtils.js';
import { runCommand } from '../../utils/processUtils.js';

export type AstroConfig = {
    adapter?: {
        name: string;
    };
    outputDir?: string;
    publicDir?: string;
    base?: string;
    redirects?: AstroRedirects;
};

export type AstroRedirects = {
    [source: string]: AstroRedirect;
};
export type AstroRedirect =
    | string
    | {
          status?: number;
          destination: string;
      };

export const astroFrameworkAdapter: FrameworkAdapter = {
    name: FRAMEWORKS.Astro,
    hooks: {
        'build:start': async ({ config }: HookArgs): Promise<void> => {
            const astroConfig = await loadAstroConfig();
            const adapterName = astroConfig.adapter?.name;
            const outputMode = adapterName === '@astrojs/node' ? 'server' : 'static';
            const outputDir: string = astroConfig.outputDir || 'dist';
            const publicDir: string = astroConfig.publicDir || 'public';
            const clientOutputDir: string = outputMode === 'server' ? `${outputDir}/client` : outputDir;
            const serverOutputDir: string = outputMode === 'server' ? `${outputDir}/server` : outputDir;
            // Construct normalized base path: docs => /docs/, /docs => /docs/, '' => '/'
            const basePath = `/${astroConfig.base ?? ''}/`.replace(/\/\//g, '/');
            const redirects = astroConfig.redirects || {};

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
                    try {
                        logger.info('The @astrojs/node adapter was not found. Installing...');
                        await runCommand('npx astro add node --yes');
                    } catch (e) {
                        throw new CliError(`Failed to install @astrojs/node adapter: ${e}`);
                    }
                }
            }

            if (config.skipFrameworkBuild) {
                logger.info(`Skipping Astro build and using existing build output...`);
            } else {
                try {
                    logger.info('Building Astro project...');
                    await runCommand(config.buildCommand || 'npx astro build');
                } catch (e) {
                    throw new CliError(`Failed to build Astro project: ${e}`);
                }
            }

            // Astro in server mode with server-side rendered pages
            if (outputMode === 'server') {
                // Configure app
                config.app.include[serverOutputDir] = true;
                config.app.include[clientOutputDir] = false;
                config.app.entrypoint = join(serverOutputDir, 'entry.mjs');
                config.app.copyDependencies = true;

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
                        path: `${basePath}404.html`,
                        description: 'Serve 404.html page by default',
                    },
                ]);
            }

            // Include astro.config.mjs in debugAssets for debugging
            config.debugAssets.include[`./astro.config.{js,ts,mjs,cjs}`] = true;

            // Configure assets
            config.assets.convertHtmlToFolders = true;
            config.assets.include[publicDir] = `./`; // public assets are without base path
            config.assets.include[clientOutputDir] = `.${basePath}`;
            config.assets.include[join(clientOutputDir, '_astro')] = false;

            // Configure permanent assets
            config.permanentAssets.include[join(clientOutputDir, '_astro')] = `.${basePath}_astro`;

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
                        title: 'Hint',
                        borderColor: 'brand',
                    },
                );
            }

            // Configure redirects from astro.config.mjs,
            // so they work also for static assets, pre-rendered pages, etc...
            for (const [sourcePattern, destinationPattern] of Object.entries(redirects)) {
                const path = filenameToPath(sourcePattern);
                const to = filenameToPath(typeof destinationPattern === 'string' ? destinationPattern : destinationPattern.destination);
                const statusCode = typeof destinationPattern === 'string' ? 302 : (destinationPattern.status ?? 302);
                config.router.match(
                    {
                        path,
                    },
                    [
                        {
                            type: 'redirect',
                            to,
                            statusCode,
                        },
                    ],
                );
            }
        },

        'dev:start': async ({ config }) => {
            try {
                logger.info('Starting Astro development server...');
                await runCommand(config.devCommand || `astro dev --port ${process.env.PORT || '3000'}`);
            } catch (e) {
                throw new CliError(`Failed to start Astro development server: ${e}`);
            }
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
