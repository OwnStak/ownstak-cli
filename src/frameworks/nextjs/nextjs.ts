import { existsSync } from 'fs';
import { readFile, copyFile, rename, rm, writeFile, appendFile } from 'fs/promises';
import { resolve, dirname, relative } from 'path';
import { logger, LogLevel } from '../../logger.js';
import { findMonorepoRoot } from '../../utils/pathUtils.js';
import semver from 'semver';
import { BuildHookArgs, FrameworkAdapter, HookArgs } from '../../config.js';
import { getFileModuleType, getModuleFileUrl, getModuleVersion, isModulePresent } from '../../utils/moduleUtils.js';
import { runCommand } from '../../utils/processUtils.js';
import { BRAND, FRAMEWORKS, NAME } from '../../constants.js';
import { fileURLToPath } from 'url';
import { getPrerenderManifest, getRoutesManifest, Has } from './manifests.js';
import { RouteCondition } from '../../compute/router/route.js';
import { CliError } from '../../cliError.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export type NextJsConfig = {
    distDir?: string;
    basePath?: string;
    output?: 'standalone' | 'server';
    images?: {
        loader?: string;
        loaderFile?: string;
    };
    i18n?: {
        locales?: string[];
        defaultLocale?: string;
        localeDetection?: boolean;
    };
    headers?: Array<any> | (() => Promise<Array<any>>);
    redirects?: Array<any> | (() => Promise<Array<any>>);
    rewrites?: Array<any> | (() => Promise<Array<any>>);
    trailingSlash?: boolean;
    outputFileTracingRoot?: string;
    experimental?: {
        outputFileTracingRoot?: string;
        // NOTE: Lambda has read-only file system,
        // so we need to disable isrFlushToDisk to prevent Next.js from logging warnings about failed ISR writes.
        isrFlushToDisk?: boolean;
    };
};

let nextConfig: NextJsConfig;
let tracingRoot: string;
let tracingRootRelative: string;

let distDir: string;
let basePath: string;
let buildId: string;

/**
 * The framework adapter for the Next.js framework (both pages and app router).
 * Doesn't support build output produced by the `npx next export` command.
 * For that, use the static framework adapter instead.
 */
