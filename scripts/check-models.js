// scripts/check-models.js
const fs = require('fs');
const path = require('path');

// Function to recursively search for js files
function findJsFiles(dir, fileList = []) {
    const files = fs.readdirSync(dir);

    files.forEach(file => {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);

        if (stat.isDirectory()) {
            findJsFiles(filePath, fileList);
        } else if (file.endsWith('.js')) {
            fileList.push(filePath);
        }
    });

    return fileList;
}

// Function to check if a file contains mongoose model definitions
function checkForModelDefinitions(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');

    // Check for mongoose.model() calls
    const modelMatch = content.match(/mongoose\.model\s*\(\s*['"](.*?)['"].*?\)/g);

    // Check for Schema definitions
    const schemaMatch = content.match(/new\s+mongoose\.Schema\s*\(/g);

    return {
        filePath,
        hasModelDefinition: !!modelMatch,
        modelNames: modelMatch ? modelMatch.map(match => {
            const nameMatch = match.match(/mongoose\.model\s*\(\s*['"](.*?)['"].*?\)/);
            return nameMatch ? nameMatch[1] : null;
        }).filter(Boolean) : [],
        hasSchemaDefinition: !!schemaMatch
    };
}

// Main function
function findModelDefinitions(rootDir) {
    console.log(`Searching for Mongoose model definitions in ${rootDir}...`);

    const jsFiles = findJsFiles(rootDir);
    console.log(`Found ${jsFiles.length} JavaScript files to scan.`);

    const modelFiles = [];
    const modelsByName = {};

    jsFiles.forEach(filePath => {
        const result = checkForModelDefinitions(filePath);

        if (result.hasModelDefinition || result.hasSchemaDefinition) {
            const relativePath = path.relative(rootDir, filePath);
            modelFiles.push({
                file: relativePath,
                ...result
            });

            // Group models by name
            result.modelNames.forEach(name => {
                if (!modelsByName[name]) {
                    modelsByName[name] = [];
                }
                modelsByName[name].push(relativePath);
            });
        }
    });

    console.log(`\nFound ${modelFiles.length} files with Mongoose model or schema definitions:`);
    modelFiles.forEach(file => {
        console.log(`- ${file.file}`);
        if (file.modelNames.length > 0) {
            console.log(`  Models defined: ${file.modelNames.join(', ')}`);
        } else if (file.hasSchemaDefinition) {
            console.log('  Contains schema definition but no model exports');
        }
    });

    // Check for duplicate model definitions
    console.log('\nChecking for duplicate model definitions:');
    let hasDuplicates = false;

    Object.entries(modelsByName).forEach(([name, files]) => {
        if (files.length > 1) {
            hasDuplicates = true;
            console.log(`⚠️ Model '${name}' is defined in multiple files:`);
            files.forEach(file => console.log(`  - ${file}`));
        }
    });

    if (!hasDuplicates) {
        console.log('✓ No duplicate model definitions found.');
    }

    return { modelFiles, modelsByName };
}

// Run the analysis on the project root
const projectRoot = path.resolve(__dirname, '..');
findModelDefinitions(projectRoot);