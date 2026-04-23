// {{headerComment}}
import { Request } from "express";
import VexResponseError from "../_types/VexResponseError.gen";

/**
 * Called by tsoa-generated routes for every @Security decorator.
 * securityName matches the key in tsoa.json securityDefinitions.
 */
export async function expressAuthentication(
    request: Request,
    securityName: string,
    _scopes?: string[]
): Promise<unknown> {

    if (securityName === "BearerAuth" && !request.headers["authorization"]) {
        throw new VexResponseError(401, null, "Missing Authorization header");
    }

    if (securityName === "AuthIndex" && !request.headers["x-auth-index"]) {
        throw new VexResponseError(401, null, "Missing X-Auth-Index header");
    }

    return {};
}
