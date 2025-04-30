import { Response } from '../../../src/compute/router/response.js';

describe('Response', () => {
  let response: Response;

  beforeEach(() => {
    response = new Response();
  });

  describe('initialization', () => {
    it('should initialize with default values', () => {
      expect(response.statusCode).toBe(200);
      expect(response.headers).toEqual({});
      expect(response.body).toBeUndefined();
    });
  });

  describe('header methods', () => {
    it('should set and get headers', () => {
      response.setHeader('content-type', 'application/json');
      response.setHeader('x-custom-header', 'custom-value');

      expect(response.getHeader('content-type')).toBe('application/json');
      expect(response.getHeader('x-custom-header')).toBe('custom-value');
      expect(response.getHeader('Content-Type')).toBe('application/json'); // Case insensitive
    });

    it('should get header arrays', () => {
      response.headers['set-cookie'] = ['session=abc123', 'user=john'];
      response.setHeader('accept', 'application/json');

      expect(response.getHeaderArray('set-cookie')).toEqual(['session=abc123', 'user=john']);
      expect(response.getHeaderArray('accept')).toEqual(['application/json']);
      expect(response.getHeaderArray('non-existent')).toEqual([]);
    });

    it('should add headers to existing ones', () => {
      response.setHeader('set-cookie', 'session=abc123');
      response.addHeader('set-cookie', 'user=john');

      expect(response.getHeaderArray('set-cookie')).toEqual(['session=abc123', 'user=john']);
    });

    it('should delete headers', () => {
      response.setHeader('x-to-delete', 'value');
      response.setHeader('x-to-keep', 'keep-value');
      
      expect(response.getHeader('x-to-delete')).toBe('value');
      
      response.deleteHeader('x-to-delete');
      
      expect(response.getHeader('x-to-delete')).toBeUndefined();
      expect(response.getHeader('x-to-keep')).toBe('keep-value');
    });
  });

  describe('body handling', () => {
    it('should set and get string body', () => {
      const stringBody = 'Hello, world!';
      response.body = stringBody;
      
      expect(response.body?.toString()).toBe(stringBody);
    });

    it('should set and get buffer body', () => {
      const bufferBody = Buffer.from('Buffer content');
      response.body = bufferBody;
      
      expect(response.body).toBe(bufferBody);
      expect(response.body?.toString()).toBe('Buffer content');
    });
  });

  describe('clear method', () => {
    it('should reset the response to default state', () => {
      response.statusCode = 404;
      response.setHeader('content-type', 'text/html');
      response.body = 'Not found';
      
      response.clear();
      
      expect(response.statusCode).toBe(200);
      expect(response.headers).toEqual({});
      expect(response.body).toBeUndefined();
    });
  });
}); 