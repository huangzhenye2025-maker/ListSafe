/**
 * ListSafe - Popup Controller (with Multi-Language i18n Support)
 * Ephemeral UI Layer: Communicates with Background Service Worker and Content Script via RPC.
 */

document.addEventListener('DOMContentLoaded', async () => {
  let userState = null;
  let activeListingAnalysis = null;

  // DOM Elements
  const navButtons = document.querySelectorAll('.nav-btn');
  const tabContents = document.querySelectorAll('.tab-content');
  const proBadge = document.getElementById('pro-badge');
  const langSwitcher = document.getElementById('lang-switcher');

  // Tab 1 Elements
  const gaugeRing = document.getElementById('gauge-ring');
  const gaugeScore = document.getElementById('gauge-score');
  const scoreStatusBadge = document.getElementById('score-status-badge');
  const scoreSummaryText = document.getElementById('score-summary-text');
  const metricThreats = document.getElementById('metric-threats');
  const metricTags = document.getElementById('metric-tags');
  const btnPopupFixAll = document.getElementById('btn-popup-fix-all');
  const threatsList = document.getElementById('threats-list');
  const threatsCounter = document.getElementById('threats-counter');
  const tagsCountLabel = document.getElementById('tags-count-label');
  const tagsInspectorBox = document.getElementById('tags-inspector-box');

  // Tab 2 Elements
  const ipSearchInput = document.getElementById('ip-search-input');
  const btnClearSearch = document.getElementById('btn-clear-search');
  const filterClassSelect = document.getElementById('filter-class-select');
  const filterRiskSelect = document.getElementById('filter-risk-select');
  const searchResultsList = document.getElementById('search-results-list');

  // Tab 3 Elements
  const inputLicenseKey = document.getElementById('input-license-key');
  const btnActivateLicense = document.getElementById('btn-activate-license');
  const licenseFeedback = document.getElementById('license-feedback');
  const statScannedCount = document.getElementById('stat-scanned-count');
  const statBlockedCount = document.getElementById('stat-blocked-count');
  const inputWhitelistWord = document.getElementById('input-whitelist-word');
  const btnAddWhitelist = document.getElementById('btn-add-whitelist');
  const whitelistTagsContainer = document.getElementById('whitelist-tags-container');

  /**
   * Escape HTML special chars before interpolating page/user-controlled
   * strings into innerHTML (Zero-XSS Defense)
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
   * Send RPC message to Background Service Worker
   */
  function sendMessage(msg) {
    return new Promise((resolve) => {
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage(msg, (response) => {
          const err = chrome.runtime.lastError;
          resolve((!err && response) || { success: false, error: err ? err.message : 'No response' });
        });
      } else {
        resolve({ success: false, error: 'No extension runtime' });
      }
    });
  }

  /**
   * Send RPC message to Content Script on active tab
   */
  function sendTabMessage(tabId, msg) {
    return new Promise((resolve) => {
      if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.sendMessage) {
        chrome.tabs.sendMessage(tabId, msg, (response) => {
          const err = chrome.runtime.lastError;
          resolve((!err && response) || { success: false, error: err ? err.message : 'No response' });
        });
      } else {
        resolve({ success: false, error: 'No tabs API' });
      }
    });
  }

  /**
   * Initialize state & UI
   */
  async function init() {
    // 1. Initialize i18n
    if (window.ListSafeI18n) {
      const currentLang = await window.ListSafeI18n.initLanguage();
      if (langSwitcher) langSwitcher.value = currentLang;
      window.ListSafeI18n.applyDomTranslations();
    }

    setupTabNavigation();
    setupLanguageSwitcher();

    // 2. Fetch User State from Background SW
    const stateRes = await sendMessage({ type: 'GET_USER_STATE' });
    if (stateRes && stateRes.success) {
      userState = stateRes.state;
      applyUserState(userState);
    }

    // 3. Setup Event Listeners
    setupSearchListeners();
    setupProListeners();
    setupWhitelistListeners();

    // 4. Trigger Initial Health Scan via Content Script RPC
    await refreshActiveTabScan();

    // 5. Initial Database Search view via Background SW
    renderSearchResults('');
  }

  /**
   * Language Switcher Handler
   */
  function setupLanguageSwitcher() {
    if (!langSwitcher) return;
    langSwitcher.addEventListener('change', () => {
      const selectedLang = langSwitcher.value;
      if (window.ListSafeI18n) {
        window.ListSafeI18n.setLanguage(selectedLang);
        window.ListSafeI18n.applyDomTranslations();
        
        // Re-render dynamic views in new language
        if (activeListingAnalysis) {
          renderHealthScan(activeListingAnalysis);
        } else {
          renderDefaultHealthScan();
        }

        renderSearchResults(ipSearchInput.value.trim(), filterClassSelect.value, filterRiskSelect.value);
        if (userState) applyUserState(userState);
      }
    });
  }

  /**
   * Tab Navigation Setup
   */
  function setupTabNavigation() {
    navButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        navButtons.forEach(b => b.classList.remove('active'));
        tabContents.forEach(c => c.classList.remove('active'));

        btn.classList.add('active');
        const targetId = btn.getAttribute('data-tab');
        const targetTab = document.getElementById(targetId);
        if (targetTab) targetTab.classList.add('active');
      });
    });
  }

  /**
   * Update UI based on User Pro State
   */
  function applyUserState(state) {
    if (!state) return;
    const t = (k) => window.ListSafeI18n ? window.ListSafeI18n.t(k) : k;

    if (state.isPro) {
      proBadge.textContent = t('proActive');
      proBadge.style.display = 'inline-block';
      inputLicenseKey.value = state.licenseKey || 'PRO-UNLOCKED';
      inputLicenseKey.disabled = true;
      btnActivateLicense.textContent = t('btnActive');
      btnActivateLicense.disabled = true;
    } else {
      proBadge.textContent = t('freeBadge');
      proBadge.style.background = 'rgba(255,255,255,0.06)';
      proBadge.style.color = '#94a3b8';
    }

    // Stats
    statScannedCount.textContent = state.stats ? state.stats.listingsScanned : 0;
    statBlockedCount.textContent = state.stats ? state.stats.risksBlocked : 0;

    // Whitelist
    renderWhitelist(state.whitelist || []);
  }

  /**
   * Scan active tab listing via Content Script RPC (Single Source of Truth)
   */
  async function refreshActiveTabScan() {
    if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.query) {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab && tab.id) {
        try {
          const res = await sendTabMessage(tab.id, { type: 'GET_TAB_LISTING_ANALYSIS' });
          if (res && res.success && res.hasFields) {
            if (res.analysis) {
              activeListingAnalysis = res.analysis;
              renderHealthScan(activeListingAnalysis);
              return;
            } else if (res.listing) {
              // Ask SW to analyze listing if content script hadn't finished
              const swRes = await sendMessage({ type: 'ANALYZE_LISTING', listing: res.listing });
              if (swRes && swRes.success) {
                activeListingAnalysis = swRes.analysis;
                renderHealthScan(activeListingAnalysis);
                return;
              }
            }
          }
        } catch (e) {
          // Fallback if tab is not an editable page
        }
      }
    }
    renderDefaultHealthScan();
  }

  /**
   * Render Tab 1 Health Scan Details
   */
  function renderHealthScan(analysis) {
    const t = (k, p) => window.ListSafeI18n ? window.ListSafeI18n.t(k, p) : k;

    if (!analysis) {
      renderDefaultHealthScan();
      return;
    }

    const score = analysis.score;
    gaugeScore.textContent = score;

    // Update gauge ring gradient
    let colorVar = 'var(--safe-color)';
    let statusLabel = t('scoreSafe');
    if (analysis.safetyStatus === 'warning') {
      colorVar = 'var(--warn-color)';
      statusLabel = t('scoreWarning');
    } else if (analysis.safetyStatus === 'dangerous') {
      colorVar = 'var(--danger-color)';
      statusLabel = t('scoreDangerous');
    }

    gaugeRing.style.background = `conic-gradient(${colorVar} 0deg ${score * 3.6}deg, rgba(255,255,255,0.08) ${score * 3.6}deg 360deg)`;

    // Score badge
    scoreStatusBadge.className = `score-status-badge ${analysis.safetyStatus}`;
    scoreStatusBadge.textContent = statusLabel;

    // Metrics
    metricThreats.textContent = analysis.stats.totalMatches;
    metricTags.textContent = `${analysis.tagResults.length}/13`;

    // Summary Text
    if (analysis.stats.totalMatches === 0) {
      scoreSummaryText.textContent = t('summarySafe');
      btnPopupFixAll.disabled = true;
    } else {
      const summaryKey = analysis.safetyStatus === 'dangerous' ? 'summaryDangerous' : 'summaryWarning';
      scoreSummaryText.textContent = t(summaryKey, { count: analysis.stats.totalMatches });
      btnPopupFixAll.disabled = false;
    }

    // Threats Counter
    threatsCounter.textContent = `${analysis.uniqueRisks.length} ${t('metricRisks')}`;
    threatsCounter.className = `counter-badge ${analysis.uniqueRisks.length > 0 ? '' : 'safe'}`;

    // Render Threat Cards (Defensive HTML escaping)
    if (analysis.uniqueRisks.length === 0) {
      threatsList.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">🛡️</div>
          <p class="empty-title">${t('emptyThreatsTitle')}</p>
          <p class="empty-desc">${t('emptyThreatsDesc')}</p>
        </div>
      `;
    } else {
      threatsList.innerHTML = analysis.uniqueRisks.map(r => `
        <div class="threat-card ${escapeHtml(r.risk)}">
          <div class="threat-card-header">
            <span class="threat-title">⚠️ ${escapeHtml(r.phrase)}</span>
            <span class="threat-risk-tag">${escapeHtml(r.risk).toUpperCase()}</span>
          </div>
          <div class="threat-meta">
            ${escapeHtml(r.owner || 'Registered Owner')} • Class ${escapeHtml(r.class || '025')}
          </div>
          ${r.alternatives && r.alternatives.length > 0 ? `
            <div class="threat-alts-box">
              <span style="font-size:10px; color:#94a3b8;">${t('safeAltsTitle')}</span>
              ${r.alternatives.slice(0, 3).map(alt => `
                <span class="threat-alt-chip">${escapeHtml(alt)}</span>
              `).join('')}
            </div>
          ` : ''}
        </div>
      `).join('');
    }

    // Render Tags Inspector
    tagsCountLabel.textContent = t('tagsCountUsed', { count: analysis.tagResults.length });
    if (analysis.tagResults.length === 0) {
      tagsInspectorBox.innerHTML = `<p class="empty-hint">${t('tagsInspectorNone')}</p>`;
    } else {
      tagsInspectorBox.innerHTML = analysis.tagResults.map(tr => `
        <div class="tag-bubble ${tr.isTooLong ? 'too-long' : ''} ${tr.hasRisk ? 'risky' : ''}" title="${tr.length} chars ${tr.isTooLong ? escapeHtml(t('tagOverLimitHint')) : ''}">
          <span>${escapeHtml(tr.tag)}</span>
          <span style="font-size:9px; opacity:0.7;">(${tr.length}/20)</span>
          ${tr.hasRisk ? '⚠️' : ''}
        </div>
      `).join('');
    }
  }

  function renderDefaultHealthScan() {
    const t = (k) => window.ListSafeI18n ? window.ListSafeI18n.t(k) : k;
    gaugeScore.textContent = '100';
    gaugeRing.style.background = `conic-gradient(var(--safe-color) 0deg 360deg, rgba(255,255,255,0.08) 360deg)`;
    scoreStatusBadge.className = 'score-status-badge safe';
    scoreStatusBadge.textContent = t('scoreSafe');
    scoreSummaryText.textContent = t('summarySafe');
    metricThreats.textContent = '0';
    metricTags.textContent = '0/13';
    btnPopupFixAll.disabled = true;
    threatsList.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🛡️</div>
        <p class="empty-title">${t('emptyThreatsTitle')}</p>
        <p class="empty-desc">${t('emptyThreatsDesc')}</p>
      </div>
    `;
    if (tagsInspectorBox) {
      tagsInspectorBox.innerHTML = `<p class="empty-hint">${t('tagsInspectorEmpty')}</p>`;
    }
  }

  // Fix All button click: Dispatches RPC to Content Script
  btnPopupFixAll.addEventListener('click', async () => {
    if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.query) {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab && tab.id) {
        const res = await sendTabMessage(tab.id, { type: 'EXECUTE_FIX_ALL' });
        if (res && res.success && res.analysis) {
          activeListingAnalysis = res.analysis;
          renderHealthScan(activeListingAnalysis);
        } else {
          setTimeout(refreshActiveTabScan, 300);
        }
      }
    }
  });

  /**
   * Tab 2: IP Lookup Search Logic via Background SW RPC
   */
  function setupSearchListeners() {
    const handleSearch = () => {
      const query = ipSearchInput.value.trim();
      const filterClass = filterClassSelect.value;
      const filterRisk = filterRiskSelect.value;

      btnClearSearch.style.display = query ? 'block' : 'none';
      renderSearchResults(query, filterClass, filterRisk);
    };

    ipSearchInput.addEventListener('input', handleSearch);
    filterClassSelect.addEventListener('change', handleSearch);
    filterRiskSelect.addEventListener('change', handleSearch);

    btnClearSearch.addEventListener('click', () => {
      ipSearchInput.value = '';
      btnClearSearch.style.display = 'none';
      renderSearchResults('', filterClassSelect.value, filterRiskSelect.value);
    });
  }

  // Guard against out-of-order async search responses while typing quickly
