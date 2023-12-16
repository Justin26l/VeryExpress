
export function serverTemplate(headerComment?:string, template?:string) {
    if(!headerComment){
        headerComment = "";
    };

    if(!template){
        template = `{{headerComment}}
import express from 'express';
import helmet from 'helmet';
import routes from './routes';
        
const app = express();
app.disable("x-powered-by");
app.use(express.json());

app.use(routes);

app.use(helmet({
  xPoweredBy: false,
  xDnsPrefetchControl: { allow: false },
}));

app.listen(3000, () => {
  console.log('Server is running on port 3000');
});`;
};

    template = template.replace(/{{headerComment}}/g, headerComment);

    return template;
};