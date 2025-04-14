import * as packageJson from "../package.json" with { type: "json" };
import { normalizePath } from './utils/pathUtils.js';
import { resolve } from 'path';

export const NAME = packageJson.default.name;
export const VERSION = packageJson.default.version;
export const DESCRIPTION = packageJson.default.description;
export const BRAND = 'OwnStak';
export const SUPPORT_URL = `https://ownstak.com/support`;

export const INPUT_CONFIG_FILE = 'ownstak.config.js';
export const OUTPUT_CONFIG_FILE = 'ownstak.config.json';

export const BUILD_DIR = '.ownstak';
export const COMPUTE_DIR = `${BUILD_DIR}/compute`;
export const PROXY_DIR = `${BUILD_DIR}/proxy`;
export const ASSETS_DIR = `${BUILD_DIR}/assets`;
export const PERSISTENT_ASSETS_DIR = `${BUILD_DIR}/persistent-assets`;
export const DEBUG_DIR = `${BUILD_DIR}/debug`;

export const BUILD_DIR_PATH = normalizePath(resolve(BUILD_DIR));
export const COMPUTE_DIR_PATH = normalizePath(resolve(COMPUTE_DIR));
export const PROXY_DIR_PATH = normalizePath(resolve(PROXY_DIR));
export const ASSETS_DIR_PATH = normalizePath(resolve(ASSETS_DIR));
export const PERSISTENT_ASSETS_DIR_PATH = normalizePath(resolve(PERSISTENT_ASSETS_DIR));
export const DEBUG_DIR_PATH = normalizePath(resolve(DEBUG_DIR));
export const ASSETS_MANIFEST_FILE = 'assets-manifest.json';
export const PERSISTENT_ASSETS_MANIFEST_FILE = 'persistent-assets-manifest.json';
export const COMPUTE_MANIFEST_FILE = 'compute-manifest.json';

export const PORT = process.env.PORT || 3000;
export const HOST = process.env.HOST || '127.0.0.1';

export const APP_PORT = Number(PORT) + 1;
export const ASSETS_PORT = Number(PORT) + 2;
export const PERSISTENT_ASSETS_PORT = Number(PORT) + 3;

export const APP_URL = process.env.OWNSTAK_APP_HOST ? `https://${process.env.OWNSTAK_APP_HOST}` : `http:\/\/${HOST}:${APP_PORT}`;
export const ASSETS_URL = process.env.OWNSTAK_ASSETS_HOST ? `https://${process.env.OWNSTAK_ASSETS_HOST}` : `http:\/\/${HOST}:${ASSETS_PORT}`;
export const PERSISTENT_ASSETS_URL = process.env.OWNSTAK_PERSISTENT_ASSETS_HOST ? `https:\/\/${process.env.OWNSTAK_PERSISTENT_ASSETS_HOST}` : `http://${HOST}:${PERSISTENT_ASSETS_PORT}`;
