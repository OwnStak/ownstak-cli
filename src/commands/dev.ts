import { detectFramework, getFrameworkAdapters } from '../frameworks/index.js';
import { getFrameworkAdapter } from '../frameworks/index.js';
import { NAME, PORT } from '../constants.js';
import { Config, type Framework } from '../config.js';
import { CliError } from '../cliError.js';
import { getNearestFreePort } from '../utils/portUtils.js';

export interface DevCommandOptions {
    framework?: Framework;
}

export async function dev(options: DevCommandOptions) {
    const config = await Config.loadFromSource();

    // By default, we listen on 3000 port.
    // If there's a port conflict, we'll try to find the nearest unused port and move to that one (4000, 5000, etc...)
    const freeMainPort = (await getNearestFreePort(PORT)) || PORT;
    process.env.PORT = freeMainPort.toString();

    config.framework = options.framework || config.framework || (await detectFramework());
    config.frameworkAdapter ??= getFrameworkAdapter(config.framework);

    if (!config.frameworkAdapter) {
        throw new CliError(
            `No supported framework was detected. The ${NAME} supports the following frameworks: ${getFrameworkAdapters()
                .map((adapter) => adapter.name)
                .join(', ')}`,
        );
    }

    // Run dev:start hook
    await config.frameworkAdapter?.hooks['dev:start']?.({ config });
}
