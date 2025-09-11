import { Response } from '../router/response.js';
import { BRAND, SUPPORT_URL, HEADERS, STATUS_CODES } from '../../constants.js';

export interface ProjectErrorOptions {
    title?: string;
    statusCode?: number;
    stack?: string;
    requestId?: string;
    version?: string;
}

export class ProjectError extends Error {
    title: string;
    statusCode: number;
    requestId?: string;
    version?: string;

    constructor(message?: string, options: ProjectErrorOptions = {}) {
        super(message || `The unknown error occurred in one of the ${BRAND} components. Please see the stack trace in the logs for more details.`);
        this.title = options.title || 'Project Error';
        this.statusCode = options.statusCode || STATUS_CODES.StatusProjectError;
        this.stack = options.stack || this.stack;
        this.requestId = options.requestId;
        this.version = options.version;
    }

    get component() {
        return `${BRAND} CLI v${this.version || '0.0.0'}`;
    }

    get canIncludeStack() {
        return process.env.LOG_LEVEL === 'debug' || !!process.env.LOCAL;
    }

    static fromError(e: any): ProjectError {
        // If the error is already type of ComputeError, return it
        // Otherwise, create a new ComputeError with the error message and preserved stack trace
        if ('errorType' in e && typeof e.errorType === 'function' && e.errorType() === new this().errorType()) {
            return e;
        }
        return new this(e.message, { stack: e.stack });
    }

    toResponse(acceptContentType?: string) {
        const contentType = acceptContentType?.includes('text/html') ? 'text/html' : 'application/json';
        const body = acceptContentType?.includes('text/html') ? this.toHtml() : this.toJSON();
        return new Response(body, {
            statusCode: this.statusCode,
            headers: {
                [HEADERS.ContentType]: contentType,
            },
        });
    }

    toJSON(includeStack = this.canIncludeStack) {
        return JSON.stringify(
            {
                errorStatus: this.statusCode,
                errorTitle: this.title,
                errorMessage: this.message,
                errorStack: includeStack ? this.stack?.split('\n') : undefined,
                requestId: this.requestId,
                component: this.component,
            },
            null,
            2,
        );
    }

