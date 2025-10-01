import { logger, LogLevel } from '../../logger.js';
import type { FrameworkAdapter } from '../../config.js';
import { BRAND, FRAMEWORKS } from '../../constants.js';
import { runCommand } from '../../utils/processUtils.js';
import { CliError } from '../../cliError.js';
import { existsSync } from 'fs';
import { join, resolve } from 'path';
import { normalizePath, pathToRegexp } from '../../utils/pathUtils.js';
import { getModuleVersion, isModulePresent } from '../../utils/moduleUtils.js';
import { bundleRequire } from 'bundle-require';
import semver from 'semver';

export interface NuxtConfig {
    app?: {
        baseURL?: string;
    };
    nitro?: {
        output?: {
            dir?: string;
            publicDir?: string;
            serverDir?: string;
        };
        routeRules?: Record<
            string,
            {
                headers?: Record<string, string>;
                redirect?: string;
                statusCode?: number;
                isr?: number | boolean;
                swr?: number | boolean;
            }
        >;
    };
}

let nuxtConfig: NuxtConfig | undefined;

/**
 * The framework adapter for the Nuxt
 */
export const nuxtFrameworkAdapter: FrameworkAdapter = {
    name: FRAMEWORKS.Nuxt,
    hooks: {
        'build:start': async ({ config }) => {
            // Get the actual used nuxt version from node_modules/nuxt/package.json
            const nuxtVersion = await getModuleVersion('nuxt');
            if (!nuxtVersion) {
                throw new CliError(`Failed to detect installed Nuxt version. Please install Nuxt first.`);
            }

            // Extract only the version number from '-alpha-4', etc... otherwise semver will fail
            const cleanedNuxtVersion = nuxtVersion.match(/(\d+\.\d+\.\d+)/)?.[1];
            if (!cleanedNuxtVersion) {
                throw new CliError(`Failed to extract Nuxt version from '${nuxtVersion}'. Please try to install Nuxt first.`);
            }

            const minSupportedVersion = '3.0.0';
            if (semver.lt(cleanedNuxtVersion, minSupportedVersion)) {
                throw new CliError(`Nuxt version ${nuxtVersion} is not supported by ${BRAND}. Please upgrade to ${minSupportedVersion} or newer.`);
            }

            if (config.skipFrameworkBuild) {
                logger.info(`Skipping Nuxt build and using existing build output...`);
            } else {
                try {
                    logger.info('Building Nuxt...');
                    await runCommand(config.buildCommand || `npx nuxt build --standalone`);
                } catch (e) {
                    throw new CliError(`Failed to build Nuxt project: ${e}`);
                }
            }

            nuxtConfig = await loadNuxtConfig();
            const baseURL = normalizePath(`/${nuxtConfig.app?.baseURL || ''}/`);
            const outDir = nuxtConfig.nitro?.output?.dir || '.output';
            if (!existsSync(outDir)) {
                throw new CliError(
                    `The ${BRAND} failed to find '${outDir}' directory with the Nuxt build output. ` +
                        `Please try the following steps to fix the issue:\r\n` +
                        `- Make sure that '${outDir}' directory exists and the build was successful.\r\n` +
                        `- Create 'nuxt.config.ts' file first and define 'nitro.output.dir' option or change the 'nitro.output.dir' back to default '.output' name, so ${BRAND} can find it.\r\n`,
                );
            }

            const publicOutDir = nuxtConfig.nitro?.output?.publicDir || join(outDir, 'public');
            const serverOutDir = nuxtConfig.nitro?.output?.serverDir || join(outDir, 'server');

            // Configure app
            config.app.include[serverOutDir] = true;
            config.app.include[publicOutDir] = false;
            config.app.entrypoint = join(serverOutDir, 'index.mjs');

            // Configure static assets
            config.assets.convertHtmlToFolders = true;
            config.assets.include[publicOutDir] = `.${baseURL}`;
            config.assets.include[join(publicOutDir, '_nuxt')] = false;

            // Configure permanent assets
            config.permanentAssets.include[join(publicOutDir, '_nuxt')] = `.${baseURL}_nuxt`;

            // Add nuxt config to debug assets
            config.debugAssets.include[`./nuxt.config.{js,ts,mjs,cjs}`] = true;
        },
        'build:routes:start': async ({ config }) => {
            // Extract headers and redirects from nuxt.config.ts
            // so they work also for static assets, pre-rendered pages, etc...
            const routeRules = nuxtConfig?.nitro?.routeRules || {};
            const normalizedRouteRules = Object.entries(routeRules).map(([path, rule]) => {
                // Convert nitro path condition to path-to-regex condition
                // e.g: /blog/* -> /blog/:path, /blog/** -> /blog/:path*
                path = path.replace('/**', '/:path*').replace('/*', '/:path');
                // Convert all path-to-regex patterns to pure regex patterns so we can later use single array condition.
                // Exact paths are left as is.
                // e.g. /blog/:id -> /blog/\d+
                return {
                    path: path.includes(':') ? pathToRegexp(path).pathRegex : path,
                    rule,
                };
            });

            // First apply redirect and headers, so they work also for static assets, pre-rendered pages, etc...
            for (const { path, rule } of normalizedRouteRules) {
                if (rule.redirect) {
                    config.router.match({ path }, [
                        {
                            type: 'redirect',
                            to: rule.redirect,
                            statusCode: rule.statusCode || 302,
                        },
                    ]);
                }
                if (rule.headers) {
                    config.router.match(
                        { path },
                        Object.entries(rule.headers).map(([key, value]) => ({ type: 'setResponseHeader', key, value })),
                    );
                }
            }

            // Then add route for all SWR and ISR pages,
            // to skip prerendered pages and serve Nuxt server with correct cache headers instead.
            const revalidationPaths = normalizedRouteRules.filter(({ rule }) => rule.swr || rule.isr).map(({ path }) => path);
            if (revalidationPaths.length > 0) {
                config.router.match(
                    { path: revalidationPaths },
                    [
                        {
                            type: 'serveApp',
                            description: 'Skip prerendered pages and serve Nuxt server',
                        },
                    ],
                    true,
                );
            }
        },
        'build:routes:finish': ({ config }) => {
            // Proxy all requests to the Nuxt server by default.
            config.router.any([
                {
                    type: 'serveApp',
                    description: 'Serve Nuxt server by default',
                },
            ]);
        },
        'dev:start': async ({ config }) => {
            try {
                logger.info('Starting Nuxt development server...');
                await runCommand(config.devCommand || `npx nuxt dev --port ${process.env.PORT || '3000'} --host ${process.env.HOST || '0.0.0.0'}`);
            } catch (e) {
                throw new CliError(`Failed to start Nuxt development server: ${e}`);
            }
        },
    },
    async isPresent() {
        return isModulePresent('nuxt');
    },
};

