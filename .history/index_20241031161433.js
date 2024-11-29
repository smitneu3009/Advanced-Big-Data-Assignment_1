const express = require('express');
const bodyParser = require('body-parser');
const Ajv = require('ajv');
const redisClient = require('./redisConnection'); 
const planSchema = require('./schema'); 
const dotenv = require('dotenv');
const { OAuth2Client } = require('google-auth-library');
const crypto = require('crypto'); // Import crypto for ETag hashing

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

// Helper function to generate ETag
function generateETag(data) {
  return crypto.createHash('sha1').update(data).digest('hex');
}

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
    const etag = generateETag(JSON.stringify(data));
    res.set('ETag', etag);
    res.status(201).json({ message: "Plan created", data });
  } catch (err) {
    console.error('Error storing plan in Redis:', err);
    res.status(500).json({ error: 'Internal Server Error: Could not store plan' });
  }
});

// PUT (Replace) Plan
app.put(`/api/${API_VERSION}/plans/:objectId`, verifyToken, async (req, res) => {
  const { objectId } = req.params;
  const newData = req.body;

  if (!validatePlan(newData)) {
    return res.status(400).json({ errors: validatePlan.errors });
  }

  try {
    const existingPlan = await redisClient.get(objectId);
    if (!existingPlan) {
      return res.status(404).json({ message: "Not Found: Plan does not exist" });
    }

    const currentETag = generateETag(existingPlan);

    if (req.headers['if-match'] !== currentETag) {
      return res.status(412).json({ error: 'Precondition Failed: ETag does not match' });
    }

    await redisClient.set(objectId, JSON.stringify(newData));
    const etag = generateETag(JSON.stringify(newData));
    res.set('ETag', etag);
    res.status(200).json({ message: "Plan replaced", data: newData });
  } catch (err) {
    console.error('Error replacing plan in Redis:', err);
    res.status(500).json({ error: 'Internal Server Error: Could not replace plan' });
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

    const etag = generateETag(plan);

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

// PATCH (Update/Merge) Plan with ETag validation
app.patch(`/api/${API_VERSION}/plans/:objectId`, verifyToken, async (req, res) => {
  const { objectId } = req.params;
  const updates = req.body;

  try {
    const plan = await redisClient.get(objectId);

    if (!plan) {
      return res.status(404).json({ message: "Not Found: Plan does not exist" });
    }

    const currentETag = generateETag(plan);

    if (req.headers['if-match'] !== currentETag) {
      return res.status(412).json({ error: 'Precondition Failed: ETag does not match' });
    }

    const planData = JSON.parse(plan);
    const updatedPlan = { ...planData, ...updates };

    if (!validatePlan(updatedPlan)) {
      return res.status(400).json({ errors: validatePlan.errors });
    }

    await redisClient.set(objectId, JSON.stringify(updatedPlan));
    const etag = generateETag(JSON.stringify(updatedPlan));
    res.set('ETag', etag);
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
    const plan = await redisClient.get(objectId);

    if (!plan) {
      return res.status(404).json({ message: "Not Found: Plan not found" });
    }

    const etag = generateETag(plan);

    if (req.headers['if-none-match'] && req.headers['if-none-match'] !== etag) {
      return res.status(412).json({ error: 'Precondition Failed: ETag does not match' });
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

// Gracefully handle process termination
process.on('SIGINT', async () => {
  console.log('Disconnecting Redis client...');
  await redisClient.quit();
  process.exit(0);
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
