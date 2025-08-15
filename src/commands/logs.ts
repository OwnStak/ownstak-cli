import { appendFile, writeFile } from 'fs/promises';
import chalk from 'chalk';
import { logger } from '../logger.js';
import { CliError } from '../cliError.js';
import { Config } from '../config.js';
import ConsoleClient from '../api/ConsoleClient.js';
import { NAME } from '../constants.js';
import { ApiRuntimeLogEntry } from '../api/types/entities.js';
import { ensureAuthenticated } from '../utils/ensureApiKey.js';
import { BaseConsoleError, ConsoleValidationError } from '../api/ConsoleError.js';

export interface BaseLogsCommandOptions {
    apiUrl: string;
    apiKey?: string;
    organization?: string;
    cloudBackend?: string;
    startTime?: string;
    endTime?: string;
    output?: string;
    tail?: boolean;
    json?: boolean;
}

export interface ProxyLogsCommandOptions extends BaseLogsCommandOptions {}

export interface ComputeLogsCommandOptions extends BaseLogsCommandOptions {
    project?: string;
    environment?: string;
}

type LogType = 'proxy' | 'compute';

export async function proxyLogs(options: ProxyLogsCommandOptions) {
    await logs('proxy', options);
}

export async function computeLogs(options: ComputeLogsCommandOptions) {
    await logs('compute', options);
}

async function logs(logType: LogType, options: BaseLogsCommandOptions) {
    const config = await Config.loadFromSource();
    const apiConfig = await ensureAuthenticated(options);

    // Use org and cloud backend from options and config if provided.
    const organizationSlug = (options.organization || config.organization)?.toLowerCase();
    const cloudBackendSlug = options.cloudBackend?.toLowerCase();

    if (!organizationSlug || !cloudBackendSlug) {
        throw new CliError(
            `Organization and cloud-backend options are required. ` +
                `Please pass them to logs command or make sure they are set in the config file. ` +
                `For example: npx ${NAME} logs ${logType} --organization <org> --cloud-backend <backend>`,
        );
    }

    let environmentSlug: string | undefined;
    let projectSlug: string | undefined;

    // For compute logs, we need project and environment
    if (logType === 'compute') {
        const computeOptions = options as ComputeLogsCommandOptions;
        projectSlug = (computeOptions.project || config.project)?.toLowerCase();
        environmentSlug = (computeOptions.environment || config.environment || Config.getDefaultEnvironment())?.toLowerCase();

        if (!projectSlug || !environmentSlug) {
            throw new CliError(
                `Project and environment options are required for compute logs. ` +
                    `Please pass them to logs command or make sure they are set in the config file. ` +
                    `For example: npx ${NAME} logs compute --organization <org> --project <project> --environment <env> --cloud-backend <backend>`,
            );
        }
    }

    const api = new ConsoleClient(apiConfig);

    // Resolve slugs to get IDs
    let resolvedData: any;
    let environmentId: string | undefined;
    let cloudBackendId: string;

    if (logType === 'compute') {
        resolvedData = await api.resolveEnvironmentCloudBackendSlugs(organizationSlug, projectSlug!, environmentSlug!, cloudBackendSlug);
        environmentId = resolvedData.environment.id;
        cloudBackendId = resolvedData.cloud_backend.id;
    } else {
        resolvedData = await api.resolveOrganizationCloudBackendSlugs(organizationSlug, cloudBackendSlug);
        cloudBackendId = resolvedData.cloud_backend.id;
    }

    if (!options.json) {
        logger.info(`${chalk.blueBright('Log Type:')} ${chalk.cyan(logType)}`);
        logger.info(`${chalk.blueBright('Organization:')} ${chalk.cyan(resolvedData.organization.slug)}`);
        if (logType === 'compute') {
            logger.info(`${chalk.blueBright('Project:')} ${chalk.cyan(resolvedData.project.slug)}`);
            logger.info(`${chalk.blueBright('Environment:')} ${chalk.cyan(resolvedData.environment.slug)}`);
        }
        logger.info(`${chalk.blueBright('Cloud Backend:')} ${chalk.cyan(cloudBackendSlug)}\n`);
    }

    const isTailMode = options.tail || (!options.startTime && !options.endTime);

    if (options.output && isTailMode) {
        throw new CliError('Cannot use --output with tail mode. Please specify --start-time and/or --end-time for file output.');
    }

    if (options.output) {
        logger.debug(`Creating output file: ${options.output!}`);
        await writeFile(options.output!, '', 'utf8');

        // Save to file
        await fetchLogs(api, logType, cloudBackendId, environmentId, options, async (logs) => {
            const formattedLogs = options.json ? logs.map((log) => JSON.stringify(log)).join('\n') : logs.map(displayLogEntry).join('\n');

            if (formattedLogs.length) {
                const firstLogTimestamp = logs[0].timestamp;
                const lastLogTimestamp = logs[logs.length - 1].timestamp;

                logger.debug(`Appending ${logs.length} logs to file: ${options.output!}  (${firstLogTimestamp} and ${lastLogTimestamp})`);
                await appendFile(options.output!, formattedLogs + '\n', 'utf8');
            }
        });

        logger.success(`Logs saved to ${chalk.cyan(options.output!)}`);
    } else if (isTailMode) {
        // Tail mode - continuous fetching
        await tailLogs(api, logType, cloudBackendId, environmentId, options);
    } else {
        await fetchLogs(api, logType, cloudBackendId, environmentId, options, async (logs) => {
            const formattedLogs = options.json ? logs.map((log) => JSON.stringify(log)).join('\n') : logs.map(displayLogEntry).join('\n');
            console.log(formattedLogs + '\n');
        });
    }
}

