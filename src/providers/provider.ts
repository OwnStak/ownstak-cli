import type { Config } from '../config.js';
import type { DeployCommandOptions } from '../commands/deploy.js';

export default class Provider {
    options: DeployCommandOptions;
    config: Config;

    constructor(options: DeployCommandOptions, config: Config) {
        this.options = options;
        this.config = config;
    }

    async init(): Promise<void> {}

    async deploy(): Promise<void> {
        throw new Error('Not implemented');
    }
}
