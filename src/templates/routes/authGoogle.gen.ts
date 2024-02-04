// generated files by very-express
import { Router } from 'express';
import passport from '../plugins/passport.gen';

// import UserController from '../controllers/UserController.gen';


const router: Router = Router();


router.get('/login',
    (req, res) => {
        res.send('login page');
    }
);

router.get('/auth/google',
    passport.authenticate('google', { scope: ['profile', 'email'] })
);

router.get('/auth/google/callback',
    passport.authenticate('google', { failureRedirect: '/login' }),
    (req, res) => {
        // save user to database
        res.redirect('/profile');
    }
);


router.get('/', (req, res) => {
    res.send('Hello World');
});

router.get('/profile', (req, res) => {
    if (!req.user) {
        return res.status(401).send('Not logged in');
    }

    // req.user contains the user's profile
    res.send(req.user);
});

export default router;