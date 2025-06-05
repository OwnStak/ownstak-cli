import http from 'http';
import https from 'https';
import { ASSETS_URL, PERMANENT_ASSETS_URL, APP_URL, HEADERS, INTERNAL_PATH_PREFIX, ASSETS_FOLDER, PERMANENT_ASSETS_FOLDER } from '../../constants.js';
import { Request } from './request.js';
import { Response } from './response.js';
import { logger } from '../../logger.js';
import { extractPathToRegexpParams, pathToRegexp, substitutePathToRegexpParams } from '../../utils/pathUtils.js';
import { isNot, Route, RouteCondition } from './route.js';
import {
    RouteAction,
    SetResponseHeader,
    SetRequestHeader,
    AddResponseHeader,
    AddRequestHeader,
    SetResponseStatus,
    DeleteResponseHeader,
    DeleteRequestHeader,
    Redirect,
    Rewrite,
    Proxy,
    ServeAsset,
    ServePermanentAsset,
    isEchoAction,
    isImageOptimizerAction,
    isAddResponseHeaderAction,
    isAddRequestHeaderAction,
    isProxyAction,
    isSetResponseHeaderAction,
    isSetRequestHeaderAction,
    isServeAssetAction,
    isServePermanentAssetAction,
    isServeAppAction,
    isRewriteAction,
    isRedirectAction,
    isSetResponseStatusAction,
    isDeleteResponseHeaderAction,
    isDeleteRequestHeaderAction,
    isSetDefaultRequestHeaderAction,
    isSetDefaultResponseHeaderAction,
    SetDefaultResponseHeader,
    SetDefaultRequestHeader,
} from './routeAction.js';

export class Router {
    routes: Route[] = [];

    /**
     * Adds a GET route to the router.
     * @param condition The condition that the route will match. Use {} to match every GET request.
     * @param actions The actions that will be executed if the route matches.
     * @param done Whether the route is the last route to be executed.
     */
    get(condition: RouteCondition | string, actions: RouteAction[], done: boolean = false) {
        this.addRouteInternal('GET', condition, actions, done);
    }

    /**
     * Adds a POST route to the router.
     * @param condition The condition that the route will match. Use {} to match every POST request.
     * @param actions The actions that will be executed if the route matches.
     * @param done Whether the route is the last route to be executed.
     */
    post(condition: RouteCondition | string, actions: RouteAction[], done: boolean = false) {
        this.addRouteInternal('POST', condition, actions, done);
    }

    /**
     * Adds a PUT route to the router.
     * @param condition The condition that the route will match. Use {} to match every PUT request.
     * @param actions The actions that will be executed if the route matches.
     * @param done Whether the route is the last route to be executed.
     */
    put(condition: RouteCondition | string, actions: RouteAction[], done: boolean = false) {
        this.addRouteInternal('PUT', condition, actions, done);
    }

    /**
     * Adds a DELETE route to the router.
     * @param condition The condition that the route will match. Use {} to match every DELETE request.
     * @param actions The actions that will be executed if the route matches.
     * @param done Whether the route is the last route to be executed.
     */
    delete(condition: RouteCondition | string, actions: RouteAction[], done: boolean = false) {
        this.addRouteInternal('DELETE', condition, actions, done);
    }

    /**
     * Adds a PATCH route to the router.
     * @param condition The condition that the route will match. Use {} to match every PATCH request.
     * @param actions The actions that will be executed if the route matches.
     * @param done Whether the route is the last route to be executed.
     */
    patch(condition: RouteCondition | string, actions: RouteAction[], done: boolean = false) {
        this.addRouteInternal('PATCH', condition, actions, done);
    }

    /**
     * Adds an OPTIONS route to the router.
     * @param condition The condition that the route will match. Use {} to match every OPTIONS request.
     * @param actions The actions that will be executed if the route matches.
     * @param done Whether the route is the last route to be executed.
     */
    options(condition: RouteCondition | string, actions: RouteAction[], done: boolean = false) {
        this.addRouteInternal('OPTIONS', condition, actions, done);
    }

