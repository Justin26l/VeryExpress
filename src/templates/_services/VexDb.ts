// {{headerComment}}
import { VexDbConnector } from "./VexDbConnector.gen";
import dotenv from "dotenv";

dotenv.config();

const VexDb = new VexDbConnector({
    sqlUrl: process.env.SQL_URI ?? undefined,
    sqlCa: process.env.SQL_CA ?? undefined,
    recordAccessLog: false,
});

export default VexDb;
