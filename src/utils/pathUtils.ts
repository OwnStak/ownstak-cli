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
 * @param pathPattern - The path pattern to convert.
 * @returns The regex pattern.
 */
export function pathToRegexp(pathPattern: string) {
    const groupRx = /:([A-Za-z0-9_]+)([?+*]?)/g;

    let match = null,
        lastIndex = 0,
        keys = [],
        result = '';

    while ((match = groupRx.exec(pathPattern)) !== null) {
        const [_, segment, mod] = match;

        // :foo  [1]      (  )
        // :foo? [0 - 1]  ( o)
        // :foo+ [1 - ∞]  (r )
        // :foo* [0 - ∞]  (ro)
        const repeat = mod === '+' || mod === '*';
        const optional = mod === '?' || mod === '*';
        const prefix = optional && pathPattern[match.index - 1] === '/' ? 1 : 0;

        const prev = pathPattern.substring(lastIndex, match.index - prefix);

        keys.push(segment);
        lastIndex = groupRx.lastIndex;

        result += escapeRx(prev) + rxForSegment(repeat, optional, prefix);
    }

    result += escapeRx(pathPattern.substring(lastIndex));

    return {
        pathParams: keys,
        pathRegex: new RegExp('^' + result + '(?:\\/)?$', 'i'),
    };
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
            // Filename cleanup
            // Remove extension from filename
            .replace(/\.(.+)$/, '')
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