    /**
     * Adds a HEAD route to the router.
     * @param condition The condition that the route will match. Use {} to match every HEAD request.
     * @param actions The actions that will be executed if the route matches.
     * @param done Whether the route is the last route to be executed.
     */
    head(condition: RouteCondition | string, actions: RouteAction[], done: boolean = false) {
        this.addRouteInternal('HEAD', condition, actions, done);
    }

    /**
     * Adds a route to the router that matches specfied condition.
     * @param condition The condition that the route will match. Use {} to match every request.
     * @param actions The actions that will be executed if the route matches.
     * @param done Whether the route is the last route to be executed.
     */
    match(condition: RouteCondition | string, actions: RouteAction[], done: boolean = false) {
        this.addRouteInternal(undefined, condition, actions, done);
    }

    /**
     * Adds a route to the router that matches every request with all the methods.
     * @param actions The actions that will be executed if the route matches.
     * @param done Whether the route is the last route to be executed.
     */
    any(actions: RouteAction[], done: boolean = false) {
        this.addRouteInternal(undefined, {}, actions, done);
    }

    /**
     * Adds a route to the router.
     * @param condition The condition that the route will match. Use {} to match every request.
     * @param actions The actions that will be executed if the route matches.
     * @param done Whether the route is the last route to be executed.
     * @example
     * router.addRoute({
     *     url: "/",
     *     path: "/",
     *     method: "GET",
     * }, [
     *     { type: "serveApp" },
     * ]);
     *
     * router.addRoute({
     *     url: "/",
     *     path: "/",
     *     method: "GET",
     * }, r => r.setResponseHeader("x-custom-header", "custom-value").setResponseHeader("x-custom-header-2", "custom-value-2"));
     */
    addRoute(condition: RouteCondition | string, actions: RouteAction[], done: boolean = false) {
        this.addRouteInternal(undefined, condition, actions, done);
    }

    /**
     * Adds a route to the front of the router.
     * @param condition The condition that the route will match. Use {} to match every request.
     * @param actions The actions that will be executed if the route matches.
     * @param done Whether the route is the last route to be executed.
     * @example
     * router.addRouteFront({
     *     url: "/",
     *     path: "/",
     *     method: ["GET", "HEAD"],
     * }, [
     *     { type: "serveApp" },
     * ]);
     */
    addRouteFront(condition: RouteCondition | string, actions: RouteAction[], done: boolean = false) {
        this.addRouteInternal(undefined, condition, actions, done, true);
    }

    /**
     * Adds a route either to the front or back of the router.
     * @param condition The condition that the route will match. Use {} to match every request.
     * @param actions The actions that will be executed if the route matches.
     * @param done Whether the route is the last route to be executed.
     * @param front Whether the route should be added to the front of the router.
     * @param method The method that the route will match.
     * @private
     */
    addRouteInternal(method: string | undefined, condition: RouteCondition | string, actions: RouteAction[], done: boolean = false, front: boolean = false) {
        // If condition is a string, we convert it to a valid condition object.
        // "/products/123" -> { path: "/products/123" }
        if (typeof condition === 'string') {
            condition = { path: condition };
        }
        // If path is a string and doesn't start with 'path-to-regex:' and contains ':',
        // we assume it's a path-to-regex pattern and mark it with correct prefix.
        // { path: "/products/:id" } -> { path: "path-to-regex:/products/:id" }
        // { path: "path-to-regex:/products/:id" } => { path: "path-to-regex:/products/:id" } - no change
        if (typeof condition.path === 'string' && !condition.path.startsWith('path-to-regex:') && condition.path.match(/(?<!\\):/)) {
            condition.path = `path-to-regex:${condition.path}`;
        }
        // Add method to condition if present
        if (method) {
            condition.method = method;
        }
        // Add route to the front or back of the router.
        if (front) {
            this.routes.unshift({ condition, actions, done });
        } else {
            this.routes.push({ condition, actions, done });
        }
    }

