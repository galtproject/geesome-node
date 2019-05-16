import {IGeesomeApp} from "../../app/interface";

const passport = require('passport');
const Strategy = require('passport-local').Strategy;
const bcrypt = require('bcrypt');

module.exports = async (app: IGeesomeApp) => {
    // Configure the local strategy for use by Passport.
    //
    // The local strategy require a `verify` function which receives the credentials
    // (`username` and `password`) submitted by the user.  The function must verify
    // that the password is correct and then invoke `cb` with a user object, which
    // will be set at `req.user` in route handlers after authentication.
    passport.use(new Strategy(
        function(username, password, cb) {
            app.database.getUserByName(username).then((user) => {
                if (!user) { 
                    return cb(null, false); 
                }
                bcrypt.compare(password, user.passwordHash, function(err, res) {
                    res ? cb(null, user) : cb(null, false);
                });
            }).catch(cb)
        }));


    // Configure Passport authenticated session persistence.
    //
    // In order to restore authentication state across HTTP requests, Passport needs
    // to serialize users into and deserialize users out of the session.  The
    // typical implementation of this is as simple as supplying the user ID when
    // serializing, and querying the user record by ID from the database when
    // deserializing.
    passport.serializeUser(function(user, cb) {
        cb(null, user.id);
    });

    passport.deserializeUser(function(id, cb) {
        app.database.getUser(id).then(user => cb(null, user)).catch(cb);
    });

    passport.handleAuth = () => {
        return (req, res, next) => {
            console.log('return (req, res, next)', req, res, next);
            return passport.authenticate('local')(req, res, () => {
                console.log('passport.authenticate');
                next(req, res);
            });
        }//, { failureRedirect: '/login' }
    };
    
    return passport;
};



