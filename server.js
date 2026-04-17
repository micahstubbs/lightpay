const {log} = console;

const compression = require('compression');
const cors = require('cors');
const express = require('express');
const helmet = require('helmet');
const morgan = require('morgan');

const apiRouter = require('./routers/api');

const {OCW_PORT} = process.env;
const {PORT} = process.env;

const morganLogLevel = 'dev';
const port = PORT || OCW_PORT || 9889;

const app = express();

app.use(helmet.hidePoweredBy());
app.use(compression());
app.use(cors());

app.use(express.static('public'));
app.use(morgan(morganLogLevel));
app.set('view engine', 'pug');

app.get('/', ({path}, res) => res.render('index', {path}));
app.use('/api/v0', apiRouter({log}));
app.get('/refund', ({path}, res) => res.render('refund', {path}));

app.listen(port, () => log(`Server listening on port ${port}.`));
