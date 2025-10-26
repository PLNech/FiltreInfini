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
   * Mixed mode: "claude memory age>7d" -> text:"claude memory" + age:7d
   * @param {string} queryString - The query to parse
   * @returns {Object} Parsed filters
   */
  parse(queryString) {
    const filters = {
      domain: null,
      age: null,
      title: null,
      url: null,
      text: null  // Free text search (searches title + url)
    };

    if (!queryString || queryString.trim() === '') {
      return filters;
    }

    let remainingText = queryString;

    // Extract known filters and remove them from text
    // Domain filter: "domain: example.com" or "domain:example.com"
    const domainMatch = remainingText.match(/domain:\s*([^\s]+)/i);
    if (domainMatch) {
      filters.domain = domainMatch[1];
      remainingText = remainingText.replace(domainMatch[0], '');
    }

    // Age filter: "age > 7d" or "age>7d" or "age > 7d"
    const ageMatch = remainingText.match(/age\s*>\s*(\d+)d/i);
    if (ageMatch) {
      filters.age = parseInt(ageMatch[1]);
      remainingText = remainingText.replace(ageMatch[0], '');
    }

    // Title filter: "title: some text" or "title:text"
    const titleMatch = remainingText.match(/title:\s*"([^"]+)"|title:\s*(\S+)/i);
    if (titleMatch) {
      filters.title = titleMatch[1] || titleMatch[2];
      remainingText = remainingText.replace(titleMatch[0], '');
    }

    // URL filter: "url: *example*" or "url:pattern"
    const urlMatch = remainingText.match(/url:\s*"([^"]+)"|url:\s*(\S+)/i);
    if (urlMatch) {
      filters.url = urlMatch[1] || urlMatch[2];
      remainingText = remainingText.replace(urlMatch[0], '');
    }

    // Whatever text remains is free text search
    remainingText = remainingText.trim();
    if (remainingText) {
      filters.text = remainingText;
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
