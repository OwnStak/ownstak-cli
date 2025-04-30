import { existsSync } from 'fs';
import { stat, unlink } from 'fs/promises';
import { logger, LogLevel } from '../logger.js';
import { ASSETS_DIR, BRAND, BUILD_DIR_PATH, COMPUTE_DIR, NAME_SHORT, PERSISTENT_ASSETS_DIR, BUILD_DIR } from '../constants.js';
import { CliError } from '../cliError.js';
import { formatBytes, zipFolder } from '../utils/fsUtils.js';
import chalk from 'chalk';
import { Config } from '../config.js';

export async function deploy() {
    if (!existsSync(BUILD_DIR_PATH)) {
        throw new CliError(`The ${BRAND} build does not exist. Please run \`npx ${NAME_SHORT} build\` first.`);
    }

    const config = await Config.loadFromBuild();
    logger.info(`Let's bring your project to life!`);

    logger.info('');
    logger.drawSubtitle(`Step 1/3`, 'Zipping');
    for (const dirName of [ASSETS_DIR, PERSISTENT_ASSETS_DIR, COMPUTE_DIR]) {
        const zipFilePath = `${dirName}.zip`;
        logger.startSpinner(`Zipping ${dirName}...`);

        await zipFolder(dirName, zipFilePath);
        const fileSize = (await stat(zipFilePath)).size;
        const fileSizeFormatted = formatBytes(fileSize);
        logger.stopSpinner(`Zipped ${dirName} (${fileSizeFormatted})`, LogLevel.SUCCESS);
    }

    logger.info('');
    logger.drawSubtitle(`Step 2/3`, 'Uploading');
    for (const zipFilePath of [ASSETS_DIR, PERSISTENT_ASSETS_DIR, COMPUTE_DIR].map(dirName => `${dirName}.zip`)) {
        logger.startSpinner(`Uploading ${zipFilePath}...`);

        // Fake upload simulation
        await new Promise(resolve => setTimeout(resolve, 3000));
        logger.stopSpinner(`Uploaded ${zipFilePath}`, LogLevel.SUCCESS);

        // Clean up the zip file
        //await unlink(zipFilePath);
    }

    logger.info('');
    logger.drawSubtitle(`Step 3/3`, 'Deployment');
    // Fake cloud backend propagation simulation
    const cloudBackendNames = ["aws-primary", "aws-secondary"];
    for (const cloudBackendName of cloudBackendNames) {
        const startTime = Date.now();
        logger.startSpinner(`Deploying to cloud backend '${cloudBackendName}'...`);
        await new Promise(resolve => setTimeout(resolve, 3000));

        const endTime = Date.now();
        const duration = endTime - startTime;
        const durationFormatted = `${(duration / 1000).toFixed(2)}s`;
        logger.stopSpinner(`Deployed to cloud backend '${cloudBackendName}' (${durationFormatted})`, LogLevel.SUCCESS);
    }

    // TODO: Get values from the Console API
    const organizationSlug = "org";
    const projectSlug = "project";
    const environmentSlug = "prod";
    const deploymentNumber = "1";
    const environmentLinks = cloudBackendNames.map(cloudBackendName => {
        return `https://${projectSlug}-${environmentSlug}.${cloudBackendName}.${organizationSlug}.ownstak.link`;
    });
    const deploymentLinks = cloudBackendNames.map(cloudBackendName => {
        return `https://${projectSlug}-${environmentSlug}-${deploymentNumber}.${cloudBackendName}.${organizationSlug}.ownstak.link`;
    });

    // Print deployment summary
    const tableMinWidth = 70;
    logger.info('');
    logger.drawTable(
        [
            `Deployment: ${chalk.cyan(deploymentNumber)}`,
            `Environment: ${chalk.cyan(environmentSlug)}`,
            `Cloud backends: ${cloudBackendNames.map(name => chalk.cyan(name)).join(', ')}`,
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
            chalk.cyan(`https://console.ownstak.com/${organizationSlug}/projects/${projectSlug}/deployments/${deploymentNumber}`)
        ],
        {
            title: "Links",
            borderColor: 'brand',
            minWidth: tableMinWidth,
        },
    );
}