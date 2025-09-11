import { isProxyRequestEvent, Event } from './proxyRequestEvent.js';
import http from 'http';
import { HEADERS, INTERNAL_HEADERS_PREFIX } from '../../constants.js';
import { stringify } from 'querystring';
import { randomUUID } from 'crypto';

export interface RequestOptions {
    url?: string;
    host?: string;
    protocol?: string;
    port?: number;
    remoteAddress?: string;
    method?: string;
    headers?: Record<string, string | string[]>;
    body?: string | Buffer;
    params?: Record<string, string | string[]>;
}

export class Request {
    url: URL = new URL('https://127.0.0.1');
    host: string = 'localhost';
    protocol: string = 'https';
    port: number = 443;
    method: string = 'GET';
    headers: Record<string, string | string[]> = {};
    body?: string | Buffer;
    params: Record<string, string | string[]> = {};
    _cookies?: Record<string, string | string[]>;
    _pathExtension?: string;
    remoteAddress?: string;
    originalEvent?: Event;
    originalNodeRequest?: http.IncomingMessage;

    constructor(url?: string, options: RequestOptions = {}) {
        this.url = url ? new URL(url) : new URL('https://127.0.0.1');
        this.host = options.host || this.url.host;
        this.protocol = options.protocol || this.url.protocol.replace(':', '');
        this.remoteAddress = options.remoteAddress || '127.0.0.1';
        Object.assign(this, options);
        this.setHeaders(options.headers || {});
    }

    get path() {
        return decodeURIComponent(this.url.pathname);
    }
    set path(path: string) {
        this.url.pathname = path;
    }

    get pathExtension() {
        if (this._pathExtension) {
            return this._pathExtension;
        }
        this._pathExtension = this.path.split('.').pop();
        return this._pathExtension;
    }
    get cookies() {
        // Parse cookies only once
        if (this._cookies) {
            return this._cookies;
        }
        // Nothing to parse if there's no cookie header
        const cookieHeader = this.getHeader(HEADERS.Cookie) || '';
        if (!cookieHeader) {
            this._cookies = {};
            return this._cookies;
        }
        // Parse cookies from the cookie header
        this._cookies = {};

        // Split by semicolons and parse each cookie
        const cookiePairs = cookieHeader.split(';');
        for (const pair of cookiePairs) {
            const [key, value] = pair.trim().split('=', 2);
            if (!key || value === undefined) continue;

            // Store the cookie, handling multiple cookies with the same name
            if (this._cookies[key]) {
                // If there's already a cookie with this name, convert to array or append
                if (Array.isArray(this._cookies[key])) {
                    (this._cookies[key] as string[]).push(value);
                } else {
                    this._cookies[key] = [this._cookies[key] as string, value];
                }
            } else {
                this._cookies[key] = value;
            }
        }

        return this._cookies;
    }

    set cookies(cookies: Record<string, string | string[]>) {
        this._cookies = cookies;
        this.headers[HEADERS.Cookie] = stringify(cookies);
    }

    setHeader(key: string, value: string | string[]): void {
        this.headers[key.toLowerCase()] = value;
    }

    addHeader(key: string, value: string | string[]): void {
        this.headers[key.toLowerCase()] = [...(this.getHeaderArray(key) || []), ...(Array.isArray(value) ? value : [value])];
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
        return this.headers[key.toLowerCase()]?.toString()?.split(',') || [];
    }

    deleteHeader(key: string) {
        delete this.headers[key.toLowerCase()];
    }

    getCookie(name: string) {
        const cookie = this.cookies[name];
        if (!cookie) return undefined;
        return Array.isArray(cookie) ? cookie[0] : cookie;
    }

    getCookieArray(name: string) {
        const cookie = this.cookies[name];
        if (!cookie) return [];
        return Array.isArray(cookie) ? cookie : [cookie];
    }

    setCookie(name: string, value: string) {
        this.cookies[name] = value;

        // Reconstruct the cookie header by joining all cookies
        const cookieStrings = [];
        for (const [cookieName, cookieValue] of Object.entries(this.cookies)) {
            if (Array.isArray(cookieValue)) {
                for (const val of cookieValue) {
                    cookieStrings.push(`${cookieName}=${val}`);
                }
            } else {
                cookieStrings.push(`${cookieName}=${cookieValue}`);
            }
        }
        this.headers[HEADERS.Cookie] = cookieStrings.join('; ');
    }

    deleteCookie(name: string) {
        delete this.cookies[name];

        // Reconstruct the cookie header by joining all cookies
        const cookieStrings = [];
        for (const [cookieName, cookieValue] of Object.entries(this.cookies)) {
            if (Array.isArray(cookieValue)) {
                for (const val of cookieValue) {
                    cookieStrings.push(`${cookieName}=${val}`);
                }
            } else {
                cookieStrings.push(`${cookieName}=${cookieValue}`);
            }
        }
        this.headers[HEADERS.Cookie] = cookieStrings.join('; ');
    }