    /**
     * Executes the router.
     * @param request The request to execute the router on.
     * @param response The response to execute the router on. Defaults to a new Response object.
     * @returns The response from the router.
     */
    async execute(request: Request, response = new Response()): Promise<Response> {
        const matchedRoutes = this.matchRoutes(request);
        logger.debug(`[Router][MatchedRoutes]: ${request.method} ${request.url.toString()} => Matched ${matchedRoutes.length} routes`);
        for (const route of matchedRoutes) {
            await this.executeRoute(route, request, response);
        }
        return response;
    }

    /**
     * Executes a route.
     * @param route The route to execute.
     * @param request The request to execute the route on.
     * @param response The response to execute the route on.
     * @private
     */
    async executeRoute(route: Route, request: Request, response: Response): Promise<void> {
        // Extract params from path condition if it's a path-to-regex pattern,
        // so it can be later references in rewrite, redirect actions etc...
        // NOTE: This feature is useful for Next.js redirects that have destination only in path-to-regex format.
        const pathCondition = route.condition?.path;
        if (typeof pathCondition === 'string' && pathCondition.startsWith('path-to-regex:')) {
            const pathToRegexPattern = pathCondition.split('path-to-regex:').pop() || '';
            request.params = extractPathToRegexpParams(pathToRegexPattern, request.path);
        }

        for (const action of route.actions || []) {
            await this.executeRouteAction(action, request, response);
        }
    }

    /**
     * Executes given route action.
     * @param action The action to execute.
     * @param request The request to execute the action on.
     * @param response The response to execute the action on.
     * @private
     */
    async executeRouteAction(action: RouteAction, request: Request, response: Response): Promise<void> {
        // Append executed action type to x-own-actions header for debugging
        response.addHeader(HEADERS.XOwnActions, action.type);

        if (isSetResponseHeaderAction(action)) {
            return this.executeSetResponseHeader(action, response);
        }
        if (isSetRequestHeaderAction(action)) {
            return this.executeSetRequestHeader(action, request);
        }
        if (isAddResponseHeaderAction(action)) {
            return this.executeAddResponseHeader(action, response);
        }
        if (isAddRequestHeaderAction(action)) {
            return this.executeAddRequestHeader(action, request);
        }
        if (isSetResponseStatusAction(action)) {
            return this.executeSetResponseStatus(action, response);
        }
        if (isDeleteResponseHeaderAction(action)) {
            return this.executeDeleteResponseHeader(action, response);
        }
        if (isDeleteRequestHeaderAction(action)) {
            return this.executeDeleteRequestHeader(action, request);
        }
        if (isSetDefaultResponseHeaderAction(action)) {
            return this.executeSetDefaultResponseHeader(action, response);
        }
        if (isSetDefaultRequestHeaderAction(action)) {
            return this.executeSetDefaultRequestHeader(action, request);
        }
        if (isRewriteAction(action)) {
            return this.executeRewrite(action, request);
        }
        if (isProxyAction(action)) {
            return this.executeProxy(action, request, response);
        }
        if (isServeAssetAction(action)) {
            return this.executeServeAsset(action, request, response);
        }
        if (isServePermanentAssetAction(action)) {
            return this.executeServePermanentAsset(action, request, response);
        }
        if (isServeAppAction(action)) {
            return this.executeServeApp(request, response);
        }
        if (isRedirectAction(action)) {
            return this.executeRedirect(action, request, response);
        }
        if (isEchoAction(action)) {
            return this.executeEcho(request, response);
        }
        if (isImageOptimizerAction(action)) {
            return this.executeImageOptimizer(request, response);
        }
    }

    /**
     * Returns the list of all the routes that match the request.
     * @param request The request to match the routes to.
     * @param includeDone Whether to include routes after matched route that has the done flag set to true.
     * @returns The routes that match the request.
     * @private
     */
    matchRoutes(request: Request, includeAfterDone: boolean = false): Route[] {
        let matchedRoutes: Route[] = [];
        for (const route of this.routes) {
            if (this.matchRoute(route, request)) {
                matchedRoutes.push(route);
                // Stop matching routes after a route that has the done flag set to true.
                // All other routes won't be executed.
                if (!includeAfterDone && route.done) break;
            }
        }
        return matchedRoutes;
    }