    toHtml(includeStack = this.canIncludeStack) {
        return `
            <!DOCTYPE html>
            <html>
                <head>
                    <title>Error ${this.statusCode}</title>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <link rel="stylesheet" href="//fonts.googleapis.com/css2?family=Poppins:wght@400;700&display=swap">
                    <style>
                        html, body, div, span, applet, object, iframe,
                        h1, h2, h3, h4, h5, h6, p, blockquote, pre,
                        a, abbr, acronym, address, big, cite, code,
                        del, dfn, em, img, ins, kbd, q, s, samp,
                        small, strike, strong, sub, sup, tt, var,
                        b, u, i, center,
                        dl, dt, dd, ol, ul, li,
                        fieldset, form, label, legend,
                        table, caption, tbody, tfoot, thead, tr, th, td,
                        article, aside, canvas, details, embed, 
                        figure, figcaption, footer, header, hgroup, 
                        menu, nav, output, ruby, section, summary,
                        time, mark, audio, video {
                            margin: 0;
                            padding: 0;
                            border: 0;
                            font-size: 1;
                            font: inherit;
                            vertical-align: baseline;
                        }
                        article, aside, details, figcaption, figure, 
                        footer, header, hgroup, menu, nav, section {
                            display: block;
                        }
                        body {
                            font-family: 'Poppins', sans-serif;
                            background:
                                radial-gradient(ellipse 60% 40% at 0% 100%, rgba(231, 76, 60, 0.07) 0%, rgba(231, 76, 60, 0.09) 60%, rgba(255,255,255,0) 100%),
                                radial-gradient(ellipse 40% 30% at 100% 0%, rgba(231, 76, 60, 0.07) 0%, rgba(231, 76, 60, 0.05) 60%, rgba(255,255,255,0) 100%),
                                #fff;
                            color: #222;
                            margin: 0;
                            padding: 0;
                            display: flex;
                            justify-content: center;
                            align-items: center;
                            height: 100vh;
                            white-space: pre-wrap;
                            text-align: center;
                        }
                        .container {
                            max-width: 600px;
                            padding: 1em 2em;
                            margin: 0 auto;
                        }
                        h1 {
                            font-size: 10em;
                            font-weight: 900;
                            margin: 0;
                            color: #e74c3c;
                            background: linear-gradient(45deg, rgba(231, 76, 60, 0.5) 0%, rgba(231, 76, 60, 1) 50%, rgba(231, 76, 60, 1) 60%, rgba(231, 76, 60, 0.5) 100%);
                            -webkit-background-clip: text;
                            background-clip: text;
                            color: transparent;
                        }
                        h2 {
                            font-size: 1.15em;
                            line-height: 1.6;
                            font-weight: 700;
                            margin: -1.25em 0 2.5em 0;
                            color: rgba(0, 0, 0, 0.8);
                        }
                        a {
                            color: rgba(231, 76, 60, 0.8);
                            text-decoration: none;
                        }
                        a:hover {
                            color: rgba(231, 76, 60, 1);
                        }
                        p {
                            font-size: 1.2em;
                            margin: 0.5em 0;
                            line-height: 1.5;

                        }
                        footer {
                            font-size: 0.9em;
                            margin: 1em auto;
                            padding-top: 2em;
                            color: rgba(0, 0, 0, 0.75);
                            position: relative;
                            max-width: 400px;
                        }
                        footer::before {
                            content: "";
                            width:60%;
                            position: absolute;
                            top: 0;
                            left: 50%;
                            transform: translate(-50%, 0);
                            height:1px;
                            background-color: rgba(0, 0, 0, 0.35);
                            display: block;
                        }

                        /* Error Table/Card Styles */
                        .error-table {
                            display: flex;
                            flex-direction: column;
                            align-items: stretch;
                            margin: 0 auto 1.5em auto;
                            max-width: 100%;
                            border-radius: 0.7em;
                            box-shadow: 0 2px 12px 0 rgba(231,76,60,0.08);
                            border: 1px solid rgba(0,0,0,0.3);
                            background: rgba(255,255,255,0.5);
                            backdrop-filter: blur(5px);
                            overflow: hidden;
                        }
                        .error-table-header {
                            font-weight: 400;
                            padding: 0.7em 1.2em 0.6em 1.2em;
                            font-size: 1.1em;
                            border-bottom: 1px solid rgba(0,0,0,0.15);
                            text-align: left;
                            color: rgba(0, 0, 0, 0.8);
                            background: rgba(255,255,255,0.95);
                        }
                        .error-table-header i {
                            color: #e74c3c;
                        }
                        .error-table-body {
                            padding: 1.2em;
                            background: none;
                        }
                        .error-table-body code {
                            background: none;
                            border: none;
                            padding: 0;
                            font-size: 1em;
                            color: rgba(0, 0, 0, 0.8);
                            font-family: 'Courier New', Courier, monospace;
                            white-space: wrap;
                            word-break: break-word;
                            display: block;
                            max-height: 95px;
                            overflow-y: auto;
                            overflow-x: hidden;
                            text-align: left;
                        }
                        .error-table-footer {
                            padding: 0.7em 1.2em;
                            background: rgba(255,255,255,0.95);
                            border-top: 1px solid rgba(0,0,0,0.13);
                            color: rgba(0, 0, 0, 0.6);
                            font-size: 0.95em;
                            text-align: left;
                            white-space: wrap;
                            word-break: break-word;
                            line-height: 1.5;
                        }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <h1>${this.statusCode}</h1>
                        <h2>Oops! This site is experiencing problems serving your request. If you are the site administrator, please see the error details below or contact <a href="${SUPPORT_URL}">OwnStak support</a> for assistance.</h2>
                        <div class="error-table">
                            <div class="error-table-header"><i>Error:</i> ${this.title}</div>
                            <div class="error-table-body"><code>${includeStack ? `${this.message}\n${this.stack}` : `${this.message}`}</code></div>
                            <div class="error-table-footer">Request ID: ${this.requestId || 'UNKNOWN'}<br>Component: ${this.component}</div>
                        </div>
                    </div>
                </body>
            </html>
        `;
    }

    errorType() {
        // Don't use `this.constructor.name`.
        // We want to return same string for all child instances of ProjectError.
        return `ProjectError`;
    }
}
