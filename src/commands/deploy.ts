import { logger } from '../logger.js';

export interface DeployCommandOptions {
    framework?: string;
}

export async function deploy(_options: DeployCommandOptions) {
    logger.info(`This feature is not available yet.`);
}
