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
const CLIENT_ID = process.env.CLIENT_ID;
const oauthClient = new OAuth2Client(CLIENT_ID);

// Middleware for token validation
async function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Missing or invalid Authorization header' });
  }

  const token = authHeader.split(' ')[1];
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

// Helper to generate ETag
function generateETag(data) {
  return `"${Buffer.from(JSON.stringify(data)).toString('base64')}"`;
}

// POST (Create) Plan with ETag generation
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

    const etag = generateETag(data);
    await redisClient.set(objectId, JSON.stringify({ ...data, etag }));
    res.set('ETag', etag);
    res.status(201).json({ message: "Plan created", data, etag });
  } catch (err) {
    console.error('Error storing plan in Redis:', err);
    res.status(500).json({ error: 'Internal Server Error: Could not store plan' });
  }
});

// GET (Read) Plan with ETag validation
app.get(`/api/${API_VERSION}/plans/:objectId`, verifyToken, async (req, res) => {
  const { objectId } = req.params;

  try {
    const plan = await redisClient.get(objectId);

    if (!plan) {
      return res.status(404).json({ message: "Not Found: Plan not found" });
    }

    const parsedPlan = JSON.parse(plan);
    const etag = parsedPlan.etag || generateETag(parsedPlan);

    if (req.headers['if-none-match'] === etag) {
      return res.status(304).end(); // Not Modified
    }

    res.set('ETag', etag);
    res.status(200).json(parsedPlan);
  } catch (err) {
    console.error('Error reading plan from Redis:', err);
    res.status(500).json({ error: 'Internal Server Error: Could not retrieve plan' });
  }
});

// PUT (Replace) Plan with ETag generation
app.put(`/api/${API_VERSION}/plans/:objectId`, verifyToken, async (req, res) => {
  const { objectId } = req.params;
  const data = req.body;
  const isValid = validatePlan(data);

  if (!isValid) {
    return res.status(400).json({ errors: validatePlan.errors });
  }

  const etag = generateETag(data);

  try {
    const existingPlan = await redisClient.get(objectId);

    if (!existingPlan) {
      return res.status(404).json({ message: "Not Found: Plan does not exist" });
    }

    await redisClient.set(objectId, JSON.stringify({ ...data, etag }));
    res.set('ETag', etag);
    res.status(200).json({ message: "Plan replaced", data, etag });
  } catch (err) {
    console.error('Error replacing plan in Redis:', err);
    res.status(500).json({ error: 'Internal Server Error: Could not replace plan' });
  }
});

// PATCH (Update) Plan with ETag generation
app.patch(`/api/${API_VERSION}/plans/:objectId`, verifyToken, async (req, res) => {
  const { objectId } = req.params;
  const updates = req.body;

  try {
    const plan = await redisClient.get(objectId);

    if (!plan) {
      return res.status(404).json({ message: "Not Found: Plan does not exist" });
    }

    const parsedPlan = JSON.parse(plan);
    const updatedPlan = { ...parsedPlan, ...updates };
    const isValid = validatePlan(updatedPlan);

    if (!isValid) {
      return res.status(400).json({ errors: validatePlan.errors });
    }

    const etag = generateETag(updatedPlan);
    await redisClient.set(objectId, JSON.stringify({ ...updatedPlan, etag }));
    res.set('ETag', etag);
    res.status(200).json({ message: "Plan updated", data: updatedPlan, etag });
  } catch (err) {
    console.error('Error updating plan in Redis:', err);
    res.status(500).json({ error: 'Internal Server Error: Could not update plan' });
  }
});

// DELETE Plan with ETag validation
app.delete(`/api/${API_VERSION}/plans/:objectId`, verifyToken, async (req, res) => {
  const { objectId } = req.params;

  try {
    const plan = await redisClient.get(objectId);

    if (!plan) {
      return res.status(404).json({ message: "Not Found: Plan not found" });
    }

    const parsedPlan = JSON.parse(plan);
    const etag = parsedPlan.etag;

    if (req.headers['if-match'] && req.headers['if-match'] !== etag) {
      return res.status(412).json({ message: "Precondition Failed: ETag does not match" });
    }

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

process.on('SIGINT', async () => {
  console.log('Disconnecting Redis client...');
  await redisClient.quit();
  process.exit(0);
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
