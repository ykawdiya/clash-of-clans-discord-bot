# Clash of Clans Discord Bot

An advanced Discord bot for Clash of Clans clan management with powerful automation for War, Clan War League (CWL), and Clan Capital features.

## Railway Deployment Guide

This bot can be deployed on Railway.app with a fixed IP, solving the Clash of Clans API IP restriction issue.

### Step 1: Sign up for Railway

1. Create an account at [Railway.app](https://railway.app/)
2. Install the Railway CLI:
   ```bash
   npm i -g @railway/cli
   ```
3. Login to Railway:
   ```bash
   railway login
   ```

### Step 2: Update Clash of Clans API Key

1. Go to [developer.clashofclans.com](https://developer.clashofclans.com/)
2. Create a new API key or edit your existing one
3. Add Railway's IP address to the allowed IPs:
   - Deploy a preliminary version to get the IP (see next step)
   - Check logs for the IP address being used
   - Add this IP to your COC API key

### Step 3: Deploy the Bot

1. Initialize Railway in your project:
   ```bash
   railway init
   ```
2. Create a new project when prompted

3. Set up your environment variables in Railway:
   ```bash
   railway variables set DISCORD_TOKEN=your_token_here
   railway variables set CLIENT_ID=your_client_id_here
   railway variables set CLASH_API_TOKEN=your_api_token_here
   railway variables set MONGODB_URI=your_mongodb_uri_here
   ```

4. Deploy your application:
   ```bash
   railway up
   ```

5. Your bot is now hosted with a fixed IP address!

## Core Features

### 1. War Automation
- Automatic war detection and status tracking
- Digital base calling and attack planning
- Real-time attack updates and performance analytics
- War end reports with detailed statistics

### 2. CWL Management
- CWL season detection and daily war tracking
- Roster management with performance metrics
- Daily war coordination specific to CWL format
- Medal distribution tracking

### 3. Clan Capital Tracking
- District progress monitoring and upgrade tracking
- Raid weekend coordination and attack usage
- Contribution tracking for members
- Automated upgrade recommendations

## Setup

### Prerequisites
- Node.js 16.9.0 or higher
- MongoDB
- Discord Bot Token
- Clash of Clans API Key

### Installation

1. Clone the repository
   ```bash
   git clone https://github.com/yourusername/clash-of-clans-discord-bot.git
   cd clash-of-clans-discord-bot
   ```

2. Install dependencies
   ```bash
   npm install
   ```

3. Create a `.env` file using the `.env.sample` as a template
   ```bash
   cp .env.old.sample .env
   ```

4. Edit the `.env` file with your configuration details:
   - `DISCORD_TOKEN`: Your Discord bot token
   - `CLIENT_ID`: Your Discord application client ID
   - `CLASH_API_TOKEN`: Your Clash of Clans API token
   - `MONGODB_URI`: Your MongoDB connection string
   
   For IP-independent access to Clash of Clans API:
   - `PROXY_HOST`: Your Webshare proxy host (typically p.webshare.io)
   - `PROXY_PORT`: Your Webshare proxy port (typically 80)
   - `PROXY_USERNAME`: Your Webshare proxy username
   - `PROXY_PASSWORD`: Your Webshare proxy password
   
   See [PROXY_SETUP.md](PROXY_SETUP.md) for detailed instructions on setting up Webshare proxy.

5. Deploy slash commands
   ```bash
   npm run deploy
   ```

6. Start the bot
   ```bash
   npm start
   ```

## Server Setup

The bot provides commands to automatically set up your Discord server with optimal channels and roles:

### Single Clan Setup

Use the `/setup single` command to create a server structure for a single clan:
- WAR CENTER (war-status, war-planning, base-calling, attack-tracker, war-history)
- CWL CENTER (cwl-announcements, cwl-roster, daily-matchups, medal-tracking)
- CLAN CAPITAL (capital-status, raid-weekends, contribution-tracker, upgrade-planning)

### Multi-Clan Setup

Use the `/setup multi` command to create a server structure for multiple clans:
- WAR CENTER (war-announcements, clan1-war, clan2-war, etc.)
- CWL CENTER (cwl-announcements, clan1-cwl, clan2-cwl, etc.)
- CLAN CAPITAL (capital-status, clan1-capital, clan2-capital, etc.)
- CLAN-SPECIFIC (separate categories for each clan)

## Commands

### Core Commands

- `/war` - War management commands
  - `/war status` - Show current war status
  - `/war call` - Call a base in war
  - `/war plan` - View or create war plan
  - `/war map` - Show the war map with calls

- `/cwl` - CWL management commands
  - `/cwl status` - Show current CWL status
  - `/cwl roster` - Manage CWL roster
  - `/cwl plan` - Plan for daily matchups
  - `/cwl stats` - View CWL statistics

- `/capital` - Clan Capital commands
  - `/capital status` - Show Clan Capital status
  - `/capital raids` - Raid weekend information
  - `/capital contribute` - Track capital gold contributions
  - `/capital planner` - View upgrade recommendations

### Player & Clan Commands

- `/clan` - Clan information and management
  - `/clan info` - View clan information
  - `/clan link` - Link clan to server
  - `/clan members` - View clan members
  - `/clan wars` - View war statistics

- `/player` - Player information and linking
  - `/player info` - View player information
  - `/player link` - Link your Clash of Clans account
  - `/player stats` - View detailed player statistics

### Admin Commands

- `/setup` - Set up server for optimal bot usage
  - `/setup single` - Set up for single clan
  - `/setup multi` - Set up for multiple clans

## Channel-Command Restrictions

The bot implements a channel-specific command system to keep conversations organized:

| Channel | Allowed Commands | Allowed Roles |
|---------|------------------|--------------|
| war-status | /war status, /war stats | Everyone |
| war-planning | /war plan, /war matchup | Elder+ |
| base-calling | /war call, /war scout | Member+ |
| cwl-roster | /cwl roster | Co-Leader+ |
| capital-status | /capital status | Everyone |
| capital-planning | /capital planner | Co-Leader+ |

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the LICENSE file for details.
