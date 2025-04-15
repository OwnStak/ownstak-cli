import { fileURLToPath } from 'url';
import { dirname, resolve, join, relative, basename } from 'path';
import { mkdir, rm, writeFile, copyFile, readdir, cp } from 'fs/promises';
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
} from '../constants.js';
import { logger } from '../logger.js';
import { BRAND, INPUT_CONFIG_FILE, OUTPUT_CONFIG_FILE } from '../constants.js';
import { bundleRequire } from 'bundle-require';
import { normalizePath } from '../utils/pathUtils.js';
import { glob } from 'glob';
import { Config, FilesConfig, Framework } from '../config.js';
import { generateBase64Id } from '../utils/idUtils.js';
import { detectFramework, getFrameworkAdapter, getFrameworkAdapters } from '../frameworks/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface BuildCommandOptions {
    framework?: Framework;
    skipFrameworkBuild?: boolean;
    assetsDir?: string;
}

export async function build(options: BuildCommandOptions) {
    // Prepare build directories
    logger.debug(`Cleaning build directory: ${BUILD_DIR_PATH}`);
    await rm(BUILD_DIR_PATH, { recursive: true, force: true });

    logger.debug(`Creating build directories`);
    await mkdir(BUILD_DIR_PATH, { recursive: true });
    await mkdir(COMPUTE_DIR_PATH, { recursive: true });
    await mkdir(ASSETS_DIR_PATH, { recursive: true });
    await mkdir(PERSISTENT_ASSETS_DIR_PATH, { recursive: true });
    await mkdir(PROXY_DIR_PATH, { recursive: true });
    await mkdir(APP_DIR_PATH, { recursive: true });
    await mkdir(DEBUG_DIR_PATH, { recursive: true });

    const config = await loadConfig();
    config.buildId ??= generateBase64Id();
    config.framework = options.framework || config.framework || (await detectFramework());
    config.frameworkAdapter ??= getFrameworkAdapter(config.framework);
    config.skipFrameworkBuild = options.skipFrameworkBuild || config.skipFrameworkBuild;

    if (options.assetsDir) {
        config.assets.include[`${options.assetsDir}`] = './';
    }

    if (config.framework && !config.frameworkAdapter) {
        logger.error(
            `The specified framework '${config.framework}' is not supported. The ${NAME} ${VERSION} supports the following frameworks: ${getFrameworkAdapters()
                .map((adapter) => adapter.name)
                .join(', ')}`,
        );
        logger.error(`Please try the following steps to resolve this issue:`);
        logger.error('- Check the framework name first');
        logger.error(`- Try to upgrade ${BRAND} CLI to the latest version by running 'npx ${NAME} upgrade' if you're sure the framework is supported.`);
        logger.error(`\r\nNothing helped? Feel free to reach out to us at ${SUPPORT_URL}`);
        process.exit(1);
    }

    if (!config.frameworkAdapter) {
        logger.error(
            `No supported framework was detected. The ${NAME} ${VERSION} supports the following frameworks: ${getFrameworkAdapters()
                .map((adapter) => adapter.name)
                .join(', ')}`,
        );
        logger.error(`If you would like to deploy just folder with static assets, please run 'npx ${NAME} build static'.`);
        process.exit(1);
    }

    logger.info(`Framework: ${config.framework}`);
    logger.info(`Runtime: ${config.runtime}`);
    logger.info(`Timeout: ${config.timeout}`);

    await config.frameworkAdapter.build(config);

    // Add project's package.json to debugAssets folder,
    // so we can see the project's dependencies version.
    config.debugAssets.include[`./package.json`] = true;

    // Put the project's package.json in the app directory too,
    // so app runs with correct module type either commonjs or module (ESM).
    config.app.include[`./package.json`] = true;

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
    config.router.addRouteFront(
        {
            method: ['GET', 'HEAD'],
            path: assets.map(
                (path) =>
                    `/${path}`
                        .replace('index.html', '/') // replace index.html with just / in paths
                        .replace(/\/(?=$)/, '') // remove trailing slash if it exists
                        .replace(/\/+/g, '/'), // replace multiple slashes with a single slash //something//image.png => /something/image.png
            ),
        },
        [
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
    config.router.addRouteFront(
        {
            method: ['GET', 'HEAD'],
            path: persistentAssets.map(
                (path) =>
                    `/${path}`
                        .replace('index.html', '/') // replace index.html with just / in paths
                        .replace(/\/(?=$)/, '') // remove trailing slash if it exists
                        .replace(/\/+/g, '/'), // replace multiple slashes with a single slash //something//image.png => /something/image.png
            ),
        },
        [
            {
                type: 'servePersistentAsset',
            },
        ],
        true,
    );

    await saveConfig(config);

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

    logger.info('Build completed successfully! 🎉');
}

/**
 * Loads the Config from config file.
 * If no config file is found, a new Config instance is returned.
 * @returns {Promise<Config>} The loaded Config instance.
 */
export async function loadConfig(): Promise<Config> {
    const inputConfigFilePath = [
        resolve(INPUT_CONFIG_FILE),
        resolve(INPUT_CONFIG_FILE).replace('.js', '.mjs'),
        resolve(INPUT_CONFIG_FILE).replace('.js', '.cjs'),
        resolve(INPUT_CONFIG_FILE).replace('.js', '.ts'),
    ].find(existsSync);

    if (!inputConfigFilePath) {
        logger.info(`No ${BRAND} config file found. Using default config...`);
        return new Config();
    }

    logger.info(`Loading ${BRAND} config: ${relative(process.cwd(), inputConfigFilePath)}`);
    const { mod } = await bundleRequire({
        filepath: normalizePath(inputConfigFilePath),
    });

    return mod?.default?.default || mod?.default || new Config();
}

export async function saveConfig(config: Config) {
    logger.debug(`Saving ${BRAND} config to ${OUTPUT_CONFIG_FILE}`);
    await writeFile(resolve(COMPUTE_DIR_PATH, OUTPUT_CONFIG_FILE), config.serialize());
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
            let destFile = srcFile;

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
                logger.debug(`Excluding file ${srcFile}`);
                rm(destFile, { force: true });
                continue;
            } else {
                destFile = resolve(destDir, destination);
            }

            const destFileDir = dirname(destFile);

            if (stat.isDirectory()) {
                logger.debug(`Copying directory ${srcFile} to ${destFile}`);
                await copyDir(srcFile, destFile);
            } else {
                logger.debug(`Copying file ${srcFile} to ${destFile}`);
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
