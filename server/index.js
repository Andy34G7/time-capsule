const express = require('express');
const serverless = require('serverless-http');
const cors = require('cors');
const helmet = require('helmet');
require('dotenv').config();

const app = express();

export const handler = serverless(app);