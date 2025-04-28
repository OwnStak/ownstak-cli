import { fileURLToPath } from 'url';
import { dirname, resolve, join, relative, basename } from 'path';
import { mkdir, rm, writeFile, copyFile, readdir, readFile } from 'fs/promises';
import { existsSync, statSync } from 'fs';
import {
    BUILD_DIR_PATH,
    COMPUTE_DIR_PATH,
    ASSETS_DIR_PATH,
    PERSISTENT_ASSETS_DIR_PATH,
    VERSION,
    PROXY_DIR_PATH,
    DEBUG_DIR_PATH,
    APP_DIR_PATH,
    NAME,
    SUPPORT_URL,
    ASSETS_DIR,
    PERSISTENT_ASSETS_DIR,
    APP_DIR,
    DEBUG_DIR,
    CACHE_CONTROL_CONFIG,
    HEADERS,
    BUILD_DIR,
    NAME_SHORT,
    ASSETS_MANIFEST_FILE_PATH,
    PERSISTENT_ASSETS_MANIFEST_FILE_PATH,
} from '../constants.js';
import { logger, LogLevel } from '../logger.js';
import { BRAND } from '../constants.js';
import { normalizePath } from '../utils/pathUtils.js';
import { glob } from 'glob';
import { Config, FilesConfig, Framework } from '../config.js';
import { detectFramework, getFrameworkAdapter, getFrameworkAdapters } from '../frameworks/index.js';
import { CliError } from '../cliError.js';
import chalk from 'chalk';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface BuildCommandOptions {
    framework?: Framework;
    skipFrameworkBuild?: boolean;
    assetsDir?: string;
}

