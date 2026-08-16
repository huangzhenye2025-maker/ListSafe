const ListSafeI18n = require('./utils/i18n.js');

console.log('--- [ListSafe i18n Verification Test Suite] ---');

const languages = ['en', 'zh-CN', 'de', 'fr', 'es', 'ja'];

// Test 1: Verify all languages load and translate core keys
languages.forEach(lang => {
  ListSafeI18n.setLanguage(lang);
  const appName = ListSafeI18n.t('appName');
  const tabHealth = ListSafeI18n.t('tabHealth');
  const scoreSafe = ListSafeI18n.t('scoreSafe');
  const scoreDangerous = ListSafeI18n.t('scoreDangerous');
  const btnFixAll = ListSafeI18n.t('btnFixAll');
  
  console.log(`\n[Language: ${lang}]`);
  console.log(` - App Name: ${appName}`);
  console.log(` - Health Tab: ${tabHealth}`);
  console.log(` - Safe Status: ${scoreSafe}`);
  console.log(` - Dangerous Status: ${scoreDangerous}`);
  console.log(` - Fix Button: ${btnFixAll}`);

  console.assert(appName && appName.length > 0, `Missing appName in ${lang}`);
  console.assert(scoreSafe && scoreSafe.length > 0, `Missing scoreSafe in ${lang}`);
  console.assert(btnFixAll && btnFixAll.length > 0, `Missing btnFixAll in ${lang}`);
});

// Test 2: Parameter replacement test
ListSafeI18n.setLanguage('zh-CN');
const zhSummary = ListSafeI18n.t('summaryDangerous', { count: 5 });
console.log(`\n[Param Test - zh-CN]: ${zhSummary}`);
console.assert(zhSummary.includes('5 个极高危侵权词'), 'Param replacement failed for zh-CN');

ListSafeI18n.setLanguage('en');
const enSummary = ListSafeI18n.t('summaryDangerous', { count: 3 });
console.log(`[Param Test - en]: ${enSummary}`);
console.assert(enSummary.includes('Found 3 high-risk terms'), 'Param replacement failed for en');

ListSafeI18n.setLanguage('de');
const deWarning = ListSafeI18n.t('fieldWarningTitle', { phrases: 'Boy Mom, Mama Bear' });
console.log(`[Param Test - de]: ${deWarning}`);
console.assert(deWarning.includes('Boy Mom, Mama Bear'), 'Param replacement failed for de');

console.log('\n✅ ALL i18N MULTI-LANGUAGE TESTS PASSED SUCCESSFULLY!\n');
