import 'dotenv/config';
import { REST, Routes } from 'discord.js';
import fs from 'fs';
import path from 'path';

const commands = []; // ✅ Now accessible globally

async function registerCommands() {
    try {
        const commandsPath = path.join(process.cwd(), './src/commands');
        console.log(`Looking for commands in: ${commandsPath}`);

        if (!fs.existsSync(commandsPath)) {
            console.error('Commands directory not found!');
            return;
        }

        const commandFolders = fs.readdirSync(commandsPath);
        console.log(`Found command folders: ${commandFolders.join(', ')}`);

        for (const folder of commandFolders) {
            const folderPath = path.join(commandsPath, folder);
            if (!fs.statSync(folderPath).isDirectory()) continue;

            console.log(`Reading files from ${folder} folder...`);
            const commandFiles = fs.readdirSync(folderPath).filter(file => file.endsWith('.js'));
            console.log(`Found command files in ${folder}: ${commandFiles.join(', ')}`);

            for (const file of commandFiles) {
                const filePath = path.join(folderPath, file);
                try {
                    const command = (await import(`file://${filePath}`)).default;
                    if (command.data && command.execute) {
                        commands.push(command.data.toJSON());
                        console.log(`✅ Added ${command.data.name} command`);
                    } else {
                        console.warn(`⚠️ Command at ${filePath} is missing required properties`);
                    }
                } catch (error) {
                    console.error(`❌ Error loading command from ${filePath}:`, error);
                }
            }
        }

        if (commands.length === 0) {
            console.error('No commands found to register!');
            return;
        }

        const clientId = process.env.CLIENT_ID;
        if (!clientId) {
            console.error('CLIENT_ID not set in .env file');
            return;
        }

        const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
        console.log(`Registering ${commands.length} commands...`);

        const result = await rest.put(Routes.applicationCommands(clientId), { body: commands });
        console.log(`Successfully registered ${result.length} global commands!`);

    } catch (error) {
        console.error('Error registering commands:', error);
    }
}

// Ensure `commands` is available here ✅
const clientId = process.env.CLIENT_ID;

if (!clientId) {
    console.error('CLIENT_ID is not set in the .env file');
    process.exit(1);
}

const GUILD_ID = process.env.GUILD_ID;
if (!GUILD_ID) {
    console.error('❌ GUILD_ID is not set in the .env file.');
    process.exit(1);
}
const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

const guildResult = await rest.put(
    Routes.applicationGuildCommands(clientId, GUILD_ID),
    { body: commands } // ✅ Now "commands" is defined
);
console.log(`Successfully registered ${guildResult.length} commands to guild ${GUILD_ID}!`);