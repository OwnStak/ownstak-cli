import { Router } from './compute/router/router.js';
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
    NAME,
    ARCHS,
    DEFAULT_MEMORY,
    DEFAULT_TIMEOUT,
    HOST,
    DEFAULT_ENVIRONMENT,
} from './constants.js';
import { dirname, relative, resolve } from 'path';
import { logger } from './logger.js';
import { normalizePath } from './utils/pathUtils.js';
import chalk from 'chalk';
import { fileURLToPath } from 'url';
import { CliError } from './cliError.js';
import { waitForSocket } from './utils/portUtils.js';

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
        this.cliVersion ??= '0.0.0';
        this.project ??= Config.getDefaultProject();
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
    }

    setOrganization(organization: string) {
        this.organization = organization;
        return this;
    }

    setProject(project: string) {
        this.project = project;
        return this;
    }

    setEnvironment(environment: string) {
        this.environment = environment;
        return this;
    }

    setRuntime(runtime: Runtime) {
        this.runtime = runtime;
        return this;
    }

    setMemory(memory: number) {
        this.memory = memory;
        return this;
    }

    setArch(arch: Architecture) {
        this.arch = arch;
        return this;
    }

    setTimeout(timeout: number) {
        this.timeout = timeout;
        return this;
    }

    setFramework(framework: Framework) {
        this.framework = framework;
        return this;
    }

    setFrameworkAdapter(frameworkAdapter: FrameworkAdapter) {
        this.frameworkAdapter = frameworkAdapter;
        return this;
    }

    includeAsset(path: string, destination?: string) {
        this.assets.include[path] = destination ?? true;
        return this;
    }

    includePermanentAsset(path: string, destination?: string) {
        this.permanentAssets.include[path] = destination ?? true;
        return this;
    }

    includeDebugAsset(path: string, destination?: string) {
        this.debugAssets.include[path] = destination ?? true;
        return this;
    }

    includeApp(path: string, destination?: string) {
        this.app.include[path] = destination ?? true;
        return this;
    }

    setAppEntrypoint(entrypoint: string) {
        this.app.entrypoint = entrypoint;
        return this;
    }

    setDefaultFile(defaultFile: string) {
        this.assets.defaultFile = defaultFile;
        this.permanentAssets.defaultFile = defaultFile;
        return this;
    }

    setDefaultStatus(defaultStatus: number) {
        this.assets.defaultStatus = defaultStatus;
        this.permanentAssets.defaultStatus = defaultStatus;
        return this;
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
        // The entrypoint should be a function that starts the HTTP server
        // and returns a promise that resolves when the server is ready to accept connections.
        if (typeof start === 'function') {
            await start();
        }
        // If entrypoint is just file that starts the HTTP server,
        // we need to wait for TCP socket to be open and accept connections.
        await waitForSocket(HOST, APP_PORT);
    }

    serialize() {
        const replacer = (key: string, value: any) => {
            if (value instanceof RegExp) {
                return `regexp:${value.source}`;
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
     * @returns
     */
    static async loadFromBuild() {
        const configFile = [resolve(__dirname, OUTPUT_CONFIG_FILE), resolve(OUTPUT_CONFIG_FILE), resolve(COMPUTE_DIR_PATH, OUTPUT_CONFIG_FILE)].find(
            existsSync,
        );
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
            // Display hint what to do to customize the default config
            logger.info(`Using default ${BRAND} config....`);
            logger.info('');
            logger.drawTable([`Run ${chalk.cyan(`npx ${NAME} config init`)} to customize your project's config.`], {
                title: 'Hint',
                borderColor: 'brand',
            });
            logger.info('');

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

    /**
     * Builds the source config in JS/TS format
     * to normalized JSON output format.
     * @param destDir - The destination directory for the output config file.
     */
    async build(destDir: string = COMPUTE_DIR_PATH) {
        logger.debug(`Building ${BRAND} project config...`);
        await writeFile(resolve(destDir, OUTPUT_CONFIG_FILE), this.serialize(), 'utf8');
    }

    toString() {
        return this.constructor.name;
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
