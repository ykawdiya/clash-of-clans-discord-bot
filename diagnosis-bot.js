require('dotenv').config();
const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');

async function debugCommands() {
    const commands = [];
    const commandFiles = new Map();

    try {
        const commandsPath = path.join(process.cwd(), './src/commands');
        console.log(`Looking for commands in: ${commandsPath}`);

        const commandFolders = fs.readdirSync(commandsPath);
        console.log(`Found command folders: ${commandFolders.join(', ')}`);

        for (const folder of commandFolders) {
            const folderPath = path.join(commandsPath, folder);

            if (!fs.statSync(folderPath).isDirectory()) continue;

            const commandFiles = fs.readdirSync(folderPath).filter(file => file.endsWith('.js'));
            console.log(`Files in ${folder} folder: ${commandFiles.join(', ')}`);

            for (const file of commandFiles) {
                const filePath = path.join(folderPath, file);
                try {
                    const command = require(filePath);

                    if (command.data && command.execute) {
                        console.log(`DEBUG: Command Name = ${command.data.name}`);
                        console.log(`DEBUG: Command File = ${filePath}`);

                        // Try to convert to JSON to catch any serialization issues
                        try {
                            const jsonData = command.data.toJSON();
                            commands.push(jsonData);
                            console.log(`DEBUG: Command JSON Serialization Success`);
                        } catch (jsonError) {
                            console.error(`ERROR: Failed to serialize command ${command.data.name}:`, jsonError);
                        }
                    } else {
                        console.warn(`WARNING: ${filePath} missing data or execute`);
                    }
                } catch (loadError) {
                    console.error(`ERROR loading ${filePath}:`, loadError);
                }
            }
        }

        console.log(`Total Commands Found: ${commands.length}`);
        console.log('Command Names:', commands.map(cmd => cmd.name));
    } catch (error) {
        console.error('FATAL ERROR in command loading:', error);
    }
}

debugCommands();