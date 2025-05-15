import { existsSync } from 'fs';
import { stat, unlink } from 'fs/promises';
import { logger, LogLevel } from '../logger.js';
import { ASSETS_DIR, BRAND, BUILD_DIR_PATH, COMPUTE_DIR, CONSOLE_URL, NAME_SHORT, PERMANENT_ASSETS_DIR, BUILD_DIR, VERSION } from '../constants.js';
import { CliError } from '../cliError.js';
import { formatBytes, zipFolder } from '../utils/fsUtils.js';
import chalk from 'chalk';
import { Config } from '../config.js';
import { CliConfig } from '../cliConfig.js';
import ConsoleClient from '../api/ConsoleClient.js';
import { uploadToPresignedUrl } from '../utils/s3Upload.js';

export interface DeployCommandOptions {
    apiUrl: string;
    apiToken?: string;
    organization: string;
    project: string;
    environment: string;
}

export async function deploy(options: DeployCommandOptions) {
    if (!existsSync(BUILD_DIR_PATH)) {
        throw new CliError(`The ${BRAND} build does not exist. Please run \`npx ${NAME_SHORT} build\` first.`);
    }

    const config = await Config.loadFromBuild();

    const cliConfig = CliConfig.load();

    const apiToken = options.apiToken || cliConfig.tokenForUrl(options.apiUrl);
    if (!apiToken) {
        throw new CliError(`Cannot deploy without an --api-token option. Please create a token at ${CONSOLE_URL}/settings`);
    }

    const api = new ConsoleClient({ url: options.apiUrl, token: apiToken });

    const { environment } = await api.resolveEnvironmentSlugs(options.organization, options.project, options.environment);

    const draftDeployment = await api.createDeployment(environment.id, {
        cli_version: VERSION,
        framework: config.framework,
        runtime: config.runtime,
        memory: config.memory,
        timeout: config.timeout,
        arch: config.arch,
    });
    logger.info(`Let's bring your project to life!`);

    logger.info('');
    logger.drawSubtitle(`Step 1/3`, 'Zipping');
    for (const dirName of [ASSETS_DIR, PERMANENT_ASSETS_DIR, COMPUTE_DIR]) {
        const zipFilePath = `${dirName}.zip`;
        logger.startSpinner(`Zipping ${dirName}...`);

        await zipFolder(dirName, zipFilePath);
        const fileSize = (await stat(zipFilePath)).size;
        const fileSizeFormatted = formatBytes(fileSize);
        logger.stopSpinner(`Zipped ${dirName} (${fileSizeFormatted})`, LogLevel.SUCCESS);
    }

    logger.info('');
    logger.drawSubtitle(`Step 2/3`, 'Uploading');
    for (const uploadObject of [
        [ASSETS_DIR, draftDeployment.storage_urls.assets],
        [PERMANENT_ASSETS_DIR, draftDeployment.storage_urls.permanent_assets],
        [COMPUTE_DIR, draftDeployment.storage_urls.compute],
    ].map(([dirName, presignedUrl]) => [`${dirName}.zip`, presignedUrl])) {
        const [zipFilePath, presignedUrl] = uploadObject;

        logger.startSpinner(`Uploading ${zipFilePath}...`);
        await uploadToPresignedUrl(presignedUrl, zipFilePath);
        logger.stopSpinner(`Uploaded ${zipFilePath}`, LogLevel.SUCCESS);

        // Clean up the zip file
        //await unlink(zipFilePath);
    }

    logger.info('');
    logger.drawSubtitle(`Step 3/3`, 'Deployment');
    let deployment = await api.deployDeployment(draftDeployment.id);

    // TODO: may need refinement when we have better status.
    //       could also be useful to have a finished boolean flag.
    while (deployment.status === 'pending' || deployment.status === 'in_progress') {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        deployment = await api.getDeployment(deployment.id);
    }

    if (['partially_completed', 'failed', 'canceled'].includes(deployment.status)) {
        let message = 'Deployment failed';
        if (deployment.status === 'partially_completed') {
            message = 'Deployment failed on some backends';
        }
        if (deployment.status === 'canceled') {
            message = 'Deployment canceled';
        }

        throw new CliError(`${message}. Please check the deployment logs on ${chalk.cyan(deployment.console_url)} for more information.`);
    }

    const deploymentLinks = deployment.links.filter((link) => link.type === 'deployment').map((link) => link.url);
    const environmentLinks = deployment.links.filter((link) => link.type === 'environment').map((link) => link.url);
    const cloudBackendNames = deployment.cloud_backend_deployments.map((backend) => backend.cloud_backend.name);

    // Print deployment summary
    const tableMinWidth = 70;
    logger.info('');
    logger.drawTable(
        [
            `Deployment: ${chalk.cyan(deployment.build_number)}`,
            `Environment: ${chalk.cyan(environment.slug)}`,
            `Cloud backends: ${cloudBackendNames.map((name) => chalk.cyan(name)).join(', ')}`,
            `Framework: ${chalk.cyan(config.framework)}`,
            `Runtime: ${chalk.cyan(config.runtime)}`,
            `Memory: ${chalk.cyan(`${config.memory}MiB`)}`,
            `Arch: ${chalk.cyan(config.arch)}`,
            `Timeout: ${chalk.cyan(`${config.timeout}s`)}`,
        ],
        {
            title: 'Deployment Successful',
            logLevel: LogLevel.SUCCESS,
            minWidth: tableMinWidth,
        },
    );

    // Display what to do next ibfo
    logger.info('');
    logger.drawTable(
        [
            `Deployment links:\r\n${chalk.cyan(deploymentLinks.join('\r\n'))}\r\n`,
            `Environment links:\r\n${chalk.cyan(environmentLinks.join('\r\n'))}\r\n`,
            chalk.gray(`See your deployment at:`),
            chalk.cyan(deployment.console_url),
        ],
        {
            title: 'Links',
            borderColor: 'brand',
            minWidth: tableMinWidth,
        },
    );
}
