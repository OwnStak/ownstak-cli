import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { logger } from '../logger.js';
import { detectFramework, getFrameworkAdapters } from '../frameworks/index.js';
import { loadConfig } from './build.js';
import { getFrameworkAdapter } from '../frameworks/index.js';
import { VERSION } from '../constants.js';
import { NAME } from '../constants.js';

export interface DevCommandOptions {
    framework?: string;
}

export async function dev(options: DevCommandOptions) {
    const config = await loadConfig();
    config.framework = options.framework || config.framework || (await detectFramework());
    config.frameworkAdapter ??= getFrameworkAdapter(config.framework);

    if (!config.frameworkAdapter) {
        logger.error(
            `No supported framework was detected. The ${NAME} ${VERSION} supports the following frameworks: ${getFrameworkAdapters()
                .map((adapter) => adapter.name)
                .join(', ')}`,
        );
        process.exit(1);
    }

    logger.info(`Framework: ${config.framework}`);
    await config.frameworkAdapter.dev();
}
