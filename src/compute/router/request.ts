import { isProxyRequestEvent, Event } from './proxyRequestEvent.js';
import http, { get } from 'http';
import tls from 'tls';
import { HEADERS } from '../../constants.js';
import { parse, stringify } from 'querystring';

export class Request {
    url: URL = new URL('https://127.0.0.1');
    host: string = 'localhost';
    protocol: string = 'https';
    port: number = 443;
    method: string = 'GET';
    headers: Record<string, string | string[]> = {};
    body?: string | Buffer;
    params: Record<string, string> = {};
    _cookies?: Record<string, string | string[]> = {};
    _pathExtension?: string;

    originalEvent?: Event;
    originalNodeRequest?: http.IncomingMessage;

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
        const cookieHeader = this.headers[HEADERS.Cookie]?.toString() || '';
        if (!cookieHeader) {
            this._cookies = {};
            return this._cookies;
        }
        // Parse cookies from the cookie header
        this._cookies = {};
        const parsedCookies = parse(cookieHeader);
        for (const [key, value] of Object.entries(parsedCookies)) {
            if (value === undefined) continue;
            this._cookies[key] = value;
        }
        return this._cookies;
    }
    set cookies(cookies: Record<string, string | string[]>) {
        this._cookies = cookies;
        this.headers[HEADERS.Cookie] = stringify(cookies);
    }

    static fromEvent(event: Event): Request {
        const request = new Request();
        if (isProxyRequestEvent(event)) {
            request.originalEvent = event;
            request.host = event.headers[HEADERS.XForwardedHost]?.toString()?.split(',')?.[0] || event.headers.host || 'localhost';
            request.protocol =
                event.headers[HEADERS.XForwardedProto]?.toString()?.split(',')[0] || (event.requestContext.http.protocol.toLowerCase() as 'http' | 'https');
            request.port = Number(event.headers[HEADERS.XForwardedPort]) || (request.protocol === 'https' ? 443 : 80);
            request.url = new URL(`${request.protocol}://${request.host}${event.rawPath}${event.rawQueryString ? `?${event.rawQueryString}` : ''}`);
            request.path = event.rawPath;
            request.method = event.requestContext.http.method;
            request.headers = Object.fromEntries(Object.entries(event.headers).map(([key, value]) => [key.toLowerCase(), value]));
            request.body = event.body ? Buffer.from(event.body, event.isBase64Encoded ? 'base64' : 'utf-8') : undefined;
        } else {
            throw new Error('Received unsupported event type');
        }
        request.deleteAmznHeaders();
        return request;
    }

    static async fromNodeRequest(nodeRequest: http.IncomingMessage): Promise<Request> {
        const request = new Request();
        request.originalNodeRequest = nodeRequest;
        request.host = nodeRequest.headers[HEADERS.XForwardedHost]?.toString()?.split(',')[0] || nodeRequest.headers.host || 'localhost';
        request.protocol =
            nodeRequest.headers[HEADERS.XForwardedProto]?.toString()?.split(',')[0] || (nodeRequest.socket instanceof tls.TLSSocket ? 'https' : 'http');
        request.port = nodeRequest.socket.localPort || (request.protocol === 'https' ? 443 : 80);
        request.url = new URL(`${request.protocol}://${request.host}${nodeRequest.url}`);
        request.method = nodeRequest.method || 'GET';
        request.headers = Object.fromEntries(Object.entries(nodeRequest.headers).map(([key, value]) => [key.toLowerCase(), value as string | string[]]));

        // Read body from request
        const chunks: Buffer[] = [];
        for await (const chunk of nodeRequest) {
            chunks.push(chunk);
        }
        request.body = Buffer.concat(chunks);

        return request;
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
        return this.headers[key.toLowerCase()]?.toString()?.split(',');
    }

    deleteHeader(key: string) {
        delete this.headers[key.toLowerCase()];
    }

    getCookie(name: string) {
        return this.cookies[name]?.toString();
    }

    getCookieArray(name: string) {
        return this.cookies[name]?.toString()?.split(',');
    }

    setCookie(name: string, value: string) {
        this.cookies[name] = value;
        this.headers[HEADERS.Cookie] = stringify(this.cookies);
    }

    deleteCookie(name: string) {
        delete this.cookies[name];
        this.headers[HEADERS.Cookie] = stringify(this.cookies);
    }

    getQuery(name: string) {
        return this.url.searchParams.get(name);
    }

    getQueryArray(name: string) {
        return this.url.searchParams.getAll(name);
    }

    setQuery(name: string, value: string) {
        this.url.searchParams.set(name, value);
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
}
