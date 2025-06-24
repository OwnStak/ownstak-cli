import { existsSync, readFileSync } from 'fs';
import { readFile, copyFile, rename, rm, writeFile, appendFile } from 'fs/promises';
import { resolve, dirname } from 'path';
import { spawn } from 'child_process';
import { logger } from '../../logger.js';
import { findMonorepoRoot } from '../../utils/pathUtils.js';
import semver from 'semver';
import { BuildHookArgs, Config, FrameworkAdapter, HookArgs } from '../../config.js';
import { getFileModuleType, getModuleFileUrl, getProjectType } from '../../utils/moduleUtils.js';
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
};

let nextConfig: NextJsConfig;
let distDir: string;
let basePath: string;
let buildId: string;

export const nextjsFrameworkAdapter: FrameworkAdapter = {
    name: FRAMEWORKS.NextJs,
    hooks: {
        'build:start': async ({ config }: HookArgs): Promise<void> => {
            const monorepoRoot = (await findMonorepoRoot()) || process.cwd();
            const packageJsonPath = resolve('package.json');
            const monorepoPackageJsonPath = resolve(monorepoRoot, 'package.json');
            const nextVersion = getNextVersion(packageJsonPath) || getNextVersion(monorepoPackageJsonPath);
            if (!nextVersion) {
                throw new CliError(`Failed to detect installed Next.js version. Please install Next.js first.`);
            }

            // Extract only the version number from canary, etc... otherwise semver will fail
            const cleanedNextVersion = nextVersion.match(/(\d+\.\d+\.\d+)/)?.[1];
            if (!cleanedNextVersion) {
                throw new CliError(`Failed to extract Next.js version from '${nextVersion}'.`);
            }

            const minSupportedVersion = '13.4.0';
            if (semver.lt(cleanedNextVersion, minSupportedVersion)) {
                throw new CliError(`Next.js version ${nextVersion} is not supported by ${BRAND}. Please upgrade to ${minSupportedVersion} or newer.`);
            }

            if (config.skipFrameworkBuild) {
                logger.info(`Skipping Next.js framework build and using existing output...`);
            } else {
                process.env.NEXT_PRIVATE_MINIMAL_MODE = 'true';
                process.env.NEXT_PRIVATE_STANDALONE = 'true';
                process.env.NEXT_PRIVATE_OUTPUT_TRACE_ROOT = monorepoRoot;
                await buildNextApp();
            }

            // Load built Next.js config with defaults from the Next.js server
            // and our ownstakNextConfig.
            nextConfig = await loadNextConfig();
            nextConfig.images ??= {};
            nextConfig.images.loader ??= 'default';
            distDir = nextConfig.distDir || '.next';
            basePath = nextConfig.basePath || '/';
            // Load buildId from the build output
            buildId = await readFile(resolve(distDir, 'BUILD_ID'), 'utf-8');

            if (nextConfig.images.loader === 'custom') {
                logger.info(`Next.js was built with custom image loader: ${nextConfig.images.loaderFile}`);
            } else {
                logger.info(`Next.js was built with image loader: ${nextConfig.images.loader}`);
            }

            // Append env vars to .env.production file or create a new one if it doesn't exist
            const envProductionPath = resolve(distDir, 'standalone', '.env.production');
            if (!existsSync(envProductionPath)) await writeFile(envProductionPath, '');
            await appendFile(envProductionPath, `\r\n__NEXT_PRIVATE_PREBUNDLED_REACT=next`);

            // Load buildId from the build output
            buildId = await readFile(resolve(distDir, 'BUILD_ID'), 'utf-8');

            // Include next.config.js in debugAssets,
            // so we can debug customer's issues with their next.config.js file.
            config.debugAssets.include[`./next.config.{js,ts,mjs}`] = true;

            // Next.js outputs prerendered pages into [page-name].html files.
            // The below config transforms such a file into normalized format with a folder as path and index.html file in it, that can be served directly.
            // For example: /products/123.html -> /products/123/index.html
            config.assets.htmlToFolders = true;

            // Include static assets and prerendered pages and serve them from the base path.
            // For example: /favicon.ico -> /docs/favicon.ico
            // For example: /docs/index.html -> /docs/index.html
            config.assets.include[`./public`] = `.${basePath}/`;
            config.assets.include[`${distDir}/standalone/${distDir}/server/pages/**/*.{html,htm}`] = `.${basePath}/**`;
            config.assets.include[`${distDir}/standalone/${distDir}/server/app/**/*.{html,htm}`] = `.${basePath}/**`;

            // Include props of pre-rendered pages
            // For example: /_next/data/{buildId}/products/123.json
            config.permanentAssets.include[`${distDir}/standalone/${distDir}/server/pages/**/*.json`] = `.${basePath}/_next/data/${buildId}/**`;
            // Exclude trace json files from permanent assets to save space, we don't need them
            config.permanentAssets.include[`${distDir}/standalone/${distDir}/server/pages/**/*.nft.json`] = false;

            // Edge case: If i18n is enabled, we need to also copy default locale pre-rendered pages to the base path.
            // Usually, this is handled by the Next.js server, but because we moved the pre-rendered pages to S3, we need to handle it here.
            // For example: /en/products/123.html -> /products/123/index.html
            // For example: /en/index.html -> /docs/index.html
            // For example: /_next/data/{buildId}/en/products/123.json -> /_next/data/{buildId}/products/123.json
            if (nextConfig.i18n?.defaultLocale) {
                config.assets.include[`${distDir}/standalone/${distDir}/server/pages/${nextConfig.i18n.defaultLocale}/**/*.{html,htm}`] = `.${basePath}/**`;
                config.assets.include[`${distDir}/standalone/${distDir}/server/app/${nextConfig.i18n.defaultLocale}/**/*.{html,htm}`] = `.${basePath}/**`;

                // Include props of pre-rendered pages with with default locale
                config.permanentAssets.include[`${distDir}/standalone/${distDir}/server/pages/${nextConfig.i18n.defaultLocale}/**/*.json`] =
                    `.${basePath}/_next/data/${buildId}/**`;
                // Exclude trace json files from permanent assets to save space, we don't need them
                config.permanentAssets.include[`${distDir}/standalone/${distDir}/server/pages/${nextConfig.i18n.defaultLocale}/**/*.nft.json`] = false;
            }

            // Include static assets with file hash
            config.permanentAssets.include[`${distDir}/static/**`] = `.${basePath}/_next/static/**`;

            // Includes all required JS files to run the Next.js server in compute.
            config.app.include[`${distDir}/standalone/`] = `./`;

            // Exclude @img and sharp binaries to save up space if our custom image loader is used
            if (nextConfig.images.loader == 'custom') {
                config.app.include[`node_modules/@img`] = false;
                config.app.include[`node_modules/sharp`] = false;
            }

            // Exclude prerendered pages from compute folder to save space
            config.app.include[`${distDir}/server/pages/**/*.{html,htm,json,rsc}`] = false;
            config.app.include[`${distDir}/server/app/**/*.{html,htm,json,rsc}`] = false;

            // Keep only 404.html,500.html files in the compute folder, otherwise Next.js server throws an error
            config.app.include[`${distDir}/standalone/${distDir}/server/pages/**/{404,500}.html`] = `${distDir}/server/pages/**`;

            // Start the Next.js server from the server.js file
            config.app.entrypoint = `./server.js`;

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
        'dev:start': async (): Promise<void> => {
            logger.info('Starting Next.js development server...');
            const devProcess = spawn('npx', ['next', 'dev'], {
                stdio: 'inherit',
                shell: true,
                env: process.env,
            });
            devProcess.on('close', (code) => {
                logger.info(`Next.js development server closed with code ${code}`);
            });

            devProcess.on('error', (err) => {
                logger.error(`Failed to start Next.js development server: ${err}`);
            });
        },
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
 * Builds the Next.js app.
 */
export async function buildNextApp() {
    const nextConfigPath = [resolve('next.config.js'), resolve('next.config.mjs'), resolve('next.config.ts'), resolve('next.config.cjs')].find(existsSync);
    if (!nextConfigPath) {
        throw new Error('Next.js config file was not found');
    }

    // Maintain original extension, so next.js correctly compiles TS files for us
    const nextConfigExtension = nextConfigPath?.split('.').pop();
    const nextConfigOriginalPath = nextConfigPath.replace(`.${nextConfigExtension}`, `.original.${nextConfigExtension}`);

    if (!existsSync(nextConfigOriginalPath)) {
        // Backup original next.config.js file
        await rename(nextConfigPath, nextConfigOriginalPath);

        // Load proper template based on extension and project type
        // next.config.ts => ownstak.next.config.ts
        // next.config.mjs => ownstak.next.config.mjs
        const nextConfigModuleType = getFileModuleType(nextConfigOriginalPath);
        const nextConfigTemplateExtension = {
            module: 'mjs',
            commonjs: 'cjs',
            typescript: 'ts',
        }[nextConfigModuleType];
        const nextConfigTemplatePath = resolve(__dirname, '..', '..', 'templates', 'nextjs', `ownstak.next.config.${nextConfigTemplateExtension}`);

        logger.info(`Adding ${BRAND} Next.js config (${nextConfigModuleType})...`);
        // We need to use static import, so next.js can correctly transpile TS
        const nextConfigTemplate = (await readFile(nextConfigTemplatePath, 'utf-8')).replace('{{ nextConfigOriginalPath }}', nextConfigOriginalPath);
        await writeFile(nextConfigPath, nextConfigTemplate);
    }

    const imageLoaderTemplatePath = resolve(__dirname, '..', '..', 'templates', 'nextjs', 'ownstak.image.loader.js');
    const imageLoaderPath = resolve('ownstak.image.loader.js');
    if (!existsSync(imageLoaderPath)) {
        // Copy our image loader to the project
        await copyFile(imageLoaderTemplatePath, imageLoaderPath);
    }

    // Properly cleanup after build on SIGINT
    let cleanupAfterBuild = () => {};
    process.on('SIGINT', cleanupAfterBuild);
    cleanupAfterBuild = async () => {
        // Prevent multiple calls between async operations
        process.removeListener('SIGINT', cleanupAfterBuild);
        if (process.env.LOG_LEVEL === 'debug') {
            logger.info(`Keeping used config files for debugging purposes...`);
            return;
        }
        logger.info(`Cleaning up after Next.js build...`);
        await rm(imageLoaderPath);
        await rm(nextConfigPath);
        if (existsSync(nextConfigOriginalPath)) {
            await rename(nextConfigOriginalPath, nextConfigPath);
        }
    };

    logger.info('Building Next.js application...');
    const buildArgs = ['next', 'build'];
    logger.debug(`Running: npx ${buildArgs.join(' ')}`);
    const buildProcess = spawn('npx', buildArgs, {
        stdio: 'inherit',
        shell: true,
    });

    const buildResult = await new Promise<number>((resolve) => {
        buildProcess.on('close', (code) => resolve(code ?? 1));
        buildProcess.on('error', () => resolve(1));
    });

    await cleanupAfterBuild();
    if (buildResult !== 0) {
        throw new CliError(
            `Next.js build failed with exit code ${buildResult}. Please check the build logs for error details. You might also try to first build the Next.js without ${BRAND} CLI using \`npx next build\`.` +
                `\n\nIf you want see more details and used config from ownstak, you can run: \`npx ${NAME} build --debug\`.`,
        );
    }

    logger.info('Next.js build completed successfully!');
}

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
        throw new CliError(`Failed to load Next.js config: ${error}`);
    }
}
