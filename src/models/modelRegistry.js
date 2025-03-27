// src/models/modelRegistry.js
const mongoose = require('mongoose');

// Store already registered models to prevent redefinition
const modelRegistry = new Map();

/**
 * Get or create a Mongoose model safely
 * @param {string} name - Model name
 * @param {mongoose.Schema} schema - Schema (only used if model doesn't exist)
 * @returns {mongoose.Model} The model
 */
function getModel(name, schema) {
    // Check if the model is already registered
    if (mongoose.models[name]) {
        return mongoose.model(name);
    }

    // Check if we've registered this model in our registry
    if (modelRegistry.has(name)) {
        return modelRegistry.get(name);
    }

    // Create new model
    const model = mongoose.model(name, schema);
    modelRegistry.set(name, model);
    return model;
}

module.exports = { getModel };