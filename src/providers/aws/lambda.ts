import {
    type Runtime as AwsRuntime,
    type Architecture as AwsArchitecture,
    LambdaClient,
    CreateFunctionCommand,
    UpdateFunctionCodeCommand,
    GetFunctionCommand,
    UpdateFunctionConfigurationCommand,
    waitUntilFunctionUpdated,
    UpdateAliasCommand,
    CreateAliasCommand,
} from '@aws-sdk/client-lambda';
import type { Runtime, Architecture } from '../../config.js';
import type { Logger } from '../../logger.js';

/**
 * Create or update Lambda function
 */
export async function createOrUpdateLambdaFunction(
    logger: Logger,
    awsRegion: string,
    functionName: string,
    s3Bucket: string,
    s3Key: string,
    config: {
        runtime: Runtime;
        handler: string;
        memory: number;
        timeout: number;
        arch: Architecture;
        role: string;
        environmentVariables: Record<string, string>;
        tags: Record<string, string>;
    },
): Promise<void> {
    const lambdaClient = new LambdaClient({ region: awsRegion });
    const baseParams = {
        FunctionName: functionName,
        Runtime: config.runtime as AwsRuntime,
        Handler: config.handler,
        MemorySize: config.memory,
        Timeout: config.timeout,
        Role: config.role,
        Environment: {
            Variables: config.environmentVariables,
        },
        Tags: config.tags,
    };
    try {
        // Try to get the function first
        await lambdaClient.send(new GetFunctionCommand({ FunctionName: functionName }));
        logger.debug(`Function ${functionName} exists, updating code.`);
        // Function exists, update it
        const updateCommand = new UpdateFunctionCodeCommand({
            FunctionName: functionName,
            S3Bucket: s3Bucket,
            S3Key: s3Key,
        });
        await lambdaClient.send(updateCommand);
        await waitUntilFunctionUpdated({ client: lambdaClient, maxWaitTime: 5 * 60 }, { FunctionName: functionName });

        logger.debug(`Function ${functionName} exists, updating configuration.`);
        const updateEnvironmentCommand = new UpdateFunctionConfigurationCommand(baseParams);

        await lambdaClient.send(updateEnvironmentCommand);
        await waitUntilFunctionUpdated({ client: lambdaClient, maxWaitTime: 5 * 60 }, { FunctionName: functionName });
    } catch (error: any) {
        if (error.name === 'ResourceNotFoundException') {
            logger.debug(`Function ${functionName} doesn't exist, creating it.`);
            // Function doesn't exist, create it
            const createCommand = new CreateFunctionCommand({
                ...baseParams,
                Code: {
                    S3Bucket: s3Bucket,
                    S3Key: s3Key,
                },
                Architectures: [config.arch as AwsArchitecture],
            });
            await lambdaClient.send(createCommand);
            await waitUntilFunctionUpdated({ client: lambdaClient, maxWaitTime: 5 * 60 }, { FunctionName: functionName });
        } else {
            throw error;
        }
    }
    logger.debug("Upserting 'current' alias for the function.");
    // "current" is the alias used by ownstak proxy to invoke the current version of a site.
    // See: https://github.com/OwnStak/ownstak-proxy/blob/main/src/middlewares/awsLambda.go
    //
    // Note that for direct AWS deployment we only publish a single version of the lambda function.
    try {
        await lambdaClient.send(
            new CreateAliasCommand({
                FunctionName: functionName,
                Name: 'current',
                FunctionVersion: '$LATEST',
            }),
        );
    } catch (error: any) {
        if (error.name === 'ResourceConflictException') {
            await lambdaClient.send(
                new UpdateAliasCommand({
                    FunctionName: functionName,
                    Name: 'current',
                    FunctionVersion: '$LATEST',
                }),
            );
        }
    }

    logger.debug(`Function ${functionName} deployed successfully.`);
}
