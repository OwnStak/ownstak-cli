import { isProxyRequestEvent, Event } from "./proxyRequestEvent.js";
import http from "http";
import tls from "tls";

export class Request {
    url: URL = new URL("https://127.0.0.1");
    host: string = "localhost";
    protocol: string = "https";
    port: number = 443;
    method: string = "GET";
    headers: Record<string, string | string[]> = {};
    body?: string | Buffer;

    get path() {
        return this.url.pathname;
    }
    set path(path: string) {
        this.url.pathname = path;
    }

    static fromEvent(event: Event): Request {
        const request = new Request();
        if(isProxyRequestEvent(event)) {
            request.host = event.headers["x-forwarded-host"]?.toString()?.split(",")?.[0] || event.headers.host || "localhost";
            request.protocol = event.headers["x-forwarded-proto"]?.toString()?.split(",")?.[0] || event.requestContext.http.protocol.toLowerCase() as "http" | "https";
            request.url = new URL(`${request.protocol}://${request.host}${event.rawPath}${event.rawQueryString ? `?${event.rawQueryString}` : ""}`);
            request.path = event.rawPath;
            request.method = event.requestContext.http.method;
            request.headers = event.headers;
            request.body = event.body ? Buffer.from(event.body, event.isBase64Encoded ? "base64" : "utf-8") : undefined;
        }else{
            throw new Error("Received unsupported event type");
        }
        return request;
    }

    static async fromNodeRequest(nodeRequest: http.IncomingMessage): Promise<Request> {
        const request = new Request();
        request.host = nodeRequest.headers["x-forwarded-host"]?.toString()?.split(",")[0] || nodeRequest.headers.host || "localhost";
        request.protocol = nodeRequest.headers["x-forwarded-proto"]?.toString()?.split(",")[0] || (nodeRequest.socket instanceof tls.TLSSocket ? "https" : "http");
        request.port = request.protocol === "https" ? 443 : 80;
        request.url = new URL(`${request.protocol}://${request.host}${nodeRequest.url}`)
        request.path = nodeRequest.url || "/";
        request.method = nodeRequest.method || "GET";
        request.headers = Object.fromEntries(
            Object.entries(nodeRequest.headers).map(([key, value]) => [
                key,
                Array.isArray(value) ? value[0] : value || ""
            ])
        );

        // Read body from request
        const chunks: Buffer[] = [];
        for await (const chunk of nodeRequest) {
            chunks.push(chunk);
        }
        request.body = Buffer.concat(chunks);

        return request;
    }
}
