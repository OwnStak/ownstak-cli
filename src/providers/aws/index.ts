import { CliError } from '../../cliError.js';
import Provider from '../provider.js';
import { logger, LogLevel } from '../../logger.js';
import { zipFolder } from '../../utils/fsUtils.js';
import { uploadToS3, uploadDirectoryToS3, deleteS3ObjectsByCondition } from './s3.js';
import { createOrUpdateLambdaFunction } from './lambda.js';
import { COMPUTE_DIR, ASSETS_DIR, PERMANENT_ASSETS_DIR } from '../../constants.js';
import { unlink } from 'fs/promises';
import { randomUUID } from 'crypto';

export default class AwsProvider extends Provider {
    initResult?: {
        wildcardDomain: string;
        resourcePrefix: string;
        awsRegion: string;
        environmentName: string;
        awsLambdaRoleArn: string;
    };

    async init() {
        const requiredEnvVars = ['OWNSTAK_WILDCARD_DOMAIN', 'OWNSTAK_RESOURCE_PREFIX', 'OWNSTAK_AWS_REGION', 'OWNSTAK_LAMBDA_ROLE'];

        requiredEnvVars.forEach((envVar) => {
            if (!process.env[envVar]?.length) {
                throw new CliError(`${envVar} must be set to use --provider aws`);
            }
        });

        if (!this.options.environment?.length) {
            throw new CliError(`--environment must be set to use --provider aws`);
        }

        if (!this.options.environment.match(/^[a-z0-9-]+$/)) {
            throw new CliError(`--environment can only contain lowercase letters, numbers and hyphens`);
        }

        if (this.options.environment.match(/(^-)|(-$)/)) {
            throw new CliError(`--environment cannot start or end with a hyphen`);
        }

        this.initResult = {
            wildcardDomain: process.env.OWNSTAK_WILDCARD_DOMAIN as string,
            resourcePrefix: process.env.OWNSTAK_RESOURCE_PREFIX as string,
            awsRegion: process.env.OWNSTAK_AWS_REGION as string,
            awsLambdaRoleArn: process.env.OWNSTAK_LAMBDA_ROLE as string,
            environmentName: this.options.environment,
        };
    }

