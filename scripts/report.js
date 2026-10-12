import fs from 'node:fs';

const read = name => fs.existsSync(`results/${name}.json`) ? JSON.parse(fs.readFileSync(`results/${name}.json`, 'utf8')) : null;
const deployment = read('deployment'), position = read('position'), simulation = read('simulation'), liquidation = read('liquidation');
const cards = [
  ['1 · Chainlink feed', 'Підключення до ETH/USD oracle і перевірка свіжості ціни.', {address: '0x694AA1769357215DE4FAC081bf1f309aDC325306', result: 'Перевір через npm run check:sepolia'}],
  ['2 · Контракти', 'Розгортання StableCoin та StableEngine і передача права емісії.', deployment],
  ['3 · Боргова позиція', 'Депозит застави та випуск синтетичного стейблкоїна з HF близько 1,1.', position],
  ['4 · Off-chain бот', 'JavaScript агент періодично читає HF та очікує на неплатоспроможну позицію.', {botLog: fs.existsSync('results/bot.log') ? 'results/bot.log' : 'бот ще не запускався'}],
  ['5 · Симуляція неплатоспроможності', 'Owner-only тестовий виклик штучно знижує HF позичальника.', simulation],
  ['6 · Ліквідація', 'Бот надсилає ліквідацію у Sepolia і зберігає хеш транзакції.', liquidation]
];
const esc = value => String(value ?? 'Ще не виконано').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
fs.mkdirSync('results', { recursive: true });
const html = `<!doctype html><html lang="uk"><meta charset="utf-8"><title>Лабораторна №6 — Звіт</title><style>body{margin:0;background:#eef2f6;color:#1b2938;font:16px Segoe UI,Arial}main{max-width:1000px;margin:32px auto;background:white;padding:34px}h1{margin-top:0}section{padding:18px 0;border-top:1px solid #d8e0e9}h2{font-size:20px}p{color:#536477}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f4f6f9;padding:15px;font:13px/1.5 Consolas,monospace;border-left:3px solid #5079a1}.done{color:#17824a}</style><main><h1>Лабораторна робота №6</h1><p>Chainlink ETH/USD · StableCoin · StableEngine · Node.js ліквідатор · Ethereum Sepolia</p>${cards.map(([title,desc,data])=>`<section><h2>${esc(title)}</h2><p>${esc(desc)}</p><pre>${esc(data ? JSON.stringify(data,null,2) : 'Ще не виконано')}</pre><p class="${data?'done':''}">${data?'Дані збережені у цьому локальному запуску.':'Виконай крок у покроковій інструкції.'}</p></section>`).join('')}<p>Надрукуй сторінку в PDF або зроби скриншоти виконаних секцій. Хеші ліквідації перевір на Etherscan Sepolia.</p></main></html>`;
fs.writeFileSync('results/report.html', html);
console.log('Створено results/report.html з наявними результатами.');