export const nextjsFrameworkAdapter: FrameworkAdapter = {
    name: FRAMEWORKS.NextJs,
    hooks: {
        'build:start': async ({ config }: HookArgs): Promise<void> => {
            const projectRoot = process.cwd();
            const monorepoRoot = (await findMonorepoRoot()) || projectRoot;

            // Get the actual used next version from node_modules/next/package.json
            const nextVersion = await getModuleVersion('next');
            if (!nextVersion) {
                throw new CliError(`Failed to detect installed Next.js version. Please install Next.js first.`);
            }

            // Extract only the version number from 'canary-15.4.5', etc... otherwise semver will fail
            const cleanedNextVersion = nextVersion.match(/(\d+\.\d+\.\d+)/)?.[1];
            if (!cleanedNextVersion) {
                throw new CliError(`Failed to extract Next.js version from '${nextVersion}'. Please try to install Next.js first.`);
            }

            const minSupportedVersion = '13.0.0';
            if (semver.lt(cleanedNextVersion, minSupportedVersion)) {
                throw new CliError(`Next.js version ${nextVersion} is not supported by ${BRAND}. Please upgrade to ${minSupportedVersion} or newer.`);
            }

            // Add our next.config wrapper and load next config together with defaults from the Next.js server.
            const { cleanupNextConfigWrapper } = await addNextConfigWrapper();
            nextConfig = await loadNextConfig();
            nextConfig.images ??= {};
            nextConfig.images.loader ??= 'default';
            distDir = nextConfig.distDir || '.next';
            basePath = nextConfig.basePath || '/';

            // Get the outputFileTracingRoot for cases where the project is built inside a monorepo.
            // The standalone build folder then has completely different structure and starts from the monorepo root.
            // But not always. Only when Next.js detects imports from outside of the project root.
            // Simple project standalone server location: /projects/my-nextjs-app/.next/standalone/server.js
            // Monorepo project standalone server location: /projects/my-monorepo/packages/my-nextjs-app/.next/standalone/packages/my-nextjs-app/server.js
            // Simple project outputFileTracingRootRelative: /projects/my-nextjs-app/ => ./
            // Monorepo project outputFileTracingRootRelative: /projects/my-monorepo/packages/my-nextjs-app/ => ./packages/my-nextjs-app/
            tracingRoot = nextConfig.outputFileTracingRoot || nextConfig.experimental?.outputFileTracingRoot || monorepoRoot;
            tracingRootRelative = relative(tracingRoot, projectRoot) || './'; // Relative returns empty string if both from and to args are the same.

            logger.debug(`Next.js config: ${JSON.stringify(nextConfig, null, 2)}`);
            logger.debug(`Dist dir: ${distDir}`);
            logger.debug(`Base path: ${basePath}`);
            logger.debug(`Tracing root: ${tracingRoot}`);

            if (config.skipFrameworkBuild) {
                logger.info(`Skipping Next.js framework build and using existing output...`);
            } else {
                try {
                    logger.info(`Building Next.js application...`);
                    process.env.NEXT_PRIVATE_STANDALONE = 'true';
                    process.env.NEXT_PRIVATE_OUTPUT_TRACE_ROOT = tracingRoot;
                    await runCommand(config.buildCommand || 'npx next build');
                    await cleanupNextConfigWrapper();
                } catch (e) {
                    await cleanupNextConfigWrapper();
                    throw new CliError(
                        `Next.js build failed. Please check the build logs for error details. You might also try to first build the Next.js without ${BRAND} CLI using \`npx next build\`.` +
                            `\n\nIf you want see more details and used config from ownstak, you can run: \`npx ${NAME} build --debug\`.`,
                    );
                }
            }

            if (!existsSync(distDir)) {
                throw new CliError(
                    `The ${BRAND} failed to find '${distDir}' directory with the Next.js build output. ` +
                        `Please try the following steps to fix the issue:\r\n` +
                        `- Make sure that '${distDir}' directory exists and the build was successful.\r\n` +
                        `- Create 'next.config.js' file first and define 'distDir' option or change the 'distDir' back to default '.next' name, so ${BRAND} can find it.\r\n`,
                );
            }

            // Load buildId from the build output
            buildId = await readFile(resolve(distDir, 'BUILD_ID'), 'utf-8');

            // Append env vars to .env.production file or create a new one if it doesn't exist
            const envProductionPath = resolve(distDir, 'standalone', '.env.production');
            if (!existsSync(envProductionPath)) await writeFile(envProductionPath, '');
            await appendFile(envProductionPath, `\r\n__NEXT_PRIVATE_PREBUNDLED_REACT=next`);

            // Include next.config.js in debugAssets,
            // so we can debug customer's issues with their next.config.js file.
            config.debugAssets.include[`./next.config.{js,ts,mjs}`] = true;

            // Next.js outputs prerendered pages into [page-name].html files.
            // The below config transforms such a file into normalized format with a folder as path and index.html file in it, that can be served directly.
            // For example: /products/123.html -> /products/123/index.html
            config.assets.convertHtmlToFolders = true;

            // Include static assets and prerendered pages and serve them from the base path.
            // For example: /favicon.ico -> /docs/favicon.ico
            // For example: /docs/index.html -> /docs/index.html
            config.assets.include[`./public`] = `.${basePath}/`;
            config.assets.include[`${distDir}/server/pages/**/*.html`] = `.${basePath}/**`;
            config.assets.include[`${distDir}/server/app/**/*.html`] = `.${basePath}/**`;

            // Include props of pre-rendered pages
            // For example: /_next/data/{buildId}/products/123.json
            config.permanentAssets.include[`${distDir}/server/pages/**/*.json`] = `.${basePath}/_next/data/${buildId}/**`;
            // Exclude trace json files from permanent assets to save space, we don't need them
            config.permanentAssets.include[`${distDir}/server/pages/**/*.nft.json`] = false;

            // Edge case: If i18n is enabled, we need to also copy default locale pre-rendered pages to the base path.
            // Usually, this is handled by the Next.js server, but because we moved the pre-rendered pages to S3, we need to handle it here.
            // For example: /en/products/123.html -> /products/123/index.html
            // For example: /en/index.html -> /docs/index.html
            // For example: /_next/data/{buildId}/en/products/123.json -> /_next/data/{buildId}/products/123.json
            if (nextConfig.i18n?.defaultLocale) {
                config.assets.include[`${distDir}/server/pages/${nextConfig.i18n.defaultLocale}/**/*.html`] = `.${basePath}/**`;
                config.assets.include[`${distDir}/server/app/${nextConfig.i18n.defaultLocale}/**/*.html`] = `.${basePath}/**`;

                // Include props of pre-rendered pages with with default locale
                config.permanentAssets.include[`${distDir}/server/pages/${nextConfig.i18n.defaultLocale}/**/*.json`] = `.${basePath}/_next/data/${buildId}/**`;
                // Exclude trace json files from permanent assets to save space, we don't need them
                config.permanentAssets.include[`${distDir}/server/pages/${nextConfig.i18n.defaultLocale}/**/*.nft.json`] = false;
            }

            // Include static assets with file hash
            config.permanentAssets.include[`${distDir}/static/**`] = `.${basePath}/_next/static/**`;

            // Include all required JS files to run the Next.js server in compute.
            // DON'T put ${tracingRootRelative} here, we want to also include all traced imports from the monorepo root.
            config.app.include[`${distDir}/standalone/**`] = `./**`;

            // Exclude @img and sharp binaries to save up space if our custom image loader is used
            if (nextConfig.images.loader == 'custom') {
                config.app.include[`${distDir}/standalone/node_modules/@img/**`] = false;
                config.app.include[`${distDir}/standalone/node_modules/sharp/**`] = false;
            }

            // Exclude prerendered pages from compute folder to save space
            config.app.include[`${distDir}/standalone/${tracingRootRelative}/${distDir}/server/pages/**/*.{html,htm,json,rsc}`] = false;
            config.app.include[`${distDir}/standalone/${tracingRootRelative}/${distDir}/server/app/**/*.{html,htm,json,rsc}`] = false;

            // Keep only 404.html,500.html files in the compute folder, otherwise Next.js server throws an error
            config.app.include[`${distDir}/standalone/${tracingRootRelative}/${distDir}/server/pages/**/{404,500}.html`] =
                `${tracingRootRelative}/${distDir}/server/pages/**`;

            // Start the Next.js server from the server.js file
            config.app.entrypoint = config.app.entrypoint || `${tracingRootRelative}/server.js`;

            // If project uses Next's Image Optimizer,
            // we need to transform all relative URLs poting to /_next/image to absolute URLs on the fly,
            // so the Next.js image loader works correctly and doesn't try to load assets on local file system inside the compute.
            if (nextConfig?.images?.loader === 'default') {
                config.addNodeFunction(resolve(__dirname, 'nextImageTransform.js'), {
                    path: '/_next/image',
                });
            }
        },
        'build:routes:start': async ({ config }: HookArgs): Promise<void> => {
            const { headers = [], rewrites = [], redirects = [] } = await getRoutesManifest(distDir);

            // Converts Next.js has config to our route condition
            const hasToCondition = (has: Has[]) => {
                const routeCondition: RouteCondition = {};
                for (const { type, key, value = /(.+)/ } of has) {
                    if (!key) continue;

                    if (type === 'header') {
                        routeCondition.header ??= {};
                        routeCondition.header[key] = value;
                    } else if (type === 'cookie') {
                        routeCondition.cookie ??= {};
                        routeCondition.cookie[key] = value;
                    } else if (type === 'query') {
                        routeCondition.query ??= {};
                        routeCondition.query[key] = value;
                    } else if (type === 'host') {
                        routeCondition.header ??= {};
                        routeCondition.header.host = value;
                    }
                }
                return routeCondition;
            };

            const beforeFilesRewrites = Array.isArray(rewrites) ? rewrites : rewrites.beforeFiles;
            for (const rewriteDefinition of beforeFilesRewrites) {
                const source = rewriteDefinition.source; // Source in either path-to-regex (/products/:id) or regex format
                const destination = rewriteDefinition.destination || '/$1'; // Destination in path-to-regex (/products/:id) format or regex format (/products/$1)
                const routeCondition = hasToCondition(rewriteDefinition.has || []);
                routeCondition.path = source;
                config.router.addRouteFront(routeCondition, [
                    {
                        type: 'rewrite',
                        description: 'Rewrite from Next.js',
                        from: source,
                        to: destination,
                    },
                ]);
            }

            for (const headerDefinition of headers) {
                const headers = headerDefinition.headers || [];
                const routeCondition = hasToCondition(headerDefinition.has || []);
                routeCondition.path = new RegExp(headerDefinition.regex || '(.+)'); // Source in regex format
                config.router.addRouteFront(
                    routeCondition,
                    headers.map(({ key, value }) => ({
                        type: 'setResponseHeader',
                        description: 'Header from Next.js',
                        key,
                        value,
                    })),
                );
            }

            for (const redirectDefinition of redirects) {
                const source = redirectDefinition.source; // Source in either path-to-regex (/products/:id) or regex format
                const destination = redirectDefinition.destination || '/$1'; // Destination in path-to-regex (/products/:id) format or regex format (/products/$1)
                const routeCondition = hasToCondition(redirectDefinition.has || []);
                routeCondition.path = source;
                config.router.addRouteFront(
                    routeCondition,
                    [
                        {
                            type: 'redirect',
                            description: 'Redirect from Next.js',
                            to: destination,
                            statusCode: redirectDefinition.statusCode || 302,
                        },
                    ],
                    true,
                );
            }

            // If __prerender_bypass and __preview_data cookies are present, bypass prerendered pages and serve the fresh page from the app instead,
            // so the preview mode works correctly.
            // NOTE: This must be in the 'build:routes:finish' hook, so this runs is added before the default routes for static assets.
            config.router.match(
                {
                    cookie: {
                        __prerender_bypass: /(.+)/,
                        __preview_data: /(.+)/,
                    },
                    // Do not match static assets with path extension, such as .css, .js, .png, etc.
                    // Only HTML pages, such as /docs.
                    pathExtension: '',
                },
                [
                    {
                        type: 'serveApp',
                        description: 'Skip prerendered pages and serve Next.js server in preview mode',
                    },
                ],
                true,
            );

            // Skip pre-rendered pages with revalidation
            const { routes = {} } = await getPrerenderManifest(distDir);
            const revalidationPaths = Object.entries(routes).flatMap(([routePath, route]) => {
                if (!route.initialRevalidateSeconds) return [];

                const paths: (string | RegExp)[] = [routePath];
                if (route.dataRoute) paths.push(route.dataRoute);
                return paths.map((path) => `${basePath}${path}`.replace(/\/+/g, '/'));
            });
            if (revalidationPaths.length > 0) {
                config.router.match(
                    {
                        path: revalidationPaths,
                    },
                    [
                        {
                            type: 'serveApp',
                            description: 'Skip prerendered pages and serve Next.js server for revalidation pages',
                        },
                    ],
                    true,
                );
            }
        },
        'build:routes:finish': async ({ config }: BuildHookArgs): Promise<void> => {
            // Proxy all requests to the Next.js server by default.
            config.router.any([
                {
                    type: 'serveApp',
                    description: 'Serve Next.js server by default',
                },
            ]);
        },
        'dev:start': async ({ config }: HookArgs): Promise<void> => {
            logger.info('Starting Next.js development server...');
            await runCommand(config.devCommand || `next dev --port ${process.env.PORT || '3000'}`);
        },
    },

    async isPresent() {
        return isModulePresent('next');
    },
};