export async function build(options: BuildCommandOptions) {
    const startTime = Date.now();

    // Prepare build directories
    logger.debug(`Cleaning build directory  '${BUILD_DIR_PATH}'...`);
    // Clear everything under the build directory except the proxy,
    // so we can copy binaries there and test everything locally.
    await rm(COMPUTE_DIR_PATH, { recursive: true, force: true });
    await rm(APP_DIR_PATH, { recursive: true, force: true });
    await rm(ASSETS_DIR_PATH, { recursive: true, force: true });
    await rm(PERSISTENT_ASSETS_DIR_PATH, { recursive: true, force: true });
    await rm(DEBUG_DIR_PATH, { recursive: true, force: true });

    logger.debug(`Creating build directories...`);
    await mkdir(BUILD_DIR_PATH, { recursive: true });
    await mkdir(COMPUTE_DIR_PATH, { recursive: true });
    await mkdir(ASSETS_DIR_PATH, { recursive: true });
    await mkdir(PERSISTENT_ASSETS_DIR_PATH, { recursive: true });
    await mkdir(PROXY_DIR_PATH, { recursive: true });
    await mkdir(APP_DIR_PATH, { recursive: true });
    await mkdir(DEBUG_DIR_PATH, { recursive: true });

    // Add build directory to .gitignore file if not already present
    await addToGitignore(BUILD_DIR);

    // Load config from source file ownstak.config.ts if present.
    // If not, default config is returned.
    const config = await Config.loadFromSource();
    config.framework = options.framework || config.framework || (await detectFramework());
    config.frameworkAdapter ??= getFrameworkAdapter(config.framework);
    config.skipFrameworkBuild = options.skipFrameworkBuild || config.skipFrameworkBuild;

    // Add assets directory to config if specified
    if (options.assetsDir) {
        config.assets.include[`${options.assetsDir}`] = './';
    }

    // Check if framework is supported
    if (config.framework && !config.frameworkAdapter) {
        throw new CliError(
            `The specified framework '${config.framework}' is not supported. \r\n` +
                `The ${NAME} ${VERSION} supports the following frameworks: \r\n` +
                getFrameworkAdapters()
                    .map((adapter) => `- ${adapter.name}`)
                    .join('\r\n') +
                `\r\n\r\n` +
                `Please try the following steps to resolve this issue:\r\n` +
                `- Check the framework name first\r\n` +
                `- If you don't know which framework to use, just run 'npx ${NAME_SHORT} build' and let ${BRAND} detect the framework for you.\r\n` +
                `- If don't see your framework in the list, try to upgrade ${BRAND} CLI to the latest version first by running 'npx ${NAME_SHORT} upgrade'.`,
        );
    }

    // If no framework adapter is found, throw an error
    if (!config.frameworkAdapter) {
        throw new CliError(
            `No supported framework was detected. \r\n` +
                `The ${NAME} ${VERSION} supports the following frameworks: \r\n` +
                getFrameworkAdapters()
                    .map((adapter) => `- ${adapter.name}`)
                    .join('\r\n') +
                `\r\n\r\n` +
                `If you would like to deploy just folder with static assets, please run 'npx ${NAME_SHORT} build static'.`,
        );
    }

    // Run build:start hook
    await config.frameworkAdapter?.hooks['build:start']?.(config);

    // Add project's package.json to debugAssets folder,
    // so we can see the project's dependencies version.
    config.debugAssets.include[`./package.json`] = true;

    // Put the project's package.json in the app directory too,
    // so app runs with correct module type either commonjs or module (ESM).
    config.app.include[`./package.json`] = true;

    // Normalize all paths in the config first
    // For example:
    // \\my\folder\..\folder2 -> /my/folder2
    // /my//folder1 -> /my/folder1
    config.assets = normalizeFilesConfig(config.assets);
    config.persistentAssets = normalizeFilesConfig(config.persistentAssets);
    config.app = normalizeFilesConfig(config.app);
    config.debugAssets = normalizeFilesConfig(config.debugAssets);

    // Copy all files under assets, persistentAssets, compute and debugAssets
    // config properties to corresponding build directory.
    logger.info(`Copying assets to ${ASSETS_DIR} directory...`);
    await copyFiles(config.assets, ASSETS_DIR_PATH);
    logger.info(`Copying persistent assets to ${PERSISTENT_ASSETS_DIR} directory...`);
    await copyFiles(config.persistentAssets, PERSISTENT_ASSETS_DIR_PATH);
    logger.info(`Copying app files to ${APP_DIR} directory...`);
    await copyFiles(config.app, APP_DIR_PATH);
    logger.info(`Copying debug assets to ${DEBUG_DIR} directory...`);
    await copyFiles(config.debugAssets, DEBUG_DIR_PATH);

    // Convert .HTML files to folders with index.html if htmlToFolders is true
    // For example:
    // .ownstak/assets/products/3.html -> .ownstak/assets/products/3/index.html
    if (config.assets.htmlToFolders) {
        logger.debug(`Converting HTML files to folders in ${ASSETS_DIR_PATH}`);
        await convertHtmlToFolders(ASSETS_DIR_PATH);
    }
    if (config.persistentAssets.htmlToFolders) {
        logger.debug(`Converting HTML files to folders in ${PERSISTENT_ASSETS_DIR_PATH}`);
        await convertHtmlToFolders(PERSISTENT_ASSETS_DIR_PATH);
    }

    // Run build:routes:start hook before we start creating default routes
    await config.frameworkAdapter?.hooks['build:routes:start']?.(config);

    // Create routes for assets
    // For example:
    // .ownstak/assets/logo.png -> /logo.png
    // .ownstak/assets/images/logo.png -> /images/logo.png
    // .ownstak/assets/something.html -> /something
    const assets = await glob.glob(join(ASSETS_DIR_PATH, '**/*'), {
        cwd: ASSETS_DIR_PATH,
        absolute: false,
        nodir: true,
    });
    const assetsPaths = assets.map((path) => {
        const tranformedPath = `/${path}`
            .replace('index.html', '/') // replace index.html with just / in paths
            .replace(/\/+/g, '/') // replace multiple slashes with a single slash //something//image.png => /something/image.png
            .replace(/\/(?=$)/, ''); // remove trailing slash if it exists
        return tranformedPath ? tranformedPath : '/'; // return "/" if the path is empty
    });
    const assetsPathsWithoutExtensions = assetsPaths.filter((path) => !path.match(/\.(.+)$/));
    const assetsPathsWithExtensions = assetsPaths.filter((path) => path.match(/\.(.+)$/));

    // Serve assets with file extensions
    config.router.match(
        {
            method: ['GET', 'HEAD'],
            path: assetsPathsWithExtensions,
        },
        [
            {
                type: 'setDefaultResponseHeader',
                key: HEADERS.CacheControl,
                value: CACHE_CONTROL_CONFIG.assets,
            },
            {
                type: 'serveAsset',
            },
        ],
        true,
    );

    // Serve assets without file extensions (prerendered pages)
    config.router.match(
        {
            method: ['GET', 'HEAD'],
            // Prerendered pages are assets without any extensions
            path: assetsPathsWithoutExtensions,
        },
        [
            {
                type: 'setDefaultResponseHeader',
                key: HEADERS.CacheControl,
                value: CACHE_CONTROL_CONFIG.prerenderedPages,
            },
            {
                type: 'serveAsset',
            },
        ],
        true,
    );

    // Create routes for persistent assets
    // For example:
    // .ownstak/persistentAssets/chunks/af0123456789.js -> /chunks/af0123456789.js
    const persistentAssets = await glob.glob(join(PERSISTENT_ASSETS_DIR_PATH, '**/*'), {
        cwd: PERSISTENT_ASSETS_DIR_PATH,
        absolute: false,
        nodir: true,
    });
    const persistentAssetsPaths = persistentAssets.map((path) => {
        const tranformedPath = `/${path}`
            .replace('index.html', '/') // replace index.html with just / in paths
            .replace(/\/+/g, '/') // replace multiple slashes with a single slash //something//image.png => /something/image.png
            .replace(/\/(?=$)/, ''); // remove trailing slash if it exists
        return tranformedPath ? tranformedPath : '/'; // return "/" if the path is empty
    });
    config.router.match(
        {
            method: ['GET', 'HEAD'],
            path: persistentAssetsPaths,
        },
        [
            {
                type: 'setDefaultResponseHeader',
                key: HEADERS.CacheControl,
                value: CACHE_CONTROL_CONFIG.persistentAssets,
            },
            {
                type: 'servePersistentAsset',
            },
        ],
        true,
    );

    // Add Image Optimizer route for local development
    // For example:
    // http://localhost:3000/__internal__/image?url=/image.png -> http://localhost:3000/image.png
    config.router.match(
        {
            path: '/__internal__/image',
        },
        [
            {
                type: 'imageOptimizer',
            },
        ],
        true,
    );

    // Run build:routes:finish hook after we created default routes
    await config.frameworkAdapter?.hooks['build:routes:finish']?.(config);

    // Copy compute entrypoint for server and serverless environments
    await copyFile(resolve(__dirname, '../compute/server/server.js'), resolve(COMPUTE_DIR_PATH, 'server.cjs'));
    await copyFile(resolve(__dirname, '../compute/server/server.js.map'), resolve(COMPUTE_DIR_PATH, 'server.cjs.map'));
    await copyFile(resolve(__dirname, '../compute/serverless/serverless.js'), resolve(COMPUTE_DIR_PATH, 'serverless.cjs'));
    await copyFile(resolve(__dirname, '../compute/serverless/serverless.js.map'), resolve(COMPUTE_DIR_PATH, 'serverless.cjs.map'));

    await writeFile(
        resolve(COMPUTE_DIR_PATH, 'package.json'),
        JSON.stringify(
            {
                version: VERSION,
                main: 'server.cjs',
                type: 'commonjs',
            },
            null,
            2,
        ),
    );

    // Finally build the project from source ownstak.config.js/ts/mjs
    // to .ownstak/compute/ownstak.config.json and .ownstak/ownstak.config.json
    await config.build(COMPUTE_DIR_PATH);
    await config.build(BUILD_DIR_PATH);

    // Run build:finish hook right before we finish the build
    await config.frameworkAdapter?.hooks['build:finish']?.(config);

    // Create manifest files
    await writeFile(ASSETS_MANIFEST_FILE_PATH, JSON.stringify(assets, null, 2));
    await writeFile(PERSISTENT_ASSETS_MANIFEST_FILE_PATH, JSON.stringify(persistentAssets, null, 2));

    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000;

    // Calculate the max content width needed for consistent tables
    const tableMinWidth = 63;

    // Print build summary
    logger.info('');
    logger.drawTable(
        [
            `Framework: ${chalk.cyan(config.framework)}`,
            `Runtime: ${chalk.cyan(config.runtime)}`,
            `RAM: ${chalk.cyan(`${config.ram}MB`)}`,
            `Timeout: ${chalk.cyan(`${config.timeout}s`)}`,
            `Routes: ${chalk.cyan(config.router.routes.length.toString())}`,
            `Build duration: ${chalk.cyan(`${duration.toFixed(2)}s`)}`,
        ],
        {
            title: 'Build Successful',
            logLevel: LogLevel.SUCCESS,
            minWidth: tableMinWidth,
        },
    );

    // Display what to do next ibfo
    logger.info('');
    logger.drawTable(
        [
            `Run ${chalk.cyan(`npx ${NAME_SHORT} start`)} to test your project locally.`,
            `When you're ready, run ${chalk.cyan(`npx ${NAME_SHORT} deploy`)} to deploy to ${BRAND}.`,
        ],
        {
            title: "What's Next",
            borderColor: 'brand',
            minWidth: tableMinWidth,
        },
    );
}