    /**
     * Returns true if the route matches the request.
     * @param route The route to match.
     * @param request The request to match the route to.
     * @returns True if the route matches the request.
     * @private
     */
    matchRoute(route: Route, request: Request): boolean {
        // Make shallow copy, to not affect the original condition
        const condition = { ...route.condition };

        // Routes with empty condition match every request
        if (!condition) {
            return true;
        }

        // Convert path-to-regex pattern to regex
        if (typeof condition.path === 'string' && condition.path.startsWith('path-to-regex:')) {
            const pathToRegexPattern = condition.path.split('path-to-regex:').pop() || '';
            condition.path = pathToRegexp(pathToRegexPattern).pathRegex;
        }

        // URL condition
        // For example:
        // condition.url = ["https://example.com/blog", /https:\/\/example\.com\/blog\/.+/]
        // condition.url.not = ["https://example.com/blog/2", /https:\/\/example\.com\/blog\/.+/]
        // condition.url = /https:\/\/example\.com\/blog\/.+/
        // condition.url.not = "https://example.com/blog/2"
        let urlMatch = true;
        const urlCondition = isNot(condition.url) ? condition.url.not : condition.url;
        if (urlCondition !== undefined) {
            if (typeof urlCondition === 'string') {
                urlMatch = request.url.toString() === urlCondition;
            } else if (Array.isArray(urlCondition)) {
                // OR between all the values in the condition.url array
                // For example: condition.url = ["https://example.com/blog", /https:\/\/example\.com\/blog\/.+/]
                urlMatch = urlCondition.some((url) => {
                    if (typeof url === 'string') {
                        return request.url.toString() === url;
                    } else if (url instanceof RegExp) {
                        return url.test(request.url.toString());
                    }
                    return false;
                });
            } else if (urlCondition instanceof RegExp) {
                urlMatch = urlCondition.test(request.url.toString());
            }
        }
        urlMatch = isNot(condition.url) ? !urlMatch : urlMatch;

        // Path condition
        // For example:
        // condition.path = ["/blog", /^\/blog\/[^\/]+$/]
        // condition.path = "path-to-regex:/blog/:postId"
        // condition.path.not = ["/blog/2", /^\/blog\/[^\/]+$/]
        // condition.path = /^\/blog\/[^\/]+$/
        // condition.path.not = "/blog/2"
        let pathMatch = true;
        const pathCondition = isNot(condition.path) ? condition.path.not : condition.path;
        if (pathCondition !== undefined) {
            if (typeof pathCondition === 'string' && pathCondition.startsWith('path-to-regex:')) {
                // Convert path-to-regex pattern to regex
                const pathConditionRegex = pathToRegexp(pathCondition).pathRegex;
                pathMatch = pathConditionRegex.test(request.path);
            } else if (typeof pathCondition === 'string') {
                // Compare exact path or path with trailing slash
                pathMatch = request.path === pathCondition || request.path === `${pathCondition}/`;
            } else if (Array.isArray(pathCondition)) {
                // OR between all the values in the condition.path array
                // For example: condition.path = ["/blog", /^\/blog\/[^\/]+$/]
                pathMatch = pathCondition.some((path) => {
                    if (typeof path === 'string') {
                        return request.path === path || request.path === `${path}/`;
                    } else if (path instanceof RegExp) {
                        return path.test(request.path);
                    }
                    return false;
                });
            } else if (pathCondition instanceof RegExp) {
                pathMatch = pathCondition.test(request.path);
            }
        }
        pathMatch = isNot(condition.path) ? !pathMatch : pathMatch;

        // Path extension condition
        // For example:
        // condition.pathExtension = ["css", "js"]
        // condition.pathExtension.not = ["png", "jpg"]
        // condition.pathExtension = "css"
        // condition.pathExtension.not = "png"
        let pathExtensionMatch = true;
        const pathExtensionCondition = isNot(condition.pathExtension) ? condition.pathExtension.not : condition.pathExtension;
        if (pathExtensionCondition !== undefined) {
            if (typeof pathExtensionCondition === 'string') {
                pathExtensionMatch = request.pathExtension === pathExtensionCondition;
            } else if (Array.isArray(pathExtensionCondition)) {
                pathExtensionMatch = pathExtensionCondition.some((pathExtension) => {
                    if (typeof pathExtension === 'string') {
                        return request.pathExtension === pathExtension;
                    } else if (pathExtension instanceof RegExp) {
                        return pathExtension.test(request.pathExtension || '');
                    }
                    return false;
                });
            } else if (pathExtensionCondition instanceof RegExp) {
                pathExtensionMatch = pathExtensionCondition.test(request.pathExtension || '');
            }
        }
        pathExtensionMatch = isNot(condition.pathExtension) ? !pathExtensionMatch : pathExtensionMatch;

        // Method condition
        // For example:
        // condition.method = ["GET", /OPTIONS|HEAD/]
        // condition.method.not = ["POST", /OPTIONS|HEAD/]
        // condition.method = /OPTIONS|HEAD/
        // condition.method.not = "POST"
        let methodMatch = true;
        const methodCondition = isNot(condition.method) ? condition.method.not : condition.method;
        if (methodCondition !== undefined) {
            if (typeof methodCondition === 'string') {
                methodMatch = request.method.toLowerCase() === methodCondition.toLowerCase();
            } else if (Array.isArray(methodCondition)) {
                // OR between all the values in the condition.method array
                // For example: condition.method = ["GET", /OPTIONS|HEAD/]
                methodMatch = methodCondition.some((method) => {
                    if (typeof method === 'string') {
                        return request.method.toLowerCase() === method.toLowerCase();
                    } else if (method instanceof RegExp) {
                        return method.test(request.method);
                    }
                    return false;
                });
            } else if (methodCondition instanceof RegExp) {
                methodMatch = methodCondition.test(request.method);
            }
        }
        methodMatch = isNot(condition.method) ? !methodMatch : methodMatch;

        // Cookie condition
        // For example:
        // condition.cookie = {
        //     "name": "value",
        //     "name2": ["value1", /value2/],
        // }
        let cookieMatch = true;
        if (condition.cookie) {
            // AND between all the cookie values in condition.cookie
            // For example: condition.cookie = {
            //     "name": "value",
            //     "name2": ["value1", /value2/]
            // }
            cookieMatch = Object.entries(condition.cookie).every(([key, value]) => {
                if (typeof value === 'string') {
                    return request.getCookieArray(key)?.includes(value);
                } else if (value instanceof RegExp) {
                    // OR if we have multiple values for the same cookie name
                    return request.getCookieArray(key)?.some((cookieValue) => value.test(cookieValue));
                }
                return false;
            });
        }

        // Header condition
        // For example:
        // condition.header = {
        //     "name": "value",
        //     "name2": ["value1", /value2/]
        // }
        let headerMatch = true;
        if (condition.header) {
            // AND between all the header values in condition.header
            // For example: condition.header = {
            //     "name": "value",
            //     "name2": ["value1", /value2/]
            // }
            headerMatch = Object.entries(condition.header).every(([key, value]) => {
                if (typeof value === 'string') {
                    return request.getHeaderArray(key)?.includes(value);
                } else if (value instanceof RegExp) {
                    // OR if we have multiple values for the same header name
                    return request.getHeaderArray(key)?.some((headerValue) => value.test(headerValue));
                }
                return false;
            });
        }

        // Query condition
        // For example:
        // condition.query = {
        //     "name": "value",
        //     "name2": ["value1", /value2/]
        // }
        let queryMatch = true;
        if (condition.query) {
            // AND between all the query parameters in condition.query
            // For example: condition.query = {
            //     "name": "value",
            //     "name2": ["value1", /value2/]
            // }
            queryMatch = Object.entries(condition.query).every(([key, value]) => {
                if (typeof value === 'string') {
                    return request.getQueryArray(key)?.includes(value);
                } else if (value instanceof RegExp) {
                    // OR if we have multiple values for the same query parameter
                    return request.getQueryArray(key)?.some((queryValue) => value.test(queryValue));
                }
                return false;
            });
        }

        return urlMatch && pathMatch && pathExtensionMatch && methodMatch && cookieMatch && headerMatch && queryMatch;
    }

