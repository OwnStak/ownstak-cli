import {
    Route,
    RouteAction,
    isProxyAction,
    isSetResponseHeaderAction,
    isSetRequestHeaderAction,
    isServeAssetAction,
    isServePersistentAssetAction,
    isServeAppAction,
    SetResponseHeader,
    SetRequestHeader,
    isRedirectAction,
    Redirect,
    isRewriteAction,
    Rewrite,
    RouteCondition,
    Proxy,
    ServeAsset,
    ServePersistentAsset,
} from './route.js';
import { Request } from './request.js';
import { Response } from './response.js';
import { logger } from '../../logger.js';
import { ASSETS_URL, PERSISTENT_ASSETS_URL, APP_URL, HEADERS } from '../../constants.js';

export class Router {
    routes: Route[] = [];

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
     */
    addRoute(condition: RouteCondition, actions: RouteAction[], done: boolean = false) {
        this.routes.push({ condition, actions, done });
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
    addRouteFront(condition: RouteCondition, actions: RouteAction[], done: boolean = false) {
        this.routes.unshift({ condition, actions, done });
    }

    /**
     * Executes the router.
     * @param request The request to execute the router on.
     * @returns The response from the router.
     * @private
     */
    async execute(request: Request): Promise<Response> {
        const response = new Response();
        const matchedRoutes = this.matchRoutes(request);
        logger.debug(
            `[Router][MatchedRoutes]: ${request.method} ${request.url.toString()} => Matched ${matchedRoutes.length} routes`,
        );
        for (const route of matchedRoutes) {
            await this.executeRoute(route, request, response);
            if (route.done) break;
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
        if (isSetResponseHeaderAction(action)) {
            return this.executeSetResponseHeader(action, response);
        }
        if (isSetRequestHeaderAction(action)) {
            return this.executeSetRequestHeader(action, request);
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
        if (isServePersistentAssetAction(action)) {
            return this.executeServePersistentAsset(action, request, response);
        }
        if (isServeAppAction(action)) {
            return this.executeServeApp(request, response);
        }
        if (isRedirectAction(action)) {
            return this.executeRedirect(action, response);
        }
    }

    /**
     * Returns the list of all the routes that match the request.
     * @param request The request to match the routes to.
     * @returns The routes that match the request.
     * @private
     */
    matchRoutes(request: Request): Route[] {
        return this.routes.filter((route) => this.matchRoute(route, request));
    }

    /**
     * Returns true if the route matches the request.
     * @param route The route to match.
     * @param request The request to match the route to.
     * @returns True if the route matches the request.
     * @private
     */
    matchRoute(route: Route, request: Request): boolean {
        const condition = route.condition;
        if (!condition) {
            return true;
        }

        let urlMatch = true;
        if (condition.url) {
            if (typeof condition.url === 'string') {
                urlMatch = request.url.toString() === condition.url || request.url.toString() === `${condition.url}/`;
            } else if (Array.isArray(condition.url)) {
                urlMatch = condition.url.some(
                    (url) => request.url.toString() === url || request.url.toString() === `${url}/`,
                );
            } else if (condition.url instanceof RegExp) {
                urlMatch =
                    condition.url.test(request.url.toString()) || condition.url.test(`${request.url.toString()}/`);
            }
        }

        let pathMatch = true;
        if (condition.path) {
            if (typeof condition.path === 'string') {
                pathMatch = request.path === condition.path || request.path === `${condition.path}/`;
            } else if (Array.isArray(condition.path)) {
                pathMatch = condition.path.some((path) => request.path === path || request.path === `${path}/`);
            } else if (condition.path instanceof RegExp) {
                pathMatch = condition.path.test(request.path) || condition.path.test(`${request.path}/`);
            }
        }

        let methodMatch = true;
        if (condition.method) {
            if (typeof condition.method === 'string') {
                methodMatch = request.method.toLowerCase() === condition.method.toLowerCase();
            } else if (Array.isArray(condition.method)) {
                methodMatch = condition.method.some((method) => request.method.toLowerCase() === method.toLowerCase());
            } else if (condition.method instanceof RegExp) {
                methodMatch = condition.method.test(request.method);
            }
        }

        return urlMatch && pathMatch && methodMatch;
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
     * Executes a proxy action.
     * @param action The action to execute.
     * @param request The request to proxy.
     * @param response The response to proxy.
     * @private
     */
    async executeProxy(action: Proxy, request: Request, response: Response): Promise<void> {
        const proxyReqUrl = new URL(`${request.path}${request.url.search}`, action.url);
        logger.debug(`[Router][ProxyRequest]: ${action.url} => ${proxyReqUrl}`);
        const proxyReqHeaders = Object.fromEntries(
            Object.entries(request.headers).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value || '']),
        );
        const proxyRes = await fetch(proxyReqUrl, {
            method: request.method,
            headers: proxyReqHeaders,
            // Only send body for non-GET/HEAD requests,
            // otherwise fetch throws exception even though the body is empty. It needs to be null.
            body: ['GET', 'HEAD'].includes(request.method) ? null : request.body,
        });
        const proxyResBody = Buffer.from(await proxyRes.arrayBuffer());
        const proxyResHeaders: Record<string, string | string[]> = {};
        proxyRes.headers.forEach((value, key) => {
            proxyResHeaders[key] = value;
        });
        delete proxyResHeaders[HEADERS.ContentEncoding];
        response.statusCode = proxyRes.status;
        response.body = proxyResBody;
        response.headers = proxyResHeaders;
        logger.debug(`[Router][ProxyResponse]: ${response.statusCode} ${response.body.length} bytes`);
    }

    /**
     * Executes a serve asset action.
     * @param action The action to execute.
     * @param request The request to serve the asset on.
     * @param response The response to serve the asset on.
     * @private
     */
    async executeServeAsset(action: ServeAsset, request: Request, response: Response): Promise<void> {
        const assetPath = action.path || request.path;
        request.url.pathname = assetPath;
        if (request.headers[HEADERS.XOwnProxy]) {
            response.headers[HEADERS.Location] = `${ASSETS_URL}/${assetPath}`.replace(/\/+/g, '/');
            response.headers[HEADERS.XOwnFollowRedirect] = 'true';
            response.statusCode = 302;
            return;
        }
        return this.executeProxy({ url: ASSETS_URL, type: 'proxy' }, request, response);
    }

    /**
     * Executes a serve persistent asset action.
     * @param action The action to execute.
     * @param request The request to serve the asset on.
     * @param response The response to serve the asset on.
     * @private
     */
    async executeServePersistentAsset(
        action: ServePersistentAsset,
        request: Request,
        response: Response,
    ): Promise<void> {
        const assetPath = action.path || request.path;
        request.url.pathname = assetPath;
        if (request.headers[HEADERS.XOwnProxy]) {
            response.headers[HEADERS.Location] = `${PERSISTENT_ASSETS_URL}/${assetPath}`.replace(/\/+/g, '/');
            response.headers[HEADERS.XOwnFollowRedirect] = 'true';
            response.statusCode = 302;
            return;
        }
        return this.executeProxy({ url: PERSISTENT_ASSETS_URL, type: 'proxy' }, request, response);
    }

    /**
     * Executes a serve app action.
     * @param request The request to serve the app on.
     * @param response The response to serve the app on.
     * @private
     */
    async executeServeApp(request: Request, response: Response): Promise<void> {
        return this.executeProxy({ url: APP_URL, type: 'proxy' }, request, response);
    }

    /**
     * Executes a redirect action.
     * @param action The action to execute.
     * @param response The response to execute the action on.
     * @private
     */
    async executeRedirect(action: Redirect, response: Response): Promise<void> {
        response.statusCode = action.statusCode;
        response.headers[HEADERS.Location] = action.to;
    }

    /**
     * Executes a rewrite action.
     * @param action The action to execute.
     * @param request The request to rewrite.
     * @private
     */
    async executeRewrite(action: Rewrite, request: Request): Promise<void> {
        const before = request.url.pathname;
        if (action.from && typeof action.from === 'string') {
            request.url.pathname = request.url.pathname.replace(action.from, action.to);
        }
        if (action.from && action.from instanceof RegExp) {
            request.url.pathname = request.url.pathname.replace(action.from, action.to);
        }
        if (!action.from) {
            request.url.pathname = action.to;
        }
        logger.debug(
            `[Router][Rewrite]: ${action.from ? action.from.toString() : 'no from'} ${before} => ${request.url.pathname}`,
        );
    }
}
