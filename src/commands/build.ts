import { fileURLToPath } from 'url';
import { dirname, resolve, join, relative} from 'path';
import { mkdir, rm, writeFile, copyFile, readdir} from 'fs/promises';
import { existsSync, statSync } from 'fs';
import { BUILD_DIR_PATH, COMPUTE_DIR_PATH, ASSETS_DIR_PATH, PERSISTENT_ASSETS_DIR_PATH, VERSION, PROXY_DIR_PATH, DEBUG_DIR_PATH} from '../constants.js';
import { logger } from '../logger.js';
import { getFramework, detectFramework, getAllFrameworks } from '../frameworks/index.js';
import { BRAND, INPUT_CONFIG_FILE, OUTPUT_CONFIG_FILE } from '../constants.js';
import { bundleRequire } from 'bundle-require';
import { normalizePath } from '../utils/pathUtils.js';
import { glob } from 'glob';
import { Config, FilesConfig } from '../config.js';


// Register all frameworks
import * as _next from '../frameworks/nextjs/nextjs.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface BuildCommandOptions {
    skipFrameworkBuild?: boolean;
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
    await mkdir(DEBUG_DIR_PATH, { recursive: true });
    
    const config = await loadConfig();
    const framework = getFramework(config.framework) || await detectFramework();

    if(!framework && config.framework){
        throw new Error(`Framework ${config.framework} is not supported. Supported frameworks are: ${Object.keys(getAllFrameworks()).join(', ')}`);
    }

    if(framework){
        logger.info(`Detected framework: ${framework.name}`);
        config.setFramework(framework.name);
        if(!options.skipFrameworkBuild){
            await framework?.build(config);
        }else{
            logger.info('Skipping framework build.');
        }
    }else{
        logger.info('No framework was detected.');
    }

    config.assets.include = await globToFiles(config.assets.include);
    config.persistentAssets.include = await globToFiles(config.persistentAssets.include);

    logger.debug(`Copying assets to build directory`);
    await copyFiles(config.assets, ASSETS_DIR_PATH);
    logger.debug(`Copying persistent assets to build directory`);
    await copyFiles(config.persistentAssets, PERSISTENT_ASSETS_DIR_PATH);
    logger.debug(`Copying compute files to build directory`);
    await copyFiles(config.compute, COMPUTE_DIR_PATH);

    await saveConfig(config);
    await copyFile(resolve(__dirname, '../compute/server/server.js'), resolve(COMPUTE_DIR_PATH, 'server.cjs'));
    await copyFile(resolve(__dirname, '../compute/serverless/serverless.js'), resolve(COMPUTE_DIR_PATH, 'serverless.cjs'));
    await writeFile(resolve(COMPUTE_DIR_PATH, 'package.json'), JSON.stringify({
        version: VERSION,
        main: 'server.cjs',
        type: 'commonjs',
    }, null, 2));

    logger.info('Build completed successfully! 🎉');
}


/**
 * Loads the Config from config file.
 * If no config file is found, a new Config instance is returned.
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
    })

    return mod?.default?.default || mod?.default || new Config();
}

export async function saveConfig(config: Config) {
    logger.debug(`Saving ${BRAND} config to ${OUTPUT_CONFIG_FILE}`);
    await writeFile(
        resolve(COMPUTE_DIR_PATH, OUTPUT_CONFIG_FILE), 
        config.serialize()
    );
}

export async function globToFiles(fileGlobs: string[]) {
    const expandedFiles = [];
    for (const fileGlob of fileGlobs) {
        const srcFiles = await glob.glob(fileGlob);
        expandedFiles.push(...srcFiles);
    }
    return expandedFiles;
}

export async function copyFiles(filesConfig: FilesConfig, destDir: string) {
    const includeFile = await globToFiles(filesConfig.include);
    return Promise.all(includeFile.map(async (srcFile) => {
        const destFile = resolve(destDir, srcFile);
        const destFileDir = dirname(destFile);
        await mkdir(destFileDir, { 
            recursive: true 
        });
        const stat = statSync(srcFile);
        if(stat.isDirectory()) {
            await copyDir(srcFile, destFile);
        }
        if(stat.isFile()) {
            await copyFile(srcFile, destFile);
        }
    }));
}

async function copyDir(src: string, dest: string){
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