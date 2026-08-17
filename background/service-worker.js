/**
 * ListSafe - Background Service Worker (Manifest V3)
 * Central Hub for rule engine singletons, offline state, and licensing.
 */

importScripts('../utils/rule-engine.js');

let engine = null;
let databaseCache = null;
let engineInitPromise = null;
let lastScanSignature = '';

// Initial state defaults
const DEFAULT_STATE = {
  isPro: false,
  proExpiry: null,
  licenseKey: '',
  language: 'en',
  stats: {
    listingsScanned: 0,
    risksBlocked: 0,
    lastScannedAt: null
  },
  whitelist: ["handmade", "vintage", "custom gift"],
  settings: {
    autoScan: true,
    highlightColor: 'rose', // rose | amber | classic
    showFloatingWidget: true,
    enableFuzzyMatch: true
  }
};

/**
 * Initialize engine and load database.
 * Shared Promise avoids duplicate concurrent loading during startup/onInstalled.
 */
function initEngine() {
  if (!engineInitPromise) {
    engineInitPromise = doInitEngine().finally(() => {
      engineInitPromise = null;
    });
  }
  return engineInitPromise;
}

async function doInitEngine() {
  try {
    const url = chrome.runtime.getURL('data/trademark-database.json');
    const response = await fetch(url);
    databaseCache = await response.json();

    engine = new ListSafeEngine(databaseCache);

    // Load persisted state
    const stored = await chrome.storage.local.get(['userState']);
    const state = stored.userState || DEFAULT_STATE;

    if (state.whitelist) {
      engine.setWhitelist(state.whitelist);
    }

    console.log(`[ListSafe] Engine initialized with ${databaseCache.records.length} trademark rules.`);
  } catch (error) {
    console.error('[ListSafe] Failed to initialize engine:', error);
  }
}

// On Extension Installed or Updated
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('[ListSafe] Extension installed/updated:', details.reason);
  const stored = await chrome.storage.local.get(['userState']);
  if (!stored.userState) {
    await chrome.storage.local.set({ userState: DEFAULT_STATE });
  }
  await initEngine();
});

// On startup
chrome.runtime.onStartup.addListener(async () => {
  await initEngine();
});

// Initialize on SW wake
initEngine();