    /**
     * Executes a set response header action.
     * @param action The action to execute.
     * @param response The response to execute the action on.
     * @private
     */
    async executeSetResponseHeader(action: SetResponseHeader, response: Response): Promise<void> {
        response.headers[action.key] = action.value;
    }

    /**
     * Executes a set request header action.
     * @param action The action to execute.
     * @param request The request to execute the action on.
     * @private
     */
    async executeSetRequestHeader(action: SetRequestHeader, request: Request): Promise<void> {
        request.headers[action.key] = action.value;
    }

    /**
     * Executes an add response header action.
     * @param action The action to execute.
     * @param response The response to execute the action on.
     * @private
     */
    async executeAddResponseHeader(action: AddResponseHeader, response: Response): Promise<void> {
        response.headers[action.key] = response.getHeaderArray(action.key)?.concat(action.value);
    }

    /**
     * Executes an add request header action.
     * @param action The action to execute.
     * @param request The request to execute the action on.
     * @private
     */
    async executeAddRequestHeader(action: AddRequestHeader, request: Request): Promise<void> {
        request.headers[action.key] = request.getHeaderArray(action.key)?.concat(action.value);
    }

    /**
     * Executes a set response status action.
     * @param action The action to execute.
     * @param response The response to execute the action on.
     * @private
     */
    async executeSetResponseStatus(action: SetResponseStatus, response: Response): Promise<void> {
        response.statusCode = action.statusCode;
    }

