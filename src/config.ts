import { Router } from './compute/router/router.js';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { BRAND, OUTPUT_CONFIG_FILE, PORT, VERSION, FRAMEWORKS, RUNTIMES } from './constants.js';
import { resolve } from 'path';
import { logger } from './logger.js';

export class Config {
    /**
     * The current version of Ownstak CLI
     * that created the config.
     * @default packageJson.default.version
     * @private
     */
    version: string = VERSION;

    /**
     * The runtime to use for the app.
     * @default RUNTIMES.Nodejs20
     */
    runtime: Runtime = RUNTIMES.Nodejs20;

    /**
     * The amount of RAM to use for the app.
     * @default 1024
     */
    ram: number = 1024;

    /**
     * The timeout for the app.
     * @default 20 seconds
     */
    timeout: number = 20;

    /**
     * The router to use for the app.
     * @default new Router()
     */
    router: Router = new Router();

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
     * The buildId for this build.
     * @default generateBase64Id()
     */
    buildId?: string;

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
    assets: AssetsConfig = {
        include: {},
    };

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
    persistentAssets: PersistentAssetsConfig = {
        include: {},
    };

    /**
     * The debug assets config for the project.
     * @default { include: {} }
     */
    debugAssets: DebugAssetsConfig = {
        include: {},
    };

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
    app: AppConfig = {
        include: {},
        entrypoint: undefined,
    };

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

        process.env.PORT = (Number(PORT) + 1).toString();
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
        const reviver = (key: string, value: any) => {
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

    static async load() {
        const configFile = [resolve(__dirname, OUTPUT_CONFIG_FILE), resolve(OUTPUT_CONFIG_FILE)].find(existsSync);

        logger.debug(`Loading ${BRAND} config from: ${configFile}`);

        if (!configFile) {
            throw new Error(`Config file was not found: ${OUTPUT_CONFIG_FILE}`);
        }

        return this.deserialize(await readFile(configFile, 'utf8'));
    }

    toString() {
        return this.constructor.name;
    }
}

export interface FrameworkAdapter {
    name: string;
    build: (config: Config) => Promise<void> | void;
    dev: () => Promise<void> | void;
    isPresent: () => Promise<boolean> | boolean;
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
