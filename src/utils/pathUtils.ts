import { normalize } from 'path';
import { join, resolve } from 'path';
import { existsSync } from 'fs';
import { readFile } from 'fs/promises';

/**
 * Normalizes the path and slashes to unix style.
 * This is needed for compatibility with Windows systems.
 * @param path - The path to normalize.
 * @example
 * \my\folder1\..\folder2 -> /my/folder2
 * /my//folder1 -> /my/folder1
 */
export function normalizePath(path: string) {
    return normalize(path).replace(/\\+/g, '/').replace(/\/\/+/g, '/');
}

/**
 * Finds the root of the monorepo.
 * It traverses up the directory tree until it finds a directory with package.json
 * and "workspaces" key in it.
 * @returns The path to the root of the monorepo or undefined if not found
 */
export async function findMonorepoRoot() {
    let currentDir = process.cwd();
    const rootDir = resolve('/');

    while (currentDir !== rootDir) {
        const packageJsonPath = join(currentDir, 'package.json');
        if (existsSync(packageJsonPath)) {
            const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf-8'));
            if (packageJson.workspaces) return currentDir;
        }

        // Move up one directory
        currentDir = resolve(currentDir, '..');
    }
    return undefined;
}

/**
 * Converts express style path pattern to a regex pattern.
 * @param pathToRegexPattern - The path pattern to convert.
 * @returns The regex pattern.
 */
export function pathToRegexp(pathToRegexPattern: string) {
    const groupRx = /:([A-Za-z0-9_]+)([?+*]?)/g;

    let match = null,
        lastIndex = 0,
        keys = [],
        result = '';

    while ((match = groupRx.exec(pathToRegexPattern)) !== null) {
        const [_, segment, mod] = match;

        // :foo  [1]      (  )
        // :foo? [0 - 1]  ( o)
        // :foo+ [1 - ∞]  (r )
        // :foo* [0 - ∞]  (ro)
        const repeat = mod === '+' || mod === '*';
        const optional = mod === '?' || mod === '*';
        const prefix = optional && pathToRegexPattern[match.index - 1] === '/' ? 1 : 0;

        const prev = pathToRegexPattern.substring(lastIndex, match.index - prefix);

        keys.push(segment);
        lastIndex = groupRx.lastIndex;

        result += escapeRx(prev) + rxForSegment(repeat, optional, prefix);
    }

    result += escapeRx(pathToRegexPattern.substring(lastIndex));

    return {
        pathParams: keys,
        pathRegex: new RegExp('^' + result + '(?:\\/)?$', 'i'),
    };
}

/**
 * Extracts the params from the path using the provided pathToRegexp pattern.
 * @param pathToRegexPattern - The path pattern to convert.
 * @param path - The path to extract the params from.
 * @returns The params from the path.
 * @example extractPathToRegexpParams('/users/:id', '/users/123') -> { id: '123' }
 * @example extractPathToRegexpParams('/users/:id*', '/users/123/456') -> { id: ['123', '456'] }
 */
export function extractPathToRegexpParams(pathToRegexPattern: string, path: string) {
    const { pathParams, pathRegex } = pathToRegexp(pathToRegexPattern);
    const match = pathRegex.exec(path);
    if (match) {
        return pathParams.reduce(
            (acc, param, index) => {
                const matchedValue = match[index + 1];
                const matchedValues = matchedValue?.split('/');
                if (matchedValues?.length > 1) {
                    // If the matched value is an array, we need to return an array of strings
                    acc[param] = matchedValues;
                } else {
                    // If the matched value is a undefined/string, just return single value
                    acc[param] = matchedValue;
                }
                return acc;
            },
            {} as Record<string, string | string[]>,
        );
    }
    return {};
}

/**
 * Substitutes the path params in the path-to-regex pattern with the provided params.
 * If no match is found, the string is returned as is.
 * @param pathToRegexPattern - The path-to-regex pattern.
 * @param params - The params to substitute.
 * @returns The path with the substituted params.
 * @example substitutePathToRegexpParams('/products/:id', { id: '123' }) -> '/products/123'
 * @example substitutePathToRegexpParams('/products/:id*', { id: '123' }) -> '/products/123'
 */
export function substitutePathToRegexpParams(pathToRegexPattern: string, params: Record<string, string | string[]>) {
    return pathToRegexPattern.replace(/:(\w+)[?+*]?/g, (match, p1) => {
        const value = params[p1];
        if (Array.isArray(value)) {
            return value.join('/');
        }
        return value || match;
    });
}

/**
 * Transforms the page filename with next.js like syntax
 * to a valid express style syntax.
 * @example /index.tsx -> /
 * @example /about.tsx -> /about
 * @example /about/index.tsx -> /about
 * @example /products/[id].tsx -> /products/:id
 */
export function filenameToPath(filename: string) {
    return (
        filename
            // Remove extension from filename
            .replace(/\.(.+)$/, '')
            // Replace /index with /
            .replace(/\/index$/, '/')
            // Transform express style syntax to Wouter style
            // Error 404 catch all syntax
            .replace(/\/404$/, '/:404*')
            // Optional catch all syntax
            .replace(/\[\[...(\w+)]]/, ':$1*')
            // Catch all syntax
            .replace(/\[(...\w+)]/, ':$1+')
            // Optional param syntax
            .replace(/\[\[(\w+)]]/, ':$1?')
            // Param syntax
            .replace(/\[(\w+)]/, ':$1')
    );
}

// escapes a regexp string (borrowed from path-to-regexp sources)
// https://github.com/pillarjs/path-to-regexp/blob/v3.0.0/index.js#L202
function escapeRx(str: string) {
    return str.replace(/([.+*?=^!:${}()[\]|/\\])/g, '\\$1');
}

// returns a segment representation in RegExp based on flags
// adapted and simplified version from path-to-regexp sources
function rxForSegment(repeat: boolean, optional: boolean, prefix: number) {
    let capture = repeat ? '((?:[^\\/]+?)(?:\\/(?:[^\\/]+?))*)' : '([^\\/]+?)';
    if (optional && prefix) capture = '(?:\\/' + capture + ')';
    return capture + (optional ? '?' : '');
}
