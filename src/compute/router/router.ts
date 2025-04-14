import { Route, RouteAction, isProxyAction, isSetResponseHeaderAction, isSetRequestHeaderAction, isServeAssetAction, isServePersistentAssetAction, isServeAppAction, SetResponseHeader, SetRequestHeader} from "./route.js";
import { Request } from "./request.js";
import { Response } from "./response.js";
import { logger } from "../../logger.js";
import { readFile } from "fs/promises";
import { resolve } from "path";
import { ASSETS_PORT, PERSISTENT_ASSETS_PORT, APP_PORT, ASSETS_URL, PERSISTENT_ASSETS_URL, APP_URL } from "../../constants.js";

export class Router {
    routes: Route[] = [];

    addRoute(route: Route) {
        this.routes.push(route);
    }
    
    async execute(request: Request): Promise<Response> {
        const response = new Response();
        const matchedRoutes = this.matchRoutes(request);
        logger.debug(`[Router][MatchedRoutes]: ${request.method} ${request.url.toString()} => Matched ${matchedRoutes.length} routes`);
        for(const route of matchedRoutes) {
            await this.executeRoute(route, request, response);
            if(route.done) break;
        }
        return response;
    }

    async executeRoute(route: Route, request: Request, response: Response): Promise<void> {
        for(const action of route.actions || []) {
            await this.executeRouteAction(action, request, response);
        }
    }

    async executeRouteAction(action: RouteAction, request: Request, response: Response): Promise<void> {
        if(isSetResponseHeaderAction(action)) {
            return this.executeSetResponseHeader(action, response);
        }
        if(isSetRequestHeaderAction(action)) {
            return this.executeSetRequestHeader(action, request);
        }
        if(isProxyAction(action)) {
            return this.executeProxy(action.url, request, response);
        }
        if(isServeAssetAction(action)) {
            return this.executeServeAsset(action.path, request, response);
        }
        if(isServePersistentAssetAction(action)) {
            return this.executeServePersistentAsset(action.path, request, response);
        }
        if(isServeAppAction(action)) {
            return this.executeServeApp(request, response);
        }
    }

    matchRoutes(request: Request): Route[] {
        return this.routes.filter(route => this.matchRoute(route, request));
    }

    matchRoute(route: Route, request: Request): boolean {
        const condition = route.condition;
        if(!condition) {
            return true;
        }
        if(condition.url && typeof condition.url === "string") {
            return request.url.toString() === condition.url || `${request.url.toString()}/` === condition.url;
        }
        if(condition.url && Array.isArray(condition.url)) {
            return condition.url.some(url => request.url.toString() === url || `${request.url.toString()}/` === url);
        }
        if(condition.url && condition.url instanceof RegExp) {
            return condition.url.test(request.url.toString()) || condition.url.test(`${request.url.toString()}/`);
        }
        if(condition.path && typeof condition.path === "string") {
            return request.path === condition.path || `${request.path}/` === condition.path;
        }
        if(condition.path && Array.isArray(condition.path)) {
            return condition.path.some(path => request.path === path || `${request.path}/` === path);
        }
        if(condition.path && condition.path instanceof RegExp) {
            return condition.path.test(request.path) || condition.path.test(`${request.path}/`);
        }
        if(condition.method && typeof condition.method === "string") {
            return request.method.toLowerCase() === condition.method.toLowerCase();
        }
        if(condition.method && Array.isArray(condition.method)) {
            return condition.method.some(method => request.method.toLowerCase() === method.toLowerCase());
        }
        if(condition.method && condition.method instanceof RegExp) {
            return condition.method.test(request.method);
        }
        return false;
    }

    async executeSetResponseHeader(action: SetResponseHeader, response: Response): Promise<void> {
        response.headers[action.key] = action.value;
    }

    async executeSetRequestHeader(action: SetRequestHeader, request: Request): Promise<void> {
        request.headers[action.key] = action.value;
    }

    async executeProxy(proxyUrl: string, request: Request, response: Response): Promise<void> {
        const proxyReqUrl = new URL(`${request.path}${request.url.search}`, proxyUrl);
        logger.debug(`[Router][ProxyRequest]: ${proxyUrl} => ${proxyReqUrl}`);
        const proxyReqHeaders = Object.fromEntries(
            Object.entries(request.headers).map(([key, value]) => [
                key,
                Array.isArray(value) ? value[0] : value || ""
            ])
        );
        const proxyRes = await fetch(proxyReqUrl, {
            method: request.method,
            headers: proxyReqHeaders,
            body: ["GET","HEAD"].includes(request.method) ? null : request.body,
        });
        const proxyResBody = Buffer.from(await proxyRes.arrayBuffer())
        const proxyResHeaders: Record<string, string | string[]> = {};
        proxyRes.headers.forEach((value, key) => {
            proxyResHeaders[key] = value;
        });
        delete proxyResHeaders["content-encoding"];
        response.statusCode = proxyRes.status;
        response.body = proxyResBody;
        response.headers = proxyResHeaders;
        logger.debug(`[Router][ProxyResponse]: ${response.statusCode} ${response.body.length} bytes`);
    }

    async executeServeAsset(assetPath: string, request: Request, response: Response): Promise<void> {
        request.url.pathname = assetPath;
        if(request.headers["x-own-proxy"]) {
            response.headers["location"] = `${ASSETS_URL}/${assetPath}`.replace(/\/+/g, '/');
            response.headers["x-own-follow-redirect"] = "true";
            response.statusCode = 302;
            return;
        }
        return this.executeProxy(`${ASSETS_URL}`, request, response);
    }

    async executeServePersistentAsset(assetPath: string, request: Request, response: Response): Promise<void> {
        request.url.pathname = assetPath;
        if(request.headers["x-own-proxy"]) {
            response.headers["location"] = `${PERSISTENT_ASSETS_URL}/${assetPath}`.replace(/\/+/g, '/');
            response.headers["x-own-follow-redirect"] = "true";
            response.statusCode = 302;
            return;
        }
        return this.executeProxy(`${PERSISTENT_ASSETS_URL}`, request, response);
    }

    async executeServeApp(request: Request, response: Response): Promise<void> {
        return this.executeProxy(APP_URL, request, response);
    }
}