#!/usr/bin/env node
/**
 * Browser Scraper Tool
 * Extrae datos estructurados de páginas web usando selectores CSS o JS.
 *
 * Usage: node scrape.js <url> [opciones]
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);

if (!args[0] || args[0] === '--help') {
  console.log(`
╔══════════════════════════════════════════════════════╗
║           Browser Scraper Tool - Playwright          ║
╚══════════════════════════════════════════════════════╝

Uso: node scrape.js <url> [opciones]

Opciones:
  --select <css>       Extrae texto de todos los elementos que coincidan
  --attr <css> <attr>  Extrae atributo de elementos (ej: href, src, alt)
  --table <css>        Extrae tabla HTML como JSON
  --text               Extrae texto completo de la página (sin HTML)
  --html               Extrae HTML completo del body
  --eval "<js>"        JS personalizado, debe retornar un valor
  --output <file>      Guarda resultado en archivo (JSON o TXT)
  --wait <ms>          Espera antes de extraer (default: 1000)
  --wait-for <sel>     Espera a que aparezca selector antes de extraer
  --paginate <sel>     Hace click en "siguiente" hasta que no exista
  --max-pages <n>      Límite de paginación (default: 10)
  --format <json|csv|text>  Formato de salida (default: json)

Ejemplos:
  # Extraer todos los títulos h1, h2
  node scrape.js https://example.com --select "h1, h2"

  # Extraer todos los links con sus href
  node scrape.js https://example.com --attr "a" "href"

  # Extraer una tabla
  node scrape.js https://example.com --table "table.data"

  # Extraer con JS personalizado
  node scrape.js https://example.com --eval "Array.from(document.querySelectorAll('.item')).map(el => ({title: el.querySelector('h2')?.textContent, price: el.querySelector('.price')?.textContent}))"

  # Scraping con paginación
  node scrape.js https://example.com/list --select ".item-title" --paginate ".next-page" --max-pages 5 --output results.json
`);
  process.exit(0);
}

const url = args[0];

const getArg = (flag) => {
  const i = args.indexOf(flag);
  return i !== -1 ? args[i + 1] : null;
};

const selectSelector = getArg('--select');
const attrSelector = getArg('--attr');
const attrName = attrSelector ? args[args.indexOf('--attr') + 2] : null;
const tableSelector = getArg('--table');
const customJs = getArg('--eval');
const outputFile = getArg('--output');
const waitMs = parseInt(getArg('--wait') || '1000');
const waitForSel = getArg('--wait-for');
const paginateSelector = getArg('--paginate');
const maxPages = parseInt(getArg('--max-pages') || '10');
const format = getArg('--format') || 'json';

const doText = args.includes('--text');
const doHtml = args.includes('--html');

const allResults = [];

async function extractData(page) {
  const data = {};

  if (waitForSel) {
    await page.waitForSelector(waitForSel, { timeout: 15000 }).catch(() => {});
  }
  if (waitMs) await page.waitForTimeout(waitMs);

  if (selectSelector) {
    data.selected = await page.evaluate(sel =>
      Array.from(document.querySelectorAll(sel)).map(el => el.textContent.trim()),
      selectSelector
    );
  }

  if (attrSelector && attrName) {
    data.attributes = await page.evaluate(({ sel, attr }) =>
      Array.from(document.querySelectorAll(sel))
        .map(el => ({ text: el.textContent.trim().substring(0, 100), [attr]: el.getAttribute(attr) }))
        .filter(item => item[attr]),
      { sel: attrSelector, attr: attrName }
    );
  }

  if (tableSelector) {
    data.table = await page.evaluate(sel => {
      const table = document.querySelector(sel);
      if (!table) return null;
      const headers = Array.from(table.querySelectorAll('th')).map(th => th.textContent.trim());
      const rows = Array.from(table.querySelectorAll('tbody tr')).map(tr =>
        Array.from(tr.querySelectorAll('td')).map(td => td.textContent.trim())
      );
      if (headers.length) {
        return rows.map(row => Object.fromEntries(headers.map((h, i) => [h, row[i] || ''])));
      }
      return rows;
    }, tableSelector);
  }

  if (doText) {
    data.text = await page.evaluate(() => document.body.innerText);
  }

  if (doHtml) {
    data.html = await page.evaluate(() => document.body.innerHTML);
  }

  if (customJs) {
    data.custom = await page.evaluate(customJs).catch(e => ({ error: e.message }));
  }

  return data;
}

(async () => {
  console.log(`\n🌐 Scrapeando: ${url}\n`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();

  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
  } catch(e) {
    console.warn(`⚠️  ${e.message}`);
  }

  let pageNum = 1;
  while (true) {
    console.log(`📄 Página ${pageNum}...`);
    const data = await extractData(page);
    allResults.push({ page: pageNum, url: page.url(), ...data });

    if (!paginateSelector || pageNum >= maxPages) break;

    const nextBtn = await page.$(paginateSelector).catch(() => null);
    if (!nextBtn) {
      console.log('✅ No hay más páginas.');
      break;
    }

    try {
      await nextBtn.click();
      await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 10000 }).catch(() => {});
      pageNum++;
    } catch(e) {
      console.warn(`⚠️  Error paginando: ${e.message}`);
      break;
    }
  }

  // Mostrar resultados
  const output = allResults.length === 1 ? allResults[0] : allResults;

  if (format === 'text' && allResults[0]?.text) {
    console.log(allResults[0].text);
  } else if (format === 'csv' && allResults[0]?.table) {
    const table = allResults.flatMap(r => r.table || []);
    if (table.length && typeof table[0] === 'object') {
      const keys = Object.keys(table[0]);
      console.log(keys.join(','));
      table.forEach(row => console.log(keys.map(k => `"${(row[k] || '').replace(/"/g, '""')}"`).join(',')));
    }
  } else {
    console.log(JSON.stringify(output, null, 2));
  }

  if (outputFile) {
    const outPath = path.resolve(outputFile);
    if (format === 'csv' && allResults[0]?.table) {
      const table = allResults.flatMap(r => r.table || []);
      const keys = Object.keys(table[0] || {});
      const csv = [keys.join(','), ...table.map(row => keys.map(k => `"${(row[k]||'').replace(/"/g,'""')}"`).join(','))].join('\n');
      fs.writeFileSync(outPath, csv);
    } else {
      fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
    }
    console.log(`\n✅ Guardado en: ${outPath}`);
  }

  await browser.close();
})();
