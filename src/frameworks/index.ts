import { Framework, FrameworkAdapter } from '../config.js';
import { logger, LogLevel } from '../logger.js';

// Import available framework adapters
import { nextjsFrameworkAdapter } from './nextjs/nextjs.js';
import { astroFrameworkAdapter } from './astro/astro.js';
import { staticFrameworkAdapter } from './static/static.js';
import { customFrameworkAdapter } from './custom/custom.js';

const FRAMEWORK_ADAPTERS = [nextjsFrameworkAdapter, astroFrameworkAdapter, staticFrameworkAdapter, customFrameworkAdapter];

export function getFrameworkAdapter(framework?: Framework): FrameworkAdapter | undefined {
    return framework ? FRAMEWORK_ADAPTERS.find((adapter) => adapter.name === framework) : undefined;
}

export function getFrameworkAdapters(): FrameworkAdapter[] {
    return FRAMEWORK_ADAPTERS;
}

export async function detectFramework(): Promise<Framework | undefined> {
    logger.startSpinner('Detecting framework...');
    for (const frameworkAdapter of FRAMEWORK_ADAPTERS) {
        if (await frameworkAdapter.isPresent()) {
            const detectedFramework = frameworkAdapter.name;
            logger.stopSpinner(`Detected framework: ${detectedFramework}`, LogLevel.SUCCESS);
            return detectedFramework;
        }
    }
    logger.stopSpinner(`No framework was detected`, LogLevel.WARN);
    return undefined;
}
