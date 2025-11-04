/**
 * History Analyzer - Rich Pattern Detection & Insight Engine
 *
 * Extracts deep insights from browsing history:
 * - Platform-specific patterns (Substack blogs, GitHub repos, subreddits, etc.)
 * - Content categorization (blogs, docs, social, shopping, etc.)
 * - Browsing habits (morning reader, evening coder, weekend researcher, etc.)
 * - Research journeys (topic clusters, deep dives, abandoned investigations)
 *
 * Privacy: User sees EVERYTHING. We avoid reading data at our (Claude) level.
 */

class HistoryAnalyzer {
  constructor() {
    this.settings = null;
    this.storage = null;
    this.stats = {
      itemsFetched: 0,
      patternsDetected: 0,
      domainsProcessed: 0,
      startTime: 0,
      endTime: 0,
      errors: []
    };
  }

  /**
   * Initialize analyzer
   */
  async init() {
    this.settings = typeof window !== 'undefined' ? window.historySettings : historySettings;
    this.storage = typeof window !== 'undefined' ? window.historyStorage : historyStorage;
    await this.storage.init();

    // Initialize domain ontology (100k+ categorized domains)
    if (typeof domainOntology !== 'undefined' && !domainOntology.isReady()) {
      console.log('[HistoryAnalyzer] Initializing domain ontology...');
      await domainOntology.init();
    }
  }

  /**
   * Main analysis entry point
   */
  async analyzeHistory(progressCallback = null) {
    this.stats = {
      itemsFetched: 0,
      patternsDetected: 0,
      domainsProcessed: 0,
      startTime: Date.now(),
      endTime: 0,
      errors: []
    };

    try {
      console.log('[HistoryAnalyzer] Starting rich analysis...');

      await this.init();

      const settings = await this.settings.get();
      if (!settings.enabled) {
        throw new Error('History analysis is disabled');
      }

      // Get time range
      const timeRangeMs = await this.settings.getTimeRangeMs();
      const startTime = timeRangeMs === Infinity ? 0 : Date.now() - timeRangeMs;

      // Fetch all history
      if (progressCallback) progressCallback({ phase: 'fetch', progress: 0 });
      const historyItems = await this.fetchAllHistory(startTime, progressCallback);
      this.stats.itemsFetched = historyItems.length;
      console.log(`[HistoryAnalyzer] Fetched ${historyItems.length} items`);

      // Filter excluded domains
      if (progressCallback) progressCallback({ phase: 'filter', progress: 0 });
      const filteredItems = await this.filterExcludedDomains(historyItems, settings.excludeDomains);
      console.log(`[HistoryAnalyzer] After filtering: ${filteredItems.length} items`);

      // Rich pattern extraction
      if (progressCallback) progressCallback({ phase: 'patterns', progress: 0 });
      const patterns = await this.extractPatterns(filteredItems, settings, progressCallback);
      this.stats.patternsDetected = patterns.size;
      console.log(`[HistoryAnalyzer] Detected ${patterns.size} patterns`);

      // Aggregate by domain (rollup view)
      if (progressCallback) progressCallback({ phase: 'aggregate', progress: 0 });
      const domainStats = await this.aggregateByDomain(patterns, progressCallback);
      this.stats.domainsProcessed = domainStats.size;
      console.log(`[HistoryAnalyzer] Aggregated ${domainStats.size} domains`);

      // Save everything
      if (progressCallback) progressCallback({ phase: 'save', progress: 0 });
      await this.savePatterns(patterns, progressCallback);
      await this.saveDomainStats(domainStats, progressCallback);

      // Compute sessions & habits
      if (settings.features.enableTimeline) {
        if (progressCallback) progressCallback({ phase: 'sessions', progress: 0 });
        await this.computeSessions(filteredItems, settings, progressCallback);
      }

      // Detect browsing habits
      if (progressCallback) progressCallback({ phase: 'habits', progress: 0 });
      await this.detectBrowsingHabits(patterns, filteredItems, progressCallback);

      this.stats.endTime = Date.now();
      const durationSec = (this.stats.endTime - this.stats.startTime) / 1000;

      console.log(`[HistoryAnalyzer] Complete in ${durationSec.toFixed(2)}s`);
      console.log(`[HistoryAnalyzer] Stats:`, this.stats);

      return {
        success: true,
        stats: this.stats,
        duration: durationSec
      };
    } catch (error) {
      this.stats.endTime = Date.now();
      this.stats.errors.push(error.message);
      console.error('[HistoryAnalyzer] Failed:', error);
      throw error;
    }
  }

