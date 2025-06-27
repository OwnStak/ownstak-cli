import { fileURLToPath } from 'url';
import { dirname, resolve, join, relative, basename } from 'path';
import { mkdir, rm, writeFile, copyFile, readdir, readFile } from 'fs/promises';
import { existsSync, lstatSync } from 'fs';
import {
    BUILD_DIR_PATH,
    COMPUTE_DIR_PATH,
    ASSETS_DIR_PATH,
    PERMANENT_ASSETS_DIR_PATH,
    PROXY_DIR_PATH,
    DEBUG_DIR_PATH,
    APP_DIR_PATH,
    NAME,
    ASSETS_DIR,
    PERMANENT_ASSETS_DIR,
    APP_DIR,
    DEBUG_DIR,
    CACHE_CONTROL_CONFIG,
    HEADERS,
    BUILD_DIR,
    ASSETS_MANIFEST_FILE_PATH,
    PERMANENT_ASSETS_MANIFEST_FILE_PATH,
    INTERNAL_PATH_PREFIX,
} from '../constants.js';
import { logger, LogLevel } from '../logger.js';
import { BRAND } from '../constants.js';
import { normalizePath } from '../utils/pathUtils.js';
import { glob } from 'glob';
import { Config, FilesConfig, Framework } from '../config.js';
import { detectFramework, getFrameworkAdapter, getFrameworkAdapters } from '../frameworks/index.js';
import { CliError } from '../cliError.js';
import { CliConfig } from '../cliConfig.js';
import chalk from 'chalk';
import { nodeFileTrace } from '@vercel/nft';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface BuildCommandOptions {
    framework?: Framework;
    skipFrameworkBuild?: boolean;
    assetsDir?: string;
    defaultFile?: string;
    defaultStatus?: number;
    skipSummary?: boolean;
}

