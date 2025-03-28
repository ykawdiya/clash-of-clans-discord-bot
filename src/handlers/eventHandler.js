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

        const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));

        if (eventFiles.length === 0) {
            console.log('No event files found.');
            return;
        }

        // Track registered event types to avoid duplicates
        const registeredEvents = new Map();

        for (const file of eventFiles) {
            const filePath = path.join(eventsPath, file);
            try {
                const event = require(filePath);

                // Skip if missing required properties
                if (!event.name) {
                    console.warn(`The event at ${filePath} is missing a name property.`);
                    continue;
                }

                if (!event.execute) {
                    console.warn(`The event at ${filePath} is missing an execute method.`);
                    continue;
                }

                // Use either the specified event or the name as the event type
                const eventType = event.event || event.name;

                // Check for custom named handlers that actually handle standard events
                if (event.event) {
                    console.log(`Registering custom handler "${event.name}" for event: ${eventType}`);
                }

                // Register the event handler
                if (event.once) {
                    client.once(eventType, (...args) => {
                        try {
                            event.execute(client, ...args);
                        } catch (error) {
                            console.error(`Error in once event ${event.name}:`, error);
                        }
                    });
                } else {
                    client.on(eventType, (...args) => {
                        try {
                            event.execute(client, ...args);
                        } catch (error) {
                            console.error(`Error in on event ${event.name}:`, error);
                        }
                    });
                }

                // Record this event type and file
                if (!registeredEvents.has(eventType)) {
                    registeredEvents.set(eventType, []);
                }
                registeredEvents.get(eventType).push(file);

                console.log(`Loaded event: ${event.name}${event.event ? ` (${event.event})` : ''}`);
            } catch (error) {
                console.error(`Error loading event from ${filePath}:`, error);
            }
        }

        // Log potential duplicate handlers
        for (const [eventType, files] of registeredEvents.entries()) {
            if (files.length > 1) {
                console.warn(`Warning: Multiple handlers for event '${eventType}':`, files.join(', '));
            }
        }

        console.log(`Loaded ${eventFiles.length} event files successfully.`);
    } catch (error) {
        console.error('Error loading events:', error);
        throw error;
    }
}

module.exports = { loadEvents };