/**
 * Normalizes the paths in the files configuration
 * For example:
 * - \\my\folder\..\folder2 -> /my/folder2
 * - /my//folder1 -> /my/folder1
 * - ./src/public -> src/public
 * @param filesConfig - The files configuration
 * @returns The normalized files configuration
 */
export function normalizeFilesConfig(filesConfig: FilesConfig) {
    const normalizedFilesConfig: FilesConfig = { ...filesConfig };
    normalizedFilesConfig.include = {};
    Object.entries(filesConfig.include).forEach(([source, destination]) => {
        const normalizedSource = normalizePath(source);
        const normalizedDestination = typeof destination === 'string' ? normalizePath(destination || './') : destination;
        normalizedFilesConfig.include[normalizedSource] = normalizedDestination;
    });
    return normalizedFilesConfig;
}

/**
 * Copies files from the source directory to the destination directory
 * based on the specified entries. Entries can be files, directories or glob patterns
 * and the values can be true, false, a string or an object.
 * - true: Copy the file to dest folder under the same path as in the source folder.
 * - false: Exclude the file.
 * - string: Copy the file to dest folder under the specified path.
 * @param {FilesConfig} filesConfig - The files configuration.
 * @param {string} destDir - The destination directory.
 * @returns {Promise<void>}
 * @example
 * {
 *     include: {
 *         "./src/index.js": true, // Includes './src/index.js' file.
 *         "./src/public": './', // Includes all files under './src/public' path.
 *         "./src/public/*.{js,css}": false, // Excludes all files under './src/public' path that ends with '.js' or '.css'.
 *         "./src/public/images/*.{jpg,webp}": true, // Includes only files ending with '.jpg' or '.webp' under './src/public/images' path.
 *     },
 * }
 */
