// Load original next.config file. This path is injected by ownstak-cli during the build.
const originalNextConfigModule = require('{{ nextConfigOriginalPath }}');
const ownstakNextConfig = {
    output: 'standalone',
    images: {
        loader: 'custom',
        loaderFile: 'ownstak.image.loader.js',
    },
};

/**
 * This is CJS Next config wrapper added by the ownstak.
 * It injects additional config into the user's next.config.ts file.
 *
 * DON'T DELETE THIS FILE UNTIL THE BUILD FINISHES.
 * If you see this file, your build is broken. Try to run 'npx ownstak build' again
 * or delete this file manually and rename the original next.config.ts/js/mjs file back.
 */
module.exports = async function nextConfig() {
    const originalNextConfigFunc = originalNextConfigModule?.default ?? originalNextConfigModule;
    const originalNextConfig = typeof originalNextConfigFunc === 'function' ? await originalNextConfigFunc({}) : originalNextConfigFunc;
    
    const nextConfig = {
        ...originalNextConfig,
        ...ownstakNextConfig,
        images: {
            ...originalNextConfig.images,
            ...(originalNextConfig.images?.loader ? {} : ownstakNextConfig.images),
        },
        experimental: {
            ...originalNextConfig.experimental,
            ...ownstakNextConfig.experimental,
        },
    }
    
    return nextConfig;
}