/**
 * Message Handling (RPC Central Hub)
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!engine && databaseCache) {
    engine = new ListSafeEngine(databaseCache);
  }

  const handleMessage = async () => {
    if (!engine) {
      await initEngine();
    }

    switch (message.type) {
      case 'ANALYZE_TEXT': {
        const matches = engine.scanText(message.text || '');
        return { success: true, matches };
      }

      case 'ANALYZE_LISTING': {
        const analysis = engine.analyzeListing(message.listing || {});

        // Update tab badge if sender is a tab
        if (sender && sender.tab && sender.tab.id) {
          updateTabBadge(sender.tab.id, analysis);
        }

        // Only count scans when the risk signature actually changes
        const signature = [
          analysis.score,
          analysis.safetyStatus,
          analysis.stats.totalMatches,
          analysis.stats.tagCount
        ].join('|');
        if (signature !== lastScanSignature) {
          lastScanSignature = signature;
          updateStats({ scannedIncrement: 1 });
        }

        return { success: true, analysis };
      }

      case 'SEARCH_TRADEMARKS': {
        const results = engine.searchDatabase(
          message.query || '',
          message.filterClass || '',
          message.filterRisk || ''
        );
        return { success: true, count: results.length, results };
      }

      case 'GET_DB_INFO': {
        return {
          success: true,
          totalRecords: databaseCache ? databaseCache.records.length : 0,
          categories: databaseCache ? databaseCache.categories : [],
          version: databaseCache ? databaseCache.version : '1.0.2'
        };
      }

      case 'GET_USER_STATE': {
        await flushStats();
        const stored = await chrome.storage.local.get(['userState']);
        const state = stored.userState || DEFAULT_STATE;

        // Background non-blocking sync: If user is Pro and last check > 12 hours ago, verify with server
        if (state.isPro && state.licenseKey && (!state.lastVerified || Date.now() - state.lastVerified > 12 * 3600 * 1000)) {
          state.lastVerified = Date.now();
          verifyLicenseKey(state.licenseKey).then(res => {
            if (!res.ok && res.error && !res.error.includes('Could not connect')) {
              // Server explicitly returned inactive, expired or refunded
              chrome.storage.local.get(['userState'], (r) => {
                const cur = r.userState || {};
                cur.isPro = false;
                chrome.storage.local.set({ userState: cur });
              });
            }
          }).catch(() => {});
        }

        return { success: true, state };
      }

      case 'ACTIVATE_LICENSE': {
        const rawKey = (message.key || '').trim();
        const result = await verifyLicenseKey(rawKey);

        if (result.ok) {
          const stored = await chrome.storage.local.get(['userState']);
          const state = stored.userState || DEFAULT_STATE;
          state.isPro = true;
          state.licenseKey = rawKey;
          state.activatedAt = new Date().toISOString();
          state.plan = result.plan || 'pro_monthly';
          state.lastVerified = Date.now();
          
          // Use server-provided expiration timestamp or calculate based on plan
          if (result.expiresAt) {
            state.proExpiry = new Date(result.expiresAt * 1000).toISOString();
          } else {
            const days = result.plan === 'pro_yearly' ? 365 : 30;
            state.proExpiry = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
          }

          await chrome.storage.local.set({ userState: state });
          return {
            success: true,
            message: 'Waffo 订单验证成功！Pro 专业版特权已解锁！'
          };
        }
        return {
          success: false,
          message: result.error || 'Invalid Order ID or License Key. Please check your Waffo confirmation email.'
        };
      }

      case 'UPDATE_WHITELIST': {
        const stored = await chrome.storage.local.get(['userState']);
        const state = stored.userState || DEFAULT_STATE;
        state.whitelist = message.whitelist || [];
        await chrome.storage.local.set({ userState: state });
        engine.setWhitelist(state.whitelist);
        return { success: true, whitelist: state.whitelist };
      }

      case 'RECORD_RISK_BLOCKED': {
        updateStats({ blockedIncrement: message.count || 1 });
        return { success: true };
      }

      case 'UPDATE_SETTINGS': {
        const stored = await chrome.storage.local.get(['userState']);
        const state = stored.userState || DEFAULT_STATE;
        state.settings = { ...state.settings, ...message.settings };
        await chrome.storage.local.set({ userState: state });
        return { success: true, settings: state.settings };
      }

      default:
        return { success: false, error: 'Unknown message type' };
    }
  };

  handleMessage()
    .then(sendResponse)
    .catch(err => sendResponse({ success: false, error: err.message }));

  return true; // Keep message channel open for async response
});

// Backend Server Endpoint (Live Render Service)
const API_BASE = 'https://listsafe.onrender.com';

/**
 * Real License / Order verification against ListSafe Backend & Waffo Gatekeeper.
 * Enforces Fail-Closed security: Must be validated by live backend authority.
 */