export async function build(options: BuildCommandOptions = {}) {
    const startTime = Date.now();

    // Clear everything under the build directory except the proxy,
    // so we can copy binaries there and test everything locally.
    logger.debug(`Cleaning build directory  '${BUILD_DIR_PATH}'...`);
    await Promise.all(
        [COMPUTE_DIR_PATH, APP_DIR_PATH, ASSETS_DIR_PATH, PERMANENT_ASSETS_DIR_PATH, DEBUG_DIR_PATH].map((path) => rm(path, { recursive: true, force: true })),
    );

    logger.debug(`Creating build directories...`);
    await Promise.all(
        [BUILD_DIR_PATH, COMPUTE_DIR_PATH, APP_DIR_PATH, ASSETS_DIR_PATH, PERMANENT_ASSETS_DIR_PATH, DEBUG_DIR_PATH, PROXY_DIR_PATH].map((path) =>
            mkdir(path, { recursive: true }),
        ),
    );

    // Add build directory to .gitignore file if not already present
    await addToGitignore(BUILD_DIR);

    // Load config from source file ownstak.config.ts if present.
    // If not, default config is returned.
    const config = await Config.loadFromSource();
    await config.validate();

    // Save the current CLI version that created build into config,
    // so we can later check it and use for debugging
    config.cliVersion = CliConfig.getCurrentVersion();
    config.framework = options.framework || config.framework || (await detectFramework());
    config.frameworkAdapter ??= getFrameworkAdapter(config.framework);
    config.skipFrameworkBuild = options.skipFrameworkBuild || config.skipFrameworkBuild;

    // Add assets directory to config if specified
    if (options.assetsDir) {
        config.assets.include[`${options.assetsDir}`] = './';
    }
    // Add default file to config if specified
    if (options.defaultFile) {
        config.assets.defaultFile = options.defaultFile;
    }
    // Add default status to config if specified
    if (options.defaultStatus) {
        config.assets.defaultStatus = options.defaultStatus;
    }

    // Check if framework is supported
    if (config.framework && !config.frameworkAdapter) {
        throw new CliError(
            `The specified framework '${config.framework}' is not supported. \r\n` +
                `The ${NAME} supports the following frameworks: \r\n` +
                getFrameworkAdapters()
                    .map((adapter) => `- ${adapter.name}`)
                    .join('\r\n') +
                `\r\n\r\n` +
                `Please try the following steps to resolve this issue:\r\n` +
                `- Check the framework name first\r\n` +
                `- If you don't know which framework to use, just run 'npx ${NAME} build' and let ${BRAND} detect the framework for you.\r\n` +
                `- If don't see your framework in the list, try to upgrade ${BRAND} CLI to the latest version first by running 'npx ${NAME} upgrade'.`,
        );
    }

    // If no framework adapter is found, throw an error
    if (!config.frameworkAdapter) {
        throw new CliError(
            `No supported framework was detected. \r\n` +
                `The ${NAME} supports the following frameworks: \r\n` +
                getFrameworkAdapters()
                    .map((adapter) => `- ${adapter.name}`)
                    .join('\r\n') +
                `\r\n\r\n` +
                `If you would like to deploy just folder with static assets, please run 'npx ${NAME} build static'.`,
        );
    }

    // Run build:start hook
    await config.frameworkAdapter?.hooks['build:start']?.({ config });

    // Add project's package.json to debugAssets folder,
    // so we can see the project's dependencies version.
    config.debugAssets.include[`./package.json`] = true;

    // Always put the project's package.json in the app directory,
    // so app runs with correct module type either commonjs or module (ESM).
    config.app.include[`./package.json`] = true;

    // If app entrypoint is absolute, convert it to relative path
    // e.g: /Users/user/project/src/server.js -> src/server.js
    if (config.app.entrypoint && resolve(config.app.entrypoint) === config.app.entrypoint) {
        config.app.entrypoint = relative(process.cwd(), config.app.entrypoint);
    }

    // Trace and copy app entrypoint dependencies
    // if copyDependencies is true
    if (config.app.copyDependencies && config.app.entrypoint) {
        const entrypointAbsolute = resolve(config.app.entrypoint);
        const { fileList } = await nodeFileTrace([entrypointAbsolute]);
        for (const file of fileList) {
            // Skip files that are already in the output directory
            if (file.startsWith(BUILD_DIR_PATH)) continue;
            config.app.include[file] = true;
        }
    }

    // Normalize all paths in the config first
    // For example:
    // \\my\folder\..\folder2 -> /my/folder2
    // /my//folder1 -> /my/folder1
    config.assets = normalizeFilesConfig(config.assets);
    config.permanentAssets = normalizeFilesConfig(config.permanentAssets);
    config.app = normalizeFilesConfig(config.app);
    config.debugAssets = normalizeFilesConfig(config.debugAssets);

    // Copy all files under assets, permanentAssets, compute and debugAssets
    // config properties to corresponding build directory.
    logger.info(`Copying assets to ${ASSETS_DIR} directory...`);
    await copyFiles(config.assets, ASSETS_DIR_PATH);
    logger.info(`Copying permanent assets to ${PERMANENT_ASSETS_DIR} directory...`);
    await copyFiles(config.permanentAssets, PERMANENT_ASSETS_DIR_PATH);
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
    if (config.permanentAssets.htmlToFolders) {
        logger.debug(`Converting HTML files to folders in ${PERMANENT_ASSETS_DIR_PATH}`);
        await convertHtmlToFolders(PERMANENT_ASSETS_DIR_PATH);
    }

    // Run build:routes:start hook before we start creating default routes
    await config.frameworkAdapter?.hooks['build:routes:start']?.({ config });

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
                type: 'serveAsset',
            },
            {
                type: 'setDefaultResponseHeader',
                key: HEADERS.CacheControl,
                value: CACHE_CONTROL_CONFIG.assets,
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
                type: 'serveAsset',
            },
            {
                type: 'setDefaultResponseHeader',
                key: HEADERS.CacheControl,
                value: CACHE_CONTROL_CONFIG.prerenderedPages,
            },
        ],
        true,
    );

    // Create routes for permanent assets
    // For example:
    // .ownstak/permanentAssets/chunks/af0123456789.js -> /chunks/af0123456789.js
    const permanentAssets = await glob.glob(join(PERMANENT_ASSETS_DIR_PATH, '**/*'), {
        cwd: PERMANENT_ASSETS_DIR_PATH,
        absolute: false,
        nodir: true,
    });
    const permanentAssetsPaths = permanentAssets.map((path) => {
        const tranformedPath = `/${path}`
            .replace('index.html', '/') // replace index.html with just / in paths
            .replace(/\/+/g, '/') // replace multiple slashes with a single slash //something//image.png => /something/image.png
            .replace(/\/(?=$)/, ''); // remove trailing slash if it exists
        return tranformedPath ? tranformedPath : '/'; // return "/" if the path is empty
    });
    config.router.match(
        {
            method: ['GET', 'HEAD'],
            path: permanentAssetsPaths,
        },
        [
            {
                type: 'servePermanentAsset',
            },
            {
                type: 'setDefaultResponseHeader',
                key: HEADERS.CacheControl,
                value: CACHE_CONTROL_CONFIG.permanentAssets,
            },
        ],
        true,
    );

    // Add Image Optimizer route for local development
    // For example:
    // http://localhost:3000/__ownstak__/image?url=/image.png -> http://localhost:3000/image.png
    config.router.match(
        {
            path: `${INTERNAL_PATH_PREFIX}/image`,
        },
        [
            {
                type: 'imageOptimizer',
            },
        ],
        true,
    );

    // Run build:routes:finish hook after we created default routes
    await config.frameworkAdapter?.hooks['build:routes:finish']?.({ config });

    // Copy compute entrypoint for server and serverless environments
    await copyFile(resolve(__dirname, '../compute/server/server.js'), resolve(COMPUTE_DIR_PATH, 'server.mjs'));
    await copyFile(resolve(__dirname, '../compute/server/server.js.map'), resolve(COMPUTE_DIR_PATH, 'server.mjs.map'));
    await copyFile(resolve(__dirname, '../compute/serverless/serverless.js'), resolve(COMPUTE_DIR_PATH, 'serverless.mjs'));
    await copyFile(resolve(__dirname, '../compute/serverless/serverless.js.map'), resolve(COMPUTE_DIR_PATH, 'serverless.mjs.map'));

    // Create package.json with default module type in folder
    await writeFile(
        resolve(COMPUTE_DIR_PATH, 'package.json'),
        JSON.stringify(
            {
                version: config.cliVersion,
                main: 'server.mjs',
                type: 'module',
            },
            null,
            2,
        ),
    );

    // Finally, build the project config from the source file (ownstak.config.js/ts/mjs)
    // to .ownstak/compute/ownstak.config.json. This captures the result of all environment variable usage
    // and any other JS code, eliminating the need for runtime dependencies.
    await config.build(COMPUTE_DIR_PATH);
    await config.build(BUILD_DIR_PATH);

    // Run build:finish hook right before we finish the build
    await config.frameworkAdapter?.hooks['build:finish']?.({ config });

    // Create manifest files
    await writeFile(ASSETS_MANIFEST_FILE_PATH, JSON.stringify(assets, null, 2));
    await writeFile(PERMANENT_ASSETS_MANIFEST_FILE_PATH, JSON.stringify(permanentAssets, null, 2));

    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000;

    // Calculate the max content width needed for consistent tables
    const tableMinWidth = 63;

    const isDefaultRuntime = Config.getDefaultRuntime() === config.runtime;
    const isDefaultMemory = Config.getDefaultMemory() === config.memory;
    const isDefaultArch = Config.getDefaultArch() === config.arch;
    const isDefaultTimeout = Config.getDefaultTimeout() === config.timeout;

    if (!options.skipSummary) {
        // Display build summary when running as a standalone command but not as part of deploy command.
        logger.info('');
        logger.drawTable(
            [
                `Framework: ${chalk.cyan(config.framework)}`,
                `Runtime: ${chalk.cyan(config.runtime)} ${chalk.gray(isDefaultRuntime ? '' : 'custom')}`,
                `Memory: ${chalk.cyan(`${config.memory}MiB`)} ${chalk.gray(isDefaultMemory ? '' : 'custom')}`,
                `Arch: ${chalk.cyan(config.arch)} ${chalk.gray(isDefaultArch ? '' : 'custom')}`,
                `Timeout: ${chalk.cyan(`${config.timeout}s`)} ${chalk.gray(isDefaultTimeout ? '' : 'custom')}`,
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
                `Run ${chalk.cyan(`npx ${NAME} start`)} to test your project locally.`,
                `When you're ready, run ${chalk.cyan(`npx ${NAME} deploy`)} to deploy to ${BRAND}.`,
            ],
            {
                title: "What's Next",
                borderColor: 'brand',
                minWidth: tableMinWidth,
            },
        );
    }
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
 * - true: Copy the file to destination folder under the same path as in the source folder.
 * - false: Exclude the file.
 * - string: Copy the file to destination folder under the specified path.
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
    const patterns = Object.entries(filesConfig.include || {});

    // Process each pattern/destPattern pair from the configuration
    for (const [index, [srcPattern, destPattern]] of patterns.entries()) {
        // When we're including/excluding files, we still maintain the order
        // and exclude only the patterns that comes after the included pattern.
        // This allows user to copy whole folder, exclude all .html files from it,
        // and then again include some specific .html files back for edge-cases.
        const excludePatterns = [
            // Always exclude .ownstak folder
            resolve(BUILD_DIR_PATH),
            // Apply all exclude patterns that come after the current include pattern
            ...patterns.slice(index + 1).flatMap(([excludeSrcPattern, excludeDestPattern]) => (excludeDestPattern === false ? [excludeSrcPattern] : [])),
        ];

        // Check if the pattern contains wildcards (glob pattern)
        // Examples: "src/*.js" (glob), "src/file.js" (regular file)
        const isGlob = srcPattern.includes('*') || srcPattern.includes('{');
        // Extract the base directory from the pattern (everything before the first wildcard)
        // Examples: "src/public/*.css" -> "src/public/", "src/file.js" -> "src/file.js"
        const baseDir = srcPattern.split('*')[0];
        const baseDirExists = existsSync(baseDir);

        // Skip non-glob patterns that don't exist to avoid errors
        if (!isGlob && !baseDirExists) {
            logger.debug(`File ${srcPattern} with baseDir ${baseDir} does not exist. Skipping...`);
            continue;
        }

        // Get list of files to process:
        // - For glob patterns: find all matching files (excluding build directory)
        // - For regular files/directories: use the pattern as-is (for performance reason, glob on node_modules/**/* is extremely slow)
        const srcFiles = isGlob
            ? await glob.glob(srcPattern, {
                  ignore: excludePatterns,
              })
            : [srcPattern];

        // Process each found file/directory
        for (const srcFile of srcFiles) {
            if (resolve(srcFile) === process.cwd()) {
                logger.info('');
                logger.drawTable(
                    [
                        `Looks like you're trying to include the entire project root directory (./) in your build.`,
                        `Be careful, this can lead to unexpected side effects, such as:`,
                        `- Silently including all node_modules`,
                        `- Accidentally including hidden or sensitive files`,
                        `- And other unintended behavior\n`,
                        `It's recommended to move your build target files into a dedicated directory (e.g. src/, static/, public/, etc...), ` +
                            `and then include that directory in your build. This gives you full control over what gets included. ` +
                            `For example: npx ${NAME} build static --assets-dir=./static`,
                    ],
                    {
                        title: 'Warning',
                        borderColor: 'yellow',
                        logLevel: LogLevel.WARN,
                        maxWidth: 100,
                    },
                );
                logger.info('');
            }

            let destFile = resolve(destDir, srcFile);
            if (destPattern === false) {
                // If destPattern is false, remove the file from the build directory
                // Example: "temp/*.tmp" with destPattern false
                // Safety check: only remove files under the build directory .ownstak
                if (resolve(destFile).startsWith(resolve(BUILD_DIR_PATH))) {
                    logger.debug(`Removing '${srcFile}' from '${destFile}'`);
                    rm(destFile, { force: true, recursive: true });
                }
                continue;
            } else if (destPattern === true) {
                // Example: "src/index.js" with destPattern true
                // copies "src/index.js" to "build/src/index.js" (preserves full path)
                destFile = resolve(destDir, srcFile);
            } else if (destPattern.toString().includes('**/*')) {
                // Example: "src/*.js" with destPattern "js/**/*"
                // copies "src/app.js" to "build/js/app.js"
                const relativeDir = relative(baseDir, dirname(srcFile));
                const fileName = basename(srcFile);
                destFile = resolve(destDir, destPattern.toString().replace('**', relativeDir).replace('*', fileName));
            } else if (destPattern.toString().includes('**')) {
                // Example: "src/components/**" with destPattern "lib/**"
                // copies "src/components/Button/index.js" to "build/lib/Button/index.js"
                const relativePath = relative(baseDir, srcFile);
                destFile = resolve(destDir, destPattern.toString().replace('**', relativePath));
            } else if (destPattern.toString().includes('*')) {
                // Example: "src/*.js" with destPattern "js/*"
                // copies "src/app.js" to "build/js/app.js"
                const fileName = basename(srcFile);
                destFile = resolve(destDir, destPattern.toString().replace('*', fileName));
            } else {
                // Example: "src/app.js" with destPattern "main.js"
                // copies "src/app.js" to "build/main.js" (custom name)
                destFile = join(destDir, destPattern);
            }

            // Use the unified copy function that handles files, directories, and symlinks properly
            logger.debug(`Copying '${srcFile}' to '${destFile}'`);
            await copy(srcFile, destFile);
        }
    }
}

