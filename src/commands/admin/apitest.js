// src/commands/admin/apitest.js
const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const clashApiService = require('../../services/clashApiService');
const { system: log } = require('../../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('apitest')
        .setDescription('Test Clash of Clans API connection and features')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand(subcommand =>
            subcommand
                .setName('connection')
                .setDescription('Test basic API connection'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('search')
                .setDescription('Test clan search functionality')
                .addStringOption(option =>
                    option.setName('name')
                        .setDescription('Clan name to search for')
                        .setRequired(true))),

    async execute(interaction) {
        try {
            const subcommand = interaction.options.getSubcommand();
            
            if (subcommand === 'connection') {
                await this.testConnection(interaction);
            } else if (subcommand === 'search') {
                await this.testSearch(interaction);
            }
        } catch (error) {
            log.error('Error executing apitest command:', { error: error.message });

            if (interaction.deferred) {
                await interaction.editReply({
                    content: `❌ Error testing API: ${error.message}`
                });
            } else {
                await interaction.reply({
                    content: `❌ Error testing API: ${error.message}`,
                    ephemeral: true
                });
            }
        }
    },
    
    async testConnection(interaction) {
        await interaction.deferReply();

        // Test API connection
        log.info('API connection test executed by ' + interaction.user.tag);

        const connectionSuccess = await clashApiService.testConnection();

        // Log proxy details (not shown to user)
        if (process.env.PROXY_HOST) {
            log.info(`Testing with proxy: ${process.env.PROXY_HOST}:${process.env.PROXY_PORT}`);
        } else {
            log.info('Testing with direct connection (no proxy)');
        }

        if (connectionSuccess) {
            await interaction.editReply({
                content: `✅ API connection test successful! The bot can communicate with the Clash of Clans API.`
            });
        } else {
            await interaction.editReply({
                content: `❌ API connection test failed. Please check your API token${process.env.PROXY_HOST ? ' and proxy settings' : ''}.`
            });
        }
    },
    
    async testSearch(interaction) {
        await interaction.deferReply();
        
        // Get clan name to search
        const clanName = interaction.options.getString('name');
        log.info(`API search test for clan name "${clanName}" executed by ${interaction.user.tag}`);
        
        // Test search functionality
        try {
            // Show that we're searching
            await interaction.editReply({
                content: `🔍 Searching for clans with name "${clanName}"...`
            });
            
            // Search for clans
            const clans = await clashApiService.searchClans(clanName, { limit: 10 });
            
            if (!clans || clans.length === 0) {
                return interaction.editReply({
                    content: `ℹ️ No clans found matching "${clanName}". The search API is working, but no results were returned.`
                });
            }
            
            // Create embed to display results
            const embed = new EmbedBuilder()
                .setTitle(`🔍 Clan Search Test: "${clanName}"`)
                .setDescription(`✅ API search successful! Found ${clans.length} clans matching your query.`)
                .setColor('#2ecc71')
                .setFooter({ text: 'API search feature is working correctly' });
            
            // Add clan results
            let clanList = '';
            clans.forEach((clan, index) => {
                clanList += `${index + 1}. **${clan.name}** (${clan.tag})\n`;
                clanList += `   Level ${clan.clanLevel} • ${clan.members}/50 members\n`;
                if (clan.location && clan.location.name) {
                    clanList += `   📍 ${clan.location.name}\n`;
                }
                clanList += '\n';
            });
            
            embed.addFields({ name: 'Search Results', value: clanList.trim() });
            
            // Add proxy information
            if (process.env.PROXY_HOST) {
                embed.addFields({ 
                    name: 'Proxy Status', 
                    value: '✅ Using Webshare proxy for API requests' 
                });
            } else {
                embed.addFields({ 
                    name: 'Proxy Status', 
                    value: '⚠️ No proxy configured. API requests are using direct connection.' 
                });
            }
            
            return interaction.editReply({
                content: null,
                embeds: [embed]
            });
            
        } catch (error) {
            log.error('Error testing clan search:', { error: error.message });
            
            return interaction.editReply({
                content: `❌ API search test failed: ${error.message}\n\nPlease verify your API token${process.env.PROXY_HOST ? ' and proxy settings' : ''}.`
            });
        }
    }
};