async function fetchLogs(
    api: ConsoleClient,
    logType: LogType,
    cloudBackendId: string,
    environmentId: string | undefined,
    options: BaseLogsCommandOptions,
    onLogsLoaded: (logs: Array<ApiRuntimeLogEntry>) => Promise<void>,
) {
    let nextToken: string | undefined;

    do {
        const response =
            logType === 'proxy'
                ? await api.getProxyLogs(cloudBackendId, {
                      start_time: options.startTime,
                      end_time: options.endTime,
                      next_token: nextToken,
                  })
                : await api.getComputeLogs(cloudBackendId, environmentId!, {
                      start_time: options.startTime,
                      end_time: options.endTime,
                      next_token: nextToken,
                  });

        await onLogsLoaded(response.logs);
        nextToken = response.meta.next_token;
    } while (nextToken);
}

async function tailLogs(api: ConsoleClient, logType: LogType, cloudBackendId: string, environmentId: string | undefined, options: BaseLogsCommandOptions) {
    logger.info('Starting tail mode (press Ctrl+C to stop)...');
    logger.info('');

    let nextToken: string | undefined;
    const startTime = new Date();
    let isRunning = true;

    // Handle Ctrl+C gracefully
    process.on('SIGINT', () => {
        logger.info('\nStopping log tail...');
        isRunning = false;
        process.exit(0);
    });

    while (isRunning) {
        try {
            const response =
                logType === 'proxy'
                    ? await api.getProxyLogs(cloudBackendId, {
                          next_token: nextToken,
                          start_time: startTime.toISOString(),
                      })
                    : await api.getComputeLogs(cloudBackendId, environmentId!, {
                          next_token: nextToken,
                          start_time: startTime.toISOString(),
                      });

            // Store the latest token
            if (response.meta.next_token) {
                nextToken = response.meta.next_token;
            }

            // Display new logs support json option
            response.logs.forEach((log) => {
                if (options.json) {
                    console.log(JSON.stringify(log));
                } else {
                    console.log(displayLogEntry(log));
                }
            });
        } catch (error) {
            if (error instanceof BaseConsoleError) {
                if (error.response.status === 400) {
                    logger.error(error.message);
                    process.exit(1);
                }
            }
        }

        await new Promise((resolve) => setTimeout(resolve, 2000));
    }
}

function displayLogEntry(log: ApiRuntimeLogEntry) {
    return log.message;
}
