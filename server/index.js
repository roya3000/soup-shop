// @flow
/* eslint-disable no-console */

import express from 'express';
import compression from 'compression';
import { resolve as pathResolve } from 'path';
import appRootDir from 'app-root-dir';
import graphqlHTTP from 'express-graphql';
import uuid from 'uuid';
import mongoose from 'mongoose';
import chalk from 'chalk';

import reactApplication from './middleware/reactApplication';
import security from './middleware/security';
import clientBundle from './middleware/clientBundle';
import serviceWorker from './middleware/serviceWorker';
import offlinePage from './middleware/offlinePage';
import errorHandlers from './middleware/errorHandlers';
import * as EnvVars from '../config/utils/envVars';
import config from '../config';
import schema from './graphql/schema/schema';

// Expose Models
import './models';

// Create our express based server.
const app = express();

// Don't expose any software information to potential hackers.
app.disable('x-powered-by');

// Security middlewares.
// TODO error with graphiql and using security middleware
// / Need better way to fix this ///////////
if (process.env.NODE_ENV === 'development') {
  app.use((req, res, next) => {
    res.locals.nonce = uuid.v4();
    next();
  });
}

if (process.env.NODE_ENV === 'production') {
  app.use(...security);
}
// ////////////////////////////////////////

// Gzip compress the responses.
app.use(compression());

// Register our service worker generated by our webpack config.
// We do not want the service worker registered for development builds, and
// additionally only want it registered if the config allows.
if (process.env.BUILD_FLAG_IS_DEV === 'false' && config('serviceWorker.enabled')) {
  app.get(`/${config('serviceWorker.fileName')}`, serviceWorker);
  app.get(
    `${config('bundles.client.webPath')}${config('serviceWorker.offlinePageFileName')}`,
    offlinePage,
  );
}

// Configure serving of our client bundle.
app.use(config('bundles.client.webPath'), clientBundle);

// Configure static serving of our "public" root http path static files.
// Note: these will be served off the root (i.e. '/') of our application.
app.use(express.static(pathResolve(appRootDir.get(), config('publicAssetsPath'))));

/**
 * Connect to MongoDB.
 */
mongoose.Promise = global.Promise;
mongoose.connect(`mongodb://${EnvVars.string('MONGODB_URI')}`, { useMongoClient: true });
mongoose.connection
  .on('error', (err) => {
    console.error(err);
    console.log(
      '%s MongoDB connection error. Please make sure MongoDB is running.',
      chalk.red('✗'),
    );
    process.exit();
  })
  .once('open', () => console.log('%s Connected to Mongodb instance.', chalk.green('✔')));

/**
 * Connect to GraphQL.
 */
app.use(
  '/graphql',
  graphqlHTTP({
    schema,
    graphiql: true,
    pretty: true,
  }),
);

// The React application middleware.
app.get('*', reactApplication);

// Error Handler middlewares.
app.use(...errorHandlers);

// Create an http listener for our express app.
const listener = app.listen(config('port'), () =>
  console.log(`%s Server listening on port ${config('port')}`, chalk.green('✔')),
);

// We export the listener as it will be handy for our development hot reloader,
// or for exposing a general extension layer for application customisations.
export default listener;
