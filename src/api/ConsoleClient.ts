import { CliConfig } from '../cliConfig.js';
import { VERSION } from '../constants.js';
import { CreateDeploymentRequest, CreateDeploymentResponse } from './requests/CreateDeployment.js';
import { ListOrganizationsResponse } from './requests/ListOrganizations.js';
import { ListProjectsRequest, ListProjectsResponse } from './requests/ListProjects.js';
import { ListEnvironmentsRequest, ListEnvironmentsResponse } from './requests/ListEnvironements.js';
import { BaseConsoleError, ConsoleErrorResult, ConsoleResourceNotFoundError, ConsoleUnauthenticatedError, ConsoleUnauthorizedError } from './ConsoleError.js';
import { Client } from '../utils/Client.js';
import { DeployDeploymentRequest } from './requests/DeployDeployment.js';

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

    async getProjects(opts: ListProjectsRequest): Promise<ListProjectsResponse[]> {
        return this.get({ path: `/api/organizations/${opts.organizationId}/projects` })
            .then((res) => res.json())
            .then((data) => data as ListProjectsResponse[]);
    }

    async getEnvironments(opts: ListEnvironmentsRequest): Promise<ListEnvironmentsResponse[]> {
        return this.get({ path: `/api/projects/${opts.projectId}/environments` })
            .then((res) => res.json())
            .then((data) => data as ListEnvironmentsResponse[]);
    }

    async createDeployment(opts: CreateDeploymentRequest): Promise<CreateDeploymentResponse> {
        return this.post({
            path: `/api/environments/${opts.environmentId}/deployments`,
        })
            .then((res) => res.json())
            .then((data) => data as CreateDeploymentResponse);
    }

    async deployDeployment(opts: DeployDeploymentRequest): Promise<CreateDeploymentResponse> {
        return this.post({
            path: `/deployments/${opts.deploymentId}/deploy`,
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
