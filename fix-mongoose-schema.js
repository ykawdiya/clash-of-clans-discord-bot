// fix-mongoose-schema.js
require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

async function main() {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected!');

        // First, let's modify the Clan schema to support our fields
        const schemaPath = path.join(__dirname, 'src', 'models', 'Clan.js');
        console.log(`Reading Clan schema from ${schemaPath}`);

        let schemaContent = fs.readFileSync(schemaPath, 'utf8');

        // Check if schema already has the fields we need
        const hasRequiredFields = schemaContent.includes('townHall') ||
            schemaContent.includes('warActivity') ||
            schemaContent.includes('donationTier');

        if (!hasRequiredFields) {
            console.log('Modifying schema to add role type fields...');

            // Find the roles part of the schema
            const rolesPattern = /roles: \{([^}]+)\}/;
            const rolesMatch = schemaContent.match(rolesPattern);

            if (rolesMatch) {
                const currentRolesSchema = rolesMatch[0];

                // Add our new fields to the roles schema
                const updatedRolesSchema = currentRolesSchema.replace(
                    /roles: \{([^}]+)\}/,
                    `roles: {$1,
            // Added role type fields
            townHall: {
                type: mongoose.Schema.Types.Mixed,
                default: {}
            },
            warActivity: {
                type: mongoose.Schema.Types.Mixed,
                default: {}
            },
            donationTier: {
                type: mongoose.Schema.Types.Mixed,
                default: {}
            }
          }`
                );

                // Update the schema content
                schemaContent = schemaContent.replace(currentRolesSchema, updatedRolesSchema);

                // Create backup of original schema
                fs.writeFileSync(`${schemaPath}.bak`, fs.readFileSync(schemaPath));

                // Write updated schema
                fs.writeFileSync(schemaPath, schemaContent);

                console.log('Schema updated successfully!');
            } else {
                console.log('Could not find roles section in schema. Manual update needed.');
            }
        } else {
            console.log('Schema already has the required fields.');
        }

        // Now let's reset the Mongoose connection to use our updated schema
        await mongoose.disconnect();
        await mongoose.connect(process.env.MONGODB_URI);

        // Make sure we reload the model with the updated schema
        delete require.cache[require.resolve('./src/models/Clan')];
        const Clan = require('./src/models/Clan');

        // Find the clan and try direct update
        const clan = await Clan.findOne();

        console.log('\nUpdating role types with direct MongoDB operations...');

        // Use the MongoDB native driver to update the document
        const db = mongoose.connection.db;
        const clanCollection = db.collection('clans');

        // Prepare empty role structure objects
        const updateData = {
            'settings.roles.townHall': {},
            'settings.roles.warActivity': {},
            'settings.roles.donationTier': {}
        };

        // Update the document using the native driver
        const updateResult = await clanCollection.updateOne(
            { _id: clan._id },
            { $set: updateData }
        );

        console.log('Update result:', updateResult);

        // Fetch the updated document
        const updatedClan = await Clan.findOne({ _id: clan._id });
        console.log('\nRole settings after update:');
        console.log(JSON.stringify(updatedClan.settings.roles, null, 2));

        console.log('\nFix complete! Restart your bot for the changes to take effect.');

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await mongoose.disconnect();
        console.log('Disconnected from MongoDB');
    }
}

main();