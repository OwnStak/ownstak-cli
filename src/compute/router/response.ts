import { HEADERS } from '../../constants.js';
import { ProxyResponseEvent } from './proxyResponseEvent.js';
import http from 'http';

export class Response {
    statusCode: number = 200;
    headers: Record<string, string | string[]> = {};
    body?: string | Buffer;

    constructor(
        body: string | Buffer | undefined = undefined,
        options: {
            statusCode?: number;
            headers?: Record<string, string | string[]>;
        } = {},
    ) {
        this.statusCode = options.statusCode ?? 200;
        this.headers = options.headers ?? {};
        this.body = body;
    }

    toEvent(): ProxyResponseEvent {
        this.deleteAmznHeaders();
        const headers = Object.fromEntries(Object.entries(this.headers).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value || '']));
        return {
            statusCode: this.statusCode,
            headers,
            body: Buffer.isBuffer(this.body) ? this.body.toString('base64') : Buffer.from(this.body?.toString() ?? '').toString('base64'),
            isBase64Encoded: true,
        };
    }

    toNodeResponse(nodeResponse: http.ServerResponse): void {
        nodeResponse.statusCode = this.statusCode;
        nodeResponse.writeHead(this.statusCode, this.headers);
        nodeResponse.end(this.body);
    }

    setHeader(key: string, value: string | string[]) {
        this.headers[key.toLowerCase()] = value;
    }

    addHeader(key: string, value: string | string[]) {
        key = key.toLowerCase();
        const newValues = [...(this.getHeaderArray(key) || []), ...(Array.isArray(value) ? value : [value])];
        if (key == HEADERS.SetCookie.toLowerCase()) {
            // Set-Cookie header is the only case that can be duplicated and returned as an array
            this.headers[key] = newValues;
        } else {
            // For all other headers, merge the values into single string
            this.headers[key] = newValues.join(',');
        }
    }

    setHeaders(headers: Record<string, string | string[]>): void {
        for (const [key, value] of Object.entries(headers)) {
            this.setHeader(key, value);
        }
    }

    addHeaders(headers: Record<string, string | string[]>): void {
        for (const [key, value] of Object.entries(headers)) {
            this.addHeader(key, value);
        }
    }

    getHeader(key: string) {
        return this.headers[key.toLowerCase()]?.toString();
    }

    getHeaderArray(key: string) {
        return this.headers[key.toLowerCase()]?.toString()?.split(',');
    }

    deleteHeader(key: string): void {
        delete this.headers[key.toLowerCase()];
    }

    deleteAmznHeaders(): void {
        // AWS returns 500 errors if we proxy back to another AWS service/API gateway
        // and headers are present in the request/response.
        // It happens with Function URLs.
        for (const key of Object.keys(this.headers)) {
            if (key.startsWith('x-amz-') || key.startsWith('x-amzn-')) {
                this.deleteHeader(key);
            }
        }
    }

    clear(): void {
        this.statusCode = 200;
        this.headers = {};
        this.body = undefined;
    }
}
