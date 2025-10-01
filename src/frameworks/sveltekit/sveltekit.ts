import { logger } from '../../logger.js';
import type { FrameworkAdapter } from '../../config.js';
import { BRAND, FRAMEWORKS } from '../../constants.js';
import { runCommand } from '../../utils/processUtils.js';
import { CliError } from '../../cliError.js';
import { existsSync } from 'fs';
import { isModulePresent, installDependency, getModuleVersion } from '../../utils/moduleUtils.js';
import { join } from 'path';
import semver from 'semver';

/**
 * The framework adapter for the SvelteKit
 */
export const sveltekitFrameworkAdapter: FrameworkAdapter = {
    name: FRAMEWORKS.SvelteKit,
    hooks: {
        'build:start': async ({ config }) => {
            // Get the actual used @sveltejs/kit version from node_modules/@sveltejs/kit/package.json
            const sveltekitVersion = await getModuleVersion('@sveltejs/kit');
            if (!sveltekitVersion) {
                throw new CliError(`Failed to detect installed @sveltejs/kit version. Please install @sveltejs/kit first.`);
            }

            // Extract only the version number from 'alpha-2.0.0', etc... otherwise semver will fail
            const cleanedSveltekitVersion = sveltekitVersion.match(/(\d+\.\d+\.\d+)/)?.[1];
            if (!cleanedSveltekitVersion) {
                throw new CliError(`Failed to extract @sveltejs/kit version from '${sveltekitVersion}'. Please try to install @sveltejs/kit first.`);
            }

            const minSupportedVersion = '2.0.0';
            if (semver.lt(cleanedSveltekitVersion, minSupportedVersion)) {
                throw new CliError(
                    `@sveltejs/kit version ${sveltekitVersion} is not supported by ${BRAND}. Please upgrade to ${minSupportedVersion} or newer.`,
                );
            }

            // Check if @sveltejs/adapter-node is installed
            if (!(await isModulePresent('@sveltejs/adapter-node'))) {
                try {
                    logger.info('The @sveltejs/adapter-node was not found. Installing...');
                    await installDependency('@sveltejs/adapter-node');
                } catch (e) {
                    throw new CliError(`Failed to install @sveltejs/adapter-node: ${e}`);
                }
            }

            if (config.skipFrameworkBuild) {
                logger.info(`Skipping SvelteKit build and using existing build output...`);
            } else {
                try {
                    logger.info('Building SvelteKit...');
                    // Add GCP_BUILDPACKS environment variable to force Sveltekit to use the nodejs adapter
                    // if project uses adapter-auto (same as for GCP Buildpacks)
                    process.env.GCP_BUILDPACKS = 'true';
                    await runCommand(config.buildCommand || `npx vite build`);
                } catch (e) {
                    throw new CliError(`Failed to build SvelteKit project: ${e}`);
                }
            }

            const outDir = 'build';
            if (!existsSync(outDir)) {
                throw new CliError(
                    `The ${BRAND} failed to find '${outDir}' directory with the SvelteKit build output. ` +
                        `Please try the following steps to fix the issue:\r\n` +
                        `- Make sure that '${outDir}' directory exists and the build was successful.\r\n`,
                );
            }

            const clientOutDir = join(outDir, 'client');
            const prerenderedOutDir = join(outDir, 'prerendered');
            const serverOutDir = join(outDir, 'server');
            const serverEntrypoint = join(outDir, 'index.js');

            if (!existsSync(serverEntrypoint)) {
                throw new CliError(
                    `The server entrypoint '${serverEntrypoint}' file was not found. ` +
                        `Please try the following steps to fix the issue:\r\n` +
                        `- Make sure the build was successful.\r\n` +
                        '- Install @sveltejs/adapter-node into project and put it into your sveltekit.config.js file.\r\n' +
                        "- Change back the @sveltejs/adapter-node's 'out' option in your sveltekit.config.js file to default 'build' name.\r\n" +
                        'Example sveltekit.config.js: \r\n' +
                        `\r\n` +
                        `import adapter from '@sveltejs/adapter-node';\r\n` +
                        `\r\n` +
                        `export default {\r\n` +
                        `  kit: { adapter: adapter({ out: 'build' }) },\r\n` +
                        `};\r\n`,
                );
            }

            // Configure app
            config.app.include[serverOutDir] = true;
            config.app.include[serverEntrypoint] = true;
            config.app.include[clientOutDir] = false;
            config.app.include[prerenderedOutDir] = false;
            config.app.entrypoint = serverEntrypoint;
            config.app.copyDependencies = true;

            // Configure pre-rendered pages
            config.assets.convertHtmlToFolders = true;
            config.assets.include[prerenderedOutDir] = `./`;
            config.assets.include[join(prerenderedOutDir, '**', '*.{br,gz}')] = false;

            // Configure static assets
            config.assets.convertHtmlToFolders = true;
            config.assets.include[clientOutDir] = `./`;
            config.assets.include[join(clientOutDir, '_app', 'immutable')] = false;
            config.assets.include[join(clientOutDir, '**', '*.{br,gz}')] = false;

            // Configure permanent assets
            config.permanentAssets.include[join(clientOutDir, '_app', 'immutable')] = `./_app/immutable`;
            config.permanentAssets.include[join(clientOutDir, '_app', 'immutable', '**', '*.{br,gz}')] = false;
        },
        'build:routes:finish': async ({ config }) => {
            // Proxy all other requests to the SvelteKit server
            config.router.any([
                {
                    type: 'serveApp',
                    description: 'Serve SvelteKit server by default',
                },
            ]);
        },
        'dev:start': async ({ config }) => {
            try {
                logger.info('Starting SvelteKit development server...');
                await runCommand(config.devCommand || `npx vite dev --port ${process.env.PORT || '3000'}`);
            } catch (e) {
                throw new CliError(`Failed to start SvelteKit development server: ${e}`);
            }
        },
    },
    async isPresent() {
        return isModulePresent('@sveltejs/kit');
    },
};
