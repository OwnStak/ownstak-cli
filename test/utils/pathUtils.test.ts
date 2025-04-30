import { normalizePath, pathToRegexp, extractPathToRegexpParams, substitutePathToRegexpParams, filenameToPath } from '../../src/utils/pathUtils';

describe('normalizePath', () => {
    it('should normalize Windows-style paths to Unix-style', () => {
        expect(normalizePath('\\my\\folder2')).toBe('/my/folder2');
    });

    it('should remove redundant slashes', () => {
        expect(normalizePath('/my//folder1')).toBe('/my/folder1');
    });
});

describe('pathToRegexp', () => {
    it('should convert single param path to regex', () => {
        const { pathParams, pathRegex } = pathToRegexp('/users/:id');
        expect(pathParams).toEqual(['id']);
        expect(pathRegex.test('/users/123')).toBe(true);
    });

    it('should convert catch all param path to regex', () => {
        const { pathParams, pathRegex } = pathToRegexp('/users/:id*');
        expect(pathParams).toEqual(['id']);
        expect(pathRegex.test('/users/123/456')).toBe(true);
    });

    it('should convert optional param path to regex', () => {
        const { pathParams, pathRegex } = pathToRegexp('/users/:id?');
        expect(pathParams).toEqual(['id']);
        expect(pathRegex.test('/users')).toBe(true);
        expect(pathRegex.test('/users/123')).toBe(true);
    });

    it('should convert exact path to regex', () => {
        const { pathParams, pathRegex } = pathToRegexp('/users/123');
        expect(pathParams).toEqual([]);
        expect(pathRegex.test('/users/123')).toBe(true);
    });
});

describe('extractPathToRegexpParams', () => {
    it('should extract params from path with single param', () => {
        const params = extractPathToRegexpParams('/users/:id', '/users/123');
        expect(params).toEqual({ id: '123' });
    });

    it('should return empty object if no params are found', () => {
        const params = extractPathToRegexpParams('/users/:id', '/users');
        expect(params).toEqual({});
    });

    it('should extract params from path with catch all param', () => {
        const params = extractPathToRegexpParams('/users/:id*', '/users/123/456');
        expect(params).toEqual({ id: ['123', '456'] });
    });

    it('should extract params from path with optional param', () => {
        const params = extractPathToRegexpParams('/users/:id?', '/users');
        expect(params).toEqual({ id: undefined });
    });

    it('should extract no params', () => {
        const params = extractPathToRegexpParams('/users/123/456', '/users/123/456');
        expect(params).toEqual({});
    });
});

describe('substitutePathToRegexpParams', () => {
    it('should substitute params in path pattern with single param', () => {
        const path = substitutePathToRegexpParams('/products/:id', { id: '123' });
        expect(path).toBe('/products/123');
    });
    it('should substitute params in path pattern with optional param', () => {
        const path = substitutePathToRegexpParams('/products/:id?', { id: '123' });
        expect(path).toBe('/products/123');
    });
    it('should substitute params in path pattern with catch all param', () => {
        const path = substitutePathToRegexpParams('/products/:id*', { id: '123' });
        expect(path).toBe('/products/123');
    });
    it('should substitute params in path pattern with catch all param and multiple values', () => {
        const path = substitutePathToRegexpParams('/products/:id*', { id: ['123', '456'] });
        expect(path).toBe('/products/123/456');
    });

    it('shouldn\'t substitute params in path pattern if no params are found', () => {
        const path = substitutePathToRegexpParams('/products', {});
        expect(path).toBe('/products');
    });
});

describe('filenameToPath', () => {
    it('should transform filename to path', () => {
        expect(filenameToPath('/index.tsx')).toBe('/');
        expect(filenameToPath('/about.tsx')).toBe('/about');
        expect(filenameToPath('/products/[id].tsx')).toBe('/products/:id');
    });
}); 