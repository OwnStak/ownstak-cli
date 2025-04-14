import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { logger } from '../logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface DevCommandOptions {
    framework?: string;
}

export async function dev(_options: DevCommandOptions) {
    logger.info(`This feature is not available yet.`);
}
