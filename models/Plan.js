const mongoose = require('mongoose');

const planSchema = new mongoose.Schema({
  planCostShares: {
    deductible: { type: Number, required: true },
    _org: { type: String, required: true },
    copay: { type: Number, required: true },
    objectId: { type: String, required: true },
    objectType: { type: String, required: true },
  },
  linkedPlanServices: [
    {
      linkedService: {
        _org: { type: String, required: true },
        objectId: { type: String, required: true },
        objectType: { type: String, required: true },
        name: { type: String, required: true },
      },
      planserviceCostShares: {
        deductible: { type: Number, required: true },
        _org: { type: String, required: true },
        copay: { type: Number, required: true },
        objectId: { type: String, required: true },
        objectType: { type: String, required: true },
      },
      _org: { type: String, required: true },
      objectId: { type: String, required: true },
      objectType: { type: String, required: true },
    }
  ],
  _org: { type: String, required: true },
  objectId: { type: String, required: true },
  objectType: { type: String, required: true },
  planType: { type: String, required: true },
  creationDate: { type: String, required: true },
});

const Plan = mongoose.model('Plan', planSchema);

module.exports = Plan; 
