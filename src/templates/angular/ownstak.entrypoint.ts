import { dirname, resolve } from 'path';
import { createServer } from 'http';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';

const { reqHandler } = await import(resolve(__dirname, 'server.mjs'));
if (!reqHandler) {
    throw new Error(
        `Failed to start Angular server. The server.mjs file does not export reqHandler function.\r\n` +
            `Example src/server.js file: \r\n` +
            `import { AngularNodeAppEngine, createNodeRequestHandler } from '@angular/ssr/node';\r\n` +
            `...\r\n` +
            `export const reqHandle = createNodeRequestHandler(app);\r\n`,
    );
}

const nodeServer = createServer(reqHandler);
nodeServer.listen(PORT, HOST, () => {
    console.debug(`Angular server is running on http://${HOST}:${PORT}`);
});
nodeServer.on('error', (e: any) => {
    throw new Error(`Failed to start the Angular server: ${e}`);
});
