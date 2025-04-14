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

export interface Proxy extends BaseRouteAction {
    type: 'proxy';
    url: string;
}

export interface serveAsset extends BaseRouteAction {
    type: 'serveAsset';
    path: string;
}

export interface servePersistentAsset extends BaseRouteAction {
    type: 'servePersistentAsset';
    path: string;
}

export interface serveApp extends BaseRouteAction {
    type: 'serveApp';
}

export type RouteAction = BaseRouteAction & (Proxy | SetResponseHeader | SetRequestHeader | serveAsset | servePersistentAsset | serveApp);

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

export function isServeAppAction(action: RouteAction): action is serveApp {
    return action.type === 'serveApp';
}

export function isServeAssetAction(action: RouteAction): action is serveAsset {
    return action.type === 'serveAsset';
}

export function isServePersistentAssetAction(action: RouteAction): action is servePersistentAsset {
    return action.type === 'servePersistentAsset';
}

export function isSetResponseHeaderAction(action: RouteAction): action is SetResponseHeader {
    return action.type === 'setResponseHeader';
}

export function isSetRequestHeaderAction(action: RouteAction): action is SetRequestHeader {
    return action.type === 'setRequestHeader';
}