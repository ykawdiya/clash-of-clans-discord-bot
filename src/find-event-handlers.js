// src/find-event-handlers.js
// This script scans your codebase for potential interaction handlers
const fs = require('fs');
const path = require('path');

// Patterns to search for
const patterns = [
    'client.on(\'interactionCreate\'',
    'client.on(Events.InteractionCreate',
    'interaction.defer',
    'interaction.reply',
    'interactionCreate',
    'createMessageComponentCollector'
];

// Directories to scan
const dirsToScan = [
    path.join(__dirname), // src directory
    path.join(__dirname, '..') // root directory
];

// Files to ignore (node_modules and the current script)
const ignore = [
    'node_modules',
    'find-event-handlers.js',
    'fresh-slash-bot.js',
    'message-bot.js',
    'diagnostic-bot.js'
];

// Function to scan files
function scanForPatterns(directory) {
    try {
        const items = fs.readdirSync(directory);

        for (const item of items) {
            // Skip ignored items
            if (ignore.some(ignoreItem => item.includes(ignoreItem))) {
                continue;
            }

            const itemPath = path.join(directory, item);
            const stats = fs.statSync(itemPath);

            if (stats.isDirectory()) {
                // Recursively scan subdirectories
                scanForPatterns(itemPath);
            } else if (stats.isFile() && item.endsWith('.js')) {
                // Scan JavaScript files
                const content = fs.readFileSync(itemPath, 'utf8');
                const matches = [];

                // Check for each pattern
                for (const pattern of patterns) {
                    if (content.includes(pattern)) {
                        matches.push(pattern);
                    }
                }

                // If any patterns found, report the file
                if (matches.length > 0) {
                    const relativePath = path.relative(process.cwd(), itemPath);
                    console.log(`Found potential event handlers in: ${relativePath}`);
                    console.log(`  Matches: ${matches.join(', ')}`);

                    // Show context around matches
                    for (const match of matches) {
                        const index = content.indexOf(match);
                        if (index !== -1) {
                            const start = Math.max(0, index - 100);
                            const end = Math.min(content.length, index + match.length + 100);
                            const context = content.substring(start, end);
                            console.log(`\n  Context for "${match}":`);
                            console.log(`  ${context.replace(/\n/g, '\n  ')}`);
                            console.log();
                        }
                    }
                }
            }
        }
    } catch (error) {
        console.error(`Error scanning ${directory}:`, error);
    }
}

// Run the scan
console.log('Scanning for interaction handlers...');
for (const dir of dirsToScan) {
    scanForPatterns(dir);
}
console.log('Scan complete.');