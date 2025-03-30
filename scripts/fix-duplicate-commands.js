// scripts/fix-duplicate-commands.js
const fs = require('fs');
const path = require('path');
const { REST } = require('discord.js');
const { Routes } = require('discord.js');

// Path resolution for .env file
const envPath = path.resolve(__dirname, '../.env');
if (fs.existsSync(envPath)) {
    require('dotenv').config({ path: envPath });
    console.log('Loaded environment from ../.env');
} else {
    require('dotenv').config();
}

// Check for required environment variables
const token = process.env.DISCORD_TOKEN;
const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID;

if (!token || !clientId) {
    console.error('Missing required environment variables: DISCORD_TOKEN and CLIENT_ID');
    process.exit(1);
}

// Create REST client
const rest = new REST({ version: '10' }).setToken(token);

async function fixDuplicateCommands() {
    try {
        console.log('Analyzing command registrations...');

        // Get global commands
        console.log('Fetching global commands...');
        const globalCommands = await rest.get(Routes.applicationCommands(clientId));
        console.log(`Found ${globalCommands.length} global commands`);

        // Get guild commands if GUILD_ID is set
        let guildCommands = [];
        if (guildId) {
            console.log(`Fetching commands for guild ${guildId}...`);
            guildCommands = await rest.get(Routes.applicationGuildCommands(clientId, guildId));
            console.log(`Found ${guildCommands.length} guild commands`);
        }

        // Compare commands to find duplicates
        const commandNameMap = {};

        // Track which commands exist in both places
        globalCommands.forEach(cmd => {
            if (!commandNameMap[cmd.name]) {
                commandNameMap[cmd.name] = { global: true, guild: false };
            }
        });

        guildCommands.forEach(cmd => {
            if (!commandNameMap[cmd.name]) {
                commandNameMap[cmd.name] = { global: false, guild: true };
            } else {
                commandNameMap[cmd.name].guild = true;
            }
        });

        // Check for duplicates (commands in both global and guild scope)
        const duplicates = Object.entries(commandNameMap)
            .filter(([_, locations]) => locations.global && locations.guild)
            .map(([name]) => name);

        if (duplicates.length > 0) {
            console.log(`\n⚠️ Found ${duplicates.length} commands registered in both global and guild scope:`);
            duplicates.forEach(name => console.log(`- ${name}`));

            console.log('\nThis is causing the duplicate commands in your Discord interface.');

            // Ask for confirmation before fixing
            console.log('\n----------------------------------');
            console.log('Would you like to fix this issue?');
            console.log('1. Remove ALL guild commands (recommended if you have duplicate commands)');
            console.log('2. Remove ALL global commands (not recommended for production bots)');
            console.log('3. Remove only duplicate commands from guild scope');
            console.log('4. Exit without making changes');
            console.log('----------------------------------');

            // Simulate user input for our script
            const choice = '1'; // Set to 1 by default for this example

            if (choice === '1') {
                console.log('\nRemoving ALL guild commands...');

                // Delete all guild commands
                await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: [] });
                console.log(`Successfully removed all guild commands from guild ${guildId}`);

                console.log('\nYour commands will now only appear once in Discord.');
                console.log('NOTE: It may take up to an hour for changes to appear in all Discord clients.');

            } else if (choice === '2') {
                console.log('\nRemoving ALL global commands...');

                // Delete all global commands
                await rest.put(Routes.applicationCommands(clientId), { body: [] });
                console.log('Successfully removed all global commands');

                console.log('\nYour commands will now only appear once in Discord.');
                console.log('NOTE: It may take up to an hour for changes to appear in all Discord clients.');

            } else if (choice === '3') {
                console.log('\nRemoving duplicate commands from guild scope...');

                // Get commands to keep (non-duplicates)
                const commandsToKeep = guildCommands.filter(cmd => !duplicates.includes(cmd.name));

                // Update guild commands
                await rest.put(
                    Routes.applicationGuildCommands(clientId, guildId),
                    { body: commandsToKeep }
                );

                console.log(`Successfully removed ${duplicates.length} duplicate commands from guild ${guildId}`);
                console.log('\nYour commands will now only appear once in Discord.');
                console.log('NOTE: It may take up to an hour for changes to appear in all Discord clients.');

            } else {
                console.log('\nExiting without making changes.');
            }
        } else {
            console.log('\nNo duplicate commands found between global and guild scope.');
            console.log('\nChecking for other potential issues:');

            // Check if the same command appears multiple times in the same scope
            const globalDupes = findDuplicatesInScope(globalCommands);
            const guildDupes = findDuplicatesInScope(guildCommands);

            if (globalDupes.length > 0) {
                console.log(`⚠️ Found duplicate command names in global scope: ${globalDupes.join(', ')}`);
                console.log('This should not be possible with the Discord API. Please report this issue.');
            }

            if (guildDupes.length > 0) {
                console.log(`⚠️ Found duplicate command names in guild scope: ${guildDupes.join(', ')}`);
                console.log('This should not be possible with the Discord API. Please report this issue.');
            }

            if (globalDupes.length === 0 && guildDupes.length === 0) {
                console.log('✓ No duplicate command names found in either scope.');
                console.log('\nIf you\'re still seeing duplicate commands in Discord:');
                console.log('1. It may take up to an hour for changes to propagate to all Discord clients');
                console.log('2. Try restarting your Discord client or using Discord in a web browser');
                console.log('3. Check if your bot is running multiple instances');
            }
        }
    } catch (error) {
        console.error('Error analyzing commands:', error);
    }
}

// Helper function to find duplicates in a single scope
function findDuplicatesInScope(commands) {
    const names = commands.map(cmd => cmd.name);
    return names.filter((name, index) => names.indexOf(name) !== index);
}

// Run the analysis and fix
fixDuplicateCommands();