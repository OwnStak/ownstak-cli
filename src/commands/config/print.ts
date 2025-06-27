import { Config } from '../../config.js';

export async function configPrint() {
    const config = await Config.loadFromSource();
    console.log(config.serialize());
}
