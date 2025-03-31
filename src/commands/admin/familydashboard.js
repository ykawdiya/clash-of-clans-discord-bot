// src/commands/admin/familydashboard.js
const { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder } = require('discord.js');
const clanFamilyService = require('../../services/clanFamilyService');
const clashApiService = require('../../services/clashApiService');
const Canvas = require('canvas');
const ErrorHandler = require('../../utils/errorHandler');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('familydashboard')
        .setDescription('Create a dashboard for your clan family')
        .addSubcommand(subcommand =>
            subcommand
                .setName('generate')
                .setDescription('Generate a visual dashboard for your clan family')),

    manualDeferring: true,

    async execute(interaction) {
        await interaction.deferReply();

        try {
            const subcommand = interaction.options.getSubcommand();

            if (subcommand === 'generate') {
                await this.generateDashboard(interaction);
            } else {
                return interaction.editReply('Unknown subcommand.');
            }
        } catch (error) {
            console.error('Error in familydashboard command:', error);
            return interaction.editReply(ErrorHandler.formatError(error, 'family dashboard'));
        }
    },

    async generateDashboard(interaction) {
        // Get family for this guild
        const family = await clanFamilyService.getFamilyByGuild(interaction.guild.id);
        if (!family) {
            return interaction.editReply('❌ No clan family found for this server. Create one first with `/clanfamily create`.');
        }

        // Fetch fresh data for each clan
        await interaction.editReply('Gathering data for all clans in the family...');

        const clansWithData = await Promise.all(
            family.clans.map(async (clan) => {
                try {
                    const clanData = await clashApiService.getClan(clan.clanTag);
                    return {
                        ...clan.toObject(),
                        apiData: clanData
                    };
                } catch (error) {
                    console.error(`Error fetching clan data: ${clan.clanTag}`, { error: error.message });
                    return {
                        ...clan.toObject(),
                        apiData: null
                    };
                }
            })
        );

        // Sort clans by role and order
        const sortedClans = clansWithData.sort((a, b) => {
            const roleOrder = { main: 0, feeder: 1, academy: 2, casual: 3, other: 4 };
            if (a.familyRole !== b.familyRole) {
                return roleOrder[a.familyRole] - roleOrder[b.familyRole];
            }
            return a.sortOrder - b.sortOrder;
        });

        // Create dashboard image
        await interaction.editReply('Creating dashboard visualization...');
        const dashboard = await this.createFamilyVisualization(sortedClans, family.familyName);

        // Calculate family stats
        const totalMembers = sortedClans.reduce((sum, clan) => sum + (clan.apiData?.members || 0), 0);
        const totalClans = sortedClans.length;
        const totalWars = sortedClans.reduce((sum, clan) => sum + ((clan.apiData?.warWins || 0) + (clan.apiData?.warLosses || 0) + (clan.apiData?.warTies || 0)), 0);
        const totalWarWins = sortedClans.reduce((sum, clan) => sum + (clan.apiData?.warWins || 0), 0);
        const winRate = totalWars > 0 ? ((totalWarWins / totalWars) * 100).toFixed(1) + '%' : 'N/A';

        // Create embed
        const embed = new EmbedBuilder()
            .setColor('#9b59b6')
            .setTitle(`${family.familyName} - Family Dashboard`)
            .setDescription(`Overview of all clans in the family`)
            .addFields(
                { name: 'Total Clans', value: totalClans.toString(), inline: true },
                { name: 'Total Members', value: totalMembers.toString(), inline: true },
                { name: 'War Win Rate', value: winRate, inline: true }
            )
            .setImage('attachment://family-dashboard.png')
            .setFooter({ text: 'Updated ' + new Date().toLocaleString() });

        return interaction.editReply({
            content: null,
            embeds: [embed],
            files: [dashboard]
        });
    },

    async createFamilyVisualization(clans, familyName) {
        // Calculate canvas dimensions based on number of clans
        const clanHeight = 100;
        const canvasWidth = 800;
        const canvasHeight = 150 + (clans.length * clanHeight);

        // Create canvas
        const canvas = Canvas.createCanvas(canvasWidth, canvasHeight);
        const ctx = canvas.getContext('2d');

        // Background
        ctx.fillStyle = '#2c3e50';
        ctx.fillRect(0, 0, canvasWidth, canvasHeight);

        // Header
        ctx.fillStyle = '#34495e';
        ctx.fillRect(0, 0, canvasWidth, 100);

        // Family name
        ctx.font = 'bold 40px Arial';
        ctx.fillStyle = '#ecf0f1';
        ctx.textAlign = 'center';
        ctx.fillText(familyName, canvasWidth / 2, 55);

        // Subtitle
        ctx.font = '20px Arial';
        ctx.fillText('Clan Family Dashboard', canvasWidth / 2, 85);

        // Column headers
        ctx.fillStyle = '#3498db';
        ctx.fillRect(0, 100, canvasWidth, 50);

        ctx.font = 'bold 16px Arial';
        ctx.fillStyle = '#ecf0f1';
        ctx.textAlign = 'left';
        ctx.fillText('Clan', 20, 130);
        ctx.fillText('Level', 300, 130);
        ctx.fillText('Members', 370, 130);
        ctx.fillText('War League', 450, 130);
        ctx.fillText('War Record', 650, 130);

        // Clan rows
        let y = 150;
        for (let i = 0; i < clans.length; i++) {
            const clan = clans[i];
            const apiData = clan.apiData;

            // Alternating row colors
            ctx.fillStyle = i % 2 === 0 ? '#34495e' : '#2c3e50';
            ctx.fillRect(0, y, canvasWidth, clanHeight);

            // Role indicator
            const roleColors = {
                main: '#e74c3c',
                feeder: '#3498db',
                academy: '#2ecc71',
                casual: '#f1c40f',
                other: '#95a5a6'
            };
            ctx.fillStyle = roleColors[clan.familyRole] || '#95a5a6';
            ctx.fillRect(0, y, 10, clanHeight);

            // Clan name and tag
            ctx.font = 'bold 18px Arial';
            ctx.fillStyle = '#ecf0f1';
            ctx.textAlign = 'left';
            ctx.fillText(clan.name, 20, y + 30);

            ctx.font = '14px Arial';
            ctx.fillStyle = '#95a5a6';
            ctx.fillText(clan.clanTag, 20, y + 50);

            ctx.font = '14px Arial';
            ctx.fillStyle = '#bdc3c7';
            ctx.fillText(clan.familyRole.charAt(0).toUpperCase() + clan.familyRole.slice(1), 20, y + 70);

            // Clan info (if data available)
            if (apiData) {
                // Level
                ctx.font = 'bold 22px Arial';
                ctx.fillStyle = '#f1c40f';
                ctx.fillText(apiData.clanLevel, 300, y + 45);

                // Members
                ctx.font = '18px Arial';
                ctx.fillStyle = '#ecf0f1';
                ctx.fillText(`${apiData.members}/50`, 370, y + 45);

                // War league
                const league = apiData.warLeague?.name || 'Unranked';
                ctx.fillText(league, 450, y + 45);

                // War record
                const warWins = apiData.warWins || 0;
                const warLosses = apiData.warLosses || 0;
                const warTies = apiData.warTies || 0;
                ctx.fillText(`${warWins}W-${warLosses}L-${warTies}T`, 650, y + 45);
            } else {
                ctx.font = 'italic 16px Arial';
                ctx.fillStyle = '#e74c3c';
                ctx.fillText('Data unavailable', 300, y + 45);
            }

            y += clanHeight;
        }

        // Create attachment
        const buffer = canvas.toBuffer();
        return new AttachmentBuilder(buffer, { name: 'family-dashboard.png' });
    }
};