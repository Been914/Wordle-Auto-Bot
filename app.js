import { loadWords, launchBrowser, openGame, playOneGame } from './src/solver.mjs';

const words = loadWords('words.txt');
const browser = await launchBrowser({ headless: false });
const page = await openGame(browser);

while (true) {
    await playOneGame(page, words);
}