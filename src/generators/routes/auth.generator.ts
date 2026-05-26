import * as types from "../../types/types";
import authRouteTemplate from "./authRoute.template";
import authControllerTemplate from "./authController.template";
import * as utilsGenerator from "../../utils/generator";

export function compileRouter(compilerOptions: types.compilerOptions): string {
    return authRouteTemplate(compilerOptions);
}

export function compileController(compilerOptions: types.compilerOptions): string {
    return authControllerTemplate(compilerOptions);
}

/** @deprecated use compileRouter / compileController */
export function compile(compilerOptions: types.compilerOptions): string {
    return authRouteTemplate(compilerOptions);
}

export function hasOAuthProviders(compilerOptions: types.compilerOptions): boolean {
    return utilsGenerator.OAuthProviders(compilerOptions).length > 0;
}
