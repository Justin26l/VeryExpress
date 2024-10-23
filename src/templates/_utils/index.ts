

import logger from "./logger.gen";
import response from "./response.gen";
import validator from "./validator.gen";
import { responseMsg, responseCode, responseStatusToCode } from "./../_types/response/index.gen";
import common from "./common.gen";

export default {
    log : logger,
    response,
    validator,
    responseMsg,
    responseCode,
    responseStatusToCode,
    common
};