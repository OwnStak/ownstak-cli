import net from 'net';

/**
 * Tries to find the nearest unbound port
 * or returns the current port if it is unbound
 * @param port - The port to check
 * @param skipNext - The number of ports to skip when searching for an unused port
 */
export async function getNearestFreePort(port: number, skipNext = 1000): Promise<number | undefined> {
    if (port > 65535) return undefined;
    const freePort = await isPortFree(port);
    return freePort ? port : getNearestFreePort(port + skipNext);
}

/**
 * Returns true if the port is in use
 * @param port
 * @param host
 */
export async function isPortFree(port: number, host = '127.0.0.1'): Promise<boolean> {
    return new Promise((resolve, reject) => {
        let client: net.Socket;

        if (port > 65535 || port <= 0) {
            reject(new Error('Invalid port'));
            return;
        }

        if (!net.isIP(host)) {
            reject(new Error('Invalid host'));
            return;
        }

        const clean = () => {
            if (client) {
                client.removeAllListeners('connect');
                client.removeAllListeners('error');
            }
        };

        const onConnect = () => {
            resolve(false);
            clean();
        };

        const onError = (error: { code: string }) => {
            if (error.code !== 'ECONNREFUSED') {
                reject(error);
                return;
            }
            resolve(true);
            clean();
        };

        client = new net.Socket();
        client.once('connect', onConnect);
        client.once('error', onError);
        client.connect({ port: port, host: host }, () => {});
    });
}
