import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { exists } from './fsUtils.js';
import { createRequire } from 'module';

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
 * Gets a file:// URL for a module file
 * @param moduleName The name of the module
 * @param filePath The path to the file within the module
 * @returns A file:// URL pointing to the module file
 */
export async function getModuleFileUrl(moduleName: string, filePath: string): Promise<string> {
    const modulePath = await findModuleLocation(moduleName);
    const fullPath = join(modulePath, filePath);
    
    if (!await exists(fullPath)) {
        throw new Error(`File ${filePath} not found in module ${moduleName} at ${modulePath}`);
    }

    return `file://${fullPath}`;
} 