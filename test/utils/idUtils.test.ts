import { generateBase64Id } from '../../src/utils/idUtils';

describe('idUtils', () => {
    describe('generateBase64Id', () => {
        it('should generate a base64 ID of the specified length', () => {
            const length = 16;
            const id = generateBase64Id(length);

            expect(id).toHaveLength(length);
            expect(typeof id).toBe('string');
        });

        it('should generate different IDs on subsequent calls', () => {
            const id1 = generateBase64Id();
            const id2 = generateBase64Id();

            expect(id1).not.toBe(id2);
        });
    });
}); 