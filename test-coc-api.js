// test-coc-api.js
require('dotenv').config();
const clashApiService = require('./src/services/clashApiService');

async function testAPI() {
    try {
        console.log('Testing CoC API connection...');

        // Test with a simple search query
        const searchResults = await clashApiService.searchClans({ name: 'Test', limit: 1 });
        console.log('Search successful!', {
            resultsCount: searchResults.items ? searchResults.items.length : 0
        });

        // Test with a specific clan tag
        const testTag = '#2Q0JJGJG9'; // Replace with a valid clan tag
        console.log(`Testing with specific clan tag: ${testTag}`);
        const clanData = await clashApiService.getClan(testTag);
        console.log('Clan lookup successful!', {
            name: clanData.name,
            tag: clanData.tag
        });

        // Test war data
        console.log(`Testing war data for clan: ${testTag}`);
        const warData = await clashApiService.getCurrentWar(testTag);
        console.log('War data fetch successful!', {
            state: warData.state
        });

        console.log('All tests passed! API is working correctly.');
    } catch (error) {
        console.error('API test failed:', error);
        if (error.response) {
            console.error('Response status:', error.response.status);
            console.error('Response data:', error.response.data);
        }
    }
}

testAPI();