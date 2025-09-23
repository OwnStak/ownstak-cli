import { stat, unlink } from 'fs/promises';
import { logger, LogLevel } from '../logger.js';
import { ASSETS_DIR, BRAND, COMPUTE_DIR, CONSOLE_API_URL, CONSOLE_URL, DEBUG_DIR, NAME, PERMANENT_ASSETS_DIR } from '../constants.js';
import { CliError } from '../cliError.js';
import { formatBytes, zipFolder } from '../utils/fsUtils.js';
import chalk from 'chalk';
import { Config } from '../config.js';
import { CliConfig } from '../cliConfig.js';
import ConsoleClient from '../api/ConsoleClient.js';
import { uploadToPresignedUrl } from '../utils/s3Upload.js';
import { build } from './build.js';
import { configInit } from './config/init.js';
import { ensureAuthenticated } from '../utils/ensureApiKey.js';

export interface DeployCommandOptions {
    apiUrl: string;
    apiKey?: string;
    organization?: string;
    project?: string;
    environment?: string;
    skipBuild?: boolean;
    skipFrameworkBuild?: boolean;
}

export async function deploy(options: DeployCommandOptions) {
    logger.info(`Let's bring your project to life!`);

    const _cliConfig = CliConfig.load();
    const config = await Config.loadFromSource();

    const apiConfig = await ensureAuthenticated(options);

    // Use org, project and environment from options and config if provided.
    const initialOrganizationSlug = (options.organization || config.organization)?.toLowerCase();
    const initialProjectSlug = (options.project || config.project)?.toLowerCase();
    const initialEnvironmentSlug = (options.environment || config.environment || Config.getDefaultEnvironment())?.toLowerCase();
    // If the organization or project is not set, run interactive project config wizard
    // that walks the user through the process of setting up the project config.
    if (!initialOrganizationSlug || !initialProjectSlug) {
        logger.info('Almost there! We just need to setup your project config.');
        await configInit({ ...apiConfig, requireOrgAndProject: true });
        await config.reloadFromSource();
        logger.info('');
    }

    // Load the organization, project and environment again after the config init
    const organizationSlug = (initialOrganizationSlug || config.organization)?.toLowerCase();
    const projectSlug = (initialProjectSlug || config.project)?.toLowerCase();
    const environmentSlug = initialEnvironmentSlug;
    // If the organization or project is still not set, throw an error.
    // We shouldn't get here, but there might be error in the config file.
    if (!organizationSlug || !projectSlug) {
        throw new CliError(
            `Organization and project options are required. ` +
                `Please pass them to deploy command or make sure they are set in the config file. ` +
                `For example: npx ${NAME} deploy --organization <organization> --project <project>`,
        );
    }

    const api = new ConsoleClient(apiConfig);
    const organizations = await api.getOrganizations();
    if (organizations.length === 0) {
        throw new CliError(`You're not a member of any organization. Please create new organization at ${CONSOLE_URL}/organizations and come back.`);
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
    } catch (_error) {
        project = await api.createProject(organization.id, projectSlug);
    }

    let environment;
    try {
        environment = (await api.resolveEnvironmentSlugs(organizationSlug, projectSlug, environmentSlug)).environment;
    } catch (_error) {
        environment = await api.createEnvironment(project.id, environmentSlug);
    }

    // Display where the project will be deployed
    logger.info(`${chalk.blueBright('Organization:')} ${chalk.cyan(organization.slug)}`);
    logger.info(`${chalk.blueBright('Project:')} ${chalk.cyan(project.slug)}`);
    logger.info(`${chalk.blueBright('Environment:')} ${chalk.cyan(environment.slug)}`);
    const maskedApiKey = `${apiConfig.apiKey.slice(0, 3)}******${apiConfig.apiKey.slice(-4)}`;
    logger.info(`${chalk.blueBright('API key:')} ${chalk.cyan(maskedApiKey)}`);
    if (options.apiUrl !== CONSOLE_API_URL) {
        // Display the API URL if it's not the default
        logger.info(`${chalk.blueBright('API URL:')} ${chalk.cyan(options.apiUrl)}`);
    }

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

    let deploymentStatus = 'draft';
    const draftDeployment = await api.createDeployment(environment.id, {
        cli_version: config.cliVersion,
        framework: config.framework,
        runtime: config.runtime,
        memory: config.memory,
        timeout: config.timeout,
        arch: config.arch,
    });

    const cleanupDraftDeployment = () => {
        deploymentStatus = 'deleting';
        logger.stopSpinner();
        logger.info('');
        logger.startSpinner('Deploment was interrupted. Cleaning up...');
        // Fire and forget cancellation, we don't want to block the process from exiting
        // for too long just to show errors
        setTimeout(() => process.exit(0), 3 * 1000);
        api.deleteDeployment(draftDeployment.id).then(() => {
            logger.stopSpinner('Deployment was successfully cancelled. See you later!', LogLevel.SUCCESS);
            process.exit(0);
        });
    };

    // Handle CONTROL+C and delete the deployment if it's still a draft
    process.on('SIGINT', cleanupDraftDeployment);

    logger.info('');
    logger.drawSubtitle(`Step 2/4`, 'Zipping');
    for (const dirName of [ASSETS_DIR, PERMANENT_ASSETS_DIR, COMPUTE_DIR, DEBUG_DIR]) {
        const zipFilePath = `${dirName}.zip`;
        logger.startSpinner(`Zipping ${dirName}...`);

        await zipFolder(dirName, zipFilePath, {
            onProgress: (percentage) => logger.updateSpinner(`Zipping ${dirName}... (${percentage}%)`),
        });
        const fileSize = (await stat(zipFilePath)).size;
        const fileSizeFormatted = formatBytes(fileSize);
        logger.stopSpinner(`Zipped ${dirName} (${fileSizeFormatted})`, LogLevel.SUCCESS);
    }

    logger.info('');
    logger.drawSubtitle(`Step 3/4`, 'Uploading');
    for (const uploadObject of [
        [ASSETS_DIR, draftDeployment.storage_urls.assets],
        [PERMANENT_ASSETS_DIR, draftDeployment.storage_urls.permanent_assets],
        [COMPUTE_DIR, draftDeployment.storage_urls.compute],
        [DEBUG_DIR, draftDeployment.storage_urls.debug],
    ].map(([dirName, presignedUrl]) => [`${dirName}.zip`, presignedUrl])) {
        const [zipFilePath, presignedUrl] = uploadObject;

        logger.startSpinner(`Uploading ${zipFilePath}...`);
        await uploadToPresignedUrl(presignedUrl, zipFilePath, {
            onProgress: (percentage) => logger.updateSpinner(`Uploading ${zipFilePath}... (${percentage}%)`),
        });
        logger.stopSpinner(`Uploaded ${zipFilePath} (100%)`, LogLevel.SUCCESS);

        // Clean up the zip file
        await unlink(zipFilePath);
    }

    // Too late to cancel the deployment,
    // just handle the SIGINT event, show a warning and immediately exit
    process.removeListener('SIGINT', cleanupDraftDeployment);
    process.on('SIGINT', () => {
        logger.stopSpinner();
        logger.info('');
        logger.warn("Oops! It's too late to cancel the deployment at this point. The deployment to cloud backends will continue on background.");
        logger.warn(`You can watch the progress at: ${chalk.cyan(draftDeployment.console_url)}`);
        logger.warn('See you there!');
        process.exit(0);
    });

    // If the deployment is not a draft, it means it's already deployed or cancelled.
    // Don't continue with the deployment.
    if (deploymentStatus !== 'draft') return;

    logger.info('');
    logger.drawSubtitle(`Step 4/4`, 'Deployment');
    let deployment = await api.deployDeployment(draftDeployment.id);
    logger.startSpinner(`Deploying to cloud backends...`);
    while (deployment.status === 'pending' || deployment.status === 'in_progress') {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        deployment = await api.getDeployment(deployment.id);
    }
    if (['failed', 'canceled'].includes(deployment.status)) {
        let message = 'Deployment failed';
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
