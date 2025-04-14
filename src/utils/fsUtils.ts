import { access } from 'fs/promises';

/**
 * Async version of fs.existsSync
 * @param path Path to check
 * @returns Promise that resolves to true if path exists, false otherwise
 */
export async function exists(path: string): Promise<boolean> {
    try {
        await access(path);
        return true;
    } catch {
        return false;
    }
}
