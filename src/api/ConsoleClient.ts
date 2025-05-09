import { CliConfig } from '../cliConfig.js';
import { VERSION } from '../constants.js';
import { CreateDeploymentRequest, CreateDeploymentResponse } from './requests/CreateDeployment.js';
import { ListOrganizationsResponse } from './requests/ListOrganizations.js';
import { ListProjectsResponse } from './requests/ListProjects.js';
import { ListEnvironmentsResponse } from './requests/ListEnvironements.js';
import { BaseConsoleError, ConsoleErrorResult, ConsoleResourceNotFoundError, ConsoleUnauthenticatedError, ConsoleUnauthorizedError } from './ConsoleError.js';
import { Client } from '../utils/Client.js';

export default class ConsoleClient extends Client {
    constructor(cliConfig: CliConfig) {
        super(cliConfig.apiUrl, {
            'User-Agent': `Ownstak CLI ${VERSION}`,
            'Content-Type': 'application/json',
        });

        if (cliConfig.apiToken) {
            this.addHeader('Authorization', `Bearer ${cliConfig.apiToken}`);
        }
    }

    async getOrganizations(): Promise<ListOrganizationsResponse[]> {
        return this.get({ path: '/api/organizations' })
            .then((res) => res.json())
            .then((data) => data as ListOrganizationsResponse[]);
    }

    async getOrganization(organizationId: string): Promise<ListOrganizationsResponse> {
        return this.get({ path: `/api/organizations/${organizationId}` })
            .then((res) => res.json())
            .then((data) => data as ListOrganizationsResponse);
    }

    async getProjects(organizationId: string): Promise<ListProjectsResponse[]> {
        return this.get({ path: `/api/organizations/${organizationId}/projects` })
            .then((res) => res.json())
            .then((data) => data as ListProjectsResponse[]);
    }

    async getProject(projectId: string): Promise<ListProjectsResponse> {
        return this.get({ path: `/api/projects/${projectId}` })
            .then((res) => res.json())
            .then((data) => data as ListProjectsResponse);
    }

    async getEnvironments(projectId: string): Promise<ListEnvironmentsResponse[]> {
        return this.get({ path: `/api/projects/${projectId}/environments` })
            .then((res) => res.json())
            .then((data) => data as ListEnvironmentsResponse[]);
    }

    async getEnvironment(environmentId: string): Promise<ListEnvironmentsResponse> {
        return this.get({ path: `/api/environments/${environmentId}` })
            .then((res) => res.json())
            .then((data) => data as ListEnvironmentsResponse);
    }

    async createDeployment(environmentId: string, opts: CreateDeploymentRequest): Promise<CreateDeploymentResponse> {
        return this.post({
            path: `/api/environments/${environmentId}/deployments`,
            body: opts,
        })
            .then((res) => res.json())
            .then((data) => data as CreateDeploymentResponse);
    }

    async deployDeployment(deploymentId: string): Promise<CreateDeploymentResponse> {
        return this.post({
            path: `/api/deployments/${deploymentId}/deploy`,
        })
            .then((res) => res.json())
            .then((data) => data as CreateDeploymentResponse);
    }

    protected async handleError(response: Response) {
        const result = await response.json();
        switch (response.status) {
            case 401:
                throw new ConsoleUnauthenticatedError(result as ConsoleErrorResult, response);
            case 403:
                throw new ConsoleUnauthorizedError(result as ConsoleErrorResult, response);
            case 404:
                throw new ConsoleResourceNotFoundError(result as ConsoleErrorResult, response);
            default:
                throw new BaseConsoleError(result as ConsoleErrorResult, response);
        }
    }
}
