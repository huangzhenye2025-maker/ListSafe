console.log('--- [Testing Waffo Order ID & License Key Verification] ---');

// Must stay in sync with verifyLicenseKey() in background/service-worker.js
function validateLicenseKey(rawKey) {
  const key = (rawKey || '').trim();
  const keyUpper = key.toUpperCase();

  // Explicit demo / test keys (should not ship in production)
  if (keyUpper === 'DEMO-VIP-2026' || keyUpper === 'ETSY-SAFE-PRO') {
    return true;
  }

  // Waffo order / subscription / transaction formats (no blanket "any 10+ chars" rule)
  const isWaffoOrder =
    /^ORD_[a-zA-Z0-9_-]{6,}$/i.test(key) ||
    /^SUB_[a-zA-Z0-9_-]{6,}$/i.test(key) ||
    /^TXN_[a-zA-Z0-9_-]{6,}$/i.test(key) ||
    /^WF[a-zA-Z0-9_-]{6,}$/i.test(key) ||
    /^WAFFO[a-zA-Z0-9_-]{4,}$/i.test(key);

  // Official keys: prefix + at least 4 valid chars (no bare startsWith match)
  const isOfficialKey =
    /^LISTSAFE-PRO-[A-Z0-9-]{4,}$/.test(keyUpper) ||
    /^PRO-[A-Z0-9-]{4,}$/.test(keyUpper);

  return isWaffoOrder || isOfficialKey;
}

const testCases = [
  { key: 'ORD_1Rwhe7sFXn5oqvh6kPBfNI', expected: true, label: 'Waffo Order ID format' },
  { key: 'SUB_99a8b7c6d5e4f3a2', expected: true, label: 'Waffo Subscription ID format' },
  { key: 'TXN_20260816999888', expected: true, label: 'Waffo Transaction ID format' },
  { key: 'WF_8837192847', expected: true, label: 'Waffo WF prefix' },
  { key: 'LISTSAFE-PRO-2026', expected: true, label: 'Official Pro License Key' },
  { key: 'LISTSAFE-PRO-ABCD-EFGH', expected: true, label: 'Official Pro License Key (grouped)' },
  { key: 'PRO-ABCD-EFGH', expected: true, label: 'Legacy PRO grouped key' },
  { key: 'ETSY-SAFE-PRO', expected: true, label: 'Official Preset Key' },
  { key: 'DEMO-VIP-2026', expected: true, label: 'Demo VIP Key' },
  { key: '123', expected: false, label: 'Short invalid key' },
  { key: 'invalid-key-$$$', expected: false, label: 'Special characters invalid key' },
  { key: 'AAAAAAAAAA', expected: false, label: 'Random 10-char string must NOT unlock Pro' },
  { key: 'asdfghjklm', expected: false, label: 'Lowercase 10-char string must NOT unlock Pro' },
  { key: 'LISTSAFE', expected: false, label: 'Bare prefix without suffix must fail' },
  { key: 'PRO-12', expected: false, label: 'Too-short official suffix must fail' }
];

let failed = 0;
testCases.forEach(({ key, expected, label }) => {
  const result = validateLicenseKey(key);
  const ok = result === expected;
  if (!ok) failed++;
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${label}: "${key}" -> Result: ${result}`);
});

if (failed > 0) {
  console.error(`\n❌ ${failed} TEST(S) FAILED!\n`);
  process.exit(1);
}
console.log('\n✅ ALL ORDER ID & LICENSE VALIDATION TESTS PASSED!\n');
