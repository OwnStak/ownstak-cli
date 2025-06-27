import { readFile, writeFile } from 'fs/promises';
import { existsSync, readFileSync } from 'fs';
import {
    BRAND,
    OUTPUT_CONFIG_FILE,
    FRAMEWORKS,
    RUNTIMES,
    APP_PORT,
    INPUT_CONFIG_FILE,
    COMPUTE_DIR_PATH,
    ARCHS,
    DEFAULT_MEMORY,
    DEFAULT_TIMEOUT,
    HOST,
    DEFAULT_ENVIRONMENT,
    NAME,
} from './constants.js';
import { basename, dirname, join, relative, resolve } from 'path';
import { logger } from './logger.js';
import { fileURLToPath } from 'url';
import { Router } from './compute/router/router.js';
import { RouteCondition } from './compute/router/route.js';
import { waitForSocket } from './utils/portUtils.js';
import { normalizePath } from './utils/pathUtils.js';
import { findModuleLocation, installDependency } from './utils/moduleUtils.js';
import { CliError } from './cliError.js';
import { CliConfig } from './cliConfig.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface ConfigOptions {
    /**
     * The version of Ownstak CLI that built the project.
     * @default Current version of Ownstak CLI
     * @private
     */
    cliVersion?: string;

    /**
     * The project name
     * @default undefined
     */
    project?: string;

    /**
     * The organization name
     * @default undefined
     */
    organization?: string;

    /**
     * The environment name
     * @default default
     */
    environment?: string;

    /**
     * The runtime to use for the app.
     * @default RUNTIMES.Nodejs20
     */
    runtime?: Runtime;

    /**
     * The amount of RAM to use for the app.
     * @default 1024
     */
    memory?: number;

    /**
     * The architecture to use for the app.
     * @default ARCHS.X86_64
     */
    arch?: Architecture;

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
     * The permanent assets config for the project.
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
    permanentAssets?: AssetsConfig;

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
    cliVersion: string;
    organization?: string;
    project?: string;
    environment?: string;
    runtime: Runtime;
    memory: number;
    arch: Architecture;
    timeout: number;
    router: Router;
    framework?: Framework;
    frameworkAdapter?: FrameworkAdapter;
    skipFrameworkBuild?: boolean;
    assets: AssetsConfig;
    permanentAssets: AssetsConfig;
    debugAssets: DebugAssetsConfig;
    app: AppConfig;

    constructor(options: ConfigOptions = {}) {
        Object.assign(this, options);

        // NOTE: The organization and project are intentionally not set here.
        // We prompt the user to confirm them in the deploy command when it's run the first time.
        this.environment ??= Config.getDefaultEnvironment();

        this.runtime ??= Config.getDefaultRuntime();
        this.arch ??= Config.getDefaultArch();
        this.memory ??= Config.getDefaultMemory();
        this.timeout ??= Config.getDefaultTimeout();

        this.router ??= new Router();
        this.assets ??= { include: {} };
        this.permanentAssets ??= { include: {} };
        this.debugAssets ??= { include: {} };
        this.app ??= { include: {}, entrypoint: undefined };
        this.cliVersion ??= '0.0.0';
    }

    /**
     * Sets the organization name.
     */
    setOrganization(organization: string) {
        this.organization = organization;
        return this;
    }

    /**
     * Sets the project name.
     */
    setProject(project: string) {
        this.project = project;
        return this;
    }

    /**
     * Sets the environment name.
     */
    setEnvironment(environment: string) {
        this.environment = environment;
        return this;
    }

    /**
     * Sets the runtime.
     */
    setRuntime(runtime: Runtime) {
        this.runtime = runtime;
        return this;
    }

    /**
     * Sets the memory.
     */
    setMemory(memory: number) {
        this.memory = memory;
        return this;
    }

    /**
     * Sets the architecture.
     */
    setArch(arch: Architecture) {
        this.arch = arch;
        return this;
    }

    /**
     * Sets the timeout.
     */
    setTimeout(timeout: number) {
        this.timeout = timeout;
        return this;
    }

    /**
     * Sets the framework.
     */
    setFramework(framework: Framework) {
        this.framework = framework;
        return this;
    }

    /**
     * Sets the framework adapter.
     */
    setFrameworkAdapter(frameworkAdapter: FrameworkAdapter) {
        this.frameworkAdapter = frameworkAdapter;
        return this;
    }

    /**
     * Includes an asset.
     * By default, the asset will be served from the project root folder.
     * e.g. includeAsset('./public/image.png') will be served at /public/image.png
     * If you want to serve the asset from a different path, you can specify the destination path.
     * e.g. includeAsset('./public/image.png', './image.png') will be served at /image.png
     * e.g. includeAsset('./public', './') will serve files from ./public folder at /
     */
    includeAsset(path: string, destination?: string) {
        this.assets.include[path] = destination ?? true;
        return this;
    }

    /**
     * Includes a permanent asset.
     * By default, the asset will be served from the project root folder.
     * e.g. includePermanentAsset('./public/image.png') will be served at /public/image.png
     * If you want to serve the asset from a different path, you can specify the destination path.
     * e.g. includePermanentAsset('./public/image.png', './image.png') will be served at /image.png
     */
    includePermanentAsset(path: string, destination?: string) {
        this.permanentAssets.include[path] = destination ?? true;
        return this;
    }

    /**
     * Includes a debug asset.
     */
    includeDebugAsset(path: string, destination?: string) {
        this.debugAssets.include[path] = destination ?? true;
        return this;
    }

    /**
     * Includes source code files of your app.
     */
    includeApp(path: string, destination?: string) {
        this.app.include[path] = destination ?? true;
        return this;
    }

    /**
     * Sets the entrypoint of your app.
     */
    setAppEntrypoint(entrypoint: string) {
        this.app.entrypoint = entrypoint;
        return this;
    }

    /**
     * Sets the default file to serve if no other route matches.
     */
    setDefaultFile(defaultFile: string) {
        this.assets.defaultFile = defaultFile;
        this.permanentAssets.defaultFile = defaultFile;
        return this;
    }

    /**
     * Sets the default status code to serve if no other route matches.
     */
    setDefaultStatus(defaultStatus: number) {
        this.assets.defaultStatus = defaultStatus;
        this.permanentAssets.defaultStatus = defaultStatus;
        return this;
    }

    /**
     * Sets whether to skip the framework build.
     */
    setSkipFrameworkBuild(value = true) {
        this.skipFrameworkBuild = value;
        return this;
    }

    /**
     * Adds a Node.js function to the router.
     * @param functionPath - The path to the module that exports the function.
     * @param condition - The condition to match the function.
     * @example
     * addNodeFunction('./urlTransformFunction.js', {
     *     path: '/_next/image',
     * });
     * @example urlTransformFunction.js
     * import type { Request, Response } from 'ownstak';
     * export default function urlTransformFunction(req: Request, res: Response) {
     *     const url = new URL(req.url);
     *     url.pathname = url.pathname.replace('/_next/image', '/_next/image/');
     *     req.url = url.toString();
     * }
     * @private
     */
    addNodeFunction(functionPath: string, condition: RouteCondition = {}) {
        const name = `${basename(functionPath).split('.').slice(0, -1).join('.')}-${Date.now()}.mjs`;
        const srcPath = relative(process.cwd(), functionPath);
        const destPath = join('node-functions', name);
        this.includeApp(srcPath, destPath);
        this.router.match(condition, [
            {
                type: 'nodeFunction',
                path: destPath,
            },
        ]);
        return this;
    }

    /**
     * Starts the user's app if defined.
     * @private
     */
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
        // The entrypoint should be a function that starts the HTTP server
        // and returns a promise that resolves when the server is ready to accept connections.
        if (typeof start === 'function') {
            await start();
        }
        // If entrypoint is just file that starts the HTTP server,
        // we need to wait for TCP socket to be open and accept connections.
        await waitForSocket(HOST, APP_PORT);
    }

    /**
     * Serializes the config to a JSON string
     * @private
     */
    serialize() {
        const replacer = (key: string, value: any) => {
            if (value instanceof RegExp) {
                return `regexp:${value.source}`;
            }
            return value;
        };
        return JSON.stringify(this, replacer, 2);
    }

    /**
     * Deserializes the config from a JSON string
     * @private
     */
    static deserialize(json: string) {
        const reviver = (_key: string, value: any) => {
            if (typeof value === 'string' && value.startsWith('regexp:')) {
                return new RegExp(value.slice(7));
            }
            return value;
        };
        try {
            const parsedJson = JSON.parse(json, reviver);
            const config = new Config(parsedJson);
            const router = new Router();
            Object.assign(router, parsedJson.router);
            config.router = router;
            return config;
        } catch (error) {
            throw new Error(`Failed to deserialize config: ${error}`);
        }
    }

    /**
     * Validates the config.
     * @throws {CliError} if the config is invalid.
     * @private
     */
    async validate() {
        const supportedFrameworks: string[] = Object.values(FRAMEWORKS);
        if (this.framework && !supportedFrameworks.includes(this.framework)) {
            throw new CliError(`Invalid framework '${this.framework}' in ${BRAND} project config. Supported frameworks are: ${supportedFrameworks.join(', ')}`);
        }
        const supportedRuntimes: string[] = Object.values(RUNTIMES);
        if (this.runtime && !supportedRuntimes.includes(this.runtime)) {
            throw new CliError(`Invalid runtime '${this.runtime}' in ${BRAND} project config. Supported runtimes are: ${supportedRuntimes.join(', ')}`);
        }
        const supportedArchitectures: string[] = Object.values(ARCHS);
        if (this.arch && !supportedArchitectures.includes(this.arch)) {
            throw new CliError(`Invalid arch '${this.arch}' in ${BRAND} project config. Supported architectures are: ${supportedArchitectures.join(', ')}`);
        }
        if (this.memory <= 0 || this.memory > 10240) {
            throw new CliError(`Invalid memory '${this.memory}' in ${BRAND} project config. Memory must be between 1 and 10240MiB`);
        }
        if (this.timeout <= 0 || this.timeout > 900) {
            throw new CliError(`Invalid timeout '${this.timeout}' in ${BRAND} project config. Timeout must be between 1 and 900 seconds`);
        }
    }

    /**
     * Loads the built JSON config file from the .ownstak folder.
     * This should be called in lambda and when running build locally.
     * @private
     */
    static async loadFromBuild() {
        const configFilePath = [resolve(__dirname, OUTPUT_CONFIG_FILE), resolve(OUTPUT_CONFIG_FILE), resolve(COMPUTE_DIR_PATH, OUTPUT_CONFIG_FILE)].find(
            existsSync,
        );
        if (!configFilePath) {
            throw new Error(`Config file was not found: ${OUTPUT_CONFIG_FILE}`);
        }

        logger.debug(`Loading ${BRAND} project config from: ${configFilePath}`);
        return this.deserialize(await readFile(configFilePath, 'utf8'));
    }

    /**
     * Loads the source config file from the project root.
     * This requires the bundle-require module with esbuild to be installed,
     * so we can correctly load mjs/cjs/ts files.
     * This should not be called in lambda.
     * @private
     */
    static async loadFromSource() {
        // Load the config from ownstak.config.json if it exists.
        // This allows users to have pure .json config without any dependencies.
        const jsonConfigFilePath = resolve(OUTPUT_CONFIG_FILE);
        if (existsSync(jsonConfigFilePath)) {
            logger.debug(`Loading ${BRAND} project config from: ${jsonConfigFilePath}`);
            return this.deserialize(await readFile(jsonConfigFilePath, 'utf8'));
        }

        // Load the config from ownstak.config.js/mjs/cjs/ts if it exists.
        // We use dynamic import here to avoid bundling the bundle-require module.
        const { bundleRequire } = await import('bundle-require');
        const configFilePath = [
            resolve(INPUT_CONFIG_FILE),
            resolve(INPUT_CONFIG_FILE).replace('.js', '.mjs'),
            resolve(INPUT_CONFIG_FILE).replace('.js', '.cjs'),
            resolve(INPUT_CONFIG_FILE).replace('.js', '.ts'),
        ].find(existsSync);
        if (!configFilePath) {
            logger.debug(`No config file found, using default ${BRAND} project config...`);
            return new Config();
        }

        // Try to import the ownstak package to verify it's actually installed
        // and not just in the package.json before we try to load the config with bundleRequire,
        // so users don't see a confusing error message about missing ownstak package
        // when they delete node_modules or have local symlink version of ownstak
        try {
            await findModuleLocation(NAME);
        } catch (e: any) {
            const cliVersion = CliConfig.getCurrentVersion();
            logger.info(`Installing ${NAME} CLI v${cliVersion} into your project...`);
            await installDependency(NAME, cliVersion);
        }

        const relativeConfigFilePath = relative(process.cwd(), configFilePath);
        logger.debug(`Loading ${BRAND} project config: ${relativeConfigFilePath}`);
        try {
            const { mod } = await bundleRequire({
                filepath: normalizePath(configFilePath),
            });

            // Check if the config file is in the correct format.
            // Do not use instanceof Config here, because it doesn't work with bundled files.
            const configModule = mod?.default?.default || mod?.default || new Config();
            if (configModule.toString() != new Config().toString()) {
                const exampleConfigFilePath = resolve(__dirname, 'templates', 'config', 'ownstak.config.js');
                const exampleConfig = await readFile(exampleConfigFilePath, 'utf8');
                throw new CliError(
                    `The ${BRAND} project config file format was not recognized. Make sure the '${relativeConfigFilePath}' file exports instance of the Config class as default.` +
                        `Example config file: \r\n${exampleConfig}`,
                );
            }

            return configModule as Config;
        } catch (e: any) {
            throw new CliError(`Failed to load ${BRAND} project config from '${relativeConfigFilePath}':\r\n${e.stack}`);
        }
    }

    /**
     * Reloads the config from the build file.
     * @private
     */
    async reloadFromBuild() {
        const config = await Config.loadFromBuild();
        Object.assign(this, config);
        return this;
    }

    /**
     * Reloads the config from the source file.
     * @private
     */
    async reloadFromSource() {
        const config = await Config.loadFromSource();
        Object.assign(this, config);
        return this;
    }

    /**
     * Builds the source config in JS/TS format
     * to normalized JSON output format.
     * @param destDir - The destination directory for the output config file.
     * @private
     */
    async build(destDir: string = COMPUTE_DIR_PATH) {
        logger.debug(`Building ${BRAND} project config...`);
        await writeFile(resolve(destDir, OUTPUT_CONFIG_FILE), this.serialize(), 'utf8');
    }

    /**
     * Returns the default runtime for the project
     * based on the currently used Node.js version.
     */
    static getDefaultRuntime(): Runtime {
        const currentVersion = process.version.slice(1);
        const [currentMajor, ..._] = currentVersion.split('.');
        for (const runtime of Object.values(RUNTIMES)) {
            const [runtimeMajor, ..._] = runtime.replace('nodejs', '').split('.');
            if (runtimeMajor === currentMajor) return runtime;
        }
        return RUNTIMES.Nodejs22;
    }

    /**
     * Returns the default architecture for the project
     * based on the currently used CPU architecture.
     * This ensures that the native node modules will work.
     */
    static getDefaultArch(): Architecture {
        const currentArch = process.arch.replace('x64', ARCHS.X86_64);
        return Object.values(ARCHS).find((arch) => arch === currentArch) ?? ARCHS.X86_64;
    }

    /**
     * Returns the default memory for the project
     * based on the currently used Node.js version.
     */
    static getDefaultMemory(): number {
        return DEFAULT_MEMORY;
    }

    /**
     * Returns the default timeout for the project
     * based on the currently used Node.js version.
     */
    static getDefaultTimeout(): number {
        return DEFAULT_TIMEOUT;
    }

    /**
     * Returns the default environment name
     * @default default
     */
    static getDefaultEnvironment(): string {
        return DEFAULT_ENVIRONMENT;
    }

    /**
     * Returns the default project name
     * @default Name from package.json
     */
    static getDefaultProject(): string {
        const packageJsonPath = resolve('package.json');
        if (!existsSync(packageJsonPath)) return 'default';
        const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
        return packageJson.name || 'default';
    }

    toString() {
        return this.constructor.name;
    }
}

