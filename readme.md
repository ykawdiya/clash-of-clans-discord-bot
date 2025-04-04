# Clash of Clans Discord Bot

A Discord bot for Clash of Clans clan management with features for War, Clan War League (CWL), and Clan Capital, designed to work within the constraints of the Clash of Clans API.

## API Limitations and Feature Availability

The Clash of Clans API has certain limitations that affect bot functionality:

### 1. War Data Access
- **War Log Privacy**: Clan war log must be set to PUBLIC to access war data
- **Fallback Behavior**: When war log is private, commands like `/war status` provide limited functionality
- **Base Calling**: Base calling works regardless of API access (uses internal database)

### 2. CWL Data Constraints
- **Limited Availability**: CWL data is only available during active CWL periods
- **No Historical Data**: Outside CWL week, limited to data collected during previous seasons
- **Adaptive Features**: Bot provides appropriate messaging based on data availability

### 3. Clan Capital Limitations
- **Basic Information**: API provides district levels but no raid weekend data
- **Manual Tracking**: Capital contributions and raid performance rely on user reporting

## IP Access & Proxy Solution

This bot supports two methods to access the Clash of Clans API:

### Railway Deployment (Fixed IP)
Deploy on Railway.app to get a consistent IP address that you can whitelist in the CoC developer portal.

### Webshare Proxy Support
For local or other hosting, use Webshare proxy to access the API (see PROXY_SETUP.md).

## Features

### 1. War Management
- War status tracking (when war log is public)
- Digital base calling system
- Attack performance statistics
- War planning tools

### 2. CWL Management
- CWL status display (when active)
- Roster management
- Medal calculation
- Performance tracking

### 3. Clan Capital Features
- Capital status display
- Contribution tracking
- Raid weekend coordination

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
