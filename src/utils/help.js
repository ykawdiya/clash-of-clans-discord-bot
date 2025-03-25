const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('Get help with bot commands')
        .addStringOption(option =>
            option.setName('command')
                .setDescription('Specific command to get help for')
                .setRequired(false)),

    /**
     * Command category for organization
     */
    category: 'Utility',

    /**
     * Full help description for the help command
     */
    longDescription: 'Displays detailed information about available commands. Use it without any arguments to see a list of all commands, or specify a command name to get detailed help for that specific command.',

    /**
     * Usage examples
     */
    examples: [
        '/help',
        '/help command:clan',
        '/help command:player'
    ],

    async execute(interaction) {
        const commandName = interaction.options.getString('command');

        if (commandName) {
            // Show help for a specific command
            await showCommandHelp(interaction, commandName);
        } else {
            // Show general help with command categories
            await showGeneralHelp(interaction);
        }
    },
};

/**
 * Display help for a specific command
 * @param {CommandInteraction} interaction
 * @param {string} commandName
 */
async function showCommandHelp(interaction, commandName) {
    // Find the command
    const command = interaction.client.commands.get(commandName);

    if (!command) {
        return interaction.reply({
            content: `Command \`${commandName}\` not found. Use \`/help\` to see all available commands.`,
            ephemeral: true
        });
    }

    // Create an embed with detailed information about the command
    const embed = new EmbedBuilder()
        .setTitle(`Command: /${command.data.name}`)
        .setDescription(command.longDescription || command.data.description)
        .setColor('#3498db')
        .addFields({ name: 'Category', value: command.category || 'Uncategorized' });

    // Add options information if available
    const options = command.data.options;
    if (options && options.length > 0) {
        const optionsText = options.map(option => {
            const required = option.required ? '(required)' : '(optional)';
            return `• \`${option.name}\`: ${option.description} ${required}`;
        }).join('\n');

        embed.addFields({ name: 'Options', value: optionsText });
    }

    // Add usage examples if available
    if (command.examples && command.examples.length > 0) {
        embed.addFields({ name: 'Examples', value: command.examples.join('\n') });
    }

    return interaction.reply({ embeds: [embed] });
}

/**
 * Display general help with all commands grouped by category
 * @param {CommandInteraction} interaction
 */
async function showGeneralHelp(interaction) {
    // Group commands by category
    const categories = new Map();

    interaction.client.commands.forEach(command => {
        const category = command.category || 'Uncategorized';

        if (!categories.has(category)) {
            categories.set(category, []);
        }

        categories.get(category).push(command);
    });

    // Create an embed
    const embed = new EmbedBuilder()
        .setTitle('Clash of Clans Bot Commands')
        .setDescription('Here are all the available commands. Use `/help command:name` to get detailed help for a specific command.')
        .setColor('#3498db')
        .setThumbnail('https://cdn.pixabay.com/photo/2016/08/26/09/19/clash-of-clans-1621176_960_720.jpg');

    // Add each category and its commands
    for (const [category, commands] of categories) {
        const commandList = commands.map(cmd => `• \`/${cmd.data.name}\`: ${cmd.data.description}`).join('\n');
        embed.addFields({ name: category, value: commandList });
    }

    return interaction.reply({ embeds: [embed] });
}