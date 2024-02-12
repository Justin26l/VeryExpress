import * as types from "../../types/types";
import utils from "./../../utils/common";

function loginHtml(providers: string[]) {
    let html = "<p> login with : </p>";
    providers.forEach((pp) => {
        html += `<a href="\${process.env.APP_HOST}:\${process.env.APP_PORT}/auth/${pp}">${pp}</a>`;
    });
    return `\`${html}\``;
}

export function compile(options: {
    compilerOptions: types.compilerOptions
}): string {

    const providers: string[] = utils.isUseOAuth(options.compilerOptions);
    return `${options.compilerOptions.headerComment}
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

        this.router.get('/profile', (req, res) => {
            if (req.isAuthenticated()) {
                res.send(\`<p>Session Data</p><pre>\${util.inspect(req.user, undefined, null)}</pre>\`);
            } 
            else {
                res.redirect('/login');
            };
        });
    }

}`;
}