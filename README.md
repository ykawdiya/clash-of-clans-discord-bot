# Clash of Clans Discord Bot

A comprehensive Discord bot for Clash of Clans clan management, tracking, and coordination.

> **New to the bot?** Check out our [Quick Start Guide](../../wiki/Quick-Start-Guide) in the Wiki for essential commands and setup instructions!

## Features

- **Clan Management**: Link Discord servers to clans, manage multiple clans
- **Player Tracking**: Track player progress, statistics, and donations
- **War Management**: Plan attacks, track war performance, send war reminders
- **Clan Games**: Track clan games participation and results
- **CWL**: Track Clan War League stats and performance
- **Capital Raids**: Monitor raid weekend participation
- **Recruitment**: Built-in application system with approval workflow
- **Role Management**: Automatic role assignment based on in-game status

## Setup

### Prerequisites
- Node.js 16.9.0 or higher
- MongoDB database
- Discord Bot Token (from Discord Developer Portal)
- Clash of Clans API Key (from developer.clashofclans.com)

### Installation

1. Clone the repository
```
git clone https://github.com/yourusername/clash-of-clans-discord-bot.git
cd clash-of-clans-discord-bot
```

2. Install dependencies
```
npm install
```

3. Copy `.env.example` to `.env` and configure variables
```
cp .env.example .env
```

4. Edit the `.env` file with your Discord token, API keys, and database information

5. Start the bot
```
npm start
```

### Configuration

#### Required Environment Variables:
- `DISCORD_TOKEN`: Your Discord bot token
- `CLIENT_ID`: Discord application client ID
- `COC_API_KEY`: Clash of Clans API key
- `MONGODB_URI`: Connection string for MongoDB

#### Optional Environment Variables:
- `GUILD_ID`: For testing commands in a specific server
- `PROXY_HOST`, `PROXY_PORT`, `PROXY_USERNAME`, `PROXY_PASSWORD`: For proxy setup
- `PORT`: Port for health check server
- `ENCRYPTION_KEY`: 32-character key for sensitive data encryption

## Commands

### Admin Commands
- `/setclan` - Link your Discord server to a clan
- `/roles` - Set up automatic role assignment

### Player Commands
- `/clan` - View clan information
- `/player` - View player details
- `/link` - Link your CoC account to Discord

### War Commands
- `/war` - View current war information
- `/warreminder` - Set up attack reminders
- `/cwl` - Track and manage Clan War League

### Tracking Commands
- `/stats` - Track player progress over time
- `/activity` - Monitor clan member activity
- `/clangames` - Track clan games performance
- `/raids` - Monitor Clan Capital raid weekend

### Recruitment Commands
- `/recruit` - Manage clan recruitment and applications
- `/event` - Create and manage clan events

## Adding the Bot to Your Server

1. Generate an invite link from the Discord Developer Portal
2. Ensure the bot has required permissions:
    - Manage Roles
    - Read/Send Messages
    - Embed Links
    - Read Message History
3. Once added, use `/setclan` to link your Clash of Clans clan

## Documentation

- [Quick Start Guide](../../wiki/Quick-Start-Guide) - Essential commands and setup
- [Admin Guide](../../wiki/Admin-Guide) - Advanced configuration options
- [Troubleshooting](../../wiki/Troubleshooting) - Common issues and solutions

## Support

For questions or support, please [create an issue](https://github.com/yourusername/clash-of-clans-discord-bot/issues) on GitHub.