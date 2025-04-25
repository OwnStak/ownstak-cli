// @ts-nocheck
// Load original next.config.ts/js/mjs file. This path is injected by ownstak-cli during the build.
import originalNextConfigModule from '{{ nextConfigOriginalPath }}';
import { existsSync } from 'fs';
import { resolve } from 'path';

/**
 * This is Next.js config wrapper added by the @ownstak/cli.
 * It injects additional config into the user's next.config.ts file.
 *
 * DON'T DELETE THIS FILE UNTIL THE BUILD FINISHES.
 * If you see this file, your build is broken. Try to run 'npx ownstak build' again
 * or delete this file manually and rename the original next.config.ts/js/mjs file back.
 */
export default async function nextConfig() {
    const originalNextConfig = originalNextConfigModule?.default ?? originalNextConfigModule;
    const nextConfig = typeof originalNextConfig === 'function' ? await originalNextConfig({}) : originalNextConfig;

    // Set build output to standalone
    nextConfig.output = 'standalone';

    // Add OwnStak image loader if user didn't set any loader
    nextConfig.images ?? (nextConfig.images = {});
    if (!nextConfig.images.loader) {
        nextConfig.images.loader = 'custom';
        nextConfig.images.loaderFile = 'ownstak.image.loader.js';
    }

    return nextConfig;
}
