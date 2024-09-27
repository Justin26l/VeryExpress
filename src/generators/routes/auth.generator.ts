import * as types from "../../types/types";
import * as utilsGenerator from "./../../utils/generator";

function loginHtml(providers: string[]) {
    let html = "<p> login with : </p>";
    providers.forEach((pp) => {
        html += `<a href="\${process.env.APP_HOST}/auth/${pp}">${pp}</a><br/>`;
    });
    return `\`${html}\``;
}

export function compile( compilerOptions: types.compilerOptions ): string {

    const providers: string[] = utilsGenerator.isUseOAuth(compilerOptions);
    return `${compilerOptions.headerComment}
import { Router } from 'express';
import { verifyToken } from '../_plugins/auth/jwt.gen';
import crypto from 'crypto';

const DummyLoginUI =  ${loginHtml(providers)};
const profileUI = (nonce:string, token:string) => {
    return \`<!DOCTYPE html>
        <head>
            <script nonce="\${nonce}">
                \${
                    token ? \`
                    localStorage.setItem('token', '\${token}');
                    \` : 
                    ''
                }
                document.addEventListener("DOMContentLoaded", function() {
                    const headers = new Headers();
                    // tokenIndex in http only cookie
                    headers.append('Authorization', 'Bearer ' + localStorage.getItem('token'));
                    fetch('/profile', { headers })
                        .then(res => res.text())
                        .then(data => document.querySelector("#profileData").innerHTML = data);
                });
            </script>
        </head>
        <body>
            <h1>Profile Data</h1>
            <pre id="profileData"></pre>
            <a href="/">back to home</a>
        </body>
    </html>\`;
};


export default class AuthRouter{

    public router: Router = Router();

    constructor() {}

    public initRoutes(logoutRedirectPath: string = '/login') {
        
        /** Dummy Login UI, list OAuth login options */
        this.router.get('/login', (req, res) => {
            res.send(DummyLoginUI);
        });
        
        this.router.get('/logout', (req, res) => {
            req.logout(
                {},
                () => { 
                    res.redirect(logoutRedirectPath); 
                }   
            );
        });

        /** Dummy Profile UI, show how to make auth request */
        this.router.get('/checkprofile', (req, res) => {
            const token = req.query.token?.toString() || '';
            const tokenIndex = req.query.tokenIndex?.toString() || '';
            const nonce = crypto.randomBytes(16).toString("base64");

            res.setHeader("Content-Security-Policy", \`script-src 'self' 'nonce-\${nonce}'\`);
            res.send(profileUI(nonce, token));
        });

        this.router.get('/profile', (req, res) => {
            if (req.headers['authorization']) {
                const token = req.headers['authorization']?.toString().split(' ')[1];
                const tokenIndex: string | undefined = req.cookies['tokenIndex']?.toString() || undefined;
                const decodedToken = verifyToken(token, tokenIndex);

                if (decodedToken === false) {
                    res.redirect('/login');
                    return;
                };
                
                res.json(decodedToken);
            }
            else {
                res.redirect('/login');
            };
        });
    }

}`;
}