import { logger } from '../logger.js';
import { BRAND, NAME } from '../constants.js';
import { CliError } from '../cliError.js';
import { Config } from '../config.js';
import { CliConfig } from '../cliConfig.js';
import { build } from './build.js';

import type Provider from '../providers/provider.js';
import AwsProvider from '../providers/aws/index.js';
import ConsoleProvider from '../providers/console.js';

export interface DeployCommandOptions {
    apiUrl: string;
    apiKey?: string;
    organization?: string;
    project?: string;
    environment?: string;
    skipBuild?: boolean;
    skipFrameworkBuild?: boolean;
    providerType?: string;
}

export async function deploy(options: DeployCommandOptions) {
    logger.info(`Let's bring your project to life!`);

    const config = await Config.loadFromSource();

    let provider: Provider = new ConsoleProvider(options, config);
    if (options.providerType === 'aws') {
        provider = new AwsProvider(options, config);
    }

    await provider.init();

    logger.info('');
    logger.drawSubtitle('Step 1/4', 'Build');
    if (!options.skipBuild) {
        logger.info('Building the project...');
        await build({
            // Allow to skip only certain parts of the build process
            skipFrameworkBuild: options.skipFrameworkBuild,
            // Skip the summary of the build process when running as part of deploy command
            skipSummary: true,
        });
        logger.success('Build completed successfully');
    } else {
        logger.info('Using existing build...');
    }
    await config.reloadFromBuild();
    const currentCliVersion = CliConfig.getCurrentVersion();
    if (config.cliVersion !== currentCliVersion) {
        throw new CliError(
            `The project was built with different version of ${BRAND} CLI (${config.cliVersion}). ` +
                `Please run \`npx ${NAME} build\` and re-build your project with the current CLI version ${currentCliVersion} before deploying. `,
        );
    }
    await provider.deploy();
}
