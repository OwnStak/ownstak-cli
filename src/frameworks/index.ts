import type { Framework, FrameworkAdapter } from '../config.js';
import { logger, LogLevel } from '../logger.js';

// Import available built-in framework adapters
import { nextjsFrameworkAdapter } from './nextjs/nextjs.js';
import { astroFrameworkAdapter } from './astro/astro.js';
import { tanstackStartFrameworkAdapter } from './tanstackStart/tanstackStart.js';
import { reactRouterFrameworkAdapter } from './reactRouter/reactRouter.js';
import { sveltekitFrameworkAdapter } from './sveltekit/sveltekit.js';
import { angularFrameworkAdapter } from './angular/angular.js';
import { remixFrameworkAdapter } from './remix/remix.js';
import { nuxtFrameworkAdapter } from './nuxt/nuxt.js';
import { staticFrameworkAdapter } from './static/static.js';
import { customFrameworkAdapter } from './custom/custom.js';

const FRAMEWORK_ADAPTERS = [
    nextjsFrameworkAdapter,
    astroFrameworkAdapter,
    nuxtFrameworkAdapter,
    tanstackStartFrameworkAdapter,
    reactRouterFrameworkAdapter,
    sveltekitFrameworkAdapter,
    angularFrameworkAdapter,
    remixFrameworkAdapter,
    staticFrameworkAdapter,
    customFrameworkAdapter,
];

export function getFrameworkAdapter(framework?: Framework): FrameworkAdapter | undefined {
    return framework ? FRAMEWORK_ADAPTERS.find((adapter) => adapter.name === framework) : undefined;
}

export function getFrameworkAdapters(): FrameworkAdapter[] {
    return FRAMEWORK_ADAPTERS;
}

export async function detectFramework(): Promise<Framework | undefined> {
    logger.startSpinner('Detecting framework...');
    for (const frameworkAdapter of FRAMEWORK_ADAPTERS) {
        if (frameworkAdapter.isPresent && (await frameworkAdapter.isPresent())) {
            const detectedFramework = frameworkAdapter.name;
            logger.stopSpinner(`Detected framework: ${detectedFramework}`, LogLevel.SUCCESS);
            return detectedFramework as Framework;
        }
    }
    logger.stopSpinner(`No framework was detected`, LogLevel.WARN);
    return undefined;
}
