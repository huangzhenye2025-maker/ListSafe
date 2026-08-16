/**
 * ListSafe - Content Script (with Multi-Language i18n Support)
 * Real-time Etsy & E-Commerce Listing Monitor & Smart Trademark Protection
 */

(function () {
  'use strict';

  // Prevent double injection
  if (window.__LISTSAFE_INITIALIZED__) return;
  window.__LISTSAFE_INITIALIZED__ = true;

  let localEngine = null;
  let currentAnalysis = null;
  let debounceTimer = null;
  let floatingWidgetEl = null;

  // Track target input fields
  const detectedFields = {
    title: null,
    tags: null,
    description: null
  };

  /**
   * Translation helper
   */
  function t(key, params = {}) {
    if (window.ListSafeI18n && typeof window.ListSafeI18n.t === 'function') {
      return window.ListSafeI18n.t(key, params);
    }
    return key;
  }

  /**
   * Escape HTML special chars (defense against XSS when interpolating
   * page/user-controlled strings into innerHTML)
   */
  function escapeHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /**
   * Helper to check if Chrome runtime is available
   */
  function isExtensionEnv() {
    return typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage;
  }

  /**
   * Find listing editable inputs on the current webpage
   */
  function locateListingFields() {
    // 1. Title Input
    detectedFields.title = 
      document.querySelector('#title') ||
      document.querySelector('input[name="title"]') ||
      document.querySelector('textarea[name="title"]') ||
      document.querySelector('#listing-title-input') ||
      document.querySelector('[data-field="title"]') ||
      document.querySelector('input[placeholder*="Title" i]') ||
      document.querySelector('input[id*="product-title" i]');

    // 2. Tags Input
    detectedFields.tags = 
      document.querySelector('#tags') ||
      document.querySelector('input[name="tags"]') ||
      document.querySelector('[data-field="tags"]') ||
      document.querySelector('#listing-tags-input') ||
      document.querySelector('input[placeholder*="Tag" i]') ||
      document.querySelector('input[id*="product-tags" i]');

    // 3. Description Field
    detectedFields.description = 
      document.querySelector('#description') ||
      document.querySelector('textarea[name="description"]') ||
      document.querySelector('#description-text-area') ||
      document.querySelector('[data-field="description"]') ||
      document.querySelector('textarea[placeholder*="Description" i]') ||
      document.querySelector('#product-description');

    return detectedFields.title || detectedFields.tags || detectedFields.description;
  }

  /**
   * Extract current values from the page
   */
  function getListingData() {
    locateListingFields();

    const title = detectedFields.title ? (detectedFields.title.value || detectedFields.title.innerText || '') : '';
    let tags = [];
    if (detectedFields.tags) {
      const rawTags = detectedFields.tags.value || detectedFields.tags.innerText || '';
      tags = rawTags.split(/[,;\n]+/).map(t => t.trim()).filter(Boolean);
    }
    const description = detectedFields.description ? (detectedFields.description.value || detectedFields.description.innerText || '') : '';

    return { title, tags, description };
  }

  /**
   * Analyze listing via Background Service Worker or Local Engine
   */
  async function runListingScan() {
    const listing = getListingData();

    // If no listing fields exist on this page (e.g. browse/search pages),
    // remove the floating widget entirely instead of showing a meaningless "safe" state.
    if (!locateListingFields()) {
      destroyFloatingWidget();
      clearFieldBanners();
      currentAnalysis = null;
      return;
    }

    // If fields exist but are completely blank, reset to the safe state
    if (!listing.title && listing.tags.length === 0 && !listing.description) {
      renderWidget(null);
      clearFieldBanners();
      currentAnalysis = null;
      return;
    }

    if (isExtensionEnv()) {
      try {
        const response = await chrome.runtime.sendMessage({
          type: 'ANALYZE_LISTING',
          listing
        });

        if (response && response.success) {
          currentAnalysis = response.analysis;
          renderWidget(currentAnalysis);
          renderFieldWarnings(currentAnalysis);
        }
      } catch (err) {
        fallbackLocalScan(listing);
      }
    } else {
      fallbackLocalScan(listing);
    }
  }

  /**
   * Fallback scanner for demo/standalone environments
   */
  function fallbackLocalScan(listing) {
    if (window.ListSafeEngine) {
      if (!localEngine && window.__LISTSAFE_DATABASE__) {
        localEngine = new window.ListSafeEngine(window.__LISTSAFE_DATABASE__);
      }
      if (localEngine) {
        currentAnalysis = localEngine.analyzeListing(listing);
        renderWidget(currentAnalysis);
        renderFieldWarnings(currentAnalysis);
      }
    }
  }

  /**
   * Debounced scan trigger
   */
  function scheduleScan() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(runListingScan, 280);
  }

  /**
   * Setup event listeners on editable fields
   */
  function bindInputListeners() {
    locateListingFields();

    const targets = [detectedFields.title, detectedFields.tags, detectedFields.description].filter(Boolean);
    targets.forEach(el => {
      if (!el.__listsafe_bound__) {
        el.__listsafe_bound__ = true;
        // 'input' covers typing/paste/IME; 'change' covers pickers & blur commits.
        el.addEventListener('input', scheduleScan);
        el.addEventListener('change', scheduleScan);
      }
    });
  }

  /**
   * Watch for SPA-driven field injection (Etsy/Shopify editors re-render
   * heavily). Pre-filter mutations to form-ish changes and debounce the
   * relocation to avoid running ~20 querySelectors on every DOM mutation.
   */
  let relocateTimer = null;
  function setupFieldObserver() {
    const observer = new MutationObserver((mutations) => {
      const relevant = mutations.some((m) => {
        if (!(m.target instanceof Element)) return false;
        if (m.target.matches('input, textarea, form') || m.target.closest('form')) return true;
        for (const node of m.addedNodes) {
          if (node.nodeType !== Node.ELEMENT_NODE) continue;
          const el = node;
          if (el.matches && (el.matches('input, textarea') || el.querySelector('input, textarea'))) {
            return true;
          }
        }
        return false;
      });
      if (relevant) {
        clearTimeout(relocateTimer);
        relocateTimer = setTimeout(() => {
          const foundBefore = !!(detectedFields.title || detectedFields.tags || detectedFields.description);
          bindInputListeners();
          const foundAfter = !!(detectedFields.title || detectedFields.tags || detectedFields.description);
          // New fields appeared -> run an immediate scan so the widget isn't stale
          if (foundAfter && !foundBefore) scheduleScan();
        }, 250);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  /**
   * Create and manage floating UI widget
   */
  function ensureFloatingWidget() {
    if (floatingWidgetEl) return floatingWidgetEl;

    floatingWidgetEl = document.createElement('div');
    floatingWidgetEl.className = 'listsafe-floating-widget';
    floatingWidgetEl.innerHTML = `
      <div class="listsafe-widget-card" id="listsafe-card">
        <div class="listsafe-widget-header">
          <div class="listsafe-brand">
            <span class="listsafe-shield-icon">🛡️</span>
            <span>ListSafe Guard</span>
            <span class="listsafe-pro-pill">PRO</span>
          </div>
          <button class="listsafe-widget-toggle" id="listsafe-btn-collapse" title="Minimize">─</button>
        </div>
        <div class="listsafe-widget-body">
          <div class="listsafe-score-row">
            <div class="listsafe-gauge-wrapper">
              <div class="listsafe-gauge-circle safe" id="listsafe-gauge">100</div>
            </div>
            <div class="listsafe-score-info">
              <div class="listsafe-status-headline" id="listsafe-status-title">${t('floatingWidgetTitle')}</div>
              <div class="listsafe-status-subtext" id="listsafe-status-sub">${t('floatingWidgetSub')}</div>
            </div>
          </div>
          <div class="listsafe-risks-container" id="listsafe-risks-list"></div>
          <div class="listsafe-widget-actions">
            <button class="listsafe-btn-fix-all" id="listsafe-btn-fix-all" disabled>
              ${t('btnFixAll')}
            </button>
          </div>
        </div>
      </div>

      <div class="listsafe-minimized-bubble" id="listsafe-minimized-bubble" title="Open ListSafe Guard">
        🛡️
        <div class="listsafe-badge-count" id="listsafe-min-badge" style="display:none;">0</div>
      </div>
    `;

    document.body.appendChild(floatingWidgetEl);

    // Event handlers
    const btnCollapse = floatingWidgetEl.querySelector('#listsafe-btn-collapse');
    const bubble = floatingWidgetEl.querySelector('#listsafe-minimized-bubble');
    const btnFixAll = floatingWidgetEl.querySelector('#listsafe-btn-fix-all');

    btnCollapse.addEventListener('click', () => {
      floatingWidgetEl.classList.add('minimized');
    });

    bubble.addEventListener('click', () => {
      floatingWidgetEl.classList.remove('minimized');
    });

    btnFixAll.addEventListener('click', () => {
      fixAllRiskyWords();
    });

    return floatingWidgetEl;
  }

  /**
   * Remove the floating widget (used on non-editor pages)
   */
  function destroyFloatingWidget() {
    if (floatingWidgetEl) {
      floatingWidgetEl.remove();
      floatingWidgetEl = null;
    }
  }

  /**
   * Update floating widget with fresh analysis
   */
  function renderWidget(analysis) {
    ensureFloatingWidget();

    const gauge = document.getElementById('listsafe-gauge');
    const statusTitle = document.getElementById('listsafe-status-title');
    const statusSub = document.getElementById('listsafe-status-sub');
    const risksList = document.getElementById('listsafe-risks-list');
    const btnFixAll = document.getElementById('listsafe-btn-fix-all');
    const minBadge = document.getElementById('listsafe-min-badge');

    btnFixAll.textContent = t('btnFixAll');

    if (!analysis) {
      gauge.className = 'listsafe-gauge-circle safe';
      gauge.textContent = '100';
      statusTitle.textContent = t('scoreSafe');
      statusSub.textContent = t('summarySafe');
      risksList.innerHTML = '';
      btnFixAll.disabled = true;
      minBadge.style.display = 'none';
      return;
    }

    // Set gauge
    gauge.textContent = analysis.score;
    gauge.className = `listsafe-gauge-circle ${analysis.safetyStatus}`;
    
    let statusHeadline = t('scoreSafe');
    if (analysis.safetyStatus === 'warning') statusHeadline = t('scoreWarning');
    if (analysis.safetyStatus === 'dangerous') statusHeadline = t('scoreDangerous');
    statusTitle.textContent = statusHeadline;

    const totalRisks = analysis.stats.totalMatches;
    if (totalRisks === 0) {
      statusSub.textContent = t('floatingWidgetSafeMsg');
      risksList.innerHTML = `
        <div style="font-size:12px; color:#10b981; text-align:center; padding:8px 0;">
          ${t('floatingWidgetSafeMsg')}
        </div>
      `;
      btnFixAll.disabled = true;
      minBadge.style.display = 'none';
    } else {
      statusSub.textContent = t('floatingWidgetFoundRisks', { count: totalRisks });
      minBadge.textContent = totalRisks;
      minBadge.style.display = 'flex';
      btnFixAll.disabled = false;

      // Render risk items (escape DB/page-derived strings defensively)
      risksList.innerHTML = analysis.uniqueRisks.map(r => `
        <div class="listsafe-risk-item ${escapeHtml(r.risk)}">
          <span class="listsafe-risk-name">⚠️ ${escapeHtml(r.phrase)}</span>
          <span class="listsafe-risk-tag">${escapeHtml(r.risk).toUpperCase()}</span>
        </div>
      `).join('');
    }
  }

  /**
   * Render inline warning banners under inputs
   */
  function renderFieldWarnings(analysis) {
    clearFieldBanners();
    if (!analysis || analysis.stats.totalMatches === 0) return;

    // Title Warnings
    if (detectedFields.title && analysis.titleResults.matches.length > 0) {
      createFieldBanner(detectedFields.title, analysis.titleResults.matches, 'title');
    }

    // Tags Warnings
    const riskyTags = analysis.tagResults.filter(t => t.hasRisk);
    if (detectedFields.tags && riskyTags.length > 0) {
      const allTagMatches = riskyTags.flatMap(t => t.matches);
      createFieldBanner(detectedFields.tags, allTagMatches, 'tags');
    }
  }

  function clearFieldBanners() {
    document.querySelectorAll('.listsafe-field-warning-banner').forEach(el => el.remove());
  }

  /**
   * Create an inline recommendation banner under a field
   */
  function createFieldBanner(fieldEl, matches, fieldType) {
    const banner = document.createElement('div');
    banner.className = 'listsafe-field-warning-banner';

    const matchPhrases = [...new Set(matches.map(m => m.phrase))].map(escapeHtml);
    const topMatch = matches[0];
    const alts = topMatch.alternatives || [];
    const safeOwner = escapeHtml(topMatch.owner || 'Registered Owner');
    const safeClass = escapeHtml(topMatch.class || '025');
    const safeMatched = escapeHtml(topMatch.matchedText);

    banner.innerHTML = `
      <div class="listsafe-field-warning-header">
        <div class="listsafe-field-warning-title">
          <span>${t('fieldWarningTitle', { phrases: matchPhrases.join(', ') })}</span>
        </div>
      </div>
      <div class="listsafe-field-warning-desc">
        ${t('fieldWarningDesc', { owner: safeOwner, class: safeClass })}
      </div>
      ${alts.length > 0 ? `
        <div class="listsafe-suggestions-box">
          <span class="listsafe-suggestion-label">${t('fieldSuggestedLabel')}</span>
          ${alts.slice(0, 3).map(alt => `
            <button type="button" class="listsafe-btn-safe-chip" data-target="${safeMatched}" data-replacement="${escapeHtml(alt)}">
              <span class="listsafe-chip-icon">+</span> ${escapeHtml(alt)}
            </button>
          `).join('')}
        </div>
      ` : ''}
    `;

    // Chip click handler
    banner.querySelectorAll('.listsafe-btn-safe-chip').forEach(chip => {
      chip.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const target = chip.getAttribute('data-target');
        const replacement = chip.getAttribute('data-replacement');
        replaceWordInField(fieldEl, target, replacement);
      });
    });

    fieldEl.parentNode.insertBefore(banner, fieldEl.nextSibling);
  }

  /**
   * Helper to replace text in an input or textarea
   */
  function replaceWordInField(inputEl, targetWord, replacement) {
    if (!inputEl || !targetWord || !replacement) return;

    let currentVal = inputEl.value;
    const escaped = targetWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escaped}(?:s|es)?\\b`, 'gi');

    const newVal = currentVal.replace(regex, replacement);
    inputEl.value = newVal;

    // Trigger standard input/change events for framework binding
    inputEl.dispatchEvent(new Event('input', { bubbles: true }));
    inputEl.dispatchEvent(new Event('change', { bubbles: true }));

    // Flash animation on field
    inputEl.style.transition = 'box-shadow 0.3s ease';
    inputEl.style.boxShadow = '0 0 0 3px rgba(16, 185, 129, 0.4)';
    setTimeout(() => {
      inputEl.style.boxShadow = '';
    }, 800);

    scheduleScan();
  }

  /**
   * One-Click Fix All
   */
  function fixAllRiskyWords() {
    if (!currentAnalysis || currentAnalysis.stats.totalMatches === 0) return;

    let replacedCount = 0;

    // Fix Title
    if (detectedFields.title && currentAnalysis.titleResults.matches.length > 0) {
      let titleVal = detectedFields.title.value;
      for (const m of currentAnalysis.titleResults.matches) {
        const replacement = (m.alternatives && m.alternatives[0]) || 'Artisan Custom';
        const escaped = m.matchedText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`\\b${escaped}(?:s|es)?\\b`, 'gi');
        titleVal = titleVal.replace(regex, replacement);
        replacedCount++;
      }
      detectedFields.title.value = titleVal;
      detectedFields.title.dispatchEvent(new Event('input', { bubbles: true }));
      detectedFields.title.dispatchEvent(new Event('change', { bubbles: true }));
    }

    // Fix Tags
    if (detectedFields.tags) {
      let tagsVal = detectedFields.tags.value;
      const riskyTags = currentAnalysis.tagResults.filter(t => t.hasRisk);
      for (const rt of riskyTags) {
        for (const m of rt.matches) {
          const replacement = (m.alternatives && m.alternatives[0]) || 'Handmade Gift';
          const escaped = m.matchedText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const regex = new RegExp(`\\b${escaped}(?:s|es)?\\b`, 'gi');
          tagsVal = tagsVal.replace(regex, replacement);
          replacedCount++;
        }
      }
      detectedFields.tags.value = tagsVal;
      detectedFields.tags.dispatchEvent(new Event('input', { bubbles: true }));
      detectedFields.tags.dispatchEvent(new Event('change', { bubbles: true }));
    }

    // Record blocked stats in background
    if (isExtensionEnv() && replacedCount > 0) {
      chrome.runtime.sendMessage({
        type: 'RECORD_RISK_BLOCKED',
        count: replacedCount
      });
    }

    scheduleScan();
  }

  // Initialize on page load
  async function init() {
    if (window.ListSafeI18n) {
      await window.ListSafeI18n.initLanguage();
    }
    bindInputListeners();
    setupFieldObserver();
    // Only scan if listing fields actually exist on this page
    if (locateListingFields()) scheduleScan();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Handle RPC messages from Popup
  if (isExtensionEnv() && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.type === 'GET_TAB_LISTING_ANALYSIS') {
        const listing = getListingData();
        const hasFields = !!(detectedFields.title || detectedFields.tags || detectedFields.description);
        sendResponse({
          success: true,
          listing,
          analysis: currentAnalysis,
          hasFields
        });
        return true;
      }
      if (request.type === 'EXECUTE_FIX_ALL') {
        fixAllRiskyWords();
        sendResponse({ success: true, analysis: currentAnalysis });
        return true;
      }
    });
  }

  // Expose API for demo page integration
  window.ListSafe = {
    scan: runListingScan,
    fixAll: fixAllRiskyWords,
    getListingData: getListingData,
    getAnalysis: () => currentAnalysis,
    refreshLanguage: () => {
      if (currentAnalysis) {
        renderWidget(currentAnalysis);
        renderFieldWarnings(currentAnalysis);
      }
    }
  };

  console.log('[ListSafe] Content script active with multi-language i18n support.');
})();
