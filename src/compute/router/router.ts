import http from 'http';
import https from 'https';
import { ASSETS_URL, PERMANENT_ASSETS_URL, APP_URL, HEADERS, INTERNAL_PATH_PREFIX, ASSETS_FOLDER, PERMANENT_ASSETS_FOLDER, BRAND } from '../../constants.js';
import type { Response } from './response.js';
import { RequestContext } from './requestContex.js';
import { logger } from '../../logger.js';
import { extractPathToRegexpParams, pathToRegexp, substitutePathToRegexpParams } from '../../utils/pathUtils.js';
import { isNot, type Route, type RouteCondition } from './route.js';
import { resolve } from 'path';
import {
    type RouteAction,
    type SetResponseHeader,
    type SetRequestHeader,
    type AddResponseHeader,
    type AddRequestHeader,
    type SetResponseStatus,
    type SetResponseBody,
    type SetDefaultResponseHeader,
    type SetDefaultRequestHeader,
    type DeleteResponseHeader,
    type DeleteRequestHeader,
    type Redirect,
    type Rewrite,
    type Proxy,
    type ServeAsset,
    type ServePermanentAsset,
    type NodeFunction,
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
    isNodeFunctionAction,
    isHealthCheckAction,
    isSetResponseBodyAction,
} from './routeAction.js';
import { ProjectTimeoutError } from '../errors/projectTimeoutError.js';

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
        return this;
    }

    /**
     * Adds a POST route to the router.
     * @param condition The condition that the route will match. Use {} to match every POST request.
     * @param actions The actions that will be executed if the route matches.
     * @param done Whether the route is the last route to be executed.
     */
    post(condition: RouteCondition | string, actions: RouteAction[], done: boolean = false) {
        this.addRouteInternal('POST', condition, actions, done);
        return this;
    }

    /**
     * Adds a PUT route to the router.
     * @param condition The condition that the route will match. Use {} to match every PUT request.
     * @param actions The actions that will be executed if the route matches.
     * @param done Whether the route is the last route to be executed.
     */
    put(condition: RouteCondition | string, actions: RouteAction[], done: boolean = false) {
        this.addRouteInternal('PUT', condition, actions, done);
        return this;
    }

    /**
     * Adds a DELETE route to the router.
     * @param condition The condition that the route will match. Use {} to match every DELETE request.
     * @param actions The actions that will be executed if the route matches.
     * @param done Whether the route is the last route to be executed.
     */
    delete(condition: RouteCondition | string, actions: RouteAction[], done: boolean = false) {
        this.addRouteInternal('DELETE', condition, actions, done);
        return this;
    }

    /**
     * Adds a PATCH route to the router.
     * @param condition The condition that the route will match. Use {} to match every PATCH request.
     * @param actions The actions that will be executed if the route matches.
     * @param done Whether the route is the last route to be executed.
     */
    patch(condition: RouteCondition | string, actions: RouteAction[], done: boolean = false) {
        this.addRouteInternal('PATCH', condition, actions, done);
        return this;
    }

    /**
     * Adds an OPTIONS route to the router.
     * @param condition The condition that the route will match. Use {} to match every OPTIONS request.
     * @param actions The actions that will be executed if the route matches.
     * @param done Whether the route is the last route to be executed.
     */
    options(condition: RouteCondition | string, actions: RouteAction[], done: boolean = false) {
        this.addRouteInternal('OPTIONS', condition, actions, done);
        return this;
    }

    /**
     * Adds a HEAD route to the router.
     * @param condition The condition that the route will match. Use {} to match every HEAD request.
     * @param actions The actions that will be executed if the route matches.
     * @param done Whether the route is the last route to be executed.
     */
    head(condition: RouteCondition | string, actions: RouteAction[], done: boolean = false) {
        this.addRouteInternal('HEAD', condition, actions, done);
        return this;
    }

    /**
     * Adds a route to the router that matches specfied condition.
     * @param condition The condition that the route will match. Use {} to match every request.
     * @param actions The actions that will be executed if the route matches.
     * @param done Whether the route is the last route to be executed.
     */
    match(condition: RouteCondition | string, actions: RouteAction[], done: boolean = false) {
        this.addRouteInternal(undefined, condition, actions, done);
        return this;
    }

    /**
     * Adds a route to the router that matches every request with all the methods.
     * @param actions The actions that will be executed if the route matches.
     * @param done Whether the route is the last route to be executed.
     */
    any(actions: RouteAction[], done: boolean = false) {
        this.addRouteInternal(undefined, {}, actions, done);
        return this;
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
        return this;
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
        return this;
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
        return this;
    }

    /**
     * Executes the router.
     * @param ctx The request context to execute the router on.
     * @returns The response from the router.
     */
    async execute(ctx: RequestContext = new RequestContext()): Promise<Response> {
        const matchedRoutes = this.matchRoutes(ctx);
        for (const [index, route] of matchedRoutes.entries()) {
            // Enable streaming for the last matched route if streaming is enabled in the config
            if (index === matchedRoutes.length - 1) {
                ctx.response.enableStreaming(ctx.config.app.streaming);
            }
            await this.executeRoute(ctx, route);
        }
        return ctx.response;
    }

    /**
     * Executes a route.
     * @param ctx The request context to execute the route on.
     * @param route The route to execute.
     * @private
     */
    async executeRoute(ctx: RequestContext, route: Route): Promise<void> {
        // Extract params from path condition if it's a path-to-regex pattern,
        // so it can be later references in rewrite, redirect actions etc...
        // NOTE: This feature is useful for Next.js redirects that have destination only in path-to-regex format.
        const pathCondition = route.condition?.path;
        if (typeof pathCondition === 'string' && pathCondition.startsWith('path-to-regex:')) {
            const pathToRegexPattern = pathCondition.split('path-to-regex:').pop() || '';
            ctx.request.params = extractPathToRegexpParams(pathToRegexPattern, ctx.request.path);
        }

        for (const action of route.actions || []) {
            await this.executeRouteAction(ctx, action);
        }
    }

    /**
     * Executes given route action.
     * @param ctx The request context to execute the action on.
     * @param action The action to execute.
     * @private
     */
    async executeRouteAction(ctx: RequestContext, action: RouteAction): Promise<void> {
        // Append executed action type to x-own-actions header for debugging
        if (ctx.request.getHeader(HEADERS.XOwnDebug)) {
            ctx.response.addHeader(HEADERS.XOwnActions, action.type);
        }

        // Map actions to their corresponding handlers
        if (isSetResponseHeaderAction(action)) return this.executeSetResponseHeader(ctx, action);
        if (isSetRequestHeaderAction(action)) return this.executeSetRequestHeader(ctx, action);
        if (isAddResponseHeaderAction(action)) return this.executeAddResponseHeader(ctx, action);
        if (isAddRequestHeaderAction(action)) return this.executeAddRequestHeader(ctx, action);
        if (isSetResponseStatusAction(action)) return this.executeSetResponseStatus(ctx, action);
        if (isSetResponseBodyAction(action)) return this.executeSetResponseBody(ctx, action);
        if (isDeleteResponseHeaderAction(action)) return this.executeDeleteResponseHeader(ctx, action);
        if (isDeleteRequestHeaderAction(action)) return this.executeDeleteRequestHeader(ctx, action);
        if (isSetDefaultResponseHeaderAction(action)) return this.executeSetDefaultResponseHeader(ctx, action);
        if (isSetDefaultRequestHeaderAction(action)) return this.executeSetDefaultRequestHeader(ctx, action);
        if (isRewriteAction(action)) return this.executeRewrite(ctx, action);
        if (isProxyAction(action)) return this.executeProxy(ctx, action);
        if (isServeAssetAction(action)) return this.executeServeAsset(ctx, action);
        if (isServePermanentAssetAction(action)) return this.executeServePermanentAsset(ctx, action);
        if (isServeAppAction(action)) return this.executeServeApp(ctx, action);
        if (isRedirectAction(action)) return this.executeRedirect(ctx, action);
        if (isEchoAction(action)) return this.executeEcho(ctx, action);
        if (isImageOptimizerAction(action)) return this.executeImageOptimizer(ctx, action);
        if (isNodeFunctionAction(action)) return this.executeNodeFunction(ctx, action);
        if (isHealthCheckAction(action)) return this.executeHealthCheck(ctx, action);

        // If no action handler found, log an error (this should never happen if all action types are covered)
        logger.error(`[Router][UnknownAction]: No action handler was found for action type '${(action as any).type}'.`);
    }

    /**
     * Returns the list of all the routes that match the request.
     * @param ctx The request context to match the routes to.
     * @param includeDone Whether to include routes after matched route that has the done flag set to true.
     * @returns The routes that match the request.
     * @private
     */
    matchRoutes(ctx: RequestContext, includeAfterDone: boolean = false): Route[] {
        const matchedRoutes: Route[] = [];
        for (const route of this.routes) {
            if (this.matchRoute(ctx, route)) {
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
     * @param ctx The request context to match the route to.
     * @param route The route to match.
     * @returns True if the route matches the request.
     * @private
     */
    matchRoute(ctx: RequestContext, route: Route): boolean {
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
                urlMatch = ctx.request.url.toString() === urlCondition;
            } else if (Array.isArray(urlCondition)) {
                // OR between all the values in the condition.url array
                // For example: condition.url = ["https://example.com/blog", /https:\/\/example\.com\/blog\/.+/]
                urlMatch = urlCondition.some((url) => {
                    if (typeof url === 'string') {
                        return ctx.request.url.toString() === url;
                    } else if (url instanceof RegExp) {
                        return url.test(ctx.request.url.toString());
                    }
                    return false;
                });
            } else if (urlCondition instanceof RegExp) {
                urlMatch = urlCondition.test(ctx.request.url.toString());
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
                pathMatch = pathConditionRegex.test(ctx.request.path);
            } else if (typeof pathCondition === 'string') {
                // Compare exact path or path with trailing slash
                pathMatch = ctx.request.path === pathCondition || ctx.request.path === `${pathCondition}/`;
            } else if (Array.isArray(pathCondition)) {
                // OR between all the values in the condition.path array
                // For example: condition.path = ["/blog", /^\/blog\/[^\/]+$/]
                pathMatch = pathCondition.some((path) => {
                    if (typeof path === 'string') {
                        return ctx.request.path === path || ctx.request.path === `${path}/`;
                    } else if (path instanceof RegExp) {
                        return path.test(ctx.request.path);
                    }
                    return false;
                });
            } else if (pathCondition instanceof RegExp) {
                pathMatch = pathCondition.test(ctx.request.path);
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
                pathExtensionMatch = ctx.request.pathExtension === pathExtensionCondition;
            } else if (Array.isArray(pathExtensionCondition)) {
                pathExtensionMatch = pathExtensionCondition.some((pathExtension) => {
                    if (typeof pathExtension === 'string') {
                        return ctx.request.pathExtension === pathExtension;
                    } else if (pathExtension instanceof RegExp) {
                        return pathExtension.test(ctx.request.pathExtension || '');
                    }
                    return false;
                });
            } else if (pathExtensionCondition instanceof RegExp) {
                pathExtensionMatch = pathExtensionCondition.test(ctx.request.pathExtension || '');
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
                methodMatch = ctx.request.method.toLowerCase() === methodCondition.toLowerCase();
            } else if (Array.isArray(methodCondition)) {
                // OR between all the values in the condition.method array
                // For example: condition.method = ["GET", /OPTIONS|HEAD/]
                methodMatch = methodCondition.some((method) => {
                    if (typeof method === 'string') {
                        return ctx.request.method.toLowerCase() === method.toLowerCase();
                    } else if (method instanceof RegExp) {
                        return method.test(ctx.request.method);
                    }
                    return false;
                });
            } else if (methodCondition instanceof RegExp) {
                methodMatch = methodCondition.test(ctx.request.method);
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
                    return ctx.request.getCookieArray(key)?.includes(value);
                } else if (value instanceof RegExp) {
                    // OR if we have multiple values for the same cookie name
                    return ctx.request.getCookieArray(key)?.some((cookieValue) => value.test(cookieValue));
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
                    return ctx.request.getHeaderArray(key)?.includes(value);
                } else if (value instanceof RegExp) {
                    // OR if we have multiple values for the same header name
                    return ctx.request.getHeaderArray(key)?.some((headerValue) => value.test(headerValue));
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
                    return ctx.request.getQueryArray(key)?.includes(value);
                } else if (value instanceof RegExp) {
                    // OR if we have multiple values for the same query parameter
                    return ctx.request.getQueryArray(key)?.some((queryValue) => value.test(queryValue));
                }
                return false;
            });
        }

        return urlMatch && pathMatch && pathExtensionMatch && methodMatch && cookieMatch && headerMatch && queryMatch;
    }

    /**
     * Executes a set response header action.
     * @param ctx The request context to execute the action on.
     * @param action The action to execute.
     * @private
     */
    async executeSetResponseHeader(ctx: RequestContext, action: SetResponseHeader): Promise<void> {
        ctx.response.setHeader(action.key, action.value);
    }

    /**
     * Executes a set request header action.
     * @param ctx The request context to execute the action on.
     * @param action The action to execute.
     * @private
     */
    async executeSetRequestHeader(ctx: RequestContext, action: SetRequestHeader): Promise<void> {
        ctx.request.setHeader(action.key, action.value);
    }

    /**
     * Executes an add response header action.
     * @param ctx The request context to execute the action on.
     * @param action The action to execute.
     * @private
     */
    async executeAddResponseHeader(ctx: RequestContext, action: AddResponseHeader): Promise<void> {
        ctx.response.addHeader(action.key, action.value);
    }

    /**
     * Executes an add request header action.
     * @param ctx The request context to execute the action on.
     * @param action The action to execute.
     * @private
     */
    async executeAddRequestHeader(ctx: RequestContext, action: AddRequestHeader): Promise<void> {
        ctx.request.addHeader(action.key, action.value);
    }

    /**
     * Executes a set response status action.
     * @param ctx The request context to execute the action on.
     * @param action The action to execute.
     * @private
     */
    async executeSetResponseStatus(ctx: RequestContext, action: SetResponseStatus): Promise<void> {
        ctx.response.statusCode = action.statusCode;
    }

    /**
     * Executes a set response body action.
     * @param ctx The request context to execute the action on.
     * @param action The action to execute.
     * @private
     */
    async executeSetResponseBody(ctx: RequestContext, action: SetResponseBody): Promise<void> {
        ctx.response.body = action.body;
        ctx.response.setHeader(HEADERS.ContentLength, action.body.length.toString());
        ctx.response.deleteHeader(HEADERS.TransferEncoding);
        ctx.response.deleteHeader(HEADERS.ContentEncoding);
    }

    /**
     * Executes a delete response header action.
     * @param ctx The request context to execute the action on.
     * @param action The action to execute.
     * @private
     */
    async executeDeleteResponseHeader(ctx: RequestContext, action: DeleteResponseHeader): Promise<void> {
        ctx.response.deleteHeader(action.key);
    }

    /**
     * Executes a delete request header action.
     * @param ctx The request context to execute the action on.
     * @param action The action to execute.
     * @private
     */
    async executeDeleteRequestHeader(ctx: RequestContext, action: DeleteRequestHeader): Promise<void> {
        ctx.request.deleteHeader(action.key);
    }

    /**
     * Executes a set default response header action.
     * This action sets defined value for a response header only if the header is not defined or is empty.
     * @param ctx The request context to execute the action on.
     * @param action The action to execute.
     * @private
     */
    async executeSetDefaultResponseHeader(ctx: RequestContext, action: SetDefaultResponseHeader): Promise<void> {
        if (ctx.response.getHeaderArray(action.key)?.length) return;
        ctx.response.setHeader(action.key, action.value);
    }

    /**
     * Executes a set default request header action.
     * This action sets defined value for a request header only if the header is not defined or is empty.
     * @param ctx The request context to execute the action on.
     * @param action The action to execute.
     * @private
     */
    async executeSetDefaultRequestHeader(ctx: RequestContext, action: SetDefaultRequestHeader): Promise<void> {
        if (ctx.request.getHeaderArray(action.key)?.length) return;
        ctx.request.setHeader(action.key, action.value);
    }

    /**
     * Executes a proxy action.
     * @param ctx The request context to execute the action on.
     * @param action The action to execute.
     * @private
     */
    async executeProxy(ctx: RequestContext, action: Proxy): Promise<void> {
        const proxyReqUrl = new URL(action.url, `${ctx.request.protocol}://${ctx.request.host}`);

        // Preserve host header from original request by default, otherwise use host from proxyUrl
        const proxyHostHeader = action.preserveHostHeader !== false ? ctx.request.host.toString() : proxyReqUrl.hostname;
        // Preserve headers from from original request by default, otherwise keep them empty
        const proxyHeaders = action.preserveHeaders !== false ? { ...ctx.request.headers } : {};
        // Preserve path from from original request by default, otherwise use path from proxyUrl
        const proxyPath = action.preservePath !== false ? ctx.request.path : proxyReqUrl.pathname || '/';
        // Preserve query params from original request by default, otherwise use params from proxyUrl
        const proxyQuery = action.preserveQuery !== false ? ctx.request.url.search : proxyReqUrl.search || '';
        const proxyTimeout = Math.max(ctx.config.timeout * 1000, 500);

        return new Promise((resolve, reject) => {
            const requestOptions: https.RequestOptions = {
                path: `${proxyPath}${proxyQuery}`.replace(/\/+/g, '/'), // remove double slashes
                method: ctx.request.method,
                headers: {
                    ...proxyHeaders,
                    host: proxyHostHeader,
                },
                rejectUnauthorized: !action.verifyTls,
                timeout: proxyTimeout,
            };

            // We need to use http/https libs instead of fetch,
            // because there's no way to get raw compressed response body from fetch without decompressing it.
            const proxyReq = (proxyReqUrl.protocol === 'https:' ? https : http).request(proxyReqUrl, requestOptions, (proxyRes) => {
                // Forward status code
                ctx.response.statusCode = proxyRes.statusCode || 500;

                // Forward headers, converting undefined values to empty strings
                const headers: Record<string, string | string[]> = {};
                for (const [key, value] of Object.entries(proxyRes.headers)) {
                    if (value !== undefined) {
                        headers[key] = value;
                    }
                }
                // Merge headers from origin with existing headers in the response
                ctx.response.setHeaders({
                    ...ctx.response.headers,
                    ...headers,
                });

                proxyRes.on('data', (chunk) => ctx.response.write(chunk));
                proxyRes.on('end', () => resolve());
            });

            proxyReq.on('error', (error) => {
                logger.error(`[Router][ProxyError]: ${error.message}`);
                reject(error);
            });

            proxyReq.on('timeout', () => {
                proxyReq.destroy();
                reject(
                    new ProjectTimeoutError(
                        `The ${BRAND} failed to fetch response from your application on '${proxyReqUrl}' within ${proxyTimeout / 1000} seconds. Please check the project logs for more details.`,
                        {
                            stack: new Error().stack,
                        },
                    ),
                );
            });

            // Only send body for non-GET/HEAD requests
            if (!['GET', 'HEAD'].includes(ctx.request.method) && ctx.request.body) {
                proxyReq.write(ctx.request.body);
            }

            proxyReq.end();
        });
    }

    /**
     * Executes a serve asset action.
     * @param ctx The request context to execute the action on.
     * @param action The action to execute.
     * @private
     */
    async executeServeAsset(ctx: RequestContext, action: ServeAsset | ServePermanentAsset, bucketUrl: string = ASSETS_URL): Promise<void> {
        let assetPath = action.path || ctx.request.path;

        // If path doesn't end with a file extension, add index.html to it
        // Example:
        // /assets/css/style.css => /assets/css/style.css
        // /images -> /images/index.html
        if (!assetPath.match(/\.[^.]+$/)) {
            assetPath = `${assetPath}/index.html`;
        }

        // Constuct the final destination of asset
        // e.g. http://ownstak-001e5052-fbb2-4811-b389-79f03e220f3d-assets.s3.amazonaws.com/1/index.html
        const assetFolder = isServeAssetAction(action) ? ASSETS_FOLDER : PERMANENT_ASSETS_FOLDER;
        const assetUrl = `${bucketUrl}/${assetFolder}/${assetPath}`.replace(/(?<!:)\/+/g, '/');

        // If the request is coming from the ownstak-proxy, we need to redirect to the S3 bucket
        if (ctx.request.getHeader(HEADERS.XOwnProxy)) {
            ctx.response.setHeader(HEADERS.Location, assetUrl);
            // Tell the ownstak-proxy to follow the redirect to the S3 bucket
            ctx.response.setHeader(HEADERS.XOwnFollowRedirect, 'true');
            // Tell the ownstak-proxy to merge headers from this response with the headers from the S3 responses.
            // Conflicting headers are overridden by the headers from the S3 responses.
            ctx.response.setHeader(HEADERS.XOwnMergeHeaders, 'true');
            // Preserve any custom status codes (proxy doesn't require redirect status codes, just the location header)
            // This allows to serve static 404.html not found page from S3 with 404 status code
            ctx.response.setHeader(HEADERS.XOwnMergeStatus, 'true');
            return;
        }

        // Otherwise, we need to proxy the request to the S3 bucket
        return this.executeProxy(ctx, {
            url: assetUrl,
            type: 'proxy',
            preserveHostHeader: false,
            preserveHeaders: false,
            preservePath: false,
            preserveQuery: false,
        });
    }

    /**
     * Executes a serve permanent asset action.
     * @param ctx The request context to execute the action on.
     * @param action The action to execute.
     * @private
     */
    async executeServePermanentAsset(ctx: RequestContext, action: ServePermanentAsset): Promise<void> {
        return this.executeServeAsset(ctx, action, PERMANENT_ASSETS_URL);
    }

    /**
     * Executes a serve app action.
     * @param ctx The request context to execute the action on.
     * @param action The action to execute.
     * @private
     */
    async executeServeApp(ctx: RequestContext, _action: RouteAction): Promise<void> {
        return this.executeProxy(ctx, {
            url: APP_URL,
            type: 'proxy',
        });
    }

    /**
     * Executes a redirect action.
     * @param ctx The request context to execute the action on.
     * @param action The action to execute.
     * @private
     */
    async executeRedirect(ctx: RequestContext, action: Redirect): Promise<void> {
        ctx.response.statusCode = action.statusCode;
        ctx.response.setHeader(HEADERS.Location, substitutePathToRegexpParams(action.to, ctx.request.params));
    }

    /**
     * Executes a rewrite action.
     * @param action The action to execute.
     * @param request The request to rewrite.
     * @private
     */
    async executeRewrite(ctx: RequestContext, action: Rewrite): Promise<void> {
        const pathBefore = ctx.request.path;

        if (action.from && typeof action.from === 'string' && action.from.includes(':')) {
            const fromRegex = pathToRegexp(action.from).pathRegex;
            const fromParams = extractPathToRegexpParams(action.from, pathBefore);
            const to = substitutePathToRegexpParams(action.to, fromParams);
            ctx.request.path = ctx.request.path.replace(fromRegex, to);
        }
        if (action.from && typeof action.from === 'string') {
            ctx.request.path = ctx.request.path.replace(action.from, action.to);
        }
        if (action.from && action.from instanceof RegExp) {
            ctx.request.path = ctx.request.path.replace(action.from, action.to);
        }
        if (!action.from) {
            ctx.request.path = action.to;
        }
        logger.debug(`[Router][Rewrite]: ${action.from ? action.from.toString() : 'no from'} ${pathBefore} => ${ctx.request.path}`);
    }

    /**
     * Executes an echo action.
     * @param ctx The request context to execute the action on.
     * @param action The action to execute.
     * @private
     */
    async executeEcho(ctx: RequestContext, _action: RouteAction): Promise<void> {
        ctx.response.setHeader(HEADERS.ContentType, 'application/json');
        ctx.response.body = JSON.stringify(
            {
                req: {
                    url: ctx.request.url.toString(),
                    path: ctx.request.path,
                    method: ctx.request.method,
                    headers: ctx.request.headers,
                    query: ctx.request.url.searchParams,
                    body: ctx.request.body?.toString(),
                    host: ctx.request.host,
                    protocol: ctx.request.protocol,
                },
                originalEvent: ctx.request.originalEvent,
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
     * @param ctx The request context to execute the action on.
     * @param action The action to execute.
     * @private
     */
    async executeImageOptimizer(ctx: RequestContext, _action: RouteAction): Promise<void> {
        const imageUrl = ctx.request.url.searchParams.get('url');
        if (!imageUrl) {
            ctx.response.clear();
            ctx.response.statusCode = 400;
            ctx.response.body = 'The image URL is required';
            return;
        }

        const parsedUrl = new URL(imageUrl, `http://${ctx.request.host}`);
        if (parsedUrl.pathname.startsWith(INTERNAL_PATH_PREFIX)) {
            ctx.response.clear();
            ctx.response.statusCode = 400;
            ctx.response.body = `The image URL cannot point back to the ${INTERNAL_PATH_PREFIX} path`;
            return;
        }

        if (parsedUrl.host !== ctx.request.host) {
            ctx.response.clear();
            ctx.response.statusCode = 400;
            ctx.response.body = `The image URL must be relative or point to the same domain: ${ctx.request.host}`;
            return;
        }

        // Rewrite path to new URL, preserve path and query params
        ctx.request.url.pathname = parsedUrl.pathname;
        ctx.request.url.search = parsedUrl.search;

        await this.executeProxy(ctx, {
            url: parsedUrl.toString(),
            type: 'proxy',
            preserveHostHeader: false,
            preserveHeaders: false,
        });
        if (ctx.response.getHeader(HEADERS.Location)) {
            return;
        }
        const contentType = ctx.response.getHeader(HEADERS.ContentType)?.toString();
        if (!contentType || !contentType.startsWith('image/')) {
            ctx.response.clear();
            ctx.response.statusCode = 400;
            ctx.response.body = 'The fetched resource is not an image';
            return;
        }
    }

    /**
     * Executes function in Node.js environment
     * @param ctx The request context to execute the action on.
     * @param action The action to execute.
     * @private
     */
    async executeNodeFunction(ctx: RequestContext, action: NodeFunction): Promise<void> {
        const path = resolve(action.path);
        const module = await import(`file://${path}`);
        const fn = module.default?.default || module.default || module;
        if (typeof fn !== 'function') {
            throw new Error(`Default export of '${path}' is not a function`);
        }
        await fn(ctx.request, ctx.response);
    }

    /**
     * Executes a health check action.
     * @param ctx The request context to execute the action on.
     * @param action The action to execute.
     * @private
     */
    async executeHealthCheck(ctx: RequestContext, _action: RouteAction): Promise<void> {
        ctx.response.statusCode = 200;
        ctx.response.body = 'OK';
    }
}