export interface HookArgs {
    config: Config;
}
export interface DevHookArgs extends HookArgs {}
export interface BuildHookArgs extends HookArgs {}

export interface FrameworkAdapter {
    name: string;
    isPresent: () => Promise<boolean> | boolean;
    hooks: {
        'build:start'?: (args: HookArgs) => Promise<void> | void;
        'build:routes:start'?: (args: BuildHookArgs) => Promise<void> | void;
        'build:routes:finish'?: (args: BuildHookArgs) => Promise<void> | void;
        'build:finish'?: (args: BuildHookArgs) => Promise<void> | void;
        'dev:start'?: (args: DevHookArgs) => Promise<void> | void;
    };
}

export type Framework = (typeof FRAMEWORKS)[keyof typeof FRAMEWORKS] | string;
export type Runtime = (typeof RUNTIMES)[keyof typeof RUNTIMES] | string;
export type Architecture = (typeof ARCHS)[keyof typeof ARCHS] | string;

export interface FilesConfig {
    /**
     * The files to include in the build.
     * The keys can contain files, directories or glob patterns. The values can be:
     * - true - to include and serve all files under same path as in the source folder.
     * - false - to exclude a specific file or all files from previously included paths.
     * - string - destination path to serve files under a different path than in the source folder.
     * See the below examples for more details.
     * @default { include: {} }
     * @example
     * {
     *     include: {
     *         "./public": './', // Includes and serves all files under './public' path. E.g. ./public/image.png will be served as /image.png
     *     },
     * }
     */
    include: Record<string, boolean | string>;
}

export interface AssetsConfig extends FilesConfig {
    /**
     * Set to true to convert HTML files to folders with index.html file.
     * For example:
     * .ownstak/assets/products/3.html -> .ownstak/assets/products/3/index.html
     * @default false
     */
    htmlToFolders?: boolean;

    /**
     * The default file to serve if no other route matches.
     * For example set this to index.html to serve it for all paths
     * in SPA applications.
     * @default 404.html
     */
    defaultFile?: string;

    /**
     * The status code to serve if no other route matches.
     * @default 404
     */
    defaultStatus?: number;
}

export interface AppConfig extends FilesConfig {
    /**
     * The entrypoint of your app to start.
     * It should be file that starts the HTTP server or exports default function that starts the HTTP server.
     * @default undefined
     */
    entrypoint?: string;

    /**
     * Set to true to trace and copy all dependencies of specified entrypoint.
     * @default false
     */
    copyDependencies?: boolean;
}

export interface DebugAssetsConfig extends FilesConfig {}
