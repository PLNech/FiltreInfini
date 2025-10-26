/**
 * Unit tests for QueryParser
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Load QueryParser from source
let QueryParser;

beforeAll(() => {
  const code = readFileSync(resolve(__dirname, '../../lib/query-parser.js'), 'utf8');
  // Execute in context to get the class
  eval(code);
  QueryParser = global.QueryParser || eval('QueryParser');
});

describe('QueryParser', () => {
  let parser;

  beforeAll(() => {
    parser = new QueryParser();
  });

  describe('Domain filtering', () => {
    it('should parse domain filter', () => {
      const result = parser.parse('domain:example.com');
      expect(result.domain).toBe('example.com');
      expect(result.age).toBeNull();
    });

    it('should handle domain with protocol', () => {
      const result = parser.parse('domain:https://example.com');
      expect(result.domain).toBe('https://example.com');
    });
  });

  describe('Age filtering', () => {
    it('should parse age filter with days', () => {
      const result = parser.parse('age>7d');
      expect(result.age.operator).toBe('>');
      expect(result.age.days).toBe(7);
    });

    it('should parse age filter with weeks', () => {
      const result = parser.parse('age>=1w');
      expect(result.age.operator).toBe('>=');
      expect(result.age.days).toBe(7);
    });

    it('should parse age filter with months', () => {
      const result = parser.parse('age<1m');
      expect(result.age.days).toBe(30);
    });

    it('should parse age filter with years', () => {
      const result = parser.parse('age>1y');
      expect(result.age.days).toBe(365);
    });

    it('should parse "today" keyword', () => {
      const result = parser.parse('age=today');
      expect(result.age.days).toBe(0);
    });

    it('should handle all operators', () => {
      expect(parser.parse('age>7d').age.operator).toBe('>');
      expect(parser.parse('age>=7d').age.operator).toBe('>=');
      expect(parser.parse('age<7d').age.operator).toBe('<');
      expect(parser.parse('age<=7d').age.operator).toBe('<=');
      expect(parser.parse('age=7d').age.operator).toBe('=');
    });
  });

  describe('Text search', () => {
    it('should extract free text after filters', () => {
      const result = parser.parse('claude memory age>1w');
      expect(result.age.days).toBe(7);
      expect(result.text).toBe('claude memory');
    });

    it('should handle text without filters', () => {
      const result = parser.parse('just some search text');
      expect(result.text).toBe('just some search text');
    });
  });

  describe('Multiple filters', () => {
    it('should parse domain and age together', () => {
      const result = parser.parse('domain:wikipedia.org age>14d');
      expect(result.domain).toBe('wikipedia.org');
      expect(result.age.days).toBe(14);
    });

    it('should handle filters with text', () => {
      const result = parser.parse('domain:github.com age>1m claude');
      expect(result.domain).toBe('github.com');
      expect(result.age.days).toBe(30);
      expect(result.text).toBe('claude');
    });
  });

  describe('Title and URL filters', () => {
    it('should parse title filter', () => {
      const result = parser.parse('title:search term');
      expect(result.title).toBe('search term');
    });

    it('should parse URL filter with wildcards', () => {
      const result = parser.parse('url:*example*');
      expect(result.url).toBe('*example*');
    });
  });

  describe('Edge cases', () => {
    it('should handle empty query', () => {
      const result = parser.parse('');
      expect(result.domain).toBeNull();
      expect(result.age).toBeNull();
      expect(result.text).toBeNull();
    });

    it('should be case insensitive for keywords', () => {
      const result = parser.parse('AGE>7D DOMAIN:Example.COM');
      expect(result.age.days).toBe(7);
      expect(result.domain).toBe('Example.COM');
    });

    it('should trim whitespace', () => {
      const result = parser.parse('  age>7d  ');
      expect(result.age.days).toBe(7);
    });
  });
});