  /**
   * Fetch all history with pagination
   */
  async fetchAllHistory(startTime, progressCallback = null) {
    const allItems = [];
    const batchSize = 10000;
    let query = {
      text: '',
      startTime: startTime,
      maxResults: batchSize
    };

    let hasMore = true;
    let iteration = 0;

    while (hasMore) {
      try {
        const items = await browser.history.search(query);

        if (items.length === 0) {
          hasMore = false;
          break;
        }

        allItems.push(...items);

        if (progressCallback) {
          progressCallback({
            phase: 'fetch',
            progress: allItems.length,
            message: `Fetched ${allItems.length.toLocaleString()} items...`
          });
        }

        if (items.length < batchSize) {
          hasMore = false;
        } else {
          const oldestItem = items[items.length - 1];
          query.startTime = oldestItem.lastVisitTime;
          query.endTime = startTime;
        }

        iteration++;
        if (iteration >= 20) {
          console.warn('[HistoryAnalyzer] Reached iteration limit');
          hasMore = false;
        }
      } catch (error) {
        console.error('[HistoryAnalyzer] Fetch error:', error);
        this.stats.errors.push(`Fetch: ${error.message}`);
        hasMore = false;
      }
    }

    return allItems;
  }

  /**
   * Filter excluded domains
   */
  async filterExcludedDomains(items, excludeDomains = []) {
    if (!excludeDomains || excludeDomains.length === 0) {
      return items;
    }

    const excludeSet = new Set(excludeDomains.map(d => d.toLowerCase()));

    return items.filter(item => {
      try {
        const url = new URL(item.url);
        const domain = url.hostname.toLowerCase();
        return !excludeSet.has(domain);
      } catch (error) {
        return false;
      }
    });
  }

  /**
   * Extract rich patterns from URLs
   * Detects: Substack blogs, Medium authors, GitHub repos, Reddit subs, etc.
   */
  async extractPatterns(items, settings, progressCallback = null) {
    const patternMap = new Map();

    for (let i = 0; i < items.length; i++) {
      const item = items[i];

      try {
        const url = new URL(item.url);
        const domain = url.hostname.toLowerCase();
        const path = url.pathname;

        // Detect pattern
        const pattern = this.detectPattern(url, domain, path);
        const patternKey = pattern.key;

        // Get or create pattern stats
        let stats = patternMap.get(patternKey);
        if (!stats) {
          stats = {
            ...pattern,
            visitCount: 0,
            firstVisit: item.lastVisitTime || Date.now(),
            lastVisit: item.lastVisitTime || Date.now(),
            timePatterns: { morning: 0, afternoon: 0, evening: 0, night: 0 },
            sampleUrls: [],
            sampleTitles: [],
            avgSessionDuration: 0
          };
          patternMap.set(patternKey, stats);
        }

        // Update stats
        stats.visitCount += item.visitCount || 1;
        stats.firstVisit = Math.min(stats.firstVisit, item.lastVisitTime || Date.now());
        stats.lastVisit = Math.max(stats.lastVisit, item.lastVisitTime || Date.now());

        // Store samples (up to 5 per pattern)
        if (stats.sampleUrls.length < 5) {
          stats.sampleUrls.push(item.url);
        }
        if (item.title && stats.sampleTitles.length < 5 && !stats.sampleTitles.includes(item.title)) {
          stats.sampleTitles.push(item.title);
        }

        // Time patterns
        if (item.lastVisitTime) {
          const hour = new Date(item.lastVisitTime).getHours();
          if (hour >= 6 && hour < 12) stats.timePatterns.morning++;
          else if (hour >= 12 && hour < 18) stats.timePatterns.afternoon++;
          else if (hour >= 18 && hour < 22) stats.timePatterns.evening++;
          else stats.timePatterns.night++;
        }
      } catch (error) {
        continue;
      }

      if (progressCallback && i % 1000 === 0) {
        progressCallback({
          phase: 'patterns',
          progress: i,
          total: items.length,
          message: `Detecting patterns: ${i.toLocaleString()} / ${items.length.toLocaleString()}...`
        });
      }
    }

    // Apply k-anonymity threshold
    const minVisits = settings.minVisitsForStats || 3;
    for (const [key, stats] of patternMap.entries()) {
      if (stats.visitCount < minVisits) {
        patternMap.delete(key);
      }
    }

    return patternMap;
  }

