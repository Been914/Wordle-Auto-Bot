import { loadWords, launchBrowser, openGame, playGames } from '../src/solver.mjs';

const GAME_COUNT = 10;
const WIN_THRESHOLD = 7;

const words = loadWords('words.txt');
console.log('loaded words');
const browser = await launchBrowser({ headless: true });
console.log('loaded browser');
const page = await openGame(browser);
console.log('loaded page, starting game');

const results = await playGames(page, words, GAME_COUNT);
await browser.close();

const wins = results.filter(r => r.won).length;

console.log('\n=== Trial results ===');
results.forEach((r, i) => console.log(`  Game ${i + 1}: ${r.won ? 'WIN' : 'LOSS'} (${r.titleText})`));
console.log(`Wins: ${wins}/${results.length} (threshold: ${WIN_THRESHOLD})`);

if (results.length < GAME_COUNT) {
    console.error(`Only completed ${results.length}/${GAME_COUNT} games - treating as a failure.`);
    process.exit(1);
}

if (wins < WIN_THRESHOLD) {
    console.error(`FAILED: won ${wins}/${GAME_COUNT}, needed at least ${WIN_THRESHOLD}.`);
    process.exit(1);
}

console.log(`PASSED: won ${wins}/${GAME_COUNT}.`);