    async deploy() {
        if (!this.initResult) {
            throw new CliError('Provider not initialized');
        }
        const { resourcePrefix, awsRegion, environmentName, awsLambdaRoleArn, wildcardDomain } = this.initResult;
        const { config } = this;

        // Generate unique deployment ID
        const deploymentId = randomUUID();
        logger.info(`Deployment ID: ${deploymentId}`);

        // Define S3 bucket names
        const computeBucket = `${resourcePrefix}-compute`;
        const assetsBucket = `${resourcePrefix}-assets`;
        const permanentAssetsBucket = `${resourcePrefix}-permanent-assets`;

        logger.info('');
        logger.drawSubtitle('Step 1/5', 'Zipping Compute');
        const computeZipPath = `${COMPUTE_DIR}.zip`;
        logger.startSpinner('Zipping compute directory...');

        await zipFolder(COMPUTE_DIR, computeZipPath, {
            onProgress: (percentage) => logger.updateSpinner(`Zipping compute directory... (${percentage}%)`),
        });

        logger.stopSpinner('Compute directory zipped', LogLevel.SUCCESS);

        logger.startSpinner('Uploading compute to S3...');
        const computeZipFileS3Key = `${environmentName}/${deploymentId}.zip`;
        await uploadToS3({
            region: awsRegion,
            bucket: computeBucket,
            key: computeZipFileS3Key,
            filePath: computeZipPath,
            onProgress: (percentage) => logger.updateSpinner(`Uploading compute to S3... (${percentage}%)`),
        });
        logger.stopSpinner('Compute uploaded to S3', LogLevel.SUCCESS);

        logger.info('');
        logger.drawSubtitle('Step 2/5', 'Uploading Permanent Assets');
        logger.startSpinner('Uploading permanent assets...');
        await uploadDirectoryToS3({
            region: awsRegion,
            bucket: permanentAssetsBucket,
            prefix: environmentName,
            localDir: PERMANENT_ASSETS_DIR,
            onProgress: (percentage) => logger.updateSpinner(`Uploading permanent assets... (${percentage}%)`),
        });

        logger.stopSpinner('Permanent assets uploaded', LogLevel.SUCCESS);

        logger.info('');
        logger.drawSubtitle('Step 3/5', 'Uploading Assets');
        logger.startSpinner('Uploading assets...');
        const assetsPrefix = `${environmentName}/${deploymentId}`;
        await uploadDirectoryToS3({
            region: awsRegion,
            bucket: assetsBucket,
            prefix: assetsPrefix,
            localDir: ASSETS_DIR,
            onProgress: (percentage) => logger.updateSpinner(`Uploading assets... (${percentage}%)`),
        });
        logger.stopSpinner('Assets uploaded', LogLevel.SUCCESS);

        logger.info('');
        logger.drawSubtitle('Step 4/5', 'Deploying Lambda Function');
        const functionName = `${resourcePrefix}-${environmentName}`;
        logger.startSpinner(`Deploying Lambda function: ${functionName}...`);

        await createOrUpdateLambdaFunction(logger, awsRegion, functionName, computeBucket, computeZipFileS3Key, {
            runtime: config.runtime,
            handler: 'serverless.handler',
            memory: config.memory,
            timeout: config.timeout,
            arch: config.arch,
            role: awsLambdaRoleArn,
            environmentVariables: {
                OWNSTAK_ASSETS_HOST: `${assetsBucket}.s3.amazonaws.com`,
                OWNSTAK_ASSETS_FOLDER: `${assetsPrefix}/`,
                OWNSTAK_PERMANENT_ASSETS_HOST: `${permanentAssetsBucket}.s3.amazonaws.com`,
                OWNSTAK_PERMANENT_ASSETS_FOLDER: `${environmentName}/`,
            },
            tags: {
                Project: 'Ownstak',
                OwnstakPrefix: resourcePrefix,
            },
        });
        logger.stopSpinner('Lambda function deployed', LogLevel.SUCCESS);

        logger.info('');
        logger.drawSubtitle('Step 5/5', 'Cleanup');
        logger.startSpinner('Cleaning up old deployments...');

        // Clean up old compute deployments
        await deleteS3ObjectsByCondition({
            region: awsRegion,
            bucket: computeBucket,
            logger,
            condition: (key) => key !== computeZipFileS3Key && key.endsWith('.zip'),
            prefix: environmentName,
        });
        await deleteS3ObjectsByCondition({
            region: awsRegion,
            bucket: assetsBucket,
            logger,
            condition: (key) => !key.startsWith(`${assetsPrefix}/`),
            prefix: environmentName,
        });

        logger.stopSpinner('Cleanup completed', LogLevel.SUCCESS);

        // Clean up local zip file
        await unlink(computeZipPath);

        // Display deployment summary
        logger.info('');
        logger.drawTable(
            [
                `Deployment ID: ${deploymentId}`,
                `Environment: ${environmentName}`,
                `Lambda Function: ${functionName}`,
                `Runtime: ${config.runtime}`,
                `Memory: ${config.memory}MiB`,
                `Architecture: ${config.arch}`,
                `Timeout: ${config.timeout}s`,
            ],
            {
                title: 'AWS Deployment Successful',
                logLevel: LogLevel.SUCCESS,
                minWidth: 70,
            },
        );
        const environmentLink = `https://${environmentName}.${wildcardDomain.replace(/^\*?\./, '')}`;
        logger.info('');
        logger.drawTable([environmentLink], {
            title: 'Link',
            borderColor: 'brand',
            minWidth: 70,
        });
    }
}