export async function copyFiles(filesConfig: FilesConfig, destDir: string) {
    const { include = [] } = filesConfig;

    for (const [pattern, destination] of Object.entries(include)) {
        const isGlob = pattern.includes('*') || pattern.includes('{');
        const baseDir = pattern.split('*')[0];
        const baseDirExists = existsSync(baseDir);

        if (!isGlob && !baseDirExists) {
            logger.debug(`File ${pattern} with baseDir ${baseDir} does not exist. Skipping...`);
            continue;
        }

        const globFiles = isGlob ? await glob.glob(pattern) : [pattern];
        for (const srcFile of globFiles) {
            const stat = statSync(srcFile);
            let destFile = resolve(destDir, srcFile);

            if (destination === './') {
                destFile = resolve(destDir, relative(baseDir, srcFile));
            } else if (destination.toString().includes('**/*')) {
                const relativeDir = relative(baseDir, dirname(srcFile));
                const fileName = basename(srcFile);
                destFile = resolve(destDir, destination.toString().replace('**', relativeDir).replace('*', fileName));
            } else if (destination.toString().includes('**')) {
                const relativePath = relative(baseDir, srcFile);
                destFile = resolve(destDir, destination.toString().replace('**', relativePath));
            } else if (destination.toString().includes('*')) {
                const fileName = basename(srcFile);
                destFile = resolve(destDir, destination.toString().replace('*', fileName));
            } else if (destination === true) {
                destFile = resolve(destDir, srcFile);
            } else if (destination === false) {
                const destFileRelative = relative(process.cwd(), destFile);
                // Make sure to remove only files under the build directory .ownstak
                if (destFileRelative.startsWith(BUILD_DIR)) {
                    logger.debug(`Removing '${srcFile}' from '${destFileRelative}'`);
                    rm(destFile, { force: true, recursive: true });
                }
                continue;
            } else {
                destFile = resolve(destDir, destination);
            }

            const destFileDir = dirname(destFile);

            logger.debug(`Copying '${srcFile}' to '${destFile}'`);
            if (stat.isDirectory()) {
                await copyDir(srcFile, destFile);
            } else {
                await mkdir(destFileDir, { recursive: true });
                await copyFile(srcFile, destFile);
            }
        }
    }
}

