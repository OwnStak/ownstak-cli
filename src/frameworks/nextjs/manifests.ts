import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';

export interface Redirect {
    source?: string;
    regex?: string;
    destination: string;
    permanent?: boolean;
    statusCode?: number;
    locale?: string | boolean;
    internal?: boolean;
    has?: Has[];
}

export interface Header {
    source?: string;
    regex?: string;
    has?: Has[];
    missing?: Missing[];
    headers?: Array<{
        key: string;
        value: string;
    }>;
}
export interface RewriteGroups {
    beforeFiles: Rewrite[];
    afterFiles: Rewrite[];
    fallback: Rewrite[];
}

export interface Rewrite {
    source: string;
    regex: string;
    destination: string;
    has?: Has[];
}

// https://nextjs.org/docs/pages/api-reference/config/next-config-js/headers#header-cookie-and-query-matching
export interface Has {
    type: 'header' | 'cookie' | 'query' | 'host';
    key?: string;
    value: string;
}

export type Missing = Has;

export interface Middleware {
    files?: string[];
    name?: string;
    page?: string;
    matchers?: Array<{
        regex: string;
        originalSource: string;
    }>;
}

export interface RoutesManifest {
    pages404?: boolean;
    basePath?: string;
    caseSensitive?: boolean;
    redirects?: Redirect[];
    headers?: Header[];
    rewriteHeaders?: {
        pathHeader?: string;
        queryHeader?: string;
    };
    rewrites?: Rewrite[] | RewriteGroups;
    dynamicRoutes?: {
        [key: string]: {
            page: string;
            regex: string;
            namedRegex: string;
            routeKeys: Record<string, string>;
        };
    };
    staticRoutes?: {
        [key: string]: {
            page: string;
            regex: string;
            namedRegex: string;
            routeKeys: Record<string, string>;
        };
    };
    dataRoutes?: {
        [key: string]: {
            page: string;
            dataRouteRegex: string;
            namedDataRouteRegex: string;
            routeKeys: Record<string, string>;
        };
    };
}

export interface PrerenderManifest {
    routes: {
        [key: string]: {
            initialRevalidateSeconds?: number | boolean;
            initialExpireSeconds?: number;
            srcRoute?: string;
            routeRegex?: string;
            dataRoute?: string;
            dataRouteRegex?: string;
            allowHeader?: string[];
            experimentalBypassFor?: Array<{
                type?: string;
                key?: string;
                value?: string;
            }>;
        };
    };
    dynamicRoutes: {
        [key: string]: {
            initialRevalidateSeconds?: number | boolean;
            initialExpireSeconds?: number;
            srcRoute?: string;
            routeRegex?: string;
            dataRoute?: string;
            dataRouteRegex?: string;
            allowHeader?: string[];
            experimentalBypassFor?: Array<{
                type?: string;
                key?: string;
                value?: string;
            }>;
        };
    };
    preview: {
        previewModeId?: string;
        previewModeSigningKey?: string;
        previewModeEncryptionKey?: string;
    };
}

export interface MiddlewareManifest {
    [key: string]: {
        [key: string]: string;
    };
}

export interface PagesManifest {
    [key: string]: string;
}

export interface AppPathsManifest {
    middleware: {
        [key: string]: {
            files?: string[];
            name?: string;
            page?: string;
            matchers?: Array<{
                regex: string;
                originalSource: string;
            }>;
        };
    };
    sortedMiddleware: string[];
}

export async function getRoutesManifest(distDir = process.cwd()): Promise<RoutesManifest> {
    return getManifest(distDir, 'routes-manifest.json');
}

export async function getPrerenderManifest(distDir = process.cwd()): Promise<PrerenderManifest> {
    return getManifest(distDir, 'prerender-manifest.json');
}

export async function getMiddlewareManifest(distDir = process.cwd()): Promise<MiddlewareManifest> {
    return getManifest(distDir, 'server/middleware-manifest.json');
}

export async function getPagesManifest(distDir = process.cwd()): Promise<PagesManifest> {
    return getManifest(distDir, 'server/pages-manifest.json');
}

export async function getAppPathsManifest(distDir = process.cwd()): Promise<AppPathsManifest> {
    return getManifest(distDir, 'server/app-paths-manifest.json');
}

export async function getManifest(distDir: string, filename: string) {
    const manifestPath = join(distDir, filename);
    if (!existsSync(manifestPath)) {
        return {};
    }
    return JSON.parse(await readFile(manifestPath, 'utf8'));
}
