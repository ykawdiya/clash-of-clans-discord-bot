// src/commandModelFix.js
// This script prevents model redefinition errors by storing already defined models
const mongoose = require('mongoose');

// Store original model function
const originalModel = mongoose.model.bind(mongoose);

// Map to keep track of defined models and their schemas
const definedModels = new Map();

// Override the model function to check if a model with the same name has already been defined
mongoose.model = function(name, schema) {
    // If model doesn't exist or schema is not provided (just retrieving the model)
    if (!schema) {
        try {
            return originalModel(name);
        } catch (error) {
            // If the model doesn't exist and no schema provided, rethrow the error
            throw error;
        }
    }

    // If we haven't defined this model yet
    if (!definedModels.has(name)) {
        // Store schema so we can compare later
        definedModels.set(name, {
            defined: true,
            schema: schema
        });

        // Create the model
        return originalModel(name, schema);
    }

    // Model exists - validate the schema is the same to avoid conflicts
    const existingInfo = definedModels.get(name);

    // For safety, do a basic schema path comparison if possible
    if (existingInfo.schema && schema) {
        const existingPaths = Object.keys(existingInfo.schema.paths || {}).sort();
        const newPaths = Object.keys(schema.paths || {}).sort();

        // If schemas are different, warn but continue
        if (JSON.stringify(existingPaths) !== JSON.stringify(newPaths)) {
            console.warn(`WARNING: Model ${name} being redefined with a different schema. This may cause issues.`);
        }
    }

    // Return the existing model
    console.log(`Model ${name} already exists, reusing existing model`);
    return originalModel(name);
};

module.exports = { definedModels };