    /**
     * Executes a delete response header action.
     * @param action The action to execute.
     * @param response The response to execute the action on.
     * @private
     */
    async executeDeleteResponseHeader(action: DeleteResponseHeader, response: Response): Promise<void> {
        delete response.headers[action.key];
    }

    /**
     * Executes a delete request header action.
     * @param action The action to execute.
     * @param request The request to execute the action on.
     * @private
     */
    async executeDeleteRequestHeader(action: DeleteRequestHeader, request: Request): Promise<void> {
        delete request.headers[action.key];
    }

    /**
     * Executes a set default response header action.
     * This action sets defined value for a response header only if the header is not defined or is empty.
     * @param action The action to execute.
     * @param response The response to execute the action on.
     * @private
     */
    async executeSetDefaultResponseHeader(action: SetDefaultResponseHeader, response: Response): Promise<void> {
        if (response.getHeaderArray(action.key)?.length) return;
        response.headers[action.key] = action.value;
    }

    /**
     * Executes a set default request header action.
     * This action sets defined value for a request header only if the header is not defined or is empty.
     * @param action The action to execute.
     * @param request The request to execute the action on.
     * @private
     */
    async executeSetDefaultRequestHeader(action: SetDefaultRequestHeader, request: Request): Promise<void> {
        if (request.getHeaderArray(action.key)?.length) return;
        request.headers[action.key] = action.value;
    }

