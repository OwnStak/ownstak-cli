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
import chalk from 'chalk';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Cache loadSourceConfig and loadBuildConfig results,
// so they always return the same instance within the same process.
let cachedBuildConfig: Config | undefined;
let cachedSourceConfig: Config | undefined;

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
     * @default same node.js version as on the machine used to build the app (e.g. 'nodejs20')
     */
    runtime?: Runtime;

    /**
     * The amount of RAM to use for the app.
     * @default 1024 MB
     */
    memory?: number;

    /**
     * The architecture to use for the app.
     * @default same architecture as on the machine used to build the app (e.g. 'x86_64' or 'arm64')
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
     * @default auto-detected based on the project folder (e.g. 'astro')
     */
    framework?: Framework;

    /**
     * The framework adapter to use for the app.
     * @default auto-selected based on the framework name
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

    /**
     * The command to build the app
     * for the static or custom framework.
     * @example 'npx vite build'
     * @default undefined
     */
    buildCommand?: string;

    /**
     * The command to run the app in development mode.
     * @example 'npx vite dev'
     * @default undefined
     */
    devCommand?: string;
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
    buildCommand?: string;
    devCommand?: string;

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
        this.app.streaming ??= true;
        this.app.compression ??= true;
        this.cliVersion ??= '0.0.0';
    }

    /**
     * Sets the organization name.
     * @example setOrganization('my-organization')
     * @default undefined
     */
    setOrganization(organization: string) {
        this.organization = organization;
        return this;
    }

    /**
     * Sets the project name.
     * @example setProject('my-project')
     * @default undefined
     */
    setProject(project: string) {
        this.project = project;
        return this;
    }

    /**
     * Sets the environment name.
     * @example setEnvironment('production')
     * @default 'default'
     */
    setEnvironment(environment: string) {
        this.environment = environment;
        return this;
    }

    /**
     * Sets the runtime.
     * @example setRuntime('nodejs20')
     * @default same node.js version as on the machine used to build the app (e.g. 'nodejs20')
     */
    setRuntime(runtime: Runtime) {
        this.runtime = runtime;
        return this;
    }

    /**
     * Sets the memory.
     * @example setMemory(1024) // 1024 MB
     * @default 1024 MB
     */
    setMemory(memory: number) {
        this.memory = memory;
        return this;
    }

    /**
     * Sets the architecture.
     * @example setArch('arm64')
     * @default same architecture as on the machine used to build the app (e.g. 'x86_64' or 'arm64')
     */
    setArch(arch: Architecture) {
        this.arch = arch;
        return this;
    }

    /**
     * Sets the timeout for the response/execution of the app in seconds.
     * @example setTimeout(60) // 60 seconds
     * @default 20 seconds
     */
    setTimeout(timeout: number) {
        this.timeout = timeout;
        return this;
    }

    /**
     * Sets the framework. When not specified, the framework will be detected automatically.
     * @example setFramework('astro')
     * @default auto-detected based on the project folder (e.g. 'astro')
     */
    setFramework(framework: Framework) {
        this.framework = framework;
        return this;
    }

    /**
     * Sets the framework adapter that defines how to build and run the specified framework.
     * @example setFrameworkAdapter({
     *     name: 'astro',
     *     hooks: {
     *         'build:start': async ({ config }) => {
     *             await runCommand('npx astro build');
     *             config.includeAsset('dist/client/');
     *             config.includeApp('dist/server/');
     *             config.setAppEntrypoint('dist/server/index.mjs');
     *         },
     *         'dev:start': async ({ config }) => {
     *             await spawnAsync(`npx astro dev --port ${process.env.PORT}`);
     *         },
     *     },
     * })
     * @default auto-selected based on the framework name
     */
    setFrameworkAdapter(frameworkAdapter: FrameworkAdapter) {
        this.frameworkAdapter = frameworkAdapter;
        return this;
    }

    /**
     * Includes a static asset into the build.
     * By default, the asset will be served from the project root folder.
     * e.g. includeAsset('./public/image.png') will be served at /public/image.png
     * If you want to serve the asset from a different path, you can specify the destination path.
     * e.g. includeAsset('./public/image.png', './image.png') will be served at /image.png
     * e.g. includeAsset('./public', './') will serve files from ./public folder at /
     * If you want to include all JS files from a folder, you can use a glob pattern.
     * e.g. includeAsset('src/*.{js,mjs}')
     */
    includeAsset(path: string, destination?: string) {
        this.assets.include[path] = destination ?? true;
        return this;
    }

    /**
     * Includes a permanent static asset into the build.
     * By default, the asset will be served from the project root folder.
     * e.g. includePermanentAsset('./public/image.png') will be served at /public/image.png
     * If you want to serve the asset from a different path, you can specify the destination path.
     * e.g. includePermanentAsset('./public/image.png', './image.png') will be served at /image.png
     * If you want to include all JS files from a folder, you can use a glob pattern.
     * e.g. includePermanentAsset('src/*.{js,mjs}')
     */
    includePermanentAsset(path: string, destination?: string) {
        this.permanentAssets.include[path] = destination ?? true;
        return this;
    }

    /**
     * Includes a debug asset into the debug build folder.
     * @example includeDebugAsset('src/package.json')
     * @example includeDebugAsset('src/*.{js,mjs}')
     */
    includeDebugAsset(path: string, destination?: string) {
        this.debugAssets.include[path] = destination ?? true;
        return this;
    }

    /**
     * Includes JS source code file/s of your app into the build.
     * @example includeApp('src/server.mjs')
     * @example includeApp('src/*.{js,mjs}')
     */
    includeApp(path: string, destination?: string) {
        this.app.include[path] = destination ?? true;
        return this;
    }

    /**
     * Sets the entrypoint of your app. This should be a file with your application code that starts the HTTP server.
     * @example setAppEntrypoint('src/server.mjs')
     */
    setAppEntrypoint(entrypoint: string) {
        this.app.entrypoint = entrypoint;
        return this;
    }

    /**
     * Sets the compression behavior for the responses from your app.
     * By default, compression is enabled for all the modern browsers/clients that support it
     * and for supported content-types that are effectively compressable (text/*, application/*, image/svg+xml...).
     *
     * Set this option to false if you would like to disable compression for all responses,
     * for example, to offload the compression to a CDN or proxy server.
     * Be aware that disabling compression will increase your overall bandwidth usage and possibly latency.
     * @default true
     */
    setAppCompression(compression = true) {
        this.app.compression = compression;
        return this;
    }

    /**
     * Sets the streaming behavior of the response.
     *
     * Set to `false` to disable streaming and buffer the entire response in memory
     * before sending it to the client. Set to `true` (default) to stream the response
     * in chunks as it is generated.
     *
     * **Behavior when disabled (`false`):**
     * When streaming is disabled, the full response is buffered in memory until processing is complete,
     * then sent to the client in a single transmission. This is useful for debugging and error handling.
     * If any error occurs during processing, regardless of phase, the client will receive a proper 5xx error response.
     * Downside is higher memory usage and increased latency between your app and the client.
     *
     * **Behavior when enabled (`true`):**
     * When streaming is enabled, each response body chunk is sent directly to the client in increments of up to 32 KiB.
     * This is useful for large responses, effective memory usage and improving Time To First Byte (TTFB) of your app.
     * Error handling depends on when the error occurs:
     * - If the error occurs before response status and headers are sent, the client receives a 5xx error response (same as when streaming is disabled).
     * - If the error occurs after response status and headers are sent, it is too late to alter the status code.
     * The client will instead encounter a TCP connection reset, incomplete chunked response, or timeout (depending on your app),
     * indicating the response with 2xx status is incomplete or corrupted and should not be cached.
     *
     * @example setAppStreaming(false)
     * @default true
     */
    setAppStreaming(streaming = true) {
        this.app.streaming = streaming;
        return this;
    }

    /**
     * Sets the default file to serve if no other route matches.
     * This config is applied to both assets and permanentAssets.
     * @example setDefaultFile('index.html')
     */
    setDefaultFile(assetsDefaultFile: string, permanentAssetsDefaultFile = assetsDefaultFile) {
        this.assets.defaultFile = assetsDefaultFile;
        this.permanentAssets.defaultFile = permanentAssetsDefaultFile;
        return this;
    }

    /**
     * Sets the default status code to serve if no other route matches.
     * This config is applied to both assets and permanentAssets.
     * @example setDefaultStatus(404)
     */
    setDefaultStatus(assetsDefaultStatus: number, permanentAssetsDefaultStatus = assetsDefaultStatus) {
        this.assets.defaultStatus = assetsDefaultStatus;
        this.permanentAssets.defaultStatus = permanentAssetsDefaultStatus;
        return this;
    }

    /**
     * Sets whether to skip the framework build.
     * @default false
     */
    setSkipFrameworkBuild(value = true) {
        this.skipFrameworkBuild = value;
        return this;
    }

    /**
     * Sets whether to copy
     * all app dependencies traced from the specified app entrypoint.
     * For example imported express node_module will be copied to the build output.
     * @default true
     */
    setCopyAppDependencies(value = true) {
        this.app.copyDependencies = value;
        return this;
    }

    /**
     * Sets whether to bundle
     * all app dependencies into the specified app entrypoint.
     * For example imported express node_module will be bundled into resulting entrypoint file.
     * @default true
     */
    setBundleAppDependencies(value = true) {
        this.app.bundleDependencies = value;
        return this;
    }

    /**
     * Sets the command to build the app.
     * Use this option to override the default build command
     * for your framework or specify it for the static/custom framework.
     * @example setBuildCommand('npx vite build')
     */
    setBuildCommand(command: string) {
        this.buildCommand = command;
        return this;
    }

    /**
     * Sets the command to run the app in development mode.
     * Use this option to override the default dev command
     * for your framework or specify it for the static/custom framework.
     * @example setDevCommand('npx vite dev')
     */
    setDevCommand(command: string) {
        this.devCommand = command;
        return this;
    }

    /**
     * Sets whether to convert HTML assets to folders with index.html file.
     * The config is applied to both assets and permanentAssets.
     * @default true
     */
    setConvertHtmlToFolders(assetsValue = true, permanentAssetsValue = assetsValue) {
        this.assets.convertHtmlToFolders = assetsValue;
        this.permanentAssets.convertHtmlToFolders = permanentAssetsValue;
        return this;
    }

    /**
     * Sets a redirect for the specified route condition.
     * @param from - The route condition to match.
     * @param to - The URL to redirect to.
     * @param statusCode - The status code to use for the redirect (default is 302)
     * @example setRedirect('/old-page', '/new-page')
     * @example setRedirect('/:path*', '/new-page', 308)
     * @example setRedirect('/blog/:slug', '/new-blog/:slug', 301)
     */
    setRedirect(from: RouteCondition | string = {}, to: string, statusCode = 302) {
        this.router.match(
            from,
            [
                {
                    type: 'redirect',
                    statusCode,
                    to,
                },
            ],
            true,
        );
        return this;
    }

    /**
     * Sets the response status code for the specified route condition.
     * @param statusCode - The status code to set.
     * @param condition - The route condition to match.
     * @example setResponseStatusCode(404)
     * @example setResponseStatusCode(404, '/old-page')
     */
    setResponseStatus(statusCode: number, condition: RouteCondition | string = {}) {
        this.router.match(
            condition,
            [
                {
                    type: 'setResponseStatus',
                    statusCode,
                },
            ],
            false,
        );
        return this;
    }

    /**
     * Sets the response headers for all requests pointing to the assets, permanentAssets or app.
     * @example setResponseHeaders({ 'X-Frame-Options': 'DENY' }) // for all requests
     * @example setResponseHeaders({ 'X-Api-Version': '1.0.0' }, "/api/:path*") // for requests to any path under /api
     * @example setResponseHeaders({ 'X-Api-Version': '1.0.0' }, { // for POST requests to any path under /api
     *     path: '/api/:path*',
     *     method: 'POST',
     * })
     */
    setResponseHeaders(headers: Record<string, string>, condition: RouteCondition | string = {}) {
        if (Object.keys(headers).length === 0) return this;
        this.router.match(
            condition,
            Object.entries(headers).map(([key, value]) => ({
                type: 'setResponseHeader',
                key,
                value,
            })),
        );
        return this;
    }

    /**
     * Sets the request headers for all requests pointing to the assets, permanentAssets or app.
     * @example setRequestHeaders({ 'X-Frame-Options': 'DENY' }) // for all requests
     * @example setRequestHeaders({ 'X-Api-Version': '1.0.0' }, "/api/:path*") // for requests to any path under /api
     * @example setRequestHeaders({ 'X-Api-Version': '1.0.0' }, { // for POST requests to any path under /api
     *     path: '/api/:path*',
     *     method: 'POST',
     * })
     */
    setRequestHeaders(headers: Record<string, string>, condition: RouteCondition | string = {}) {
        if (Object.keys(headers).length === 0) return this;
        this.router.match(
            condition,
            Object.entries(headers).map(([key, value]) => ({
                type: 'setRequestHeader',
                key,
                value,
            })),
        );
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
     * Sets the custom router config for the Ownstak project.
     * @param router - The router to use for the app.
     * @example import { Router } from 'ownstak';
     * setRouter(new Router()
     *     .get('/', [
     *         {
     *             type: 'serveAsset',
     *             path: '/public/my-page.html',
     *         },
     *     ])
     * );
     */
    setRouter(router: Router) {
        this.router = router;
        return this;
    }

    /**
     * Starts the user's app if defined.
     * @private
     */
    async startApp() {
        // Remove AWS credentials.
        // Not for our security but just so customers have less things to worry about.
        delete process.env.AWS_ACCESS_KEY_ID;
        delete process.env.AWS_SECRET_ACCESS_KEY;
        delete process.env.AWS_SESSION_TOKEN;

        // Set defaults for the app in cloud. Locally these are overriden by the start command.
        process.env.LOG_LEVEL = process.env.LOG_LEVEL || 'error';
        process.env.NODE_ENV = process.env.NODE_ENV || 'production';

        // Set the port to listen on for the app.
        process.env.PORT = APP_PORT.toString();
        // Change the working directory to the app folder,
        // so the relative imports are same as in the project root.
        process.chdir('app');

        if (!this.app.entrypoint) {
            logger.debug('No app entrypoint was specified, skipping');
            return;
        }

        logger.debug(`Starting app's entrypoint: ${this.app.entrypoint}`);
        const entrypointPath = resolve(this.app.entrypoint);
        if (!existsSync(entrypointPath)) {
            throw new Error(`App entrypoint '${entrypointPath}' does not exist.`);
        }

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
        const replacer = (_key: string, value: any) => {
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
            throw new CliError(
                `The specified framework '${this.framework}' is not supported.\r\n` +
                    `The ${NAME} supports the following frameworks: ${supportedFrameworks.join(', ')}\r\n` +
                    `\r\n\r\n` +
                    `Please try the following steps to resolve this issue:\r\n` +
                    `- Check the framework name first\r\n` +
                    `- If you don't know which framework to use, just run 'npx ${NAME} build' and let ${BRAND} detect the framework for you.\r\n` +
                    `- If don't see your framework in the list, try to upgrade ${BRAND} CLI to the latest version first by running 'npx ${NAME} upgrade'.\r\n` +
                    `- If you want to deploy framework that is not yet supported by the ${BRAND}, set the framework to 'custom' and implement your own 'frameworkAdapter' inside '${INPUT_CONFIG_FILE}' file.`,
            );
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
     * @param cache - Whether to cache and load the config from the cache if it exists.
     * @private
     */
    static async loadFromBuild(cache: boolean = true) {
        if (cache && cachedBuildConfig) {
            return cachedBuildConfig;
        }

        const configFilePath = [resolve(__dirname, OUTPUT_CONFIG_FILE), resolve(OUTPUT_CONFIG_FILE), resolve(COMPUTE_DIR_PATH, OUTPUT_CONFIG_FILE)].find(
            existsSync,
        );
        if (!configFilePath) {
            throw new Error(`Config file was not found: ${OUTPUT_CONFIG_FILE}`);
        }

        logger.debug(`Loading ${BRAND} project config from: ${configFilePath}`);
        cachedBuildConfig = this.deserialize(await readFile(configFilePath, 'utf8'));
        return cachedBuildConfig;
    }

    /**
     * Loads the source config file from the project root.
     * This requires the bundle-require module with esbuild to be installed,
     * so we can correctly load mjs/cjs/ts files.
     * This should not be called in lambda.
     * @param cache - Whether to cache and load the config from the cache if it exists.
     * @private
     */
    static async loadFromSource(cache: boolean = true) {
        if (cache && cachedSourceConfig) {
            return cachedSourceConfig;
        }

        // Load the config from ownstak.config.json if it exists.
        // This allows users to have pure .json config without any dependencies.
        const jsonConfigFilePath = resolve(OUTPUT_CONFIG_FILE);
        if (existsSync(jsonConfigFilePath)) {
            logger.debug(`Loading ${BRAND} project config from: ${jsonConfigFilePath}`);
            cachedSourceConfig = this.deserialize(await readFile(jsonConfigFilePath, 'utf8'));
            return cachedSourceConfig;
        }

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
            logger.success(`${NAME} CLI v${cliVersion} installed successfully!`);
        }

        const relativeConfigFilePath = relative(process.cwd(), configFilePath);
        logger.debug(`Loading ${BRAND} project config: ${relativeConfigFilePath}`);
        try {
            // Load the config from ownstak.config.js/mjs/cjs/ts if it exists.
            // We use dynamic import here to avoid bundling the bundle-require module.
            const bundleStartTime = performance.now();
            const { bundleRequire } = await import('bundle-require');

            // We use bundleRequire with esbuild, so we are able to read also .ts config file.
            // We always bundle all imports into the project config (notExternal: [/(.+)/] option),
            // so import won't fail on the first run where ownstak package is not installed in the project yet when process started,
            // we dynamically install it from the current process and dynamically load the project config that depends on it.
            // This happens because Node's ESM modules resolution cache is not updated after we install ownstak package from the current process
            // and there's no way for us to update it without restarting the process.
            const { mod } = await bundleRequire({
                filepath: normalizePath(configFilePath),
                notExternal: [/(.+)/],
                format: 'esm',
            });
            logger.debug(`Project config loaded in ${performance.now() - bundleStartTime}ms`);

            // Check if the exported config is in the correct format.
            const importedConfig = mod?.default?.default || mod?.default || new Config();
            if (importedConfig.toString() != new Config().toString()) {
                const exampleConfigFilePath = resolve(__dirname, 'templates', 'config', 'ownstak.config.js');
                const exampleConfig = await readFile(exampleConfigFilePath, 'utf8');
                throw new CliError(
                    `The ${BRAND} project config file format was not recognized. Make sure the '${relativeConfigFilePath}' file exports instance of the Config class as default export. For example: \r\n\r\n${chalk.cyanBright(exampleConfig)}\r\n`,
                );
            }

            // Create a new Config instance with class from this package.
            // The Config class from the configModule was bundled, so this.constructor.name might be different, etc...
            // It will save us hours of debugging weird issues where ¨Config is not instance of Config¨.
            cachedSourceConfig = new Config();
            Object.assign(cachedSourceConfig, importedConfig);
            return cachedSourceConfig;
        } catch (e: any) {
            throw new CliError(`Failed to load ${BRAND} project config from '${relativeConfigFilePath}':\r\n${e.stack}`);
        }
    }

    /**
     * Reloads the config from the build file.
     * @private
     */
    async reloadFromBuild() {
        const config = await Config.loadFromBuild(false);
        Object.assign(this, config);
        return this;
    }

    /**
     * Reloads the config from the source file.
     * @private
     */
    async reloadFromSource() {
        const config = await Config.loadFromSource(false);
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
        return packageJson.name?.split('/')?.pop() || 'default';
    }

    toString() {
        // NOTE: The this.constructor.name can change after bundling, minification, etc...
        return 'Config';
    }
}

export interface HookArgs {
    config: Config;
}
export interface DevHookArgs extends HookArgs {}
export interface BuildHookArgs extends HookArgs {}

export interface FrameworkAdapter {
    name: string;
    isPresent?: () => Promise<boolean> | boolean;
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
    convertHtmlToFolders?: boolean;

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
     * For example imported express node_modules will be copied to the build output.
     * @default false
     */
    copyDependencies?: boolean;

    /**
     * Set to true to bundle the dependencies of the entrypoint.
     * For example all imported express node_modules will be bundled into resulting entrypoint file.
     * @default false
     */
    bundleDependencies?: boolean;

    /**
     * Controls the compression behavior of the response.
     * By default, compression is enabled for all the modern browsers/clients that support it
     * and for supported content-types that are effectively compressable.
     *
     * Set this option to false if you would like to disable compression for all responses,
     * for example, to offload the compression to a CDN or proxy server.
     * Be aware that disabling compression will increase your overall bandwidth usage and possibly latency.
     * @default true
     */
    compression?: boolean;

    /**
     * Controls the streaming behavior of the response.
     *
     * Set to `false` to disable streaming and buffer the entire response in memory
     * before sending it to the client. Set to `true` (default) to stream the response
     * in chunks as it is generated.
     *
     * **Behavior when disabled (`false`):**
     * When streaming is disabled, the full response is buffered in memory until processing is complete,
     * then sent to the client in a single transmission. This is useful for debugging and error handling.
     * If any error occurs during processing, regardless of phase, the client will receive a proper 5xx error response.
     * Downsides: higher memory usage and increased latency between your app and the client.
     *
     * **Behavior when enabled (`true`):**
     * When streaming is enabled, each response body chunk is sent directly to the client in increments of up to 32 KiB.
     * This is useful for large responses, effective memory usage and improving Time To First Byte (TTFB) of your app.
     * Error handling depends on when the error occurs:
     * - If the error occurs before response status and headers are sent, the client receives a 5xx error response (same as when streaming is disabled).
     * - If the error occurs after response status and headers are sent, it is too late to alter the status code.
     * The client will instead encounter a TCP connection reset, incomplete response, or timeout (depending on your app),
     * indicating the response with 2xx status is incomplete or corrupted and should not be cached.
     *
     * @default true
     */
    streaming?: boolean;
}

export interface DebugAssetsConfig extends FilesConfig {}