  /**
   * Detect pattern type from URL
   */
  detectPattern(url, domain, path) {
    // Substack blogs: blog.substack.com
    if (domain.endsWith('.substack.com') && domain !== 'substack.com') {
      const blogName = domain.replace('.substack.com', '');
      return {
        key: `substack:${blogName}`,
        type: 'substack_blog',
        platform: 'Substack',
        identifier: blogName,
        displayName: `${blogName} (Substack)`,
        domain: domain,
        category: 'blog'
      };
    }

    // Medium authors: medium.com/@author
    if (domain === 'medium.com' && path.startsWith('/@')) {
      const author = path.split('/')[1];
      return {
        key: `medium:${author}`,
        type: 'medium_author',
        platform: 'Medium',
        identifier: author,
        displayName: `${author} (Medium)`,
        domain: domain,
        category: 'blog'
      };
    }

    // GitHub repos: github.com/user/repo
    if (domain === 'github.com') {
      const parts = path.split('/').filter(p => p);
      if (parts.length >= 2) {
        const repo = `${parts[0]}/${parts[1]}`;
        return {
          key: `github:${repo}`,
          type: 'github_repo',
          platform: 'GitHub',
          identifier: repo,
          displayName: `${repo} (GitHub)`,
          domain: domain,
          category: 'tech'
        };
      }
    }

    // Reddit subreddits: reddit.com/r/subreddit
    if (domain === 'reddit.com' || domain === 'old.reddit.com') {
      if (path.startsWith('/r/')) {
        const sub = path.split('/')[2];
        if (sub) {
          return {
            key: `reddit:${sub}`,
            type: 'reddit_subreddit',
            platform: 'Reddit',
            identifier: sub,
            displayName: `r/${sub} (Reddit)`,
            domain: 'reddit.com',
            category: 'social'
          };
        }
      }
    }

    // YouTube channels: youtube.com/@channel or /c/channel
    if (domain === 'youtube.com' || domain === 'www.youtube.com') {
      if (path.startsWith('/@') || path.startsWith('/c/')) {
        const channel = path.split('/')[1];
        return {
          key: `youtube:${channel}`,
          type: 'youtube_channel',
          platform: 'YouTube',
          identifier: channel,
          displayName: `${channel} (YouTube)`,
          domain: 'youtube.com',
          category: 'video'
        };
      }
    }

    // Twitter/X profiles: twitter.com/username or x.com/username
    if (domain === 'twitter.com' || domain === 'x.com') {
      const parts = path.split('/').filter(p => p);
      if (parts.length >= 1 && !parts[0].startsWith('i/')) {
        const username = parts[0];
        return {
          key: `twitter:${username}`,
          type: 'twitter_profile',
          platform: 'Twitter/X',
          identifier: username,
          displayName: `@${username} (Twitter)`,
          domain: 'twitter.com',
          category: 'social'
        };
      }
    }

    // Dev.to authors: dev.to/username
    if (domain === 'dev.to') {
      const parts = path.split('/').filter(p => p);
      if (parts.length >= 1) {
        const username = parts[0];
        return {
          key: `devto:${username}`,
          type: 'devto_author',
          platform: 'Dev.to',
          identifier: username,
          displayName: `${username} (Dev.to)`,
          domain: domain,
          category: 'tech'
        };
      }
    }

    // Stack Overflow questions: stackoverflow.com/questions/ID
    if (domain === 'stackoverflow.com' && path.startsWith('/questions/')) {
      return {
        key: `stackoverflow:questions`,
        type: 'stackoverflow_questions',
        platform: 'Stack Overflow',
        identifier: 'questions',
        displayName: 'Stack Overflow Questions',
        domain: domain,
        category: 'tech'
      };
    }

    // Hacker News: news.ycombinator.com
    if (domain === 'news.ycombinator.com') {
      return {
        key: `hn:home`,
        type: 'hackernews',
        platform: 'Hacker News',
        identifier: 'home',
        displayName: 'Hacker News',
        domain: domain,
        category: 'tech'
      };
    }

    // Documentation patterns (detect versioned docs, API docs)
    if (this.isDocsSite(domain, path)) {
      return {
        key: `docs:${domain}`,
        type: 'documentation',
        platform: 'Docs',
        identifier: domain,
        displayName: `${domain} (Docs)`,
        domain: domain,
        category: 'tech'
      };
    }

    // Default: just domain
    return {
      key: `domain:${domain}`,
      type: 'generic',
      platform: null,
      identifier: domain,
      displayName: domain,
      domain: domain,
      category: this.categorizeGenericDomain(domain)
    };
  }

