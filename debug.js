// debug.js - Updated version
const fs = require('fs');

// Start memory monitoring
const memoryUsage = [];
const memoryInterval = setInterval(() => {
    const usage = process.memoryUsage();
    memoryUsage.push({
        time: new Date().toISOString(),
        rss: Math.round(usage.rss / 1024 / 1024), // RSS in MB
        heapTotal: Math.round(usage.heapTotal / 1024 / 1024), // Heap total in MB
        heapUsed: Math.round(usage.heapUsed / 1024 / 1024), // Heap used in MB
        external: Math.round(usage.external / 1024 / 1024) // External in MB
    });

    // Log every 10th entry to console
    if (memoryUsage.length % 10 === 0) {
        const latest = memoryUsage[memoryUsage.length - 1];
        console.log(`Memory: ${latest.rss}MB RSS, ${latest.heapUsed}MB Heap Used`);
    }

    // Write to file every 50 entries
    if (memoryUsage.length % 50 === 0) {
        fs.writeFileSync(
            'memory-debug.json',
            JSON.stringify(memoryUsage, null, 2)
        );
    }
}, 5000); // Every 5 seconds

// Listen for process termination to save final memory stats
process.on('SIGINT', () => {
    clearInterval(memoryInterval);
    fs.writeFileSync(
        'memory-debug.json',
        JSON.stringify(memoryUsage, null, 2)
    );
    console.log('Memory debug data saved to memory-debug.json');
    process.exit(0);
});

// Now require your main file
require('./src/index');