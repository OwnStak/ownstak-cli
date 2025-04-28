import * as packageJson from '../package.json' with { type: 'json' };
import { normalizePath } from './utils/pathUtils.js';
import { resolve } from 'path';

export const NAME = packageJson.default.name;
export const VERSION = packageJson.default.version;
export const DESCRIPTION = packageJson.default.description;
export const BRAND = 'OwnStak';
export const SUPPORT_URL = `https://ownstak.com/support`;
export const NAME_SHORT = 'ownstak';

export const INPUT_CONFIG_FILE = 'ownstak.config.js';
export const OUTPUT_CONFIG_FILE = 'ownstak.config.json';

export const HOME_DIR = process.env.HOME || process.env.HOMEPATH || process.cwd();
export const CLI_CONFIG_DIR = '.ownstak';
export const CLI_CONFIG_FILE = 'ownstak.cli.json';
export const CLI_CONFIG_FILE_PATH = normalizePath(resolve(HOME_DIR, CLI_CONFIG_DIR, CLI_CONFIG_FILE));

export const BUILD_DIR = '.ownstak';
export const COMPUTE_DIR = `${BUILD_DIR}/compute`;
export const APP_DIR = `${BUILD_DIR}/compute/app`;
export const PROXY_DIR = `${BUILD_DIR}/proxy`;
export const ASSETS_DIR = `${BUILD_DIR}/assets`;
export const PERSISTENT_ASSETS_DIR = `${BUILD_DIR}/persistent-assets`;
export const DEBUG_DIR = `${BUILD_DIR}/debug`;

export const BUILD_DIR_PATH = normalizePath(resolve(BUILD_DIR));
export const COMPUTE_DIR_PATH = normalizePath(resolve(COMPUTE_DIR));
export const APP_DIR_PATH = normalizePath(resolve(APP_DIR));
export const PROXY_DIR_PATH = normalizePath(resolve(PROXY_DIR));
export const ASSETS_DIR_PATH = normalizePath(resolve(ASSETS_DIR));
export const PERSISTENT_ASSETS_DIR_PATH = normalizePath(resolve(PERSISTENT_ASSETS_DIR));
export const DEBUG_DIR_PATH = normalizePath(resolve(DEBUG_DIR));

export const ASSETS_MANIFEST_FILE = 'assets.manifest.json';
export const ASSETS_MANIFEST_FILE_PATH = normalizePath(resolve(BUILD_DIR, ASSETS_MANIFEST_FILE));
export const PERSISTENT_ASSETS_MANIFEST_FILE = 'persistent-assets.manifest.json';
export const PERSISTENT_ASSETS_MANIFEST_FILE_PATH = normalizePath(resolve(BUILD_DIR, PERSISTENT_ASSETS_MANIFEST_FILE));

// Default ports
// The CLI will try to find the nearest free port if the specified port is already in use.
export const HOST = process.env.HOST || '0.0.0.0';
export const PORT = Number(process.env.PORT || 3000);
export const ASSETS_PORT = Number(process.env.ASSETS_PORT || PORT + 1);
export const PERSISTENT_ASSETS_PORT = Number(process.env.PERSISTENT_ASSETS_PORT || PORT + 2);
export const APP_PORT = Number(process.env.APP_PORT || PORT + 100);

// Default URLs for our proxy
// These should be provided as ENV variables to lambda:
// OWNSTAK_ASSETS_HOST=http://ownstak-nextjs-assets.s3.amazonaws.com
// OWNSTAK_ASSETS_FOLDER=deployment-123
// OWNSTAK_PERSISTENT_ASSETS_HOST=http://ownstak-nextjs-persistent-assets.s3.amazonaws.com
export const ASSETS_FOLDER = process.env.OWNSTAK_ASSETS_FOLDER || '/'; // e.g. /deployment-123
export const APP_URL = process.env.OWNSTAK_APP_HOST ? `http://${process.env.OWNSTAK_APP_HOST}` : `http://${HOST}:${APP_PORT}`;
export const ASSETS_URL = process.env.OWNSTAK_ASSETS_HOST
    ? `http://${process.env.OWNSTAK_ASSETS_HOST}${ASSETS_FOLDER}`
    : `http://${HOST}:${ASSETS_PORT}${ASSETS_FOLDER}`.replace(/(?<!:)\/+/g, '/');
export const PERSISTENT_ASSETS_URL = process.env.OWNSTAK_PERSISTENT_ASSETS_HOST
    ? `http://${process.env.OWNSTAK_PERSISTENT_ASSETS_HOST}`
    : `http://${HOST}:${PERSISTENT_ASSETS_PORT}`;

// Supported frameworks
export const FRAMEWORKS = {
    NextJs: 'nextjs',
    Astro: 'astro',
    Static: 'static',
} as const;

// Supported runtimes
export const RUNTIMES = {
    Nodejs22: 'nodejs22.x',
    Nodejs20: 'nodejs20.x',
    Nodejs18: 'nodejs18.x',
};

// This is prefix for all our internal endpoints.
// For example: /__ownstak__/health, /__ownstak__/image etc...
// This needs to be in sync with ownstak-proxy
export const INTERNAL_PATH_PREFIX = '/__ownstak__';
export const HEADERS = {
    Host: 'host',
    Cookie: 'cookie',
    SetCookie: 'set-cookie',
    Location: 'location',
    ContentType: 'content-type',
    ContentLength: 'content-length',
    ContentEncoding: 'content-encoding',
    XForwardedHost: 'x-forwarded-host',
    XForwardedProto: 'x-forwarded-proto',
    XForwardedPort: 'x-forwarded-port',
    XForwardedFor: 'x-forwarded-for',
    CacheControl: 'cache-control',
    // Custom headers
    // Below headers needs to be in sync with ownstak-proxy
    XOwnProxy: 'x-own-proxy',
    XOwnProxyVersion: 'x-own-proxy-version',
    XOwnFollowRedirect: 'x-own-follow-redirect',
    XOwnLambdaName: 'x-own-lambda-name',
    XOwnLambdaRegion: 'x-own-lambda-region',
    XOwnLambdaDuration: 'x-own-lambda-duration',
    XOwnMergeHeaders: 'x-own-merge-headers',
    XOwnActions: 'x-own-actions',
};

export const CACHE_CONTROL_CONFIG = {
    prerenderedPages: `public, max-age=0, s-maxage=3600, no-store`, // cache pre-rendered pages for 1 hour by the CDN and never in the browser
    assets: `public, max-age=3600, s-maxage=31536000, no-store`, // cache assets for 1 hour in the browser and 1 year by the CDN
    persistentAssets: `public, max-age=86400, s-maxage=31536000, immutable`, // cache persistent assets for 1 day in the browser and 1 year by the CDN
} as const;
