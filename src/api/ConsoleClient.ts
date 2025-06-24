import { ApiDeployment, ApiDeploymentOnCreate, ApiKeyRequest, ApiLogs, ApiKey } from './types/entities.js';
import { CreateDeploymentRequest } from './requests/CreateDeployment.js';
import { ListOrganizationsResponse } from './requests/ListOrganizations.js';
import { ListProjectsResponse } from './requests/ListProjects.js';
import { ResolveEnvironmentSlugsResponse, ResolveProjectSlugResponse } from './requests/ResolveSlugs.js';
import { ListEnvironmentsResponse } from './requests/ListEnvironements.js';
import {
    BaseConsoleError,
    ConsoleErrorResult,
    ConsoleResourceNotFoundError,
    ConsoleUnauthenticatedError,
    ConsoleUnauthorizedError,
    ConsoleValidationError,
} from './ConsoleError.js';
import { Client } from '../utils/Client.js';
import { BRAND, HEADERS, NAME } from '../constants.js';
import { CliConfig } from '../cliConfig.js';
import chalk from 'chalk';
import { logger } from '../logger.js';

export default class ConsoleClient extends Client {
    constructor({ apiUrl, apiKey }: { apiUrl: string; apiKey?: string }) {
        super(apiUrl, {
            [HEADERS.UserAgent]: `${BRAND} CLI ${CliConfig.getCurrentVersion()}`,
            [HEADERS.ContentType]: 'application/json',
        });

        if (apiKey) {
            this.addHeader(HEADERS.Authorization, `Bearer ${apiKey}`);
        }
    }

    async resolveEnvironmentSlugs(organizationSlug: string, projectSlug: string, environmentSlug: string) {
        return this.get({ path: `/api/slug/organizations/${organizationSlug}/projects/${projectSlug}/environments/${environmentSlug}` })
            .then((res) => res.json())
            .then((data) => data as ResolveEnvironmentSlugsResponse);
    }

    async resolveProjectSlugs(organizationSlug: string, projectSlug: string) {
        return this.get({ path: `/api/slug/organizations/${organizationSlug}/projects/${projectSlug}` })
            .then((res) => res.json())
            .then((data) => data as ResolveProjectSlugResponse);
    }

    async getOrganizations() {
        return this.get({ path: '/api/organizations' })
            .then((res) => res.json())
            .then((data) => data as ListOrganizationsResponse[]);
    }

    async getOrganization(organizationId: string) {
        return this.get({ path: `/api/organizations/${organizationId}` })
            .then((res) => res.json())
            .then((data) => data as ListOrganizationsResponse);
    }

    async getProjects(organizationId: string) {
        return this.get({ path: `/api/organizations/${organizationId}/projects` })
            .then((res) => res.json())
            .then((data) => data as ListProjectsResponse[]);
    }

    async getProject(projectId: string) {
        return this.get({ path: `/api/projects/${projectId}` })
            .then((res) => res.json())
            .then((data) => data as ListProjectsResponse);
    }

    async createProject(organizationId: string, projectName: string) {
        return this.post({
            path: `/api/projects`,
            body: {
                name: projectName,
                organization_id: organizationId,
            },
        })
            .then((res) => res.json())
            .then((data) => data as ListProjectsResponse);
    }

    async getEnvironments(projectId: string) {
        return this.get({ path: `/api/projects/${projectId}/environments` })
            .then((res) => res.json())
            .then((data) => data as ListEnvironmentsResponse[]);
    }

    async getEnvironment(environmentId: string) {
        return this.get({ path: `/api/environments/${environmentId}` })
            .then((res) => res.json())
            .then((data) => data as ListEnvironmentsResponse);
    }

    async createEnvironment(projectId: string, environmentName: string) {
        return this.post({
            path: `/api/environments`,
            body: {
                name: environmentName,
                project_id: projectId,
            },
        })
            .then((res) => res.json())
            .then((data) => data as ListEnvironmentsResponse);
    }

    async createDeployment(environmentId: string, opts: CreateDeploymentRequest) {
        return this.post({
            path: `/api/deployments`,
            body: {
                ...opts,
                environment_id: environmentId,
            },
        })
            .then((res) => res.json())
            .then((data) => data as ApiDeploymentOnCreate);
    }

    async deployDeployment(deploymentId: string) {
        return this.post({
            path: `/api/deployments/${deploymentId}/deploy`,
        })
            .then((res) => res.json())
            .then((data) => data as ApiDeployment);
    }

    async getDeployment(deploymentId: string) {
        return this.get({ path: `/api/deployments/${deploymentId}` })
            .then((res) => res.json())
            .then((data) => data as ApiDeployment);
    }

    async deleteDeployment(deploymentId: string) {
        return this.delete({ path: `/api/deployments/${deploymentId}` })
            .then((res) => res.json())
            .then((data) => data as ApiDeployment);
    }

    async getCloudBackendDeploymentLogs(cloudBackendDeploymentId: string) {
        return this.get({ path: `/api/cloud_backend_deployments/${cloudBackendDeploymentId}/logs` })
            .then((res) => res.json())
            .then((data) => data as ApiLogs);
    }

    async createApiKeyRequest(apiKeyRequest: Pick<ApiKeyRequest, 'client_name' | 'name'> = {}) {
        return this.post({ path: '/api/api_key_requests', body: apiKeyRequest })
            .then((res) => res.json())
            .then((data) => data as ApiKeyRequest);
    }

    async getApiKeyRequest(apiKeyRequestId: string) {
        return this.get({ path: `/api/api_key_requests/${apiKeyRequestId}` })
            .then((res) => res.json())
            .then((data) => data as ApiKeyRequest);
    }

    async retrieveApiKeyFromRequest(apiKeyRequestId: string, apiKeyRequestSecret: string) {
        return this.post({ path: `/api/api_key_requests/${apiKeyRequestId}/retrieve_api_key`, body: { secret: apiKeyRequestSecret } })
            .then((res) => res.json())
            .then((data) => data as ApiKey);
    }

    protected async handleError(response: Response) {
        const result = await response.json();
        switch (response.status) {
            case 401:
                throw new ConsoleUnauthenticatedError(result as ConsoleErrorResult, response, {
                    instructions: [`Please run \`npx ${NAME} login\` to authenticate with the platform.`],
                });
            case 403:
                throw new ConsoleUnauthorizedError(result as ConsoleErrorResult, response, {
                    instructions: [
                        `Verify your access permissions and try again. If the problem continues, contact your administrator to request elevated access.`,
                    ],
                });
            case 404:
                throw new ConsoleResourceNotFoundError(result as ConsoleErrorResult, response, {
                    instructions: [
                        `The requested resource could not be found. Please verify the resource details and try again. If the problem persists, contact support for assistance.`,
                    ],
                });
            case 422:
                let details = '';
                try {
                    details = Object.entries(result.details as { [key: string]: string[] })
                        .map(([key, value]) => `- ${chalk.bold(key)}: ${value.join(', ')}`)
                        .join('\n');
                } catch (e) {
                    logger.warn(`Failed to parse validation errors: ${e}`);
                    details = JSON.stringify(result, null, 2);
                }

                throw new ConsoleValidationError(result as ConsoleErrorResult, response, {
                    instructions: [`Please address the validation issues below and try again:\n\n${details}`],
                });
            default:
                throw new BaseConsoleError(result as ConsoleErrorResult, response);
        }
    }
}
