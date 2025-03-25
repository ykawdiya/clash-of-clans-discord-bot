// Save this as test-proxy.js in your project root
// Run with: node test-proxy.js

const axios = require('axios');
require('dotenv').config();

// Try both import syntaxes
let HttpsProxyAgent;
try {
    // For newer versions
    const module = require('https-proxy-agent');
    HttpsProxyAgent = module.HttpsProxyAgent;
    console.log('Using newer HttpsProxyAgent import syntax');
} catch (error) {
    // For older versions
    HttpsProxyAgent = require('https-proxy-agent');
    console.log('Using older HttpsProxyAgent import syntax');
}

// Get proxy details from environment variables
const proxyHost = process.env.PROXY_HOST || '';
const proxyPort = process.env.PROXY_PORT || '';
const proxyUser = process.env.PROXY_USERNAME || '';
const proxyPass = process.env.PROXY_PASSWORD || '';

console.log(`Proxy configuration:
  Host: ${proxyHost}
  Port: ${proxyPort}
  Username: ${proxyUser ? '✓ (set)' : '✗ (not set)'}
  Password: ${proxyPass ? '✓ (set)' : '✗ (not set)'}`);

if (!proxyHost || !proxyPort || !proxyUser || !proxyPass) {
    console.error('ERROR: Proxy configuration is incomplete');
    process.exit(1);
}

// Function to test the proxy with a simple HTTP request
async function testProxy() {
    try {
        console.log('Testing proxy connection...');

        // Build proxy URL
        const proxyUrl = `http://${proxyUser}:${proxyPass}@${proxyHost}:${proxyPort}`;
        console.log(`Using proxy URL: http://${proxyUser}:***@${proxyHost}:${proxyPort}`);

        // Create proxy agent
        const httpsAgent = new HttpsProxyAgent(proxyUrl);

        // Test with a public IP echo service
        const response = await axios.get('https://api.ipify.org?format=json', {
            httpsAgent,
            proxy: false, // Important: this disables axios's built-in proxy handling
            timeout: 10000 // 10 second timeout
        });

        console.log('✅ Proxy test successful!');
        console.log('Your public IP through the proxy:', response.data.ip);
        console.log('This is the IP you should whitelist in Clash of Clans API');

        return response.data;
    } catch (error) {
        console.error('❌ Proxy test failed:', error.message);

        if (error.code === 'ECONNRESET') {
            console.error('Connection was reset by the proxy server. This usually indicates:');
            console.error('- The proxy server rejected your authentication');
            console.error('- The proxy has connectivity issues');
        } else if (error.code === 'ECONNREFUSED') {
            console.error('Connection refused. The proxy server might be down or the host/port is incorrect.');
        } else if (error.code === 'ETIMEDOUT') {
            console.error('Connection timed out. The proxy server might be slow or unresponsive.');
        }

        console.error('\nCheck the following:');
        console.error('1. Is your WebShare proxy online?');
        console.error('2. Are your proxy credentials correct?');
        console.error('3. Do you have remaining bandwidth on your WebShare account?');

        throw error;
    }
}

// Now test Clash of Clans API through the proxy
async function testClashApi() {
    try {
        console.log('\nTesting Clash of Clans API through proxy...');

        const apiKey = process.env.COC_API_KEY;
        if (!apiKey) {
            console.error('ERROR: COC_API_KEY is not set');
            return { success: false, error: 'COC_API_KEY not set' };
        }

        // Build proxy URL
        const proxyUrl = `http://${proxyUser}:${proxyPass}@${proxyHost}:${proxyPort}`;

        // Create proxy agent
        const httpsAgent = new HttpsProxyAgent(proxyUrl);

        // Create a client with the proxy configuration
        const client = axios.create({
            baseURL: 'https://api.clashofclans.com/v1',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Accept': 'application/json'
            },
            httpsAgent,
            proxy: false, // Important: use the httpsAgent instead of built-in proxy
            timeout: 10000 // 10 second timeout
        });

        // Try to search for a clan (simple API request)
        const response = await client.get('/clans', {
            params: { name: 'Clash', limit: 1 }
        });

        console.log('✅ Clash of Clans API test successful!');
        console.log(`Found ${response.data.items?.length || 0} clans`);

        return { success: true, data: response.data };
    } catch (error) {
        console.error('❌ Clash of Clans API test failed:', error.message);

        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Data:', JSON.stringify(error.response.data, null, 2));

            if (error.response.status === 403) {
                console.error('\nAPI ACCESS DENIED: The proxy IP is not whitelisted in the Clash of Clans API');
                console.error('Make sure you whitelist the IP shown above in the developer.clashofclans.com portal');
            }
        } else if (error.request) {
            console.error('No response received from the Clash of Clans API');
            console.error('This might indicate a proxy connection issue or API availability problem');
        }

        return { success: false, error: error.message };
    }
}

// Run both tests
async function runTests() {
    try {
        // Test proxy first
        const proxyResult = await testProxy();

        // Then test Clash API if proxy test succeeded
        if (proxyResult && proxyResult.ip) {
            await testClashApi();
        }
    } catch (error) {
        console.error('Tests failed:', error.message);
    }
}

runTests();