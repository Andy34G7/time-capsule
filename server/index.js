require('dotenv').config();
const express = require('express');
const serverless = require('serverless-http');
const cors = require('cors');
const helmet = require('helmet');
const capsuleRoutes = require('./routes/capsuleRoutes');

const app = express();

const allowedOrigins = process.env.ALLOWED_ORIGINS
	? process.env.ALLOWED_ORIGINS.split(',').map((origin) => origin.trim()).filter(Boolean)
	: null;

app.use(helmet());
app.use(cors(allowedOrigins ? { origin: allowedOrigins } : {}));
app.use(express.json({ limit: '1mb' }));

app.get('/health', (req, res) => {
	res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/capsules', capsuleRoutes);

app.use((req, res) => {
	res.status(404).json({ error: 'RouteNotFound' });
});

app.use((err, req, res, next) => {
	const statusCode = err.statusCode || 500;
	if (statusCode >= 500) {
		console.error(err);
	}
	res.status(statusCode).json({
		error: err.message || 'InternalServerError',
		details: err.details,
	});
});

const port = Number(process.env.PORT) || 4000;

// to check which port while dev

const isServerlessRuntime = Boolean(process.env.LAMBDA_TASK_ROOT); //this is set by AWS Lambda
if (!isServerlessRuntime) {
	app.listen(port, () => {
		console.log(`API listening on port ${port}`);
	});
}

const handler = serverless(app);

module.exports = {
	handler,
	app,
};