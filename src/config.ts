import * as packageJson from "../package.json" with { type: "json" };
import { Router } from "./compute/router/router.js";
import { readFile } from "fs/promises";
import { existsSync } from "fs";
import { BRAND, OUTPUT_CONFIG_FILE, PORT } from "./constants.js";
import { resolve } from "path";
import { logger } from "./logger.js";
import { COMPUTE_DIR_PATH } from "./constants.js";

const version = packageJson.default.version;

export const FRAMEWORK_NAMES = {
    Next: 'nextjs',
    Static: 'static',
} as const;

export type FrameworkName = (typeof FRAMEWORK_NAMES)[keyof typeof FRAMEWORK_NAMES] | string;

export const RUNTIMES = {
    Nodejs22: 'nodejs22.x',
    Nodejs20: 'nodejs20.x',
    Nodejs18: 'nodejs18.x',
} as const;

export type Runtime = (typeof RUNTIMES)[keyof typeof RUNTIMES] | string;

export interface FilesConfig {
    include: string[];
    exclude: string[];
}

export interface ComputeConfig extends FilesConfig {
    entrypoint?: string;
}

export interface AssetsManifest {
    files: string[];
    expirations: Record<string, number>;
}

export interface PersistentAssetsManifest {
    files: string[];
}

export interface ComputeManifest {
    files: string[];
}

export class Config {
    version: string = version;
    runtime: Runtime = RUNTIMES.Nodejs20;
    framework?: FrameworkName;
    ram: number = 1024;
    timeout: number = 20;
    router: Router = new Router();

    assets: FilesConfig = {
        include: [],
        exclude: []
    };
    persistentAssets: FilesConfig = {
        include: [],
        exclude: []
    };
    compute: ComputeConfig = {
        include: [],
        exclude: [],
    };

    setFramework(framework: FrameworkName) {
        this.framework = framework;
        return this;
    }

    setRuntime(runtime: Runtime) {
        this.runtime = runtime;
        return this;
    }

    setRam(ram: number) {
        this.ram = ram;
        return this;
    }

    setTimeout(timeout: number) {
        this.timeout = timeout;
        return this;
    }

    includeAsset(...fileGlobs: string[]) {
        this.assets.include.push(...fileGlobs);
        return this;
    }

    includePersistentAsset(...fileGlobs: string[]) {
        this.persistentAssets.include.push(...fileGlobs);
        return this;
    }

    includeCompute(...fileGlobs: string[]) {
        this.compute.include.push(...fileGlobs);
        return this;
    }

    excludeAsset(...fileGlobs: string[]) {
        this.assets.exclude.push(...fileGlobs);
        return this;
    }
    
    excludePersistentAsset(...fileGlobs: string[]) {
        this.persistentAssets.exclude.push(...fileGlobs);
        return this;
    }

    excludeCompute(...fileGlobs: string[]) {
        this.compute.exclude.push(...fileGlobs);
        return this;
    }

    async startEntrypoint() {
        if(!this.compute.entrypoint) {
            logger.debug("No entrypoint specified, skipping ");
            return;
        }

        // Remove AWS credentials.
        // Not for our security but just so customers have less things to worry about.
        delete process.env.AWS_ACCESS_KEY_ID
        delete process.env.AWS_SECRET_ACCESS_KEY
        delete process.env.AWS_SESSION_TOKEN

        process.env.PORT = (Number(PORT) + 1).toString();

        logger.debug(`Starting app's entrypoint: ${this.compute.entrypoint}`);
        const entrypointPath = resolve(process.cwd(), this.compute.entrypoint);
        const mod = await import(`file://${entrypointPath}`);
        const start = mod?.default?.default || mod?.default || (() => {});
        if(typeof start === 'function') {
            await start();
        }
    }

    serialize() {
        return JSON.stringify(this, null, 2);
    }

    static deserialize(json: string) {
        try{
            const config = new Config();
            const parsedJson = JSON.parse(json);
            Object.assign(config, parsedJson);
            const router = new Router();
            Object.assign(router, parsedJson.router);
            config.router = router;
            return config;
        }catch(error){
            throw new Error(`Failed to deserialize config: ${error}`);
        }
    }

    static async load() {
        const configFile = [
            resolve(__dirname, OUTPUT_CONFIG_FILE),
            resolve(OUTPUT_CONFIG_FILE)
        ].find(existsSync);

        logger.debug(`Loading ${BRAND} config from: ${configFile}`);

        if(!configFile) {
            throw new Error(`Config file was not found: ${OUTPUT_CONFIG_FILE}`);
        }

        return this.deserialize(
            await readFile(configFile, "utf8")
        );
    }

    toString(){
        return this.constructor.name;
    }
}