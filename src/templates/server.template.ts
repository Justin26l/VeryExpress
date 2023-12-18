import * as types from '../types/types';

export default function serverTemplate(templateOptions: {
	headerComment?: string,
	template?: string,
	options?: types.compilerOptions,
}): string {
	let headerComment: string = templateOptions.options?.headerComment || "// generated files by very-express";
	let template: string = templateOptions.template || `{{headerComment}}

import dotenv from 'dotenv';
import express from 'express';
import helmet from 'helmet';
import routesGenerated from './routes/routes.gen';

dotenv.config();

const app = express();
app.disable("x-powered-by");
app.use(express.json());

app.use(routesGenerated);

app.use(helmet({
  xPoweredBy: false,
  xDnsPrefetchControl: { allow: false },
}));

app.listen(process.env.VERYEXPRESS_PORT, () => {
  console.log('Server is running on port ' + process.env.VERYEXPRESS_PORT );
});
`;

	template = template.replace(/{{headerComment}}/g, headerComment);

	return template;
};