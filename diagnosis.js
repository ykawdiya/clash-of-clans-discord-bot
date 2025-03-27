require('dotenv').config();
const fs = require('fs');
const path = require('path');

console.log('===== BOT DIAGNOSTICS =====');

// Check environment variables
console.log('\n== Environment Variables ==');
console.log('DISCORD_TOKEN set:', !!process.env.DISCORD_TOKEN);
console.log('COC_API_KEY set:', !!process.env.COC_API_KEY);
console.log('MONGODB_URI set:', !!process.env.MONGODB_URI);
console.log('PROXY_HOST set:', !!process.env.PROXY_HOST);
console.log('PROXY_PORT set:', !!process.env.PROXY_PORT);
console.log('PROXY_USERNAME set:', !!process.env.PROXY_USERNAME);
console.log('PROXY_PASSWORD set:', !!process.env.PROXY_PASSWORD);

// Check file structure
console.log('\n== File Structure ==');
const requiredDirs = [
    './src',
    './src/commands',
    './src/events',
    './src/handlers',
    './src/services',
    './src/models',
    './src/utils'
];

for (const dir of requiredDirs) {
    console.log(`${dir} exists:`, fs.existsSync(dir));
}

// Check key files
console.log('\n== Key Files ==');
const keyFiles = [
    './index.js',
    './src/handlers/commandHandler.js',
    './src/handlers/eventHandler.js',
    './src/services/clashApiService.js',
    './events/interactionCreate.js',
    './src/events/ready.js'
];

for (const file of keyFiles) {
    console.log(`${file} exists:`, fs.existsSync(file));
}

// Count command files
console.log('\n== Command Files ==');
const commandsPath = path.join(__dirname, 'src', 'commands');
if (fs.existsSync(commandsPath)) {
    const categories = fs.readdirSync(commandsPath).filter(file =>
        fs.statSync(path.join(commandsPath, file)).isDirectory()
    );

    console.log('Command categories:', categories.length);
    for (const category of categories) {
        const categoryPath = path.join(commandsPath, category);
        const commands = fs.readdirSync(categoryPath).filter(file => file.endsWith('.js'));
        console.log(`- ${category}: ${commands.length} commands`);
        commands.forEach(cmd => console.log(`  - ${cmd}`));
    }
}

// Check if src/index.js exists (this would be a problem)
console.log('\nPotential Issues:');
if (fs.existsSync('./src/index.js')) {
    console.log('WARNING: index.js exists in both root and src/ - this can cause conflicts');
}

// Count event files
const eventsPath = path.join(__dirname, 'src', 'events');
if (fs.existsSync(eventsPath)) {
    const events = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));
    console.log(`\nFound ${events.length} event files`);
}

console.log('\n===== DIAGNOSTICS COMPLETE =====');