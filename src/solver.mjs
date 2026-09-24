import puppeteer from 'puppeteer';
import fs from 'node:fs';

export function loadWords(path = 'words.txt') {
    const data = fs.readFileSync(path, { encoding: 'utf8' });
    return data.split('\n').map(w => w.trim().toUpperCase()).filter(Boolean);
}

export async function launchBrowser(opts = {}) {
    return puppeteer.launch({
        headless: true,
        // Needed on GitHub Actions runners: Chrome refuses to start as root
        // without --no-sandbox, and CI containers often have a tiny /dev/shm.
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
        ...opts,
    });
}

export async function openGame(browser) {
    const page = await browser.newPage();
    await page.goto('https://wordler.org/wordle-unlimited');
    await page.setViewport({ width: 1080, height: 1024 });
    await new Promise(resolve => setTimeout(resolve, 1000));
    await page.locator('::-p-aria([name="Reject All"][role="button"])').click();
    return page;
}

// Plays a single game to completion (win, loss, or run out of candidate words).
// Returns { isOver, won, titleText }.
export async function playOneGame(page, words, { maxGuesses = 6 } = {}) {
    for (let i = 0; i < maxGuesses; i++) {
        await new Promise(resolve => setTimeout(resolve, 1500));

        const state = await checkGameOver(page);
        if (state.isOver) return state;

        const word = await getWord(page, words);
        if (word === null) {
            // Word list exhausted before the modal appeared - count it as a loss
            // rather than hanging, so a trial run can never stall indefinitely.
            return { isOver: true, won: false, titleText: 'NO_CANDIDATES' };
        }

        await page.keyboard.type(word);
        await page.keyboard.press('Enter');
    }

    const finalState = await checkGameOver(page);
    if (finalState.isOver) return finalState;
    return { isOver: true, won: false, titleText: 'MAX_GUESSES_EXCEEDED' };
}

export async function playGames(page, words, count) {
    const results = [];
    for (let g = 0; g < count; g++) {
        results.push(await playOneGame(page, words));
    }
    return results;
}

async function getWord(page, words) {
    const list = await getWordList(page, words);
    return list.length === 0 ? null : list[0];
}

async function getWordList(page, words) {
    const constraints = await getConstraints(page);
    return words.filter(w => {
        for (let c = 0; c < constraints.correct.length; c++) {
            const char = constraints.correct[c];
            if (char === null) continue;
            if (w[c] !== char) return false;
        }
        for (const letter of constraints.absent) {
            if (w.includes(letter)) return false;
        }
        for (const letter of constraints.elsewhere) {
            if (!w.includes(letter)) return false;
        }
        for (let c = 0; c < constraints.elsewhereByPos.length; c++) {
            for (const letter of constraints.elsewhereByPos[c]) {
                if (w[c] === letter) return false;
            }
        }
        return true;
    });
}

async function getBoardState(page) {
    return await page.evaluate(() => {
        const statusFromClassList = (classList) => {
            if (classList.contains('correct')) return 'correct';
            if (classList.contains('elsewhere')) return 'elsewhere';
            if (classList.contains('absent')) return 'absent';
            return 'empty';
        };

        const rows = Array.from(document.querySelectorAll('.Game > .row'));

        return rows.map(row => {
            const cells = Array.from(row.querySelectorAll('.cell'));
            return cells.map(cell => ({
                letter: (cell.textContent || '').trim().toUpperCase(),
                status: statusFromClassList(cell.classList),
            }));
        });
    });
}

async function getCompletedRows(page) {
    const board = await getBoardState(page);
    return board.filter(row => row.length > 0 && row.every(cell => cell.status !== 'empty'));
}

async function getConstraints(page) {
    const completedRows = await getCompletedRows(page);

    const correct = [null, null, null, null, null];
    const elsewhere = new Set();
    const absent = new Set();
    const elsewhereByPos = [new Set(), new Set(), new Set(), new Set(), new Set()];

    for (const row of completedRows) {
        row.forEach((cell, i) => {
            if (!cell.letter) return;

            if (cell.status === 'correct') {
                correct[i] = cell.letter;
            } else if (cell.status === 'elsewhere') {
                elsewhere.add(cell.letter);
                elsewhereByPos[i].add(cell.letter);
            } else if (cell.status === 'absent') {
                const appearsElsewhereInRow = row.some(c => c.letter === cell.letter && c.status !== 'absent');
                if (!appearsElsewhereInRow) absent.add(cell.letter);
            }
        });
    }

    return { correct, elsewhere, absent, elsewhereByPos };
}

async function checkGameOver(page) {
    const state = await page.evaluate(() => {
        const modal = document.querySelector('.Top-window-background.modal-reveal');
        if (!modal) return { isOver: false, titleText: '' };

        const style = window.getComputedStyle(modal);
        const isOver = style.display !== 'none' && style.visibility !== 'hidden';

        const titleEl = modal.querySelector('.Top-window-title');
        const titleText = titleEl ? titleEl.textContent.trim() : '';

        return { isOver, titleText };
    });

    if (!state.isOver) return { isOver: false, won: false, titleText: '' };

    const won = state.titleText.toUpperCase().includes('WON');
    console.log(won ? `Victory! (${state.titleText})` : `Loss. (${state.titleText})`);

    await page.locator('::-p-text(New Game)').click();
    await new Promise(resolve => setTimeout(resolve, 1400));

    return { isOver: true, won, titleText: state.titleText };
}