    /**
     * Executes a proxy action.
     * @param action The action to execute.
     * @param request The request to proxy.
     * @param response The response to proxy.
     * @private
     */
    async executeProxy(action: Proxy, request: Request, response: Response): Promise<void> {
        const proxyReqUrl = new URL(action.url);

        // Preserve host header from original request by default, otherwise use host from proxyUrl
        const proxyHostHeader = action.preserveHostHeader !== false ? request.host.toString() : proxyReqUrl.hostname;
        // Preserve headers from from original request by default, otherwise keep them empty
        const proxyHeaders = action.preserveHeaders !== false ? { ...request.headers } : {};
        // Preserve path from from original request by default, otherwise use path from proxyUrl
        const proxyPath = action.preservePath !== false ? request.path : proxyReqUrl.pathname || '/';
        // Preserve query params from original request by default, otherwise use params from proxyUrl
        const proxyQuery = action.preserveQuery !== false ? request.url.search : proxyReqUrl.search || '';

        logger.debug(`[Router][ProxyRequest]: ${action.url} => ${proxyReqUrl}`);

        return new Promise((resolve, reject) => {
            const requestOptions: https.RequestOptions = {
                path: `${proxyPath}${proxyQuery}`.replace(/\/+/g, '/'), // remove double slashes
                method: request.method,
                headers: {
                    ...proxyHeaders,
                    host: proxyHostHeader,
                },
                rejectUnauthorized: !action.verifyTls, // ignore TLS errors by default if verifyTls is false/undefined
            };

            // We need to use http/https libs instead of fetch,
            // because there's no way to get raw compressed response body from fetch without decompressing it.
            const proxyReq = (proxyReqUrl.protocol === 'https:' ? https : http).request(proxyReqUrl, requestOptions, (proxyRes) => {
                // Forward status code
                response.statusCode = proxyRes.statusCode || 500;

                // Forward headers, converting undefined values to empty strings
                const headers: Record<string, string | string[]> = {};
                for (const [key, value] of Object.entries(proxyRes.headers)) {
                    if (value !== undefined) {
                        headers[key] = value;
                    }
                }
                response.headers = {
                    ...response.headers,
                    ...headers,
                };

                // Read the response body
                const chunks: Buffer[] = [];
                proxyRes.on('data', (chunk) => {
                    chunks.push(chunk);
                });

                proxyRes.on('end', () => {
                    response.body = Buffer.concat(chunks);
                    logger.debug(`[Router][ProxyResponse]: ${response.statusCode} ${response.body?.length || 0} bytes`);
                    resolve();
                });
            });

            proxyReq.on('error', (error) => {
                logger.error(`[Router][ProxyError]: ${error.message}`);
                reject(error);
            });

            // Only send body for non-GET/HEAD requests
            if (!['GET', 'HEAD'].includes(request.method) && request.body) {
                proxyReq.write(request.body);
            }

            proxyReq.end();
        });
    }

    /**
     * Executes a serve asset action.
     * @param action The action to execute.
     * @param request The request to serve the asset on.
     * @param response The response to serve the asset on.
     * @private
     */
    async executeServeAsset(action: ServeAsset | ServePermanentAsset, request: Request, response: Response, bucketUrl: string = ASSETS_URL): Promise<void> {
        let assetPath = action.path || request.path;

        // If path doesn't end with a file extension, add index.html to it
        // Example:
        // /assets/css/style.css => /assets/css/style.css
        // /images -> /images/index.html
        if (!assetPath.match(/\.[^\.]+$/)) {
            assetPath = `${assetPath}/index.html`;
        }

        // Constuct the final destination of asset
        // e.g. http://ownstak-001e5052-fbb2-4811-b389-79f03e220f3d-assets.s3.amazonaws.com/1/index.html
        const assetFolder = isServeAssetAction(action) ? ASSETS_FOLDER : PERMANENT_ASSETS_FOLDER;
        const assetUrl = `${bucketUrl}/${assetFolder}/${assetPath}`.replace(/(?<!:)\/+/g, '/');

        // If the request is coming from the ownstak-proxy, we need to redirect to the S3 bucket
        if (request.getHeader(HEADERS.XOwnProxy)) {
            response.setHeader(HEADERS.Location, assetUrl);
            // Tell the ownstak-proxy to follow the redirect to the S3 bucket
            response.setHeader(HEADERS.XOwnFollowRedirect, 'true');
            // Tell the ownstak-proxy to merge headers from this response with the headers from the S3 responses.
            // Conflicting headers are overridden by the headers from the S3 responses.
            response.setHeader(HEADERS.XOwnMergeHeaders, 'true');
            response.statusCode = 301;
            return;
        }

        // Otherwise, we need to proxy the request to the S3 bucket
        return this.executeProxy(
            {
                url: assetUrl,
                type: 'proxy',
                preserveHostHeader: false,
                preserveHeaders: false,
                preservePath: false,
                preserveQuery: false,
            },
            request,
            response,
        );
    }

    /**
     * Executes a serve permanent asset action.
     * @param action The action to execute.
     * @param request The request to serve the asset on.
     * @param response The response to serve the asset on.
     * @private
     */
    async executeServePermanentAsset(action: ServePermanentAsset, request: Request, response: Response): Promise<void> {
        return this.executeServeAsset(action, request, response, PERMANENT_ASSETS_URL);
    }

