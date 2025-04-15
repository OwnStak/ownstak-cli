import { Framework, FrameworkAdapter } from '../config.js';
import { logger } from '../logger.js';

// Import available framework adapters
import { nextjsFrameworkAdapter } from './nextjs/nextjs.js';
import { astroFrameworkAdapter } from './astro/astro.js';
import { staticFrameworkAdapter } from './static/static.js';

const FRAMEWORK_ADAPTERS = [nextjsFrameworkAdapter, astroFrameworkAdapter, staticFrameworkAdapter];

export function getFrameworkAdapter(framework?: Framework): FrameworkAdapter | undefined {
    return framework ? FRAMEWORK_ADAPTERS.find((adapter) => adapter.name === framework) : undefined;
}

export function getFrameworkAdapters(): FrameworkAdapter[] {
    return FRAMEWORK_ADAPTERS;
}

export async function detectFramework(): Promise<Framework | undefined> {
    logger.info(`Detecting framework...`);
    for (const frameworkAdapter of FRAMEWORK_ADAPTERS) {
        if (await frameworkAdapter.isPresent()) {
            return frameworkAdapter.name;
        }
    }
    return undefined;
}
