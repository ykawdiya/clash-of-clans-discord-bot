// src/fresh-slash-bot.js
// Minimal slash command bot with only the essentials
require('dotenv').config();
const {
    Client,
    GatewayIntentBits,
    REST,
    Routes,
    SlashCommandBuilder,
    Events
} = require('discord.js');

// Configuration
const token = process.env.DISCORD_TOKEN;
const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID;

// Create fresh client - ONLY include required intents
const client = new Client({
    intents: [GatewayIntentBits.Guilds]
});

// Create a unique test command
const commandName = `freshtest${Date.now().toString().slice(-4)}`;
const testCommand = new SlashCommandBuilder()
    .setName(commandName)
    .setDescription('Fresh test command')
    .toJSON();

console.log(`Created unique command: /${commandName}`);

// Ready event handler
client.once(Events.ClientReady, async () => {
    console.log(`Logged in as ${client.user.tag}`);

    // Register the command
    try {
        const rest = new REST({ version: '10' }).setToken(token);

        console.log('Deploying the test command...');

        // Deploy only our test command
        await rest.put(
            Routes.applicationGuildCommands(clientId, guildId),
            { body: [testCommand] }
        );

        console.log(`Success! Command /${commandName} deployed`);
        console.log(`Please use /${commandName} in Discord to test`);
    } catch (error) {
        console.error('Error deploying command:', error);
    }
});

// VERY SIMPLE interaction handler - no defer, no complex logic
client.on(Events.InteractionCreate, async interaction => {
    // Debug output
    console.log(`Received interaction: ${interaction.id} (${interaction.commandName})`);

    // Only handle our specific command
    if (!interaction.isChatInputCommand() || interaction.commandName !== commandName) {
        console.log('Not our test command, ignoring');
        return;
    }

    // Simplest possible response
    try {
        console.log('Attempting to reply to the interaction...');
        await interaction.reply({ content: 'It worked! 🎉', ephemeral: false });
        console.log('Reply successful!');
    } catch (error) {
        console.error('Error replying to interaction:', error);
    }
});

// Login to Discord
console.log('Starting fresh slash command bot...');
client.login(token)
    .catch(error => console.error('Login failed:', error));