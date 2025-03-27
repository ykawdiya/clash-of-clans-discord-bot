// fix-commands.js
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { REST, Routes } = require('discord.js');

// Check for required environment variables
if (!process.env.DISCORD_TOKEN) {
    console.error('DISCORD_TOKEN is not set in environment variables');
    process.exit(1);
}

if (!process.env.CLIENT_ID) {
    console.error('CLIENT_ID is not set in environment variables');
    process.exit(1);
}

async function fixCommands() {
    try {
        // Create missing directories
        const requiredDirs = [
            './src',
            './src/commands',
            './src/commands/info',
            './src/commands/clan',
            './src/commands/war',
            './src/commands/tracking',
            './src/commands/utility',
            './src/commands/base',
            './src/commands/events',
            './src/commands/recruitment',
            './src/commands/admin',
            './src/commands/capital',
            './src/events',
            './src/handlers',
            './src/services',
            './src/models',
            './src/utils'
        ];

        // Create any missing directories
        for (const dir of requiredDirs) {
            if (!fs.existsSync(dir)) {
                console.log(`Creating missing directory: ${dir}`);
                fs.mkdirSync(dir, { recursive: true });
            }
        }

        // Load and validate commands
        const commandsPath = path.join(process.cwd(), './src/commands');
        console.log(`Looking for commands in: ${commandsPath}`);

        const commands = [];
        const commandsWithIssues = [];

        const commandFolders = fs.readdirSync(commandsPath);
        console.log(`Found command folders: ${commandFolders.join(', ')}`);

        for (const folder of commandFolders) {
            const folderPath = path.join(commandsPath, folder);

            if (!fs.statSync(folderPath).isDirectory()) continue;

            console.log(`Checking files in ${folder} folder...`);

            const commandFiles = fs.readdirSync(folderPath).filter(file => file.endsWith('.js'));
            console.log(`Found ${commandFiles.length} command files in ${folder}`);

            for (const file of commandFiles) {
                const filePath = path.join(folderPath, file);
                try {
                    // Clear require cache
                    delete require.cache[require.resolve(filePath)];

                    const command = require(filePath);

                    // Validate command structure
                    if (!command.data) {
                        console.warn(`❌ Missing data property in ${filePath}`);
                        commandsWithIssues.push({ path: filePath, issue: 'Missing data property' });
                        continue;
                    }

                    if (!command.execute) {
                        console.warn(`❌ Missing execute method in ${filePath}`);
                        commandsWithIssues.push({ path: filePath, issue: 'Missing execute method' });
                        continue;
                    }

                    try {
                        // Check if toJSON method exists and works
                        const jsonData = command.data.toJSON();
                        commands.push(jsonData);
                        console.log(`✅ Valid command: ${command.data.name}`);
                    } catch (jsonError) {
                        console.error(`❌ Failed to convert command data to JSON in ${filePath}:`, jsonError.message);
                        commandsWithIssues.push({ path: filePath, issue: 'Invalid command data structure: ' + jsonError.message });
                    }
                } catch (error) {
                    console.error(`❌ Error loading command from ${filePath}:`, error.message);
                    commandsWithIssues.push({ path: filePath, issue: 'Failed to load: ' + error.message });
                }
            }
        }

        console.log(`Found ${commands.length} valid commands`);
        console.log(`Found ${commandsWithIssues.length} commands with issues`);

        if (commandsWithIssues.length > 0) {
            console.log('\nCommands with issues:');
            commandsWithIssues.forEach(issue => {
                console.log(`- ${issue.path}: ${issue.issue}`);
            });
        }

        // Register commands if there are any valid ones
        if (commands.length > 0) {
            console.log('\nAttempting to register commands...');

            const clientId = process.env.CLIENT_ID;
            const guildId = process.env.GUILD_ID; // Optional

            const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

            try {
                // Clear existing commands first (optional)
                if (guildId) {
                    console.log(`Clearing existing guild commands for guild ${guildId}...`);
                    await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: [] });
                } else {
                    console.log('Clearing existing global commands...');
                    await rest.put(Routes.applicationCommands(clientId), { body: [] });
                }

                // Register new commands
                if (guildId) {
                    console.log(`Registering ${commands.length} commands to guild ${guildId}...`);
                    const data = await rest.put(
                        Routes.applicationGuildCommands(clientId, guildId),
                        { body: commands }
                    );
                    console.log(`Successfully registered ${data.length} commands for development guild!`);
                } else {
                    console.log(`Registering ${commands.length} global commands...`);
                    const data = await rest.put(
                        Routes.applicationCommands(clientId),
                        { body: commands }
                    );
                    console.log(`Successfully registered ${data.length} global commands!`);
                }
            } catch (error) {
                console.error('Error registering commands:', error);

                // More detailed error reporting
                if (error.rawError) {
                    console.error('Discord API error:', JSON.stringify(error.rawError, null, 2));
                }
            }
        }
    } catch (error) {
        console.error('Script error:', error);
    }
}

// Run the function
fixCommands();