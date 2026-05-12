// {{headerComment}}
import { Router, Request, Response } from "express";
import crypto from "crypto";

export interface LoginUIConfig {
    localAuth: boolean;
    oauthProviders: string[];
}

export default class LoginUI {

    private router: Router = Router();
    private config: LoginUIConfig;

    constructor(config: LoginUIConfig) {
        this.config = config;
        this.registerRoutes();
    }

    getRouter(): Router {
        return this.router;
    }

    private registerRoutes(): void {
        this.router.get("/", this.homePage.bind(this));
        this.router.get("/login", this.loginPage.bind(this));
        this.router.get("/logout", this.logoutPage.bind(this));
        this.router.get("/mytokens", this.myTokensPage.bind(this));
        this.router.get("/refreshtoken", this.refreshTokenPage.bind(this));
        this.router.get("/logincallback", this.loginCallbackPage.bind(this));
    }

    private nonce(): string {
        return crypto.randomBytes(16).toString("base64");
    }

    private homePage(_req: Request, res: Response): void {
        const authLinks = this.config.localAuth || this.config.oauthProviders.length > 0
            ? `<li><a href="/login">Login</a></li>
                    <li><a href="/mytokens">myTokens</a></li>
                    <li><a href="/refreshtoken">RefreshToken</a></li>
                    <li><a href="/logout">LogOut</a></li>`
            : "";

        res.send(`
            <div>
                <h1>Hello World</h1>
                <ul>
                    ${authLinks}
                    <li><a href="/swagger">Swagger UI</a></li>
                </ul>
                <h1>Others</h1>
                <ul>
                    <li><a href="/logincallback">logincallback</a></li>
                </ul>
            </div>
        `);
    }

    private loginPage(_req: Request, res: Response): void {
        const nonce = this.nonce();
        res.setHeader("Content-Security-Policy", `script-src 'self' 'nonce-${nonce}'`);

        let formHtml = "";
        if (this.config.localAuth) {
            formHtml += `
                <p>Email:</p>
                <input type="email" id="email"/>
                <p>Password:</p>
                <input type="password" id="password"/>
                <br/><br/>
                <button id="localLoginBtn">Login</button>
                <button id="localRegisterBtn">Register</button>
                <br/><br/>`;
        }

        formHtml += "                <p>Login with SSO:</p>\n";
        if (this.config.oauthProviders.length === 0) {
            formHtml += "                <p>No OAuth provider configured.</p>\n";
        }
        else {
            this.config.oauthProviders.forEach((provider) => {
                formHtml += `                <a href="/api/auth/${provider}">${provider}</a><br/>\n`;
            });
        }

        const scriptTag = this.config.localAuth
            ? `<script nonce="${nonce}" src="/js/login.js?d=${Date.now()}"></script>`
            : "";

        res.send(`${scriptTag}<body>${formHtml}</body>`);
    }

    private logoutPage(_req: Request, res: Response): void {
        const nonce = this.nonce();
        res.setHeader("Content-Security-Policy", `script-src 'self' 'nonce-${nonce}'`);
        res.send(`
            <script nonce="${nonce}">
                localStorage.removeItem('accessToken');
                localStorage.removeItem('accessTokenIndex');
                localStorage.removeItem('refreshToken');
                localStorage.removeItem('refreshTokenIndex');
            </script>
        `);
    }

    private myTokensPage(_req: Request, res: Response): void {
        const nonce = this.nonce();
        res.setHeader("Content-Security-Policy", `script-src 'self' 'nonce-${nonce}'`);
        res.send(`
            <script nonce="${nonce}" src="/js/mytokens.js"></script>
            <link rel="stylesheet" href="/css/style.css">
            <body>
                <h1>My Token</h1>
                <pre id="tokenData"></pre>
                <a href="/">back to home</a>
            </body>
        `);
    }

    private refreshTokenPage(_req: Request, res: Response): void {
        const nonce = this.nonce();
        res.setHeader("Content-Security-Policy", `script-src 'self' 'nonce-${nonce}'`);
        res.send(`
            <script nonce="${nonce}" src="/js/refreshtokens.js"></script>
            <link rel="stylesheet" href="/css/style.css">
            <body>
                <h1>New Token</h1>
                <pre id="tokenData"></pre>
                <a href="/">back to home</a>
            </body>
        `);
    }

    private loginCallbackPage(_req: Request, res: Response): void {
        const nonce = this.nonce();
        res.setHeader("Content-Security-Policy", `script-src 'self' 'nonce-${nonce}'`);
        res.send(`
            <script nonce="${nonce}" src="/js/logincallback.js"></script>
            <link rel="stylesheet" href="/css/style.css">
            <body>
                <h1>Profile Data</h1>
                <pre id="tokenData"></pre>
                <a href="/">back to home</a>
            </body>
        `);
    }
}
