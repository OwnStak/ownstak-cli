import { existsSync } from 'fs';
import { stat, unlink } from 'fs/promises';
import { logger, LogLevel } from '../logger.js';
import { ASSETS_DIR, BRAND, BUILD_DIR_PATH, COMPUTE_DIR, CONSOLE_URL, DEBUG_DIR, NAME_SHORT, PERMANENT_ASSETS_DIR } from '../constants.js';
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
    logger.info(`Let's bring your project to life!`);

    if (!existsSync(BUILD_DIR_PATH)) {
        throw new CliError(`The project build does not exist. Please run \`npx ${NAME_SHORT} build\` first.`);
    }

    const config = await Config.loadFromBuild();
    const currentCliVersion = CliConfig.getCurrentVersion();
    if (config.cliVersion !== currentCliVersion) {
        throw new CliError(
            `The project was built with different version of ${BRAND} CLI (${config.cliVersion}). Please run \`npx ${NAME_SHORT} build\` and re-build your project with the current CLI version ${currentCliVersion} before deploying. `,
        );
    }

    const cliConfig = CliConfig.load();
    const apiToken = options.apiToken || cliConfig.getToken(options.apiUrl);
    if (!apiToken) {
        throw new CliError(
            `Something is missing here... The CLI cannot deploy without an --api-token option. Please create a token at ${CONSOLE_URL}/settings and pass it to deploy command or login on this machine using \`npx ${NAME_SHORT} login. ` +
                `Example: npx ${NAME_SHORT} deploy --api-token <token>`,
        );
    }

    const api = new ConsoleClient({ url: options.apiUrl, token: apiToken });
    const organizations = await api.getOrganizations();
    if (organizations.length === 0) {
        throw new CliError(`You're not a member of any organization. Please create new organization at ${CONSOLE_URL}/organizations and come back.`);
    }

    const environmentSlug = (options.environment || config.environment || Config.getDefaultEnvironment())?.toLowerCase();
    const projectSlug = (options.project || config.project || Config.getDefaultProject())?.toLowerCase();
    const organizationSlug = (options.organization || config.organization || organizations[0]?.slug)?.toLowerCase();
    if (!organizationSlug) {
        throw new CliError(
            `Something is missing here... The CLI cannot deploy without an --organization option. Please pass it to deploy command or set the organization property in the ownstak.config.js file. ` +
                `Example: npx ${NAME_SHORT} deploy --organization <organization> --project <project> --environment <environment> --api-token <token>`,
        );
    }

    const organization = organizations.find((org) => org.slug === organizationSlug);
    if (!organization) {
        throw new CliError(
            `Oops! The organization ${organizationSlug} does not exist. Please create it at ${CONSOLE_URL}/organizations and come back or pass different organization name to deploy command. ` +
                `You are a member of the following organizations: ${organizations.map((org) => org.slug).join(', ')}`,
        );
    }

    let project;
    try {
        project = (await api.resolveProjectSlugs(organizationSlug, projectSlug)).project;
    } catch (error) {
        project = await api.createProject(organization.id, projectSlug);
    }

    let environment;
    try {
        environment = (await api.resolveEnvironmentSlugs(organizationSlug, projectSlug, environmentSlug)).environment;
    } catch (error) {
        environment = await api.createEnvironment(project.id, environmentSlug);
    }

    const draftDeployment = await api.createDeployment(environment.id, {
        cli_version: config.cliVersion,
        framework: config.framework,
        runtime: config.runtime,
        memory: config.memory,
        timeout: config.timeout,
        arch: config.arch,
    });

    // Display where the project will be deployed
    logger.info(`${chalk.blueBright('Organization:')} ${chalk.cyan(organization.slug)}`);
    logger.info(`${chalk.blueBright('Project:')} ${chalk.cyan(project.slug)}`);
    logger.info(`${chalk.blueBright('Environment:')} ${chalk.cyan(environment.slug)}`);
    const maskedApiToken = `${apiToken.slice(0, 3)}******${apiToken.slice(-4)}`;
    logger.info(`${chalk.blueBright('API token:')} ${chalk.cyan(maskedApiToken)}`);

    logger.info('');
    logger.drawSubtitle(`Step 1/3`, 'Zipping');
    for (const dirName of [ASSETS_DIR, PERMANENT_ASSETS_DIR, COMPUTE_DIR, DEBUG_DIR]) {
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
        [DEBUG_DIR, draftDeployment.storage_urls.debug],
    ].map(([dirName, presignedUrl]) => [`${dirName}.zip`, presignedUrl])) {
        const [zipFilePath, presignedUrl] = uploadObject;

        logger.startSpinner(`Uploading ${zipFilePath}...`);
        await uploadToPresignedUrl(presignedUrl, zipFilePath);
        logger.stopSpinner(`Uploaded ${zipFilePath}`, LogLevel.SUCCESS);

        // Clean up the zip file
        await unlink(zipFilePath);
    }

    logger.info('');
    logger.drawSubtitle(`Step 3/3`, 'Deployment');
    let deployment = await api.deployDeployment(draftDeployment.id);

    // TODO: may need refinement when we have better status.
    //       could also be useful to have a finished boolean flag.
    logger.startSpinner(`Deploying to cloud backends...`);
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

        logger.stopSpinner(message, LogLevel.ERROR);
        throw new CliError(`${message}. Please check the deployment logs on ${chalk.cyan(deployment.console_url)} for more information.`);
    }

    logger.stopSpinner(`Deployed to cloud backends`, LogLevel.SUCCESS);
    const cloudBackendNames = deployment.cloud_backend_deployments.map((backend) => backend.cloud_backend.name);
    const deploymentLinks = deployment.links.filter((link) => link.type === 'deployment').map((link) => link.url);
    const environmentLinks = deployment.links.filter((link) => link.type === 'environment').map((link) => link.url);

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
