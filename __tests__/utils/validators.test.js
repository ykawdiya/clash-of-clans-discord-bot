const { validateTag } = require('../../src/utils/validators');

describe('Tag validation', () => {
    test('validates correct tag format', () => {
        const result = validateTag('#ABC123');
        expect(result.valid).toBe(true);
        expect(result.formattedTag).toBe('#ABC123');
    });

    test('adds # prefix if missing', () => {
        const result = validateTag('ABC123');
        expect(result.valid).toBe(true);
        expect(result.formattedTag).toBe('#ABC123');
    });

    test('converts to uppercase', () => {
        const result = validateTag('#abc123');
        expect(result.valid).toBe(true);
        expect(result.formattedTag).toBe('#ABC123');
    });

    test('rejects invalid characters', () => {
        const result = validateTag('#ABC-123');
        expect(result.valid).toBe(false);
    });

    test('handles empty input', () => {
        const result = validateTag('');
        expect(result.valid).toBe(false);
    });

    test('handles null input', () => {
        const result = validateTag(null);
        expect(result.valid).toBe(false);
    });
});