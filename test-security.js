// Create a test file: test-security.js
const Security = require('./src/utils/security');

function testSecurity() {
    console.log("Testing security utilities...");

    // Test token generation
    const token = Security.generateToken();
    console.log("Generated token:", token);
    console.log("Token length:", token.length);

    // Test string hashing
    const hash = Security.hashString("test-password-123");
    console.log("Hashed string:", hash);

    // Test encryption/decryption
    process.env.ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef"; // 32 chars for testing
    const plaintext = "Sensitive information: API key XYZ123";
    console.log("Original text:", plaintext);

    const encrypted = Security.encrypt(plaintext);
    console.log("Encrypted:", encrypted);

    const decrypted = Security.decrypt(encrypted);
    console.log("Decrypted:", decrypted);

    console.log("Text matches after decryption:", plaintext === decrypted ? "✅ Yes" : "❌ No");

    // Test input sanitization
    const unsafeInput = "<script>alert('XSS');</script>console.log('test')";
    const safeInput = Security.sanitizeInput(unsafeInput);
    console.log("Original input:", unsafeInput);
    console.log("Sanitized input:", safeInput);

    // Test rate limiting
    console.log("Testing rate limiting...");
    const userId = "test-user";
    const commandName = "test-command";

    for (let i = 1; i <= 7; i++) {
        const result = Security.checkRateLimit(userId, commandName, 5, 60000);
        console.log(`Request ${i}: Limited: ${result.limited}, Remaining: ${result.remaining}`);
    }
}

testSecurity();