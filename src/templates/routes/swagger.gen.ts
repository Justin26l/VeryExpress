import { Router } from 'express';
import swaggerUi, { JsonObject } from 'swagger-ui-express';
import { loadYaml } from '../utils/common.gen';


export default class SwaggerRouter{

    public router: Router = Router();

    constructor() {}

    public initRoutes() {
        this.router.use('/api', swaggerUi.serve, swaggerUi.setup(loadYaml('./openapi/openapi.gen.yaml') as JsonObject));

    }

}