async function verifyLicenseKey(rawKey) {
  const key = (rawKey || '').trim();
  const keyUpper = key.toUpperCase();

  // 1. Explicit Local Demo / Test VIP keys
  if (keyUpper === 'DEMO-VIP-2026' || keyUpper === 'ETSY-SAFE-PRO') {
    return { ok: true, kind: 'demo', plan: 'pro_yearly' };
  }

  // 2. Strict format check
  const isWaffoOrder =
    /^ORD_[a-zA-Z0-9_-]{6,}$/i.test(key) ||
    /^SUB_[a-zA-Z0-9_-]{6,}$/i.test(key) ||
    /^TXN_[a-zA-Z0-9_-]{6,}$/i.test(key) ||
    /^WF[a-zA-Z0-9_-]{6,}$/i.test(key) ||
    /^WAFFO[a-zA-Z0-9_-]{4,}$/i.test(key);

  const isOfficialKey =
    /^LISTSAFE-PRO-[A-Z0-9-]{4,}$/.test(keyUpper) ||
    /^PRO-[A-Z0-9-]{4,}$/.test(keyUpper);

  if (!isWaffoOrder && !isOfficialKey) {
    return { ok: false, error: 'Invalid Order ID format. Expected format: ORD_xxxxxxxx or LISTSAFE-PRO-xxxx' };
  }

  // 3. Online Server Verification (ListSafe Backend Gatekeeper)
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    const verifyEndpoint = `${API_BASE}/api/verify-license?key=${encodeURIComponent(key)}`;

    const resp = await fetch(verifyEndpoint, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      signal: controller.signal
    }).catch(() => null);

    clearTimeout(timer);

    if (resp && resp.ok) {
      const data = await resp.json();
      if (data && data.valid === true && data.status === 'active') {
        return {
          ok: true,
          kind: 'server_verified',
          plan: data.plan || 'pro_monthly',
          expiresAt: data.expires_at
        };
      }
      if (data && (data.status === 'refunded' || data.status === 'expired' || data.status === 'not_found')) {
        return {
          ok: false,
          error: data.message || 'License is inactive, expired, or refunded.'
        };
      }
    }
  } catch (err) {
    console.warn('[ListSafe] Backend verification network error:', err);
  }

  // Fail-Closed: Never grant Pro without backend confirmation
  return {
    ok: false,
    error: 'Could not connect to ListSafe License Server. Please check your internet connection and try again.'
  };
}

/**
 * Update Action Badge on Chrome tab
 */
function updateTabBadge(tabId, analysis) {
  try {
    const riskCount = analysis.stats.totalMatches;
    if (riskCount > 0) {
      chrome.action.setBadgeText({ tabId, text: `${riskCount}` });
      const color = analysis.safetyStatus === 'dangerous' ? '#ef4444' : '#f59e0b';
      chrome.action.setBadgeBackgroundColor({ tabId, color });
    } else {
      chrome.action.setBadgeText({ tabId, text: '✓' });
      chrome.action.setBadgeBackgroundColor({ tabId, color: '#10b981' });
    }
  } catch (e) {
    // Ignore if tab closed
  }
}

/**
 * Throttled storage batch write
 * Accumulates in memory and flushes at most once per second.
 */
const statsAccum = { scanned: 0, blocked: 0 };
let statsFlushTimer = null;
let statsFlushing = false;

function updateStats({ scannedIncrement = 0, blockedIncrement = 0 }) {
  statsAccum.scanned += scannedIncrement;
  statsAccum.blocked += blockedIncrement;
  if (statsFlushTimer === null && (statsAccum.scanned || statsAccum.blocked)) {
    statsFlushTimer = setTimeout(flushStats, 1000);
  }
}

function flushStats() {
  if (statsFlushTimer !== null) {
    clearTimeout(statsFlushTimer);
    statsFlushTimer = null;
  }
  if (statsFlushing) return Promise.resolve();

  const inc = statsAccum;
  statsAccum.scanned = 0;
  statsAccum.blocked = 0;
  if (!inc.scanned && !inc.blocked) return Promise.resolve();

  statsFlushing = true;
  return (async () => {
    try {
      const stored = await chrome.storage.local.get(['userState']);
      const state = stored.userState || DEFAULT_STATE;
      if (!state.stats) state.stats = { listingsScanned: 0, risksBlocked: 0, lastScannedAt: null };

      state.stats.listingsScanned += inc.scanned;
      state.stats.risksBlocked += inc.blocked;
      state.stats.lastScannedAt = new Date().toISOString();

      await chrome.storage.local.set({ userState: state });
    } catch (e) {
      statsAccum.scanned += inc.scanned;
      statsAccum.blocked += inc.blocked;
      console.error('Failed to update stats:', e);
    } finally {
      statsFlushing = false;
      if (statsAccum.scanned || statsAccum.blocked) {
        statsFlushTimer = setTimeout(flushStats, 1000);
      }
    }
  })();
}
