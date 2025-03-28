const Security = require('../../src/utils/security');

describe('Security utilities', () => {
  describe('Token generation', () => {
    test('generates token with default length', () => {
      const token = Security.generateToken();
      expect(token).toHaveLength(64); // 32 bytes = 64 hex chars
    });

    test('generates token with custom length', () => {
      const token = Security.generateToken(16);
      expect(token).toHaveLength(32); // 16 bytes = 32 hex chars
    });
  });

  describe('String hashing', () => {
    test('hashes string consistently', () => {
      const hash1 = Security.hashString('test123');
      const hash2 = Security.hashString('test123');
      expect(hash1).toBe(hash2);
    });

    test('produces different hashes for different inputs', () => {
      const hash1 = Security.hashString('test123');
      const hash2 = Security.hashString('test124');
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('Encryption and decryption', () => {
    beforeEach(() => {
      process.env.ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef';
    });

    test('encrypts and decrypts correctly', () => {
      const plaintext = 'Sensitive data';
      const encrypted = Security.encrypt(plaintext);

      expect(encrypted).not.toBe(plaintext);
      expect(encrypted).toContain(':'); // IV and data are separated by colon

      const decrypted = Security.decrypt(encrypted);
      expect(decrypted).toBe(plaintext);
    });

    test('handles empty string', () => {
      const encrypted = Security.encrypt('');
      const decrypted = Security.decrypt(encrypted);
      expect(decrypted).toBe('');
    });
  });

  describe('Input sanitization', () => {
    test('removes HTML tags', () => {
      const result = Security.sanitizeInput('<script>alert("XSS")</script>');
      expect(result).not.toContain('<script>');
    });

    test('handles null input', () => {
      const result = Security.sanitizeInput(null);
      expect(result).toBe('');
    });
  });

  describe('Rate limiting', () => {
    beforeEach(() => {
      // Clear rate limit state
      Security.commandRateLimits.clear();
    });

    test('tracks request count correctly', () => {
      const userId = 'test-user';
      const commandName = 'test-command';

      // First request should not be limited
      const result1 = Security.checkRateLimit(userId, commandName, 3, 60000);
      expect(result1.limited).toBe(false);
      expect(result1.remaining).toBe(2);

      // Second request should not be limited
      const result2 = Security.checkRateLimit(userId, commandName, 3, 60000);
      expect(result2.limited).toBe(false);
      expect(result2.remaining).toBe(1);

      // Third request should not be limited
      const result3 = Security.checkRateLimit(userId, commandName, 3, 60000);
      expect(result3.limited).toBe(false);
      expect(result3.remaining).toBe(0);

      // Fourth request should be limited
      const result4 = Security.checkRateLimit(userId, commandName, 3, 60000);
      expect(result4.limited).toBe(true);
      expect(result4.remaining).toBe(0);
    });
  });
});