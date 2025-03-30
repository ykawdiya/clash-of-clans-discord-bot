// scripts/fix-mongoose-models.js
const fs = require('fs');
const path = require('path');

// Root directory of the project
const rootDir = path.resolve(__dirname, '..');

// File to create
const helperFilePath = path.join(rootDir, 'src', 'utils', 'modelHelper.js');

// Content for the helper file
const helperContent = `// src/utils/modelHelper.js
// This utility helps prevent Mongoose model redefinition errors
const mongoose = require('mongoose');

/**
 * Safely get or create a Mongoose model
 * @param {string} modelName - Name of the model
 * @param {mongoose.Schema} schema - Schema definition (only used if model doesn't exist)
 * @returns {mongoose.Model} The Mongoose model
 */
function getModel(modelName, schema) {
    try {
        // Try to get the existing model
        return mongoose.model(modelName);
    } catch (error) {
        // If model doesn't exist, create it with the provided schema
        if (error.name === 'MissingSchemaError' && schema) {
            return mongoose.model(modelName, schema);
        }
        throw error;
    }
}

module.exports = { getModel };
`;

// Write the helper file
fs.writeFileSync(helperFilePath, helperContent);
console.log(`Created model helper at ${helperFilePath}`);

// Now update each model to use the helper
function updateModelFiles() {
    const modelsDir = path.join(rootDir, 'src', 'models');
    const modelFiles = fs.readdirSync(modelsDir).filter(file => file.endsWith('.js'));

    console.log(`Found ${modelFiles.length} model files to check`);

    modelFiles.forEach(file => {
        const filePath = path.join(modelsDir, file);
        const content = fs.readFileSync(filePath, 'utf8');

        // Check if the file exports a model directly
        if (content.includes('module.exports = mongoose.model(')) {
            console.log(`Updating ${file}...`);

            // Simple replacement - this works for basic cases
            const updated = content.replace(
                /module\.exports = mongoose\.model\((['"])(.+?)(['"])(.*?)\);/g,
                `// Get the model safely using helper
const { getModel } = require('../utils/modelHelper');
module.exports = getModel($1$2$3$4);`
            );

            fs.writeFileSync(filePath, updated);
            console.log(`Updated ${file}`);
        } else {
            console.log(`No direct model export in ${file}, skipping`);
        }
    });
}

// Uncomment the next line to apply model updates
// updateModelFiles();

console.log('Helper file created. To update your model files, uncomment the updateModelFiles() line in this script.');
console.log('NOTE: Always make a backup before running automated code modifications!');