  /**
   * Check if site is documentation
   */
  isDocsSite(domain, path) {
    const docsKeywords = ['docs', 'documentation', 'api', 'reference', 'guide', 'manual'];
    const lowerDomain = domain.toLowerCase();
    const lowerPath = path.toLowerCase();

    return docsKeywords.some(keyword =>
      lowerDomain.includes(keyword) || lowerPath.includes(keyword)
    );
  }

  /**
   * Categorize generic domain using ontology + heuristics
   */
  categorizeGenericDomain(domain) {
    // Try ontology first (1M+ domains)
    if (typeof domainOntology !== 'undefined' && domainOntology.isReady()) {
      const category = domainOntology.getCategory(domain);
      if (category !== 'other') {
        return category;
      }
    }

    // Fallback: pattern-based heuristics (30-category improved ontology)
    const lowerDomain = domain.toLowerCase();

    // Adult Content (comprehensive patterns)
    if (lowerDomain.match(/porn|xxx|sex|adult|nsfw|nude|dating|hookup|escort|camgirl/)) {
      return 'adult';
    }

    // Gambling (separate from gaming!)
    if (lowerDomain.match(/casino|poker|betting|lottery|gamble|sportsbook|slots/)) {
      return 'gambling';
    }

    // Gaming (video games only)
    if (lowerDomain.match(/steam|game(?!ble)|play(?!boy)|xbox|playstation|nintendo|twitch|esports|riot|blizzard/)) {
      return 'gaming';
    }

    // Social Media
    if (lowerDomain.match(/facebook|instagram|twitter|tiktok|snapchat|linkedin|reddit|pinterest|tumblr|whatsapp|telegram/)) {
      return 'social';
    }

    // Video Streaming
    if (lowerDomain.match(/youtube|netflix|hulu|disney|primevideo|vimeo|dailymotion|twitch\.tv/)) {
      return 'video';
    }

    // Music & Audio
    if (lowerDomain.match(/spotify|soundcloud|pandora|apple.*music|deezer|tidal|bandcamp|podcast/)) {
      return 'music';
    }

    // News & Media
    if (lowerDomain.match(/news|times|post|guardian|bbc|cnn|reuters|journalist|magazine|press/)) {
      return 'news';
    }

    // Shopping & E-commerce
    if (lowerDomain.match(/amazon|ebay|shop|store|cart|buy|ecommerce|etsy|alibaba|walmart|target/)) {
      return 'shopping';
    }

    // Finance & Banking
    if (lowerDomain.match(/bank|paypal|venmo|crypto|trading|invest|finance|payment|visa|mastercard|coinbase|binance/)) {
      return 'finance';
    }

    // Health & Medical
    if (lowerDomain.match(/health|medical|clinic|doctor|hospital|pharma|medicine|wellness|fitness/)) {
      return 'health';
    }

    // Education & Learning
    if (lowerDomain.match(/course|learn|edu|academy|tutorial|university|school|mooc|udemy|coursera/)) {
      return 'learning';
    }

    // Technology & Computing
    if (lowerDomain.match(/github|gitlab|bitbucket|stackoverflow|dev\.to|npm|pypi|cargo|crates|tech|software|hardware|computing/)) {
      return 'tech';
    }

    // Business & Professional
    if (lowerDomain.match(/business|corporate|enterprise|career|jobs|b2b|professional|consultant/)) {
      return 'business';
    }

    // Sports & Fitness
    if (lowerDomain.match(/sport|nfl|nba|mlb|soccer|football|basketball|hockey|olympics|athletic|gym/)) {
      return 'sports';
    }

    // Travel & Tourism
    if (lowerDomain.match(/booking|hotel|flight|airbnb|travel|trip|vacation|tourism|hostel/)) {
      return 'travel';
    }

    // Food & Dining
    if (lowerDomain.match(/food|recipe|restaurant|dining|cooking|chef|menu|delivery|grubhub|ubereats|doordash/)) {
      return 'food';
    }

    // Entertainment & Culture
    if (lowerDomain.match(/entertainment|movie|film|celebrity|culture|event|concert|theater/)) {
      return 'entertainment';
    }

    // Arts & Design
    if (lowerDomain.match(/art|design|creative|photography|gallery|museum|fashion|style/)) {
      return 'arts';
    }

    // Home & Garden
    if (lowerDomain.match(/home|house|garden|diy|decor|furniture|interior|renovation/)) {
      return 'home';
    }

    // Family & Kids
    if (lowerDomain.match(/family|parent|kids|children|baby|toddler|mom|dad/)) {
      return 'family';
    }

    // Pets & Animals
    if (lowerDomain.match(/pet|dog|cat|animal|veterinary|vet|puppy|kitten/)) {
      return 'pets';
    }

    // Religion & Philosophy
    if (lowerDomain.match(/religion|church|spiritual|bible|faith|prayer|philosophy/)) {
      return 'religion';
    }

    // Science & Academia
    if (lowerDomain.match(/science|research|academic|journal|scholar|study|laboratory/)) {
      return 'science';
    }

    // Government & Legal
    if (lowerDomain.match(/gov|government|legal|law|court|politics|election|policy/)) {
      return 'government';
    }

    // Real Estate & Property
    if (lowerDomain.match(/realestate|property|realtor|apartment|rental|housing|zillow/)) {
      return 'realestate';
    }

    // Automotive
    if (lowerDomain.match(/car|auto|vehicle|motorcycle|truck|automotive|dealer/)) {
      return 'automotive';
    }

    // Personal Blogs & Websites
    if (lowerDomain.match(/blog|personal|diary|journal|substack|medium\.com\/@|wordpress\.com/)) {
      return 'blog';
    }

    // Reference & Information
    if (lowerDomain.match(/wikipedia|wiki|dictionary|encyclopedia|reference|archive/)) {
      return 'reference';
    }

    // Productivity (work tools)
    if (lowerDomain.match(/notion|trello|asana|slack|zoom|productivity|task|project|calendar/)) {
      return 'productivity';
    }

    // Security & Harmful (phishing, malware, etc.)
    if (lowerDomain.match(/phish|malware|virus|hack|exploit|scam|fraud/)) {
      return 'security';
    }

    return 'other';
  }

