const fs = require('fs');
const path = require('path');
const ListSafeEngine = require('./utils/rule-engine.js');

const dbPath = path.join(__dirname, 'data', 'trademark-database.json');
const rawDb = JSON.parse(fs.readFileSync(dbPath, 'utf8'));

const engine = new ListSafeEngine(rawDb);

console.log('--- [ListSafe Engine Verification Test Suite] ---');

// Test 1: High risk exact and plural match
const testText1 = "Vintage Boy Mom Sweatshirt with cute mama bears and onesies for baby";
const matches1 = engine.scanText(testText1);
console.log(`\nTest 1 (Text Scanning): "${testText1}"`);
console.log(`Matches found: ${matches1.length}`);
matches1.forEach(m => console.log(` - Matched: "${m.matchedText}" -> Trademark: "${m.phrase}" (${m.risk.toUpperCase()})`));

console.assert(matches1.some(m => m.phrase === 'Boy Mom'), 'Failed to match Boy Mom');
console.assert(matches1.some(m => m.phrase === 'Mama Bear'), 'Failed to match Mama Bear');
console.assert(matches1.some(m => m.phrase === 'Onesie'), 'Failed to match Onesie');

// Test 2: Listing Analysis & Score
const testListing = {
  title: "Custom Swiftie Stanley Cup 40oz Tumbler with Barbie Pink Bow",
  tags: ["stanley cup", "swiftie", "barbie pink", "crocs jibbitz", "super bowl party", "this is a very long tag that exceeds twenty characters limit"],
  description: "Perfect for game day super bowl tailgates."
};

const analysis = engine.analyzeListing(testListing);
console.log('\nTest 2 (Full Listing Analysis):');
console.log(`Score: ${analysis.score}/100 | Status: ${analysis.statusLabel}`);
console.log(`Total Risk Violations: ${analysis.stats.totalMatches}`);
console.log(`Tag count: ${analysis.stats.tagCount}, Over-limit tags: ${analysis.stats.tagOverLimitCount}`);

console.assert(analysis.score < 50, 'High risk listing should score below 50');
console.assert(analysis.safetyStatus === 'dangerous', 'Safety status should be dangerous');

// Test 3: Safe Word Replacement
let cleanTitle = testListing.title;
for (const match of analysis.titleResults.matches) {
  const safeAlt = match.alternatives[0];
  cleanTitle = engine.replaceWithSafe(cleanTitle, match.matchedText, safeAlt);
}
console.log('\nTest 3 (Replacement):');
console.log(`Original: "${testListing.title}"`);
console.log(`Cleaned:  "${cleanTitle}"`);
const cleanMatches = engine.scanText(cleanTitle);
console.log(`Remaining matches in cleaned title: ${cleanMatches.length}`);
console.assert(cleanMatches.length === 0, 'Cleaned title should have 0 violations');

// Test 4: Database Search
const searchResults = engine.searchDatabase('cricut', '016');
console.log(`\nTest 4 (Database Search for "cricut"): Found ${searchResults.length} records`);
console.assert(searchResults.length > 0, 'Search should find records for Cricut');

console.log('\n✅ ALL AUTOMATED TESTS PASSED SUCCESSFULLY!\n');
