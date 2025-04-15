import { logger } from '../../logger.js';
import { Config, FrameworkAdapter } from '../../config.js';
import { FRAMEWORKS, NAME } from '../../constants.js';
import { readFile } from 'fs/promises';
import { resolve } from 'path';
import { spawn } from 'child_process';

export const staticFrameworkAdapter: FrameworkAdapter = {
    name: FRAMEWORKS.Static,
    async build(config: Config): Promise<void> {
        logger.info('Building static project...');
        if (Object.keys(config.assets.include).length == 0) {
            logger.error('Looks like you are trying to build static project without any assets. Please specify the folder with static assets to include.');
            logger.error(`For example: npx ${NAME} build static --assets-dir ./assets`);
            process.exit(1);
        }

        logger.info('Static project built successfully!');
    },

    async dev() {
        const packageJson = await readFile(resolve('package.json'), 'utf8');
        const packageJsonObject = JSON.parse(packageJson);
        const scripts = packageJsonObject.scripts || {};
        if (!scripts.dev) {
            const devScriptExample = JSON.stringify(
                {
                    name: 'my-static-project',
                    version: '1.0.0',
                    scripts: {
                        dev: 'npx vite dev',
                    },
                },
                null,
                2,
            );
            logger.error('No dev script found in package.json. Please add a dev script if you want to run the project in development mode.');
            logger.error(`For example: ${devScriptExample}`);
            process.exit(1);
        }

        const [programName, ...programArgs] = scripts.dev.split(' ');
        logger.debug(`Running: ${programName} ${programArgs.join(' ')}`);
        const child = spawn(programName, programArgs, {
            stdio: 'inherit',
            cwd: process.cwd(),
        });
        child.on('close', (code) => {
            process.exit(code);
        });
    },

    async isPresent() {
        // Static framework is always present. It needs to be the last framework in the list.
        return true;
    },
};
