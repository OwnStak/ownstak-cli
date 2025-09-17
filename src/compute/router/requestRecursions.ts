import { ProjectReqRecursionError } from '../errors/projectReqRecursionError.js';
import { Request } from './request.js';
import { HEADERS, MAX_RECURSIONS, BRAND, NAME } from '../../constants.js';
import { logger, LogLevel } from '../../logger.js';
import http from 'http';
import https from 'https';

const originalFetch = fetch;
const originalHttpGet = http.get;
const originalHttpRequest = http.request;
const originalHttpsGet = https.get;
const originalHttpsRequest = https.request;

// This function is used to prevent infinite fetch loops in serverless environments
// for cases where we fetch itself or another project. These cases are usually handled by req timeout,
// but for serverless environments waiting for timeout of 1-900 seconds can be really expensive
// and it can generate quite a huge traffic. We can do this because we are sure the request handler
// can process only one request at a time and the global count in fetch/http/https is not shared between
// multiple requests.
// IMPORTANT: Don't use this function in server.js handler,
// we don't have reliable way how to globally store the req counter there.
// Usually these cases can be handled by the AsyncLocalStorage but because we proxy to another HTTP server
// from user app that is running in same process it's difficult to track the req context.
export function detectRequestRecursions(request: Request, recursionsLimit: number = MAX_RECURSIONS) {
    const recursionsCount = Number(request.getHeader(HEADERS.XOwnRecursions) || 0);
    if (recursionsCount > recursionsLimit) {
        throw new ProjectReqRecursionError(
            `The maximum number of allowed recursion requests (${recursionsLimit}) has been reached.\r\n` +
                `This can happen in cases where your application fetches itself or another ${BRAND} project in an infinite loop.\r\n` +
                `Please check your code for any potential loops.\r\n`,
        );
    }
    const recursionRequestHeaders = {
        [HEADERS.XOwnRecursions]: (recursionsCount + 1).toString(),
    };
    overrideFetchClient(recursionRequestHeaders);
    overrideHttpClient(recursionRequestHeaders);
}

export function overrideFetchClient(requestHeaders: Record<string, string> = {}) {
    const injectHeaders = (originalFetch: typeof fetch) => {
        return async (url: URL | RequestInfo, options: RequestInit = {}) => {
            options.headers = {
                ...(options.headers || {}),
                ...requestHeaders,
            };
            options.method = options.method || 'GET';
            if (logger.level == LogLevel.DEBUG) {
                logger.debug(`[UpstreamRequest] ${options.method} ${url.toString()}`, {
                    type: `ownstak.upstreamRequest`,
                    client: 'fetch',
                    url: url.toString(),
                    method: options.method,
                    headers: options.headers,
                });
            }
            const startTime = Date.now();
            const upstreamRes = await originalFetch(url, options);
            if (logger.level == LogLevel.DEBUG) {
                logger.debug(`[UpstreamResponse] ${upstreamRes.status} ${upstreamRes.headers.get(HEADERS.ContentType) || 'text/plain'}`, {
                    type: `ownstak.upstreamResponse`,
                    client: 'fetch',
                    url: url.toString(),
                    statusCode: upstreamRes.status,
                    headers: upstreamRes.headers,
                    duration: Date.now() - startTime,
                });
            }
            return upstreamRes;
        };
    };

    globalThis.fetch = injectHeaders(originalFetch);
}

export function overrideHttpClient(requestHeaders: Record<string, string> = {}) {
    const injectHeaders = (originalRequest: typeof http.get | typeof http.request) => {
        return function (...args: any[]) {
            // Handle different argument patterns for http.get/https.get:
            // 1. get(url, callback)
            // 2. get(url, options, callback)
            // 3. get(options, callback)

            let url: any;
            let options: any = {};
            let callback: any;

            if (args.length === 1) {
                // Only url/options provided, no callback
                if (typeof args[0] === 'string' || args[0] instanceof URL) {
                    url = args[0];
                } else {
                    options = args[0];
                }
            } else if (args.length === 2) {
                if (typeof args[0] === 'string' || args[0] instanceof URL) {
                    // get(url, callback)
                    url = args[0];
                    callback = args[1];
                } else {
                    // get(options, callback)
                    options = args[0];
                    callback = args[1];
                }
            } else if (args.length === 3) {
                // get(url, options, callback)
                url = args[0];
                options = args[1] || {};
                callback = args[2];
            }

            // Convert string URL to URL object if needed and merge into options
            if (url) {
                if (typeof url === 'string') {
                    url = new URL(url);
                }
                // Extract URL components into options
                options = {
                    protocol: url.protocol,
                    hostname: url.hostname,
                    port: url.port,
                    path: url.pathname + url.search,
                    ...options,
                };
            }

            // Inject our headers
            options.headers = {
                ...(options.headers || {}),
                ...requestHeaders,
            };

            const method = options.method || 'GET';
            const urlString = `${options.protocol}//${options.hostname}${options.port ? ':' + options.port : ''}${options.path}`;
            const startTime = Date.now();

            // Log request
            if (logger.level == LogLevel.DEBUG) {
                logger.debug(`[UpstreamRequest] ${method} ${urlString}`, {
                    type: `ownstak.upstreamRequest`,
                    client: 'http.request',
                    url: urlString,
                    method,
                    headers: options.headers || {},
                });
            }

            // Call original function with the modified options
            return originalRequest(options, (res: http.IncomingMessage) => {
                // Log response
                if (logger.level == LogLevel.DEBUG) {
                    logger.debug(`[UpstreamResponse] ${res.statusCode} ${res.headers?.['content-type'] || 'text/plain'}`, {
                        type: `ownstak.upstreamResponse`,
                        client: 'http.request',
                        url: urlString,
                        statusCode: res.statusCode,
                        headers: res.headers || {},
                        duration: Date.now() - startTime,
                    });
                }

                // Call original callback if provided
                callback?.(res);
            });
        };
    };

    http.get = injectHeaders(originalHttpGet);
    http.request = injectHeaders(originalHttpRequest);
    https.get = injectHeaders(originalHttpsGet);
    https.request = injectHeaders(originalHttpsRequest);
}