/**
 * Copies a directory from the source to the destination.
 * @param {string} src - The source directory.
 * @param {string} dest - The destination directory.
 * @returns {Promise<void>}
 */
async function copyDir(src: string, dest: string) {
    await mkdir(dest, { recursive: true });
    const entries = await readdir(src, { withFileTypes: true });

    for (const entry of entries) {
        const srcPath = join(src, entry.name);
        const destPath = join(dest, entry.name);

        if (entry.isDirectory()) {
            await copyDir(srcPath, destPath);
        } else {
            await copyFile(srcPath, destPath);
        }
    }
}

/**
 * Converts HTML files to folders with index.html.
 * For example:
 * .ownstak/assets/products/3.html -> .ownstak/assets/products/3/index.html
 * @param {string} dir - The directory to convert.
 * @returns {Promise<void>}
 */
async function convertHtmlToFolders(dir: string) {
    const entries = await readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
        const srcPath = join(dir, entry.name);
        const destPath = join(dir, entry.name.replace('.html', ''));

        if (entry.isDirectory()) {
            await convertHtmlToFolders(srcPath);
        } else if (entry.name.endsWith('.html')) {
            await mkdir(destPath, { recursive: true });
            await copyFile(srcPath, join(destPath, 'index.html'));
        }
    }
}

/**
 * Adds specified pattern to .gitignore file if present
 * @param pattern
 */
async function addToGitignore(pattern: string) {
    const gitignorePath = join(process.cwd(), '.gitignore');
    const gitignoreContent = existsSync(gitignorePath) ? await readFile(gitignorePath, 'utf-8') : '';
    if (gitignoreContent.includes(pattern)) {
        return;
    }
    logger.info(`Adding ${pattern} to .gitignore file...`);
    await writeFile(gitignorePath, `${gitignoreContent}\r\n# ${BRAND} build directory\r\n${pattern}`);
}
