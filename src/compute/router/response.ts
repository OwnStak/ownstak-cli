import { ProxyResponseEvent } from "./proxyResponseEvent.js";
import http from "http";

export class Response {
    statusCode: number = 200;
    headers: Record<string, string | string[]> = {};
    body?: string | Buffer;

    constructor(body: string | Buffer | undefined = undefined, options: {
        statusCode?: number;
        headers?: Record<string, string | string[]>;
    } = {}) {
        this.statusCode = options.statusCode ?? 200;
        this.headers = options.headers ?? {};
        this.body = body;
    }

    toEvent(): ProxyResponseEvent {
        const headers = Object.fromEntries(
            Object.entries(this.headers).map(([key, value]) => [
                key,
                Array.isArray(value) ? value[0] : value || ""
            ])
        );
        return {
            statusCode: this.statusCode,
            headers,
            body: Buffer.isBuffer(this.body) ? this.body.toString("base64") : Buffer.from(this.body?.toString() ?? "").toString("base64"),
            isBase64Encoded: true,
        };
    }

    toNodeResponse(nodeResponse: http.ServerResponse): void {
        nodeResponse.statusCode = this.statusCode;
        nodeResponse.writeHead(this.statusCode, this.headers);
        nodeResponse.end(this.body);
    }
}
