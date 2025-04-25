import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { logger } from '../logger.js';
import { detectFramework, getFrameworkAdapters } from '../frameworks/index.js';
import { getFrameworkAdapter } from '../frameworks/index.js';
import { VERSION, NAME } from '../constants.js';
import { Config } from '../config.js';
import { CliError } from '../cliError.js';

export interface DevCommandOptions {
    framework?: string;
}

export async function dev(options: DevCommandOptions) {
    const config = await Config.loadFromSource();

    config.framework = options.framework || config.framework || (await detectFramework());
    config.frameworkAdapter ??= getFrameworkAdapter(config.framework);

    if (!config.frameworkAdapter) {
        throw new CliError(
            `No supported framework was detected. The ${NAME} ${VERSION} supports the following frameworks: ${getFrameworkAdapters()
                .map((adapter) => adapter.name)
                .join(', ')}`,
        );
    }

    // Run dev:start hook
    await config.frameworkAdapter?.hooks['dev:start']?.(config);
}
