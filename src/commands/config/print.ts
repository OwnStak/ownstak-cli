import { Config } from '../../config.js';
import { BRAND } from '../../constants.js';

export async function configPrint() {
    const config = await Config.loadFromSource();
    console.log(`${BRAND} project config:`);
    console.log(config.serialize());
}