    getQuery(name: string) {
        const value = this.url.searchParams.get(name);
        return value === null ? undefined : value;
    }

    getQueryArray(name: string) {
        return this.url.searchParams.getAll(name);
    }

    setQuery(name: string, value: string) {
        this.url.searchParams.set(name, value);
    }

    get internalHeaders(): Record<string, string | string[]> {
        return Object.fromEntries(Object.entries(this.headers).filter(([key]) => key.startsWith(INTERNAL_HEADERS_PREFIX)));
    }

    setDefaultHeaders() {
        // Always set x-forwarded-* headers
        // to make sure they are all in place and in sync with req properties
        this.setHeader(HEADERS.Host, this.host);
        this.setHeader(HEADERS.XForwardedHost, this.getHeader(HEADERS.XForwardedHost) || this.host);
        this.setHeader(HEADERS.XForwardedProto, this.getHeader(HEADERS.XForwardedProto) || this.protocol);
        this.setHeader(HEADERS.XForwardedPort, this.getHeader(HEADERS.XForwardedPort) || this.port.toString());
        this.setHeader(HEADERS.XForwardedFor, this.getHeader(HEADERS.XForwardedFor) || this.remoteAddress || '127.0.0.1');

        // Always set recursion counter header
        this.setHeader(HEADERS.XOwnRecursions, this.getHeader(HEADERS.XOwnRecursions) || '0');

        // Set x-request-id header if not set (for example locally)
        this.setHeader(HEADERS.XRequestId, this.getHeader(HEADERS.XRequestId) || randomUUID());
    }

    static fromEvent(event: Event): Request {
        const request = new Request();
        if (isProxyRequestEvent(event)) {
            request.originalEvent = event;
            // Make sure all header keys are normalized to lowercase
            request.headers = Object.fromEntries(Object.entries(event.headers).map(([key, value]) => [key.toLowerCase(), value]));

            request.host = request.headers[HEADERS.XForwardedHost]?.toString()?.split(',')?.[0] || request.headers.host?.toString() || 'localhost';
            request.protocol =
                request.headers[HEADERS.XForwardedProto]?.toString()?.split(',')[0] || (event.requestContext.http.protocol.toLowerCase() as 'http' | 'https');
            request.remoteAddress = event.requestContext.http.sourceIp || request.headers[HEADERS.XForwardedFor]?.toString()?.split(',')[0] || '127.0.0.1';
            request.port = Number(request.headers[HEADERS.XForwardedPort]) || (request.protocol === 'https' ? 443 : 80);
            request.url = new URL(`${request.protocol}://${request.host}${event.rawPath}${event.rawQueryString ? `?${event.rawQueryString}` : ''}`);
            request.path = event.rawPath;
            request.method = event.requestContext.http.method;
            request.body = event.body ? Buffer.from(event.body, event.isBase64Encoded ? 'base64' : 'utf-8') : undefined;
        } else {
            throw new Error('Received unsupported event type');
        }

        request.setDefaultHeaders();
        return request;
    }

    static async fromNodeRequest(nodeRequest: http.IncomingMessage): Promise<Request> {
        const request = new Request();
        const isEncrypted = (nodeRequest.socket as any).encrypted;
        request.originalNodeRequest = nodeRequest;
        // Make sure all header keys are normalized to lowercase
        request.headers = Object.fromEntries(Object.entries(nodeRequest.headers).map(([key, value]) => [key.toLowerCase(), value as string | string[]]));

        request.host = request.headers[HEADERS.XForwardedHost]?.toString()?.split(',')[0] || request.headers.host?.toString() || 'localhost';
        request.protocol = request.headers[HEADERS.XForwardedProto]?.toString()?.split(',')[0] || (isEncrypted ? 'https' : 'http');
        request.remoteAddress = request.headers[HEADERS.XForwardedFor]?.toString()?.split(',')[0] || nodeRequest.socket.remoteAddress || '127.0.0.1';
        request.port = nodeRequest.socket.localPort || (request.protocol === 'https' ? 443 : 80);
        request.url = new URL(`${request.protocol}://${request.host}${nodeRequest.url}`);
        request.method = nodeRequest.method || 'GET';

        // Read body from request
        const chunks: Buffer[] = [];
        for await (const chunk of nodeRequest) {
            chunks.push(chunk);
        }
        request.body = Buffer.concat(chunks);

        request.setDefaultHeaders();
        return request;
    }
}
