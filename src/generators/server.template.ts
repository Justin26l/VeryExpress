import * as types from '../types/types';

export default function serverTemplate(templateOptions: {
	headerComment?: string,
	template?: string,
	options?: types.compilerOptions,
}): string {
	let headerComment: string = templateOptions.options?.headerComment || "// generated files by very-express";
	let template: string = templateOptions.template || `{{headerComment}}

import express from 'express';
import dotenv from 'dotenv';
import helmet from 'helmet';
import session from 'express-session';

import mongoConn from './services/mongoConn.gen';
import passport from './plugins/passport.gen';
import log from './utils/log.gen';

import authRouter from './routes/authGoogle.gen';
import generatedRouter from './routes/routes.gen';

dotenv.config();

const app = express();
app.use(express.json());
app.disable("x-powered-by");

app.use(helmet({
  xPoweredBy: false,
  xDnsPrefetchControl: { allow: false },
}));

app.use(session({
  secret: 'some secret',
  resave: false,
  saveUninitialized: false
}));

app.use(passport.initialize());
app.use(passport.session());

app.use(authRouter);
app.use(generatedRouter);

app.get('/', (req, res) => {
  res.send('Hello World');
});

app.listen(3000, () => {
  mongoConn.connect(process.env.MONGO_URL || 'mongodb://localhost:27017/veryExpressDB');
  log.ok('Server is running on port 3000');
});

`;

	template = template.replace(/{{headerComment}}/g, headerComment);

	return template;
};
