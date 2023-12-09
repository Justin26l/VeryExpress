import express from 'express';
import helmet from 'helmet';
import { rateLimit, RateLimitRequestHandler } from 'express-rate-limit'
import routes from './routes';

const app = express();
app.disable("x-powered-by");
app.use(express.json());

app.use(routes);

app.use(helmet({
  xPoweredBy: false,
  xDnsPrefetchControl: { allow: false },
}));

app.use(rateLimit({
	windowMs: 5 * 60 * 1000, // 5 minutes
	limit: 300, // Limit each IP to 300 requests per 5 min.
	standardHeaders: 'draft-7',
	legacyHeaders: false
}));

app.listen(3000, () => {
  console.log('Server is running on port 3000');
});