/**
 * Copies a file or directory from source to destination.
 * Handles both files and directories, creates destination paths recursively.
 * @param {string} src - The source file or directory path.
 * @param {string} dest - The destination file or directory path.
 * @returns {Promise<void>}
 */
export async function copy(src: string, dest: string) {
    // Skip .ownstak folder to avoid infinite recursion
    // when user includes the project root as folder
    if (resolve(src).startsWith(resolve(BUILD_DIR_PATH))) {
        logger.debug(`Skipping '${src}' because it's inside .ownstak folder`);
        return;
    }

    const stat = lstatSync(src);
    if (stat.isSymbolicLink()) {
        // Skip symlinks with debug message
        logger.debug(`Skipping symlink '${src}'`);
        return;
    }

    if (stat.isFile()) {
        // For files: create destPattern directory recursively and copy file
        const destDir = dirname(dest);
        await mkdir(destDir, { recursive: true });
        await copyFile(src, dest);
        return;
    }

    if (stat.isDirectory()) {
        // For directories: create destPattern directory and copy all contents
        await mkdir(dest, { recursive: true });
        const entries = await readdir(src, { withFileTypes: true });
        for (const entry of entries) {
            const srcPath = join(src, entry.name);
            const destPath = join(dest, entry.name);

            // Recursively call copy for each entry (file, directory)
            if (entry.isDirectory() || entry.isFile()) {
                await copy(srcPath, destPath);
            }
        }
        return;
    }

    // Handle any other file types by logging and skipping
    logger.debug(`Skipping unknown type '${src}'`);
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
    // Nothing to do, if we're not running in project
    if (!existsSync('package.json')) {
        return;
    }
    const gitignorePath = join(process.cwd(), '.gitignore');
    const gitignoreContent = existsSync(gitignorePath) ? await readFile(gitignorePath, 'utf-8') : '';
    if (gitignoreContent.includes(pattern)) {
        return;
    }
    logger.info(`Adding ${pattern} to .gitignore file...`);
    await writeFile(gitignorePath, `${gitignoreContent}\r\n# ${BRAND} build directory\r\n${pattern}`);
}
