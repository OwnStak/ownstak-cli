import { existsSync } from 'fs';
import { logger } from '../logger.js';
import { BRAND, BUILD_DIR_PATH, NAME_SHORT } from '../constants.js';
import { CliError } from '../cliError.js';

export async function deploy() {
    if (!existsSync(BUILD_DIR_PATH)) {
        throw new CliError(`The ${BRAND} build does not exist. Please run \`npx ${NAME_SHORT} build\` first.`);
    }

    throw new CliError(`This feature is not available yet. You can try to run \`npx ${NAME_SHORT} start\` to run the project locally.`);
}