  /**
   * Aggregate patterns into domain-level stats
   */
  async aggregateByDomain(patternMap, progressCallback = null) {
    const domainMap = new Map();

    for (const [key, pattern] of patternMap.entries()) {
      const domain = pattern.domain;

      let stats = domainMap.get(domain);
      if (!stats) {
        stats = {
          domain,
          visitCount: 0,
          patternCount: 0,
          firstVisit: pattern.firstVisit,
          lastVisit: pattern.lastVisit,
          timePatterns: { morning: 0, afternoon: 0, evening: 0, night: 0 },
          categories: new Set(),
          platforms: new Set()
        };
        domainMap.set(domain, stats);
      }

      // Aggregate
      stats.visitCount += pattern.visitCount;
      stats.patternCount++;
      stats.firstVisit = Math.min(stats.firstVisit, pattern.firstVisit);
      stats.lastVisit = Math.max(stats.lastVisit, pattern.lastVisit);
      stats.timePatterns.morning += pattern.timePatterns.morning;
      stats.timePatterns.afternoon += pattern.timePatterns.afternoon;
      stats.timePatterns.evening += pattern.timePatterns.evening;
      stats.timePatterns.night += pattern.timePatterns.night;

      if (pattern.category) stats.categories.add(pattern.category);
      if (pattern.platform) stats.platforms.add(pattern.platform);
    }

    // Convert sets to arrays
    for (const [domain, stats] of domainMap.entries()) {
      stats.categories = Array.from(stats.categories);
      stats.platforms = Array.from(stats.platforms);
    }

    return domainMap;
  }

