import { spawn } from 'child_process';
import { logger } from '../logger.js';

/**
 * Runs a specified command.
 * @param command The command to run.
 * @param options The options for the command.
 * @returns A promise that resolves when the command is finished.
 */
export async function runCommand(
    command: string,
    options: {
        cwd?: string;
        env?: Record<string, string>;
        stdio?: 'inherit' | 'pipe' | 'ignore';
        shell?: boolean;
    } = {},
) {
    return new Promise<void>((resolve, reject) => {
        const [programName, ...programArgs] = command.split(' ');
        logger.debug(`Running: ${programName} ${programArgs.join(' ')}`);
        const child = spawn(programName, programArgs, {
            stdio: options.stdio ?? 'inherit',
            cwd: options.cwd ?? process.cwd(),
            env: options.env ?? process.env,
            shell: options.shell ?? true,
        });
        child.on('error', (err) => {
            return reject(new Error(`Failed to start ${programName} ${programArgs.join(' ')}: ${err.message}`));
        });
        child.on('close', (code) => {
            if (code === 0) return resolve();
            return reject(new Error(`${programName} ${programArgs.join(' ')} failed with code ${code}`));
        });
    });
}
