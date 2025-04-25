import {
    RouteAction,
    Proxy,
    SetResponseHeader,
    SetRequestHeader,
    AddResponseHeader,
    AddRequestHeader,
    DeleteResponseHeader,
    DeleteRequestHeader,
    Redirect,
    Rewrite,
    ServeAsset,
    ServePersistentAsset,
    ServeApp,
    Echo,
    ImageOptimizer,
    SetResponseStatus,
} from './routeAction.js';

export class RouteActionsCreator {
    actions: RouteAction[] = [];

    setResponseHeader(key: string, value: string, options: Omit<SetResponseHeader, 'type' | 'key' | 'value'> = {}) {
        this.actions.push({ type: 'setResponseHeader', key, value, ...options });
        return this;
    }

    setRequestHeader(key: string, value: string, options: Omit<SetRequestHeader, 'type' | 'key' | 'value'> = {}) {
        this.actions.push({ type: 'setRequestHeader', key, value, ...options });
        return this;
    }

    addResponseHeader(key: string, value: string, options: Omit<AddResponseHeader, 'type' | 'key' | 'value'> = {}) {
        this.actions.push({ type: 'addResponseHeader', key, value, ...options });
        return this;
    }

    addRequestHeader(key: string, value: string, options: Omit<AddRequestHeader, 'type' | 'key' | 'value'> = {}) {
        this.actions.push({ type: 'addRequestHeader', key, value, ...options });
        return this;
    }

    deleteResponseHeader(key: string, options: Omit<DeleteResponseHeader, 'type' | 'key'> = {}) {
        this.actions.push({ type: 'deleteResponseHeader', key, ...options });
        return this;
    }

    deleteRequestHeader(key: string, options: Omit<DeleteRequestHeader, 'type' | 'key'> = {}) {
        this.actions.push({ type: 'deleteRequestHeader', key, ...options });
        return this;
    }

    setResponseStatus(statusCode: number, options: Omit<SetResponseStatus, 'type' | 'statusCode'> = {}) {
        this.actions.push({ type: 'setResponseStatus', statusCode, ...options });
        return this;
    }

    redirect(to: string, statusCode: number = 302, options: Omit<Redirect, 'type' | 'to' | 'statusCode'> = {}) {
        this.actions.push({ type: 'redirect', to, statusCode, ...options });
        return this;
    }

    rewrite(from: string, to: string, options: Omit<Rewrite, 'type' | 'from' | 'to'> = {}) {
        this.actions.push({ type: 'rewrite', from, to, ...options });
        return this;
    }

    proxy(url: string, options: Omit<Proxy, 'type' | 'url'> = {}) {
        this.actions.push({ type: 'proxy', url, ...options });
        return this;
    }

    serveAsset(path?: string, options: Omit<ServeAsset, 'type' | 'path'> = {}) {
        this.actions.push({ type: 'serveAsset', path, ...options });
        return this;
    }

    servePersistentAsset(path?: string, options: Omit<ServePersistentAsset, 'type' | 'path'> = {}) {
        this.actions.push({ type: 'servePersistentAsset', path, ...options });
        return this;
    }

    serveApp(options: Omit<ServeApp, 'type'> = {}) {
        this.actions.push({ type: 'serveApp', ...options });
        return this;
    }

    echo(options: Omit<Echo, 'type'> = {}) {
        this.actions.push({ type: 'echo', ...options });
        return this;
    }

    imageOptimizer(options: Omit<ImageOptimizer, 'type'> = {}) {
        this.actions.push({ type: 'imageOptimizer', ...options });
        return this;
    }
}
