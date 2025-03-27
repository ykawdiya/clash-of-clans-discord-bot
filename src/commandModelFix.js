// src/commandModelFix.js
// This script prevents model redefinition errors by storing already defined models
const mongoose = require('mongoose');

// Store original model function
const originalModel = mongoose.model.bind(mongoose);

// Map to keep track of defined models
const definedModels = new Map();

// Override the model function to check if a model with the same name has already been defined
mongoose.model = function(name, schema) {
    // If model doesn't exist or schema is not provided (just retrieving the model)
    if (!schema || !definedModels.has(name)) {
        // If we're defining a new model, store it
        if (schema) {
            definedModels.set(name, true);
        }
        // Call original function
        return originalModel(name, schema);
    }

    // Model already exists, just return it
    console.log(`Model ${name} already exists, reusing existing model`);
    return originalModel(name);
};

module.exports = { definedModels };