    /**
     * Executes a serve app action.
     * @param request The request to serve the app on.
     * @param response The response to serve the app on.
     * @private
     */
    async executeServeApp(request: Request, response: Response): Promise<void> {
        return this.executeProxy(
            {
                url: APP_URL,
                type: 'proxy',
            },
            request,
            response,
        );
    }

    /**
     * Executes a redirect action.
     * @param action The action to execute.
     * @param response The response to execute the action on.
     * @private
     */
    async executeRedirect(action: Redirect, request: Request, response: Response): Promise<void> {
        response.statusCode = action.statusCode;
        response.headers[HEADERS.Location] = substitutePathToRegexpParams(action.to, request.params);
    }

    /**
     * Executes a rewrite action.
     * @param action The action to execute.
     * @param request The request to rewrite.
     * @private
     */
    async executeRewrite(action: Rewrite, request: Request): Promise<void> {
        const pathBefore = request.path;

        if (action.from && typeof action.from === 'string' && action.from.includes(':')) {
            const fromRegex = pathToRegexp(action.from).pathRegex;
            const fromParams = extractPathToRegexpParams(action.from, pathBefore);
            const to = substitutePathToRegexpParams(action.to, fromParams);
            request.path = request.path.replace(fromRegex, to);
        }
        if (action.from && typeof action.from === 'string') {
            request.path = request.path.replace(action.from, action.to);
        }
        if (action.from && action.from instanceof RegExp) {
            request.path = request.path.replace(action.from, action.to);
        }
        if (!action.from) {
            request.path = action.to;
        }
        logger.debug(`[Router][Rewrite]: ${action.from ? action.from.toString() : 'no from'} ${pathBefore} => ${request.path}`);
    }

    /**
     * Executes an echo action.
     * @param request The request to echo.
     * @param response The response to echo.
     * @private
     */
    async executeEcho(request: Request, response: Response): Promise<void> {
        response.setHeader(HEADERS.ContentType, 'application/json');
        response.body = JSON.stringify(
            {
                req: {
                    url: request.url.toString(),
                    path: request.path,
                    method: request.method,
                    headers: request.headers,
                    query: request.url.searchParams,
                    body: request.body?.toString(),
                    host: request.host,
                    protocol: request.protocol,
                },
                originalEvent: request.originalEvent,
            },
            null,
            2,
        );
    }

    /**
     * Executes an image optimizer action.
     * This action just simulates image optimizer,
     * doesn't do any image transformations and only returns source image unchaged, so projects work even locally without ownstak-proxy.
     * The actual Image Optimizer is part of ownstak-proxy.
     * @param request The request to optimize the image on.
     * @param response The response to optimize the image on.
     * @private
     */
    async executeImageOptimizer(request: Request, response: Response): Promise<void> {
        const imageUrl = request.url.searchParams.get('url');
        if (!imageUrl) {
            response.clear();
            response.statusCode = 400;
            response.body = 'The image URL is required';
            return;
        }

        const parsedUrl = new URL(imageUrl, `http://${request.host}`);
        if (parsedUrl.pathname.startsWith(INTERNAL_PATH_PREFIX)) {
            response.clear();
            response.statusCode = 400;
            response.body = `The image URL cannot point back to the ${INTERNAL_PATH_PREFIX} path`;
            return;
        }

        if (parsedUrl.host !== request.host) {
            response.clear();
            response.statusCode = 400;
            response.body = `The image URL must be relative or point to the same domain: ${request.host}`;
            return;
        }

        // Rewrite path to new URL, preserve path and query params
        request.url.pathname = parsedUrl.pathname;
        request.url.search = parsedUrl.search;

        await this.executeProxy(
            {
                url: parsedUrl.toString(),
                type: 'proxy',
                preserveHostHeader: false,
                preserveHeaders: false,
            },
            request,
            response,
        );

        response.setHeader(HEADERS.XOwnImageOptimizer, 'enabled=true');
        if (response.getHeader(HEADERS.Location)) {
            return;
        }
        const contentType = response.getHeader(HEADERS.ContentType)?.toString();
        if (!contentType || !contentType.startsWith('image/')) {
            response.clear();
            response.statusCode = 400;
            response.body = 'The fetched resource is not an image';
            return;
        }
    }
}
