const express = require('express');
const bodyParser = require('body-parser');
const connection = require('./config/db');
const Plan = require('./models/Plan.js');
const dotenv = require('dotenv');


dotenv.config();  // Initialize dotenv to use environment variables

const app = express();
const PORT = 3000;

app.use(bodyParser.json());

// Connect to the database
connection();

// Create a plan
app.post('/plans', async (req, res) => {
  try {
    const plan = new Plan(req.body);
    await plan.save();
    res.status(201).json({ message: "Plan created", data: plan });
  } catch (error) {
    res.status(400).json({ errors: error.message });
  }
});

// Get a plan by objectId
app.get('/plans/:objectId', async (req, res) => {
  try {
    const { objectId } = req.params;
    const plan = await Plan.findOne({ "planCostShares.objectId": objectId });

    if (!plan) {
      return res.status(404).json({ message: "Plan not found" });
    }
    res.json(plan);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.delete('/plans/:objectId', async (req, res) => {
  try {
    const { objectId } = req.params;
    const deletedPlan = await Plan.findOneAndDelete({ "planCostShares.objectId": objectId });

    if (!deletedPlan) {
      return res.status(404).json({ message: "Plan not found" });
    }

    res.status(200).json({ message: "Plan deleted successfully" }); // Changed status to 200 with message
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});


app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
