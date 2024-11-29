const express = require('express');
const bodyParser = require('body-parser');
const Ajv = require('ajv');
const redisClient = require('./redisConnection'); 
const planSchema = require('./schema'); 
const dotenv = require('dotenv');
const { OAuth2Client } = require('google-auth-library');

dotenv.config();  

const app = express();
const ajv = new Ajv();
const PORT = process.env.PORT || 3000;
const API_VERSION = 'v1';

// Google OAuth2 Client
const CLIENT_ID = "690786630324-dohd0m1gq1i72l5pe2c3405ks8vo9248.apps.googleusercontent.com";  // Load CLIENT_ID from .env file
const oauthClient = new OAuth2Client(CLIENT_ID);

// Middleware for token validation
async function verifyToken(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized: Missing or invalid Authorization header' });
    }
  
    const token = authHeader.split(' ')[1];
    console.log(`Received token: '${token}'`);
console.log(`Token length: ${token.length}`);

  
    try {
      const ticket = await oauthClient.verifyIdToken({
        idToken: token,
        audience: CLIENT_ID,
      });
      const payload = ticket.getPayload();
      req.user = payload;
      next();
    } catch (error) {
      console.error('Token validation error:', error.message);
      return res.status(403).json({ error: `Forbidden: ${error.message}` });
    }
  }
  

app.use(bodyParser.json());

const validatePlan = ajv.compile(planSchema);

// POST (Create) Plan with Bearer Token Authentication
app.post(`/api/${API_VERSION}/plans`, verifyToken, async (req, res) => {
  const data = req.body;
  const isValid = validatePlan(data);

  if (!isValid) {
    return res.status(400).json({ errors: validatePlan.errors });
  }

  const objectId = data.planCostShares.objectId;

  try {
    const existingPlan = await redisClient.get(objectId);

    if (existingPlan) {
      return res.status(409).json({ message: "Conflict: Plan already exists", data: JSON.parse(existingPlan) });
    }

    await redisClient.set(objectId, JSON.stringify(data));
    res.status(201).json({ message: "Plan created", data });
  } catch (err) {
    console.error('Error storing plan in Redis:', err);
    res.status(500).json({ error: 'Internal Server Error: Could not store plan' });
  }
});

// GET (Read) Plan with conditional ETag support
app.get(`/api/${API_VERSION}/plans/:objectId`, verifyToken, async (req, res) => {
  const { objectId } = req.params;

  try {
    const plan = await redisClient.get(objectId);

    if (!plan) {
      return res.status(404).json({ message: "Not Found: Plan not found" });
    }

    const etag = `"${Buffer.from(plan).toString('base64')}"`;

    if (req.headers['if-none-match'] === etag) {
      return res.status(304).end(); // Not Modified
    }

    res.set('ETag', etag);
    res.status(200).json(JSON.parse(plan));
  } catch (err) {
    console.error('Error reading plan from Redis:', err);
    res.status(500).json({ error: 'Internal Server Error: Could not retrieve plan' });
  }
});

// PATCH (Update/Merge) Plan
app.patch(`/api/${API_VERSION}/plans/:objectId`, verifyToken, async (req, res) => {
  const { objectId } = req.params;
  const updates = req.body;

  try {
    const plan = await redisClient.get(objectId);

    if (!plan) {
      return res.status(404).json({ message: "Not Found: Plan does not exist" });
    }

    const planData = JSON.parse(plan);
    const updatedPlan = { ...planData, ...updates };

    const isValid = validatePlan(updatedPlan);
    if (!isValid) {
      return res.status(400).json({ errors: validatePlan.errors });
    }

    await redisClient.set(objectId, JSON.stringify(updatedPlan));
    res.status(200).json({ message: "Plan updated", data: updatedPlan });
  } catch (err) {
    console.error('Error updating plan in Redis:', err);
    res.status(500).json({ error: 'Internal Server Error: Could not update plan' });
  }
});

// DELETE Plan
app.delete(`/api/${API_VERSION}/plans/:objectId`, verifyToken, async (req, res) => {
  const { objectId } = req.params;

  try {
    const deleted = await redisClient.del(objectId);

    if (deleted === 0) {
      return res.status(404).json({ message: "Not Found: Plan not found" });
    }

    res.status(204).end();
  } catch (err) {
    console.error('Error deleting plan from Redis:', err);
    res.status(500).json({ error: 'Internal Server Error: Could not delete plan' });
  }
});

// Gracefully handle process termination
process.on('SIGINT', async () => {
  console.log('Disconnecting Redis client...');
  await redisClient.quit();
  process.exit(0);
});

// Optional: Implement Rate Limiting to secure API (e.g., using `express-rate-limit`)
// const rateLimit = require('express-rate-limit');
// app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 100 })); // 100 requests per 15 minutes

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
