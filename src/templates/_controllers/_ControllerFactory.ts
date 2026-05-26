// {{headerComment}}
import { Controller } from "tsoa";

export class _ControllerFactory extends Controller {

    constructor() {
        super();
    }

    protected isObjectId(id: string): boolean {
        return /^[0-9a-fA-F]{24}$/.test(id);
    }

}