async function loadNuxtConfig(): Promise<NuxtConfig> {
    logger.debug('Loading Nuxt config...');
    const nuxtConfigPath = getNuxtConfigPath();
    if (!nuxtConfigPath) {
        return {};
    }

    try {
        // Add fake Nuxt globals, so config without imports doesn't fail
        (globalThis as any).defineNuxtConfig = (globalThis as any).defineConfig = (config: any) => config;
        const { mod } = await bundleRequire({
            filepath: nuxtConfigPath,
            externalNodeModules: true,
        });
        const nuxtConfig = mod.default?.default || mod.default || mod;
        if (typeof nuxtConfig === 'function') {
            return nuxtConfig() || {};
        }
        return nuxtConfig || {};
    } catch (e) {
        logger.drawTable(
            [
                `${BRAND} failed to load the Nuxt config from '${nuxtConfigPath}' file.`,
                `The customized 'nitro.output.publicDir' config options won't work.`,
                `The ${BRAND} will look for the Nuxt build output in the default 'dist' directory.`,
                `Please run the build command again with the --debug flag to see more details.`,
            ],
            {
                logLevel: LogLevel.WARN,
                title: 'Warning',
            },
        );
        logger.debug(`Nuxt config error: ${e}`);
        return {};
    }
}

function getNuxtConfigPath() {
    return [resolve('nuxt.config.ts'), resolve('nuxt.config.mjs'), resolve('nuxt.config.cjs'), resolve('nuxt.config.js')].find(existsSync);
}
