const fs = require('fs');
const path = require('path');

/**
 * Load and register all event handlers
 * @param {Client} client - Discord.js client
 */
function loadEvents(client) {
    try {
        const eventsPath = path.join(__dirname, '../events');

        // Check if events directory exists
        if (!fs.existsSync(eventsPath)) {
            console.log('Events directory not found, creating it...');
            fs.mkdirSync(eventsPath, { recursive: true });
            return;
        }

        let eventFiles = [];
        try {
            eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));
        } catch (error) {
            console.error(`Failed to read events directory: ${error.message}`);
            return;
        }

        if (eventFiles.length === 0) {
            console.log('No event files found.');
            return;
        }

        function clearEventListeners(client, eventName) {
            client.removeAllListeners(eventName);
        }

        for (const file of eventFiles) {
            const filePath = path.join(eventsPath, file);
            try {
                const event = require(filePath);

                if (!event.name) {
                    console.warn(`The event at ${filePath} is missing a name property.`);
                    continue;
                }

                if (!event.execute) {
                    console.warn(`The event at ${filePath} is missing an execute method.`);
                    continue;
                }

                if (event.once) {
                    clearEventListeners(client, event.name);
                    client.once(event.name, (...args) => {
                        try {
                            event.execute(client, ...args);
                        } catch (error) {
                            console.error(`Error in once event ${event.name}:`, error);
                        }
                    });
                } else {
                    clearEventListeners(client, event.name);
                    client.on(event.name, (...args) => {
                        try {
                            event.execute(client, ...args);
                        } catch (error) {
                            console.error(`Error in on event ${event.name}:`, error);
                        }
                    });
                }

                console.log(`Loaded event: ${event.name}`);
            } catch (error) {
                console.error(`Error loading event from ${filePath}:`, error);
            }
        }

        console.log(`Loaded ${eventFiles.length} event files successfully.`);
    } catch (error) {
        console.error('Error loading events:', error);
        throw error;
    }
}

module.exports = { loadEvents };