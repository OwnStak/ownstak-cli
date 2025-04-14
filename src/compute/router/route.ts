export interface BaseRouteAction {
    type: string;
}

export interface SetResponseHeader extends BaseRouteAction {
    type: 'setResponseHeader';
    key: string;
    value: string;
}

export interface SetRequestHeader extends BaseRouteAction {
    type: 'setRequestHeader';
    key: string;
    value: string;
}

export interface Redirect extends BaseRouteAction {
    type: 'redirect';
    to: string;
    statusCode: number;
}

export interface Rewrite extends BaseRouteAction {
    type: 'rewrite';
    from?: string | RegExp;
    to: string;
}

export interface Proxy extends BaseRouteAction {
    type: 'proxy';
    url: string;
}

export interface ServeAsset extends BaseRouteAction {
    type: 'serveAsset';
    path?: string;
}

export interface ServePersistentAsset extends BaseRouteAction {
    type: 'servePersistentAsset';
    path?: string;
}

export interface ServeApp extends BaseRouteAction {
    type: 'serveApp';
}

export type RouteAction = BaseRouteAction &
    (Proxy | SetResponseHeader | SetRequestHeader | ServeAsset | ServePersistentAsset | ServeApp | Redirect | Rewrite);

export interface RouteCondition {
    url?: string | string[] | RegExp;
    path?: string | string[] | RegExp;
    method?: string | string[] | RegExp;
}

export interface Route {
    condition?: RouteCondition;
    actions?: RouteAction[];
    done?: boolean;
}

export function isProxyAction(action: RouteAction): action is Proxy {
    return action.type === 'proxy';
}

export function isServeAppAction(action: RouteAction): action is ServeApp {
    return action.type === 'serveApp';
}

export function isServeAssetAction(action: RouteAction): action is ServeAsset {
    return action.type === 'serveAsset';
}

export function isServePersistentAssetAction(action: RouteAction): action is ServePersistentAsset {
    return action.type === 'servePersistentAsset';
}

export function isSetResponseHeaderAction(action: RouteAction): action is SetResponseHeader {
    return action.type === 'setResponseHeader';
}

export function isSetRequestHeaderAction(action: RouteAction): action is SetRequestHeader {
    return action.type === 'setRequestHeader';
}

export function isRedirectAction(action: RouteAction): action is Redirect {
    return action.type === 'redirect';
}

export function isRewriteAction(action: RouteAction): action is Rewrite {
    return action.type === 'rewrite';
}
