/**
 * Query Language Parser
 *
 * Parses queries like:
 * - "domain: wikipedia.org"
 * - "age > 7d"
 * - "domain: example.com AND age > 14d"
 * - "title: search term"
 *
 * MVP: Simple regex-based parsing
 * TODO: Phase 3 - Build proper AST parser with syntax highlighting
 */

class QueryParser {
  /**
   * Parse a query string into filter objects
   * @param {string} queryString - The query to parse
   * @returns {Object} Parsed filters
   */
  parse(queryString) {
    // TODO: Handle AND/OR operators properly
    // TODO: Support parentheses for grouping
    // TODO: Better error handling with helpful messages

    const filters = {
      domain: null,
      age: null,
      title: null,
      url: null
    };

    if (!queryString || queryString.trim() === '') {
      return filters;
    }

    // Domain filter: "domain: example.com" or "domain:example.com"
    const domainMatch = queryString.match(/domain:\s*([^\s]+)/i);
    if (domainMatch) {
      filters.domain = domainMatch[1];
    }

    // Age filter: "age > 7d" or "age>7d"
    const ageMatch = queryString.match(/age\s*>\s*(\d+)d/i);
    if (ageMatch) {
      filters.age = parseInt(ageMatch[1]);
    }

    // Title filter: "title: some text" or "title:text"
    const titleMatch = queryString.match(/title:\s*"([^"]+)"|title:\s*(\S+)/i);
    if (titleMatch) {
      filters.title = titleMatch[1] || titleMatch[2];
    }

    // URL filter: "url: *example*" or "url:pattern"
    const urlMatch = queryString.match(/url:\s*"([^"]+)"|url:\s*(\S+)/i);
    if (urlMatch) {
      filters.url = urlMatch[1] || urlMatch[2];
    }

    return filters;
  }

  /**
   * Validate a query string and return helpful error messages
   * @param {string} queryString - The query to validate
   * @returns {Object} { valid: boolean, error: string|null }
   */
  validate(queryString) {
    // TODO: Implement proper validation
    // For now, just return valid
    return { valid: true, error: null };
  }

  /**
   * Get autocomplete suggestions for partial query
   * TODO: Phase 3 - Implement autocomplete
   * @param {string} partialQuery - Partial query string
   * @param {number} cursorPosition - Cursor position in query
   * @returns {Array} Array of suggestions
   */
  getSuggestions(partialQuery, cursorPosition) {
    // TODO: Implement autocomplete
    return [];
  }

  /**
   * Tokenize query for syntax highlighting
   * TODO: Phase 3 - Implement syntax highlighting
   * @param {string} queryString - Query to tokenize
   * @returns {Array} Array of {type, value, color} tokens
   */
  tokenize(queryString) {
    // TODO: Implement tokenization for syntax highlighting
    return [];
  }
}

// Export singleton instance
const queryParser = new QueryParser();
