/**
 * ListSafe Rule Engine
 * High-performance trademark detection, risk scoring, and safe word replacement.
 * Single-pass O(L) multi-pattern matching with combined regex compilation.
 */

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ListSafeEngine = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  class RuleEngine {
    constructor(database = null) {
      this.database = database || { records: [], categories: [] };
      this.customWhitelist = new Set();
      this.customBlacklist = [];
      this.combinedRegex = null;
      this.patternMap = new Map();
      this.patternList = [];
      if (this.database.records && this.database.records.length > 0) {
        this.compile();
      }
    }

    /**
     * Load or update database
     */
    loadDatabase(database) {
      this.database = database;
      this.compile();
    }

    /**
     * Set user custom whitelist
     */
    setWhitelist(list) {
      this.customWhitelist = new Set((list || []).map(w => w.trim().toLowerCase()));
    }

    /**
     * Set user custom blacklist
     */
    setBlacklist(list) {
      this.customBlacklist = list || [];
      this.compile();
    }

    /**
     * Pre-compile a single unified alternation regex and lookup table.
     * Replaces N sequential regex passes with a single O(L) multi-pattern scan.
     */
    compile() {
      this.patternMap = new Map();
      const allRecords = [...(this.database.records || []), ...this.customBlacklist];

      // Collect all phrases and keywords
      for (const record of allRecords) {
        const patterns = new Set();
        if (record.phrase) patterns.add(record.phrase.toLowerCase().trim());
        if (Array.isArray(record.keywords)) {
          record.keywords.forEach(k => {
            if (k) patterns.add(k.toLowerCase().trim());
          });
        }

        for (const pat of patterns) {
          if (!pat) continue;
          this.patternMap.set(pat, record);
          const normalized = pat.replace(/[\s\-_]+/g, ' ');
          if (!this.patternMap.has(normalized)) {
            this.patternMap.set(normalized, record);
          }
        }
      }

      // Sort patterns by descending length (longest match first)
      const rawPatterns = Array.from(new Set(this.patternMap.keys()));
      rawPatterns.sort((a, b) => b.length - a.length);

      if (rawPatterns.length === 0) {
        this.combinedRegex = null;
        this.patternList = [];
        return;
      }

      // Build deduplicated alternation subpatterns with flexible space/hyphen and plural support
      const subpatternSet = new Set();
      for (const pattern of rawPatterns) {
        let sub;
        if (pattern.includes(' ') || pattern.includes('-') || pattern.includes('_')) {
          const flex = pattern.split(/[\s\-_]+/).filter(Boolean).map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[\\s\\-_]+');
          sub = `${flex}(?:s|es)?`;
        } else {
          const esc = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          sub = `${esc}(?:s|es)?`;
        }
        subpatternSet.add(sub);
      }

      const uniqueSubpatterns = Array.from(subpatternSet);
      this.patternList = rawPatterns;
      this.combinedRegex = new RegExp(`\\b(?:${uniqueSubpatterns.join('|')})\\b`, 'gi');
    }

    /**
     * Scan raw text for trademark infringements in a single O(L) pass
     * @param {string} text 
     * @returns {Array<MatchResult>}
     */
    scanText(text) {
      if (!text || typeof text !== 'string' || text.trim().length === 0 || !this.combinedRegex) {
        return [];
      }

      const matches = [];
      const seenRanges = []; // Prevent overlapping matches
      this.combinedRegex.lastIndex = 0;

      let match;
      while ((match = this.combinedRegex.exec(text)) !== null) {
        const matchedText = match[0];
        const startIndex = match.index;
        const endIndex = startIndex + matchedText.length;
        const lowerMatched = matchedText.toLowerCase().trim();

        // 1. Check direct whitelist
        if (this.customWhitelist.has(lowerMatched)) {
          continue;
        }

        // 2. Find matching record via normalized lookup
        let record = this.patternMap.get(lowerMatched);
        if (!record) {
          const normalized = lowerMatched.replace(/[\s\-_]+/g, ' ');
          record = this.patternMap.get(normalized);
        }
        if (!record) {
          const singular = lowerMatched.replace(/(?:es|s)$/, '');
          record = this.patternMap.get(singular) || this.patternMap.get(singular.replace(/[\s\-_]+/g, ' '));
        }

        // Fallback: search pattern list
        if (!record) {
          for (const p of this.patternList) {
            if (lowerMatched.startsWith(p) || p.startsWith(lowerMatched)) {
              record = this.patternMap.get(p);
              break;
            }
          }
        }

        if (!record) continue;

        // Check if root phrase is whitelisted
        if (this.customWhitelist.has(record.phrase.toLowerCase().trim())) {
          continue;
        }

        // 3. Overlap check
        const overlaps = seenRanges.some(r => !(endIndex <= r.start || startIndex >= r.end));
        if (!overlaps) {
          seenRanges.push({ start: startIndex, end: endIndex });
          matches.push({
            matchedText,
            startIndex,
            endIndex,
            record,
            risk: record.risk || 'high',
            phrase: record.phrase,
            owner: record.owner,
            class: record.class,
            serialNumber: record.serialNumber,
            description: record.description,
            alternatives: record.alternatives || []
          });
        }
      }

      // Sort by start index
      return matches.sort((a, b) => a.startIndex - b.startIndex);
    }

    /**
     * Scan an entire Etsy/Shopify listing payload
     * @param {{ title: string, tags: string[]|string, description: string }} listing 
     */
    analyzeListing(listing = {}) {
      const title = listing.title || '';
      const rawTags = listing.tags || [];
      const tags = Array.isArray(rawTags) ? rawTags : (typeof rawTags === 'string' ? rawTags.split(',').map(t => t.trim()).filter(Boolean) : []);
      const description = listing.description || '';

      const titleMatches = this.scanText(title);
      const descMatches = this.scanText(description);

      const tagResults = tags.map(tag => {
        const tagMatches = this.scanText(tag);
        const isTooLong = tag.length > 20; // Etsy tag max 20 chars
        return {
          tag,
          length: tag.length,
          isTooLong,
          matches: tagMatches,
          hasRisk: tagMatches.length > 0
        };
      });

      const allMatches = [
        ...titleMatches.map(m => ({ ...m, source: 'title' })),
        ...descMatches.map(m => ({ ...m, source: 'description' })),
        ...tagResults.flatMap(tr => tr.matches.map(m => ({ ...m, source: 'tags', tagValue: tr.tag })))
      ];

      // Deduplicate risks by trademark ID
      const uniqueRisksMap = new Map();
      allMatches.forEach(m => {
        const key = m.record.id || m.record.phrase;
        if (!uniqueRisksMap.has(key)) {
          uniqueRisksMap.set(key, { ...m, count: 1, occurrences: [m.source] });
        } else {
          const item = uniqueRisksMap.get(key);
          item.count++;
          if (!item.occurrences.includes(m.source)) item.occurrences.push(m.source);
        }
      });

      const uniqueRisks = Array.from(uniqueRisksMap.values());

      // Score Calculation (0 - 100)
      let score = 100;
      let criticalCount = 0;
      let highCount = 0;
      let mediumCount = 0;

      for (const risk of uniqueRisks) {
        if (risk.risk === 'critical') {
          score -= 35;
          criticalCount++;
        } else if (risk.risk === 'high') {
          score -= 20;
          highCount++;
        } else {
          score -= 10;
          mediumCount++;
        }
      }

      // Minor penalty for missing tags or tags over limit
      if (tags.length > 13) score -= 5;
      const overLimitCount = tagResults.filter(t => t.isTooLong).length;
      if (overLimitCount > 0) score -= 5;

      score = Math.max(0, Math.min(100, score));

      let safetyStatus = 'safe'; // safe | warning | dangerous
      let statusLabel = '100% Safe to Publish';
      let statusColor = '#10b981'; // emerald-500

      if (score < 50 || criticalCount > 0) {
        safetyStatus = 'dangerous';
        statusLabel = 'High Suspension Risk';
        statusColor = '#ef4444'; // rose-500
      } else if (score < 85 || highCount > 0 || mediumCount > 0) {
        safetyStatus = 'warning';
        statusLabel = 'Risks Detected';
        statusColor = '#f59e0b'; // amber-500
      }

      return {
        score,
        safetyStatus,
        statusLabel,
        statusColor,
        stats: {
          totalMatches: allMatches.length,
          uniqueRisksCount: uniqueRisks.length,
          criticalCount,
          highCount,
          mediumCount,
          tagCount: tags.length,
          tagOverLimitCount: overLimitCount
        },
        titleResults: {
          text: title,
          matches: titleMatches
        },
        tagResults,
        descriptionResults: {
          matchesCount: descMatches.length,
          matches: descMatches
        },
        allMatches,
        uniqueRisks
      };
    }

    /**
     * Replace matched risky words with safe alternative in a string
     * @param {string} text 
     * @param {string} targetWord 
     * @param {string} replacement 
     */
    replaceWithSafe(text, targetWord, replacement) {
      if (!text || !targetWord || !replacement) return text;
      const escaped = targetWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`\\b${escaped}\\b`, 'gi');
      return text.replace(regex, replacement);
    }

    /**
     * Search dictionary by keyword
     */
    searchDatabase(query = '', filterClass = '', filterRisk = '') {
      const q = query.trim().toLowerCase();
      return (this.database.records || []).filter(item => {
        const matchesQuery = !q || 
          item.phrase.toLowerCase().includes(q) ||
          (item.keywords && item.keywords.some(k => k.toLowerCase().includes(q))) ||
          (item.owner && item.owner.toLowerCase().includes(q)) ||
          (item.description && item.description.toLowerCase().includes(q));

        const matchesClass = !filterClass || (item.class && item.class.includes(filterClass));
        const matchesRisk = !filterRisk || item.risk === filterRisk;

        return matchesQuery && matchesClass && matchesRisk;
      });
    }
  }

  return RuleEngine;
});