  /**
   * Save patterns to storage
   */
  async savePatterns(patternMap, progressCallback = null) {
    let saved = 0;
    const total = patternMap.size;

    for (const [key, pattern] of patternMap.entries()) {
      try {
        await this.storage.savePattern(pattern);
        saved++;

        if (progressCallback && saved % 50 === 0) {
          progressCallback({
            phase: 'save_patterns',
            progress: saved,
            total: total,
            message: `Saved ${saved.toLocaleString()} / ${total.toLocaleString()} patterns...`
          });
        }
      } catch (error) {
        console.error(`[HistoryAnalyzer] Failed to save pattern ${key}:`, error);
        this.stats.errors.push(`Save pattern ${key}: ${error.message}`);
      }
    }

    console.log(`[HistoryAnalyzer] Saved ${saved} patterns`);
  }

  /**
   * Save domain stats
   */
  async saveDomainStats(domainMap, progressCallback = null) {
    let saved = 0;
    const total = domainMap.size;

    for (const [domain, stats] of domainMap.entries()) {
      try {
        await this.storage.saveDomainStats(domain, stats);
        saved++;

        if (progressCallback && saved % 100 === 0) {
          progressCallback({
            phase: 'save',
            progress: saved,
            total: total,
            message: `Saved ${saved.toLocaleString()} / ${total.toLocaleString()} domains...`
          });
        }
      } catch (error) {
        console.error(`[HistoryAnalyzer] Failed to save ${domain}:`, error);
        this.stats.errors.push(`Save ${domain}: ${error.message}`);
      }
    }

    console.log(`[HistoryAnalyzer] Saved ${saved} domain stats`);
  }

  /**
   * Compute browsing sessions
   */
  async computeSessions(items, settings, progressCallback = null) {
    const sessionGapMs = (settings.sessionGapMinutes || 30) * 60 * 1000;
    const sessions = [];
    let currentSession = null;

    const sortedItems = items.sort((a, b) => (a.lastVisitTime || 0) - (b.lastVisitTime || 0));

    for (const item of sortedItems) {
      const visitTime = item.lastVisitTime;
      if (!visitTime) continue;

      try {
        const url = new URL(item.url);
        const domain = url.hostname.toLowerCase();

        if (!currentSession) {
          currentSession = {
            sessionId: `session-${visitTime}`,
            startTime: visitTime,
            endTime: visitTime,
            domains: [domain],
            tabCount: 1
          };
        } else {
          const timeSinceLastActivity = visitTime - currentSession.endTime;

          if (timeSinceLastActivity > sessionGapMs) {
            currentSession.duration = currentSession.endTime - currentSession.startTime;
            sessions.push(currentSession);

            currentSession = {
              sessionId: `session-${visitTime}`,
              startTime: visitTime,
              endTime: visitTime,
              domains: [domain],
              tabCount: 1
            };
          } else {
            currentSession.endTime = visitTime;
            if (!currentSession.domains.includes(domain)) {
              currentSession.domains.push(domain);
            }
            currentSession.tabCount++;
          }
        }
      } catch (error) {
        continue;
      }
    }

    if (currentSession) {
      currentSession.duration = currentSession.endTime - currentSession.startTime;
      sessions.push(currentSession);
    }

    // Save recent sessions
    const recentSessions = sessions.slice(-100);
    for (const session of recentSessions) {
      try {
        await this.storage.saveSession(session);
      } catch (error) {
        console.error('[HistoryAnalyzer] Failed to save session:', error);
      }
    }

    console.log(`[HistoryAnalyzer] Computed ${sessions.length} sessions, saved ${recentSessions.length}`);
  }