let searchRequestSeq = 0;

async function renderSearchResults(query = '', filterClass = '', filterRisk = '') {
    const t = (k, p) => window.ListSafeI18n ? window.ListSafeI18n.t(k, p) : k;

    const requestSeq = ++searchRequestSeq;
    const res = await sendMessage({
      type: 'SEARCH_TRADEMARKS',
      query,
      filterClass,
      filterRisk
    });

    // A newer search was issued while this one was in flight -> drop stale result
    if (requestSeq !== searchRequestSeq) return;

    const results = (res && res.success && res.results) || [];

    if (results.length === 0) {
      searchResultsList.innerHTML = `
        <div class="empty-state" style="margin-top:20px;">
          <div class="empty-icon">🔍</div>
          <p class="empty-title">${t('noSearchResultsTitle')}</p>
          <p class="empty-desc">${t('noSearchResultsDesc', { query: escapeHtml(query) })}</p>
        </div>
      `;
      return;
    }

    searchResultsList.innerHTML = results.map(item => `
      <div class="ip-result-card">
        <div class="ip-card-top">
          <span class="ip-phrase-title">⚠️ ${escapeHtml(item.phrase)}</span>
          <span class="threat-risk-tag" style="background:${item.risk === 'critical' ? 'var(--danger-bg)' : 'var(--warn-bg)'}; color:${item.risk === 'critical' ? 'var(--danger-color)' : 'var(--warn-color)'}">
            ${escapeHtml(item.risk).toUpperCase()}
          </span>
        </div>
        <div class="ip-meta-row">
          <span class="ip-meta-tag">Class ${escapeHtml(item.class)}</span>
          <span class="ip-meta-tag">${escapeHtml(item.owner)}</span>
        </div>
        <p class="ip-desc-text">${escapeHtml(item.description)}</p>
        ${item.alternatives && item.alternatives.length > 0 ? `
          <div class="ip-alts-box">
            <div class="ip-alts-title">${t('safeAltsTitle')}</div>
            <div class="ip-alts-chips">
              ${item.alternatives.map(alt => `
                <button type="button" class="ip-alt-btn" data-copy="${escapeHtml(alt)}" title="Click to copy">${escapeHtml(alt)} 📋</button>
              `).join('')}
            </div>
          </div>
        ` : ''}
      </div>
    `).join('');

    // Copy to clipboard handlers
    searchResultsList.querySelectorAll('.ip-alt-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const text = btn.getAttribute('data-copy');
        navigator.clipboard.writeText(text);
        const original = btn.textContent;
        btn.textContent = t('copiedSuccess');
        setTimeout(() => { btn.textContent = original; }, 1200);
      });
    });
  }

  /**
   * Tab 3: Pro & License Activation
   */
  function setupProListeners() {
    const t = (k) => window.ListSafeI18n ? window.ListSafeI18n.t(k) : k;

    btnActivateLicense.addEventListener('click', async () => {
      const key = inputLicenseKey.value.trim();
      if (!key) {
        showLicenseFeedback(t('licenseRequired'), 'error');
        return;
      }

      btnActivateLicense.disabled = true;
      btnActivateLicense.textContent = t('btnChecking');

      const res = await sendMessage({
        type: 'ACTIVATE_LICENSE',
        key
      });

      if (res && res.success) {
        showLicenseFeedback(t('licenseSuccess'), 'success');
        proBadge.textContent = t('proActive');
        proBadge.style.display = 'inline-block';
        btnActivateLicense.textContent = t('btnActive');
      } else {
        showLicenseFeedback(t('licenseInvalid'), 'error');
        btnActivateLicense.disabled = false;
        btnActivateLicense.textContent = t('btnActivate');
      }
    });
  }

  function showLicenseFeedback(text, type) {
    licenseFeedback.textContent = text;
    licenseFeedback.className = `license-message ${type}`;
  }

  /**
   * Whitelist Manager
   */
  function setupWhitelistListeners() {
    btnAddWhitelist.addEventListener('click', async () => {
      const word = inputWhitelistWord.value.trim().toLowerCase();
      if (!word) return;

      const currentList = (userState && userState.whitelist) || [];
      if (!currentList.includes(word)) {
        currentList.push(word);
        const res = await sendMessage({
          type: 'UPDATE_WHITELIST',
          whitelist: currentList
        });

        if (res && res.success) {
          userState.whitelist = currentList;
          renderWhitelist(currentList);
          inputWhitelistWord.value = '';
          refreshActiveTabScan();
        }
      }
    });
  }

  function renderWhitelist(list) {
    whitelistTagsContainer.innerHTML = list.map(word => `
      <div class="whitelist-chip">
        <span>${escapeHtml(word)}</span>
        <button class="remove-whitelist-btn" data-word="${escapeHtml(word)}" title="Remove">✕</button>
      </div>
    `).join('');

    whitelistTagsContainer.querySelectorAll('.remove-whitelist-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const wordToRemove = btn.getAttribute('data-word');
        const updated = (userState.whitelist || []).filter(w => w !== wordToRemove);
        const res = await sendMessage({
          type: 'UPDATE_WHITELIST',
          whitelist: updated
        });
        if (res && res.success) {
          userState.whitelist = updated;
          renderWhitelist(updated);
          refreshActiveTabScan();
        }
      });
    });
  }

  // Run initialization
  await init();
});
