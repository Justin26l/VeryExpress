import * as types from "../../types/types";
import * as utilsGenerator from "./../../utils/generator";

function loginHtml(providers: string[]) {
    let html = "<p> login with : </p>";
    providers.forEach((pp) => {
        html += `<a href="\${process.env.APP_HOST}/auth/${pp}">${pp}</a>`;
    });
    return `\`${html}\``;
}

export function compile( compilerOptions: types.compilerOptions ): string {

    const providers: string[] = utilsGenerator.isUseOAuth(compilerOptions);
    return `${compilerOptions.headerComment}
import { Router } from 'express';
import util from 'util';

export default class OAuthRouter{

    public router: Router = Router();
    private loginHtml = ${loginHtml(providers)};

    constructor() {}

    public initRoutes() {
        
        this.router.get('/login', (req, res) => {
            res.send(this.loginHtml);
        });
        
        this.router.get('/logout', (req, res) => {
            req.logout(
                {},
                () => { res.redirect('/login'); }   
            );
        });


        this.router.get('/profile', (req, res) => {
            if (req.isAuthenticated()) {
                res.send(\`
                    <div>
                        <h1>Session Data</h1>
                        <pre>\${util.inspect(req.user, undefined, null)}</pre>
                        <a href="/">back to home</a>
                    </div>
                \`);
            } 
            else {
                res.redirect('/login');
            };
        });
    }

}`;
}