  /**
   * Detect browsing habits and patterns
   */
  async detectBrowsingHabits(patternMap, items, progressCallback = null) {
    const habits = {
      topHours: this.detectTopHours(patternMap),
      contentTypes: this.detectContentTypes(patternMap),
      readingVsCoding: this.detectReadingVsCoding(patternMap),
      deepDives: this.detectDeepDives(patternMap),
      platforms: this.detectTopPlatforms(patternMap)
    };

    console.log('[HistoryAnalyzer] Detected habits:', habits);

    // Save habits
    try {
      await this.storage.saveHabits(habits);
      console.log('[HistoryAnalyzer] Saved browsing habits');
    } catch (error) {
      console.error('[HistoryAnalyzer] Failed to save habits:', error);
    }
  }

  detectTopHours(patternMap) {
    const hourCounts = new Array(24).fill(0);

    for (const pattern of patternMap.values()) {
      const tp = pattern.timePatterns;
      // Rough approximation of hours
      hourCounts[8] += tp.morning / 6;  // 6-12
      hourCounts[15] += tp.afternoon / 6;  // 12-18
      hourCounts[20] += tp.evening / 4;  // 18-22
      hourCounts[1] += tp.night / 8;  // 22-6
    }

    const topHour = hourCounts.indexOf(Math.max(...hourCounts));
    return { topHour, distribution: hourCounts };
  }

  detectContentTypes(patternMap) {
    const types = {};
    for (const pattern of patternMap.values()) {
      const cat = pattern.category || 'other';
      types[cat] = (types[cat] || 0) + pattern.visitCount;
    }
    return types;
  }

  detectReadingVsCoding(patternMap) {
    let reading = 0;
    let coding = 0;

    for (const pattern of patternMap.values()) {
      if (pattern.category === 'blog' || pattern.category === 'news') {
        reading += pattern.visitCount;
      }
      if (pattern.category === 'tech' || pattern.type === 'github_repo') {
        coding += pattern.visitCount;
      }
    }

    return { reading, coding, ratio: coding / (reading + coding) };
  }

  detectDeepDives(patternMap) {
    // Patterns with high visit count = deep dives
    const sorted = Array.from(patternMap.values())
      .sort((a, b) => b.visitCount - a.visitCount)
      .slice(0, 10);

    return sorted.map(p => ({
      name: p.displayName,
      visits: p.visitCount,
      type: p.type
    }));
  }

  detectTopPlatforms(patternMap) {
    const platforms = {};
    for (const pattern of patternMap.values()) {
      if (pattern.platform) {
        platforms[pattern.platform] = (platforms[pattern.platform] || 0) + pattern.visitCount;
      }
    }
    return platforms;
  }

  /**
   * Get stats
   */
  getStats() {
    return { ...this.stats };
  }
}

// Export singleton
if (typeof window !== 'undefined') {
  window.historyAnalyzer = new HistoryAnalyzer();
}
const historyAnalyzer = typeof window !== 'undefined' ? window.historyAnalyzer : new HistoryAnalyzer();
