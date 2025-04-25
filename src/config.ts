import { Router } from './compute/router/router.js';
import { readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { BRAND, OUTPUT_CONFIG_FILE, VERSION, FRAMEWORKS, RUNTIMES, APP_PORT, INPUT_CONFIG_FILE, NAME, COMPUTE_DIR_PATH, NAME_SHORT } from './constants.js';
import { relative, resolve } from 'path';
import { logger } from './logger.js';
import { normalizePath } from './utils/pathUtils.js';
import chalk from 'chalk';

export interface ConfigOptions {
    /**
     * The current version of Ownstak CLI
     * that created the config.
     * @default packageJson.default.version
     * @private
     */
    version?: string;

    /**
     * The runtime to use for the app.
     * @default RUNTIMES.Nodejs20
     */
    runtime?: Runtime;

    /**
     * The amount of RAM to use for the app.
     * @default 1024
     */
    ram?: number;

    /**
     * The timeout for the app.
     * @default 20 seconds
     */
    timeout?: number;

    /**
     * The router to use for the app.
     * @default new Router()
     */
    router?: Router;

    /**
     * The framework name to use for the app.
     * @default undefined
     */
    framework?: Framework;

    /**
     * The framework adapter to use for the app.
     * @default undefined
     */
    frameworkAdapter?: FrameworkAdapter;

    /**
     * Whether to skip the framework build
     * and use existing build output of your app.
     * @default false
     */
    skipFrameworkBuild?: boolean;

    /**
     * The assets config for the project.
     * The include keys can contain files, directories or glob patterns. The values can be:
     * - true - to include and serve all files under same path as in the source folder.
     * - false - to exclude a specific file or all files.
     * - string - destination path to serve files under a different path than in the source folder.
     * See the below examples for more details.
     * @default { include: {} }
     * @example
     * {
     *     include: {
     *         "./public": './', // Includes and serves files under './' path. E.g. ./public/image.png will be served as /image.png
     *         "./static": true, // Includes and serves all files under './static' path. E.g. ./static/image.png will be served as /static/image.png
     *         "./public/*.{js,css}": false, // Excludes all files under './public' path that ends with '.js' or '.css'.
     *         "./images/*.{jpg,webp)": true, // Includes only files ending with '.jpg' or '.webp' under './images' path.
     *     },
     * }
     */
    assets?: AssetsConfig;

    /**
     * The persistent assets config for the project.
     * The include keys can contain files, directories or glob patterns. The values can be:
     * - true - to include and serve all files under same path as in the source folder.
     * - false - to exclude a specific file or all files.
     * - string - destination path to serve files under a different path than in the source folder.
     * See the below examples for more details.
     * @default { include: {} }
     * @example
     * {
     *     include: {
     *         "./public": './', // Includes and serves files under './' path. E.g. ./public/image.png will be served as /image.png
     *         "./static": true, // Includes and serves all files under './static' path. E.g. ./static/image.png will be served as /static/image.png
     *         "./public/*.{js,css}": false, // Excludes all files under './public' path that ends with '.js' or '.css'.
     *         "./images/*.{jpg,webp)": true, // Includes only files ending with '.jpg' or '.webp' under './images' path.
     *     },
     * }
     */
    persistentAssets?: PersistentAssetsConfig;

    /**
     * The debug assets config for the project.
     * @default { include: {} }
     */
    debugAssets?: DebugAssetsConfig;

    /**
     * The app config for the project.
     * App property should contain the executable code for your project that will be executed in the compute environment.
     * The 'entrypoint' property should point to the file that starts the HTTP server of your app.
     * @default { include: {}, entrypoint: undefined }
     * @example
     * {
     *     include: {
     *         "./dist/server.js": './server.js',
     *     },
     *     entrypoint: "./server.js",
     * }
     */
    app?: AppConfig;
}

export class Config {
    version: string;
    runtime: Runtime;
    ram: number;
    timeout: number;
    router: Router;
    framework?: Framework;
    frameworkAdapter?: FrameworkAdapter;
    skipFrameworkBuild?: boolean;
    assets: AssetsConfig;
    persistentAssets: PersistentAssetsConfig;
    debugAssets: DebugAssetsConfig;
    app: AppConfig;

    constructor(options: ConfigOptions = {}) {
        Object.assign(this, options);
        this.version ??= VERSION;
        this.runtime ??= RUNTIMES.Nodejs20;
        this.ram ??= 1024;
        this.timeout ??= 20;
        this.router ??= new Router();
        this.assets ??= { include: {} };
        this.persistentAssets ??= { include: {} };
        this.debugAssets ??= { include: {} };
        this.app ??= { include: {}, entrypoint: undefined };
    }

    setRuntime(runtime: Runtime) {
        this.runtime = runtime;
    }

    setRam(ram: number) {
        this.ram = ram;
    }

    setTimeout(timeout: number) {
        this.timeout = timeout;
    }

    setFramework(framework: Framework) {
        this.framework = framework;
    }

    setFrameworkAdapter(frameworkAdapter: FrameworkAdapter) {
        this.frameworkAdapter = frameworkAdapter;
    }

    includeAsset(path: string, destination?: string) {
        this.assets.include[path] = destination ?? true;
    }

    includePersistentAsset(path: string, destination?: string) {
        this.persistentAssets.include[path] = destination ?? true;
    }

    includeDebugAsset(path: string, destination?: string) {
        this.debugAssets.include[path] = destination ?? true;
    }

    includeApp(path: string, destination?: string) {
        this.app.include[path] = destination ?? true;
    }

    setAppEntrypoint(entrypoint: string) {
        this.app.entrypoint = entrypoint;
    }

    async startApp() {
        if (!this.app.entrypoint) {
            logger.debug('No app entrypoint was specified, skipping');
            return;
        }
        // Remove AWS credentials.
        // Not for our security but just so customers have less things to worry about.
        delete process.env.AWS_ACCESS_KEY_ID;
        delete process.env.AWS_SECRET_ACCESS_KEY;
        delete process.env.AWS_SESSION_TOKEN;

        process.env.PORT = APP_PORT.toString();
        process.chdir('app');

        logger.debug(`Starting app's entrypoint: ${this.app.entrypoint}`);
        if (!this.app.entrypoint) {
            throw new Error('Entrypoint is not defined in the app configuration.');
        }
        const entrypointPath = resolve(process.cwd(), this.app.entrypoint);
        const mod = await import(`file://${entrypointPath}`);
        const start = mod?.default?.default || mod?.default || (() => {});
        if (typeof start === 'function') {
            await start();
        }
    }

    serialize() {
        const replacer = (key: string, value: any) => {
            if (value instanceof RegExp) {
                return `regexp:${value.toString()}`;
            }
            return value;
        };
        return JSON.stringify(this, replacer, 2);
    }

    static deserialize(json: string) {
        const reviver = (_key: string, value: any) => {
            if (typeof value === 'string' && value.startsWith('regexp:')) {
                return new RegExp(value.slice(7));
            }
            return value;
        };
        try {
            const config = new Config();
            const parsedJson = JSON.parse(json, reviver);
            Object.assign(config, parsedJson);
            const router = new Router();
            Object.assign(router, parsedJson.router);
            config.router = router;
            return config;
        } catch (error) {
            throw new Error(`Failed to deserialize config: ${error}`);
        }
    }

    /**
     * Loads the built JSON config file from the .ownstak folder.
     * This should be called in lambda and when running build locally.
     * @returns
     */
    static async loadFromBuild() {
        const configFile = [resolve(__dirname, OUTPUT_CONFIG_FILE), resolve(OUTPUT_CONFIG_FILE)].find(existsSync);
        logger.debug(`Loading ${BRAND} project config from: ${configFile}`);

        if (!configFile) {
            throw new Error(`Config file was not found: ${OUTPUT_CONFIG_FILE}`);
        }

        return this.deserialize(await readFile(configFile, 'utf8'));
    }

    /**
     * Loads the source config file from the project root.
     * This requires the bundle-require module with esbuild to be installed,
     * so we can correctly load mjs/cjs/ts files.
     * This should not be called in lambda.
     * @returns
     */
    static async loadFromSource() {
        // We use dynamic import here to avoid bundling the bundle-require module.
        const { bundleRequire } = await import('bundle-require');
        const configFilePath = [
            resolve(INPUT_CONFIG_FILE),
            resolve(INPUT_CONFIG_FILE).replace('.js', '.mjs'),
            resolve(INPUT_CONFIG_FILE).replace('.js', '.cjs'),
            resolve(INPUT_CONFIG_FILE).replace('.js', '.ts'),
        ].find(existsSync);

        if (!configFilePath) {
            logger.info(`Using default ${BRAND} config....`);
            logger.info(chalk.gray(`Run "npx ${NAME_SHORT} config init" to create a custom config`));
            return new Config();
        }

        const relativeConfigFilePath = relative(process.cwd(), configFilePath);
        logger.info(`Loading ${BRAND} project config: ${relativeConfigFilePath}`);
        const { mod } = await bundleRequire({
            filepath: normalizePath(configFilePath),
        });

        // Check if the config file is in the correct format.
        // Do not use instanceof Config here, because it doesn't work with bundled files.
        const configModule = mod?.default?.default || mod?.default || new Config();
        if (configModule.toString() != new Config().toString()) {
            const exampleConfigFilePath = resolve(__dirname, '../templates/config/ownstak.config.js');
            const exampleConfig = await readFile(exampleConfigFilePath, 'utf8');
            logger.error(
                `The ${BRAND} config file format was not recognized. Make sure the '${relativeConfigFilePath}' file exports instance of the Config class as default.`,
            );
            logger.error(`Example config file: \r\n${exampleConfig}`);
            process.exit(1);
        }

        return configModule as Config;
    }

    async build(destDir: string = COMPUTE_DIR_PATH) {
        logger.debug(`Building ${BRAND} project config...`);
        await writeFile(resolve(destDir, OUTPUT_CONFIG_FILE), this.serialize(), 'utf8');
    }

    toString() {
        return this.constructor.name;
    }
}

export interface FrameworkAdapter {
    name: string;
    isPresent: () => Promise<boolean> | boolean;
    hooks: {
        'build:start'?: (config: Config) => Promise<void> | void;
        'build:routes:start'?: (config: Config) => Promise<void> | void;
        'build:routes:finish'?: (config: Config) => Promise<void> | void;
        'build:finish'?: (config: Config) => Promise<void> | void;
        'dev:start'?: (config: Config) => Promise<void> | void;
    };
}

export type Framework = (typeof FRAMEWORKS)[keyof typeof FRAMEWORKS] | string;
export type Runtime = (typeof RUNTIMES)[keyof typeof RUNTIMES] | string;

export interface FilesConfig {
    include: Record<string, boolean | string>;
}

export interface AssetsConfig extends FilesConfig {
    htmlToFolders?: boolean;
}

export interface PersistentAssetsConfig extends FilesConfig {
    htmlToFolders?: boolean;
}

export interface DebugAssetsConfig extends FilesConfig {
    htmlToFolders?: boolean;
}

export interface AppConfig extends FilesConfig {
    entrypoint?: string;
}
