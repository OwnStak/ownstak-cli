export interface BaseRouteAction {
    type: string;
    description?: string;
}

export interface SetResponseHeader extends BaseRouteAction {
    type: 'setResponseHeader';
    key: string;
    value: string;
}

export interface SetDefaultResponseHeader extends BaseRouteAction {
    type: 'setDefaultResponseHeader';
    key: string;
    value: string;
}

export interface SetRequestHeader extends BaseRouteAction {
    type: 'setRequestHeader';
    key: string;
    value: string;
}

export interface SetDefaultRequestHeader extends BaseRouteAction {
    type: 'setDefaultRequestHeader';
    key: string;
    value: string;
}

export interface AddResponseHeader extends BaseRouteAction {
    type: 'addResponseHeader';
    key: string;
    value: string;
}

export interface AddRequestHeader extends BaseRouteAction {
    type: 'addRequestHeader';
    key: string;
    value: string;
}

export interface SetResponseStatus extends BaseRouteAction {
    type: 'setResponseStatus';
    statusCode: number;
}

export interface DeleteResponseHeader extends BaseRouteAction {
    type: 'deleteResponseHeader';
    key: string;
}

export interface DeleteRequestHeader extends BaseRouteAction {
    type: 'deleteRequestHeader';
    key: string;
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
    verifyTls?: boolean;
    preserveHostHeader?: boolean;
    preserveHeaders?: boolean;
    preservePath?: boolean;
    preserveQuery?: boolean;
}

export interface ServeAsset extends BaseRouteAction {
    type: 'serveAsset';
    path?: string;
    revalidate?: number;
}

export interface ServePermanentAsset extends BaseRouteAction {
    type: 'servePermanentAsset';
    path?: string;
}

export interface ServeApp extends BaseRouteAction {
    type: 'serveApp';
}

export interface Echo extends BaseRouteAction {
    type: 'echo';
}

export interface ImageOptimizer extends BaseRouteAction {
    type: 'imageOptimizer';
}

export type RouteAction = BaseRouteAction &
    (
        | Proxy
        | SetResponseHeader
        | SetDefaultResponseHeader
        | SetRequestHeader
        | SetDefaultRequestHeader
        | AddResponseHeader
        | AddRequestHeader
        | ServeAsset
        | ServePermanentAsset
        | ServeApp
        | Redirect
        | Rewrite
        | Echo
        | ImageOptimizer
        | SetResponseStatus
        | DeleteResponseHeader
        | DeleteRequestHeader
    );

export function isRouteAction(action: any): action is RouteAction {
    return action && typeof action === 'object' && 'type' in action;
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

export function isServePermanentAssetAction(action: RouteAction): action is ServePermanentAsset {
    return action.type === 'servePermanentAsset';
}

export function isSetResponseHeaderAction(action: RouteAction): action is SetResponseHeader {
    return action.type === 'setResponseHeader';
}

export function isSetRequestHeaderAction(action: RouteAction): action is SetRequestHeader {
    return action.type === 'setRequestHeader';
}

export function isAddResponseHeaderAction(action: RouteAction): action is AddResponseHeader {
    return action.type === 'addResponseHeader';
}

export function isAddRequestHeaderAction(action: RouteAction): action is AddRequestHeader {
    return action.type === 'addRequestHeader';
}

export function isSetResponseStatusAction(action: RouteAction): action is SetResponseStatus {
    return action.type === 'setResponseStatus';
}

export function isDeleteResponseHeaderAction(action: RouteAction): action is DeleteResponseHeader {
    return action.type === 'deleteResponseHeader';
}

export function isDeleteRequestHeaderAction(action: RouteAction): action is DeleteRequestHeader {
    return action.type === 'deleteRequestHeader';
}

export function isSetDefaultResponseHeaderAction(action: RouteAction): action is SetDefaultResponseHeader {
    return action.type === 'setDefaultResponseHeader';
}

export function isSetDefaultRequestHeaderAction(action: RouteAction): action is SetDefaultRequestHeader {
    return action.type === 'setDefaultRequestHeader';
}

export function isRedirectAction(action: RouteAction): action is Redirect {
    return action.type === 'redirect';
}

export function isRewriteAction(action: RouteAction): action is Rewrite {
    return action.type === 'rewrite';
}

export function isEchoAction(action: RouteAction): action is Echo {
    return action.type === 'echo';
}

export function isImageOptimizerAction(action: RouteAction): action is ImageOptimizer {
    return action.type === 'imageOptimizer';
}
