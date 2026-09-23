import puppeteer from 'puppeteer';
import fs from 'node:fs';

const data = fs.readFileSync('words.txt', {encoding:'utf8'});
const words = data.split('\n')
.map(w=>w.trim().toUpperCase());

const browser = await puppeteer.launch({
    headless: false,
    
});
const page = await browser.newPage();

await page.goto('https://wordler.org/wordle-unlimited');

await page.setViewport({width: 1080, height: 1024});

await new Promise(resolve => setTimeout(resolve, 1000));
await page.locator('::-p-aria([name="Reject All"][role="button"])').click();

while (true) //game loop
{
    for (let i = 0; i < 6; i++)
    {
        await new Promise(resolve => setTimeout(resolve, 1500));
        const gameOver = await CheckGameOver();
        if (gameOver)
            break;
        
        const word = await GetWord();
        if (word === null)
            break;
        await page.keyboard.type(word);
        await page.keyboard.press('Enter');
    }
}

async function GetWord()
{
    const words = await GetWordList();
    if (words.length === 0){
        return null;
    }

    return words[0];
}
async function GetWordList()
{
    const constraints = await GetConstraints();
    return words.filter(w => {
        for (let c = 0 ; c < constraints.correct.length; c++)
        {
            const char = constraints.correct[c];
            if (char === null)
                continue;
            if (w[c] !== char)
            {
                return false;
            }
        }
        for (const letter of constraints.absent)
        {
            if (w.includes(letter))
            {
                return false;
            }
        }
         for (const letter of constraints.elsewhere)
        {
            if (!w.includes(letter)) 
            {
                return false;
            }
        }
        for (let c = 0; c < constraints.elsewhereByPos.length; c++)
        {
            for (const letter of constraints.elsewhereByPos[c])
            {
                if (w[c] === letter)
                {
                    return false;
                }    
            }
        }
        return true;
    });
}
async function GetBoardState()
{
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
async function GetCompletedRows()
{
    const board = await GetBoardState();
    return board.filter(row => row.length > 0 && row.every(cell => cell.status !== 'empty'));
}
async function GetConstraints()
{
    const completedRows = await GetCompletedRows();
 
    const correct = [null, null, null, null, null];
    const elsewhere = new Set();
    const absent = new Set();
    const elsewhereByPos = [new Set(), new Set(), new Set(), new Set(), new Set()];
 
    for (const row of completedRows)
    {
        row.forEach((cell, i) => {
            if (!cell.letter) return;
 
            if (cell.status === 'correct')
            {
                correct[i] = cell.letter;
            }
            else if (cell.status === 'elsewhere')
            {
                elsewhere.add(cell.letter);
                elsewhereByPos[i].add(cell.letter);
            }
            else if (cell.status === 'absent')
            {
                const appearsElsewhereInRow = row.some(c => c.letter === cell.letter && c.status !== 'absent');
                if (!appearsElsewhereInRow) absent.add(cell.letter);
            }
        });
    }
 
    return { correct, elsewhere, absent, elsewhereByPos };
}
async function CheckGameOver()
{
    const state = await page.evaluate(() => {
        const modal = document.querySelector('.Top-window-background.modal-reveal');
        if (!modal) return { isOver: false, titleText: '' };
 
        const style = window.getComputedStyle(modal);
        const isOver = style.display !== 'none' && style.visibility !== 'hidden';
 
        const titleEl = modal.querySelector('.Top-window-title');
        const titleText = titleEl ? titleEl.textContent.trim() : '';
 
        return { isOver, titleText };
    });
 
    if (!state.isOver) return false;
 
    if (state.titleText.toUpperCase().includes('WON'))
    {
        console.log(`Victory! (${state.titleText})`);
    }
    else
    {
        console.log(`Loss. (${state.titleText})`);
    }
 
    await page.locator('::-p-text(New Game)').click();
 
    await new Promise(resolve => setTimeout(resolve, 1400));
 
    return true;
}
