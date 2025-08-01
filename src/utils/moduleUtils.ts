import { dirname, join, resolve } from 'path';
import { createRequire } from 'module';
import { existsSync, readFileSync } from 'fs';
import { writeFile, readFile } from 'fs/promises';
import util from 'util';
import { exec } from 'child_process';

/**
 * Finds the location of a module in the project's node_modules
 * @param moduleName The name of the module to find
 * @returns The absolute path to the module's root directory
 */
export async function findModuleLocation(moduleName: string): Promise<string> {
    // Get the project root (where package.json is)
    const projectRoot = process.cwd();
    const require = createRequire(projectRoot + '/package.json');

    try {
        // First get the package.json path
        const packageJsonPath = require.resolve(`${moduleName}/package.json`);
        // Then get the module's root directory
        return dirname(packageJsonPath);
    } catch (error: any) {
        throw new Error(`Module ${moduleName} not found in project's node_modules: ${error.message}`);
    }
}

/**
 * Checks if the given module is present in the project's package.json of the current project.
 * NOTE: Unlike `findModuleLocation`, this function returns false if the module is installed in the parent folder.
 * @returns `true` if the module is present, `false` otherwise
 */
export async function isModulePresent(moduleName: string): Promise<boolean> {
    const packageJsonPath = resolve('package.json');
    if (!existsSync(packageJsonPath)) return false;
    const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf-8'));

    if (packageJson.dependencies && packageJson.dependencies[moduleName]) {
        return true;
    }
    if (packageJson.devDependencies && packageJson.devDependencies[moduleName]) {
        return true;
    }
    return false;
}

/**
 * Gets the version of the given module
 * @param moduleName The name of the module
 * @returns The version of the module
 */
export async function getModuleVersion(moduleName: string): Promise<string | undefined> {
    try {
        // Get the actual next version from node_modules/next/package.json
        // and not project's package.json where it can be specified as latest tag etc...
        const modulePath = await findModuleLocation(moduleName);
        const packageJsonPath = resolve(modulePath, 'package.json');

        const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
        return packageJson.version;
    } catch (error) {
        return undefined;
    }
}

/**
 * Gets a file:// URL for a module file
 * @param moduleName The name of the module
 * @param filePath The path to the file within the module
 * @returns A file:// URL pointing to the module file
 */
export async function getModuleFileUrl(moduleName: string, filePath: string): Promise<string> {
    const modulePath = await findModuleLocation(moduleName);
    const fullPath = join(modulePath, filePath);

    if (!existsSync(fullPath)) {
        throw new Error(`File ${filePath} not found in module ${moduleName} at ${modulePath}`);
    }

    return `file://${fullPath}`;
}

export async function installDependency(packageName: string, packageVersion = 'latest', cwd: string = process.cwd()) {
    // Create basic package.json if it doesn't exist
    const packageJsonPath = join(cwd, 'package.json');
    if (!existsSync(packageJsonPath)) {
        await writeFile(
            packageJsonPath,
            JSON.stringify(
                {
                    dependencies: {},
                    devDependencies: {},
                },
                null,
                2,
            ),
        );
    }

    // Replace the existing dependency with the exact specified version
    const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf-8'));
    packageJson.dependencies ??= {};
    packageJson.devDependencies ??= {};
    delete packageJson.dependencies[packageName];
    delete packageJson.devDependencies[packageName];
    packageJson.dependencies[packageName] = packageVersion;
    await writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2));

    // Install the dependency with used package manager
    await installDependencies(cwd);
}

export async function installDependencies(cwd: string = process.cwd()) {
    const execAsync = util.promisify(exec);
    const packageManager = getPackageManager(cwd);
    const cmd = {
        npm: 'npm install --no-audit --no-fund --legacy-peer-deps',
        yarn: 'yarn install --no-audit',
        pnpm: 'pnpm install --no-audit',
        bun: 'bun install',
    }[packageManager];

    await execAsync(cmd, {
        cwd,
    });
}

export function getProjectType(cwd: string = process.cwd()): 'commonjs' | 'module' | 'typescript' {
    if (existsSync(join(cwd, 'tsconfig.json'))) {
        return 'typescript';
    }

    const packageJson = existsSync(join(cwd, 'package.json')) ? JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf8')) : null;
    if (packageJson?.type) {
        return packageJson?.type;
    }

    return 'commonjs';
}

export function getFileModuleType(filePath: string): 'commonjs' | 'module' | 'typescript' {
    if (filePath.endsWith('mjs')) {
        return 'module';
    }
    if (filePath.endsWith('cjs')) {
        return 'commonjs';
    }
    if (filePath.endsWith('ts')) {
        return 'typescript';
    }
    const fileContent = readFileSync(filePath, 'utf8')
        // Remove multi-line comments
        .replace(/\/\*[\s\S]*?\*\//g, '')
        // Remove single-line comments
        .replace(/\/\/.*$/gm, '');

    if (fileContent.match(/export\s+default/)) {
        return 'module';
    }
    return 'commonjs';
}

function getPackageManager(cwd: string = process.cwd()) {
    if (existsSync(join(cwd, 'package-lock.json'))) {
        return 'npm';
    }
    if (existsSync(join(cwd, 'yarn.lock'))) {
        return 'yarn';
    }
    if (existsSync(join(cwd, 'pnpm-lock.yaml'))) {
        return 'pnpm';
    }
    if (existsSync(join(cwd, 'bun.lockb'))) {
        return 'bun';
    }
    // If no package manager is found, default to npm
    return 'npm';
}
