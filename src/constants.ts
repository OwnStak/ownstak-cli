import os from 'os';
import { normalizePath } from './utils/pathUtils.js';
import { resolve } from 'path';

export const NAME = '@ownstak/cli';
export const NAME_SHORT = 'ownstak';
export const DESCRIPTION = 'OwnStak CLI';

export const BRAND = 'OwnStak';
export const SUPPORT_URL = `https://ownstak.com/support`;

export const CONSOLE_URL = 'https://console.ownstak.com';
export const CONSOLE_API_URL = 'https://api.ownstak.com';
export const CONSOLE_API_URL_DEV = 'https://dev.ownstak.com';
export const CONSOLE_API_URL_STAGE = 'https://stage.ownstak.com';
export const CONSOLE_API_URL_LOCAL = 'http://127.0.0.1:5173';

export const INPUT_CONFIG_FILE = 'ownstak.config.js';
export const OUTPUT_CONFIG_FILE = 'ownstak.config.json';

export const HOME_DIR = os.homedir();
export const CLI_CONFIG_DIR = '.ownstak';
export const CLI_CONFIG_FILE = 'ownstak.cli.json';
export const CLI_CONFIG_FILE_PATH = normalizePath(resolve(HOME_DIR, CLI_CONFIG_DIR, CLI_CONFIG_FILE));

export const BUILD_DIR = '.ownstak';
export const COMPUTE_DIR = `${BUILD_DIR}/compute`;
export const APP_DIR = `${BUILD_DIR}/compute/app`;
export const PROXY_DIR = `${BUILD_DIR}/proxy`;
export const ASSETS_DIR = `${BUILD_DIR}/assets`;
export const PERMANENT_ASSETS_DIR = `${BUILD_DIR}/permanent-assets`;
export const DEBUG_DIR = `${BUILD_DIR}/debug`;

export const BUILD_DIR_PATH = normalizePath(resolve(BUILD_DIR));
export const COMPUTE_DIR_PATH = normalizePath(resolve(COMPUTE_DIR));
export const APP_DIR_PATH = normalizePath(resolve(APP_DIR));
export const PROXY_DIR_PATH = normalizePath(resolve(PROXY_DIR));
export const ASSETS_DIR_PATH = normalizePath(resolve(ASSETS_DIR));
export const PERMANENT_ASSETS_DIR_PATH = normalizePath(resolve(PERMANENT_ASSETS_DIR));
export const DEBUG_DIR_PATH = normalizePath(resolve(DEBUG_DIR));

export const ASSETS_MANIFEST_FILE = 'assets.manifest.json';
export const ASSETS_MANIFEST_FILE_PATH = normalizePath(resolve(COMPUTE_DIR, ASSETS_MANIFEST_FILE));
export const PERMANENT_ASSETS_MANIFEST_FILE = 'permanent-assets.manifest.json';
export const PERMANENT_ASSETS_MANIFEST_FILE_PATH = normalizePath(resolve(COMPUTE_DIR, PERMANENT_ASSETS_MANIFEST_FILE));

// Default ports
// The CLI will try to find the nearest free port if the specified port is already in use.
export const HOST = process.env.HOST || '0.0.0.0';
export const PORT = Number(process.env.PORT || 3000);
export const ASSETS_PORT = Number(process.env.ASSETS_PORT || PORT + 1);
export const PERMANENT_ASSETS_PORT = Number(process.env.PERMANENT_ASSETS_PORT || PORT + 2);
export const APP_PORT = Number(process.env.APP_PORT || PORT + 100);

// Default URLs for our proxy
// These should be provided as ENV variables to lambda:
// OWNSTAK_ASSETS_HOST=http://ownstak-nextjs-assets.s3.amazonaws.com
// OWNSTAK_ASSETS_FOLDER=deployment-123
// OWNSTAK_PERMANENT_ASSETS_HOST=http://ownstak-nextjs-permanent-assets.s3.amazonaws.com
export const ASSETS_FOLDER = process.env.OWNSTAK_ASSETS_FOLDER || '/'; // e.g. /deployment-123
export const PERMANENT_ASSETS_FOLDER = process.env.OWNSTAK_PERMANENT_ASSETS_FOLDER || '/'; // e.g. /
export const APP_URL = process.env.OWNSTAK_APP_HOST ? `http://${process.env.OWNSTAK_APP_HOST}` : `http://${HOST}:${APP_PORT}`;
export const ASSETS_URL = process.env.OWNSTAK_ASSETS_HOST ? `http://${process.env.OWNSTAK_ASSETS_HOST}` : `http://${HOST}:${ASSETS_PORT}`;
export const PERMANENT_ASSETS_URL = process.env.OWNSTAK_PERMANENT_ASSETS_HOST
    ? `http://${process.env.OWNSTAK_PERMANENT_ASSETS_HOST}`
    : `http://${HOST}:${PERMANENT_ASSETS_PORT}`;

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

// Supported architectures
export const ARCHS = {
    X86_64: 'x86_64',
    ARM64: 'arm64',
} as const;

// Default request/lambda timeout
export const DEFAULT_TIMEOUT = 20;

// Default memory for lambda in MiB
export const DEFAULT_MEMORY = 1024;

// Default environment name
export const DEFAULT_ENVIRONMENT = 'default';

// This is prefix for all our internal endpoints.
// For example: /__ownstak__/health, /__ownstak__/image etc...
// This needs to be in sync with ownstak-proxy
export const INTERNAL_PATH_PREFIX = '/__ownstak__';
export const HEADERS = {
    Host: 'host',
    Cookie: 'cookie',
    SetCookie: 'set-cookie',
    UserAgent: 'user-agent',
    Location: 'location',
    ContentType: 'content-type',
    ContentLength: 'content-length',
    ContentEncoding: 'content-encoding',
    XForwardedHost: 'x-forwarded-host',
    XForwardedProto: 'x-forwarded-proto',
    XForwardedPort: 'x-forwarded-port',
    XForwardedFor: 'x-forwarded-for',
    CacheControl: 'cache-control',
    Authorization: 'authorization',

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
    XOwnImageOptimizer: 'x-own-image-optimizer',
    XOwnImageOptimizerError: 'x-own-image-optimizer-error',
};

export const CACHE_CONTROL_CONFIG = {
    prerenderedPages: `public, max-age=0, s-maxage=3600`, // cache pre-rendered pages for 1 hour by the CDN and never in the browser
    assets: `public, max-age=3600, s-maxage=31536000`, // cache assets for 1 hour in the browser and 1 year by the CDN
    permanentAssets: `public, max-age=86400, s-maxage=31536000, immutable`, // cache persistent assets for 1 day in the browser and 1 year by the CDN
} as const;