/**
 * Load the Next.js config with defaults from the Next.js server.
 * This methods works with all types of Next.js configs (js, ts, mjs, cjs).
 * @returns The Next.js config
 */
async function loadNextConfig() {
    try {
        const loadConfigModuleUrl = await getModuleFileUrl('next', 'dist/server/config.js');
        const loadConfigModule = await import(loadConfigModuleUrl);
        const loadConfig = loadConfigModule.default?.default || loadConfigModule.default;
        const nextConfig = await loadConfig('phase-production-server', process.cwd());
        return nextConfig;
    } catch (e: any) {
        logger.drawTable(
            [
                `${BRAND} failed to load the Next.js config.`,
                `The customized 'distDir', 'basePath', 'output' options won't work.`,
                `The ${BRAND} will look for the Next.js build output in the default '.next' directory.`,
                `Please run the build command again with the --debug flag to see more details.`,
            ],
            {
                logLevel: LogLevel.WARN,
                title: 'Warning',
                maxWidth: 65,
            },
        );
        logger.debug(`Next.js config error: ${e.message}`);
        logger.debug(`Stack: ${e.stack}`);
    }
    return {};
}

/**
 * Adds our Next.js config wrapper to the project
 * that injects our image loader and build output.
 */
export async function addNextConfigWrapper() {
    const nextConfigPath = [resolve('next.config.js'), resolve('next.config.mjs'), resolve('next.config.ts'), resolve('next.config.cjs')].find(existsSync);
    if (!nextConfigPath) {
        throw new CliError(
            `The Next.js config file was not found. Please make sure this command is run from the root of your project. ` +
                `If you don't have a next.config.js file, please create a new one and try again.`,
        );
    }

    // Maintain original extension, so next.js correctly compiles TS files for us
    const nextConfigExtension = nextConfigPath?.split('.').pop();
    const nextConfigOriginalPath = nextConfigPath.replace(`.${nextConfigExtension}`, `.original.${nextConfigExtension}`);
    const imageLoaderPath = resolve('ownstak.image.loader.js');

    if (!existsSync(nextConfigOriginalPath)) {
        // Backup original next.config.js file
        await rename(nextConfigPath, nextConfigOriginalPath);

        // Load proper template based on extension and project type
        const nextConfigModuleType = getFileModuleType(nextConfigOriginalPath);
        const nextConfigTemplateExtension = {
            module: 'mjs',
            commonjs: 'cjs',
            typescript: 'ts',
        }[nextConfigModuleType];
        const nextConfigTemplatePath = resolve(__dirname, '..', '..', 'templates', 'nextjs', `ownstak.next.config.${nextConfigTemplateExtension}`);

        logger.info(`Adding ${BRAND} Next.js config (${nextConfigModuleType})...`);
        const nextConfigTemplate = (await readFile(nextConfigTemplatePath, 'utf-8')).replace('{{ nextConfigOriginalPath }}', nextConfigOriginalPath);
        await writeFile(nextConfigPath, nextConfigTemplate);
    }

    const imageLoaderTemplatePath = resolve(__dirname, '..', '..', 'templates', 'nextjs', 'ownstak.image.loader.js');
    if (!existsSync(imageLoaderPath)) {
        await copyFile(imageLoaderTemplatePath, imageLoaderPath);
    }

    const cleanupNextConfigWrapper = async () => {
        if (process.env.LOG_LEVEL === 'debug') {
            logger.info(`Keeping used Next.js config files for debugging purposes...`);
            return;
        }

        logger.info(`Cleaning up after Next.js build...`);
        if (existsSync(imageLoaderPath)) await rm(imageLoaderPath);
        if (existsSync(nextConfigPath)) await rm(nextConfigPath);
        if (existsSync(nextConfigOriginalPath)) await rename(nextConfigOriginalPath, nextConfigPath);
    };

    // Handle CTRL+C
    const handleSigint = async () => {
        await cleanupNextConfigWrapper();
        process.exit(1);
    };
    process.on('SIGINT', handleSigint);

    return {
        cleanupNextConfigWrapper,
        nextConfigPath,
        nextConfigOriginalPath,
        imageLoaderPath,
    };
}
