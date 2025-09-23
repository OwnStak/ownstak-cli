import { HEADERS } from '../constants.js';
import { logger } from '../logger.js';
export interface HttpHeaders {
    [key: string]: string;
}

export interface QueryParameters {
    [key: string]: string | number | boolean;
}

export enum HttpMethod {
    GET = 'GET',
    POST = 'POST',
    PUT = 'PUT',
    PATCH = 'PATCH',
    DELETE = 'DELETE',
}

export interface ClientRequestOptions {
    path: string;
    method?: HttpMethod;
    query?: QueryParameters;
    headers?: HttpHeaders;
    body?: any;
    timeout?: number;
}

export class ClientHttpError extends Error {
    public response;

    constructor(result: string, response: Response) {
        super(`[${response.status}] Client error ${result}`);
        this.response = response;
    }
}

class ClientError extends Error {
    constructor(message: string, client: Client) {
        super(`${message} [${client.baseUrl}]`);
    }
}

export class Client {
    public baseUrl: string;
    private headers: HttpHeaders = {};

    constructor(baseUrl: string, headers: HttpHeaders = {}) {
        this.baseUrl = baseUrl;
        this.headers = headers;
    }

    addHeader(key: string, value: string) {
        this.headers[key] = value;
        return this;
    }

    async get(opts: ClientRequestOptions): Promise<Response> {
        return this.request({ ...opts, method: HttpMethod.GET });
    }

    async post(opts: ClientRequestOptions): Promise<Response> {
        return this.request({ ...opts, method: HttpMethod.POST });
    }

    async put(opts: ClientRequestOptions): Promise<Response> {
        return this.request({ ...opts, method: HttpMethod.PUT });
    }

    async patch(opts: ClientRequestOptions): Promise<Response> {
        return this.request({ ...opts, method: HttpMethod.PATCH });
    }

    async delete(opts: ClientRequestOptions): Promise<Response> {
        return this.request({ ...opts, method: HttpMethod.DELETE });
    }

    async request(opts: ClientRequestOptions): Promise<Response> {
        const url = new URL(opts.path, this.baseUrl);
        const headers = { ...this.headers, ...(opts.headers || {}) };
        let body = opts.body ? opts.body : undefined;

        if (opts.query && Object.keys(opts.query).length > 0) {
            Object.entries(opts.query).forEach(([key, value]) => {
                url.searchParams.set(key, String(value));
            });
        }

        if (headers[HEADERS.ContentType] === 'application/json') {
            body = JSON.stringify(body);
        }

        try {
            logger.debug(`HTTP ${opts.method || HttpMethod.GET} ${url}`);

            const requestInit: RequestInit = {
                method: opts.method || HttpMethod.GET,
                body,
                headers,
                duplex: 'half',
            } as RequestInit;

            const response = await fetch(url, requestInit);
            logger.debug(`Response ${response.status}`);
            if (!response.ok) {
                await this.handleError(response);
            }
            return response;
        } catch (error: any) {
            switch (error?.cause?.code) {
                case 'ECONNREFUSED':
                    throw new ClientError('Failed to connect to the API server', this);
                case 'ECONNRESET':
                    throw new ClientError('Connection was reset by the API server', this);
                case 'ENOTFOUND':
                    throw new ClientError('The API server was not found', this);
                default:
                    throw new ClientError(`${error.message}${error.cause ? `: ${error.cause}` : ''}`, this);
            }
        }
    }

    protected async handleError(response: Response) {
        const result = await response.text();
        throw new ClientHttpError(result, response);
    }
}
