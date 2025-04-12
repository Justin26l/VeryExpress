import * as types from "../../types/types";
import authRouteTemplate from "./authRoute.template";

export function compile( compilerOptions: types.compilerOptions ): string {
    return authRouteTemplate(compilerOptions); 
}