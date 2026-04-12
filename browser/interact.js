#!/usr/bin/env node
/**
 * Browser Interactive Tool
 * Abre un browser, navega a una URL e interactúa con la página.
 * Expone el CDP (Chrome DevTools Protocol) en un puerto local
 * para que puedas conectarte con Chrome DevTools remotamente.
 *
 * Usage: node interact.js <url> [opciones]
 *
 * Opciones:
 *   --cdp <port>        Expone DevTools en puerto (default: 9222)
 *   --click <selector>  Hace click en selector CSS
 *   --fill <sel> <val>  Rellena input
 *   --type <sel> <val>  Escribe en elemento
 *   --wait-for <sel>    Espera a que aparezca selector
 *   --scroll <y>        Hace scroll a posición Y
 *   --screenshot        Captura pantalla al final
 *   --eval "<js>"       Evalúa JS y muestra resultado
 *   --wait <ms>         Espera N ms (default: 5000)
 *   --keep-open         Mantiene el browser abierto (útil con --cdp)
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);

if (!args[0] || args[0] === '--help') {
  console.log(`
╔══════════════════════════════════════════════════════╗
║         Browser Interact Tool - Playwright           ║
╚══════════════════════════════════════════════════════╝

Uso: node interact.js <url> [opciones]

Opciones:
  --cdp <port>         Expone Chrome DevTools Protocol en puerto
                       Luego abre chrome://inspect en tu browser local
  --click <selector>   Click en elemento CSS
  --fill <sel> <val>   Rellena input (limpia antes de escribir)
  --type <sel> <val>   Escribe en elemento (sin limpiar)
  --wait-for <sel>     Espera hasta que aparezca el selector
  --scroll <y>         Scroll a posición Y en píxeles
  --screenshot         Screenshot al final (guarda en screenshots/)
  --eval "<js>"        Evalúa JS y muestra resultado
  --wait <ms>          Tiempo de espera final (default: 5000)
  --keep-open          No cierra el browser al terminar

Ejemplos:
  # Ver la página con DevTools remotos
  node interact.js https://example.com --cdp 9222 --keep-open

  # Login en un formulario
  node interact.js https://example.com/login \\
    --fill "#email" "user@test.com" \\
    --fill "#password" "pass123" \\
    --click "#submit" \\
    --screenshot

  # Ejecutar JS en la página
  node interact.js https://example.com --eval "document.querySelectorAll('h1,h2').length"

Para usar DevTools remotos:
  1. Ejecuta: node interact.js <url> --cdp 9222 --keep-open
  2. En tu Chrome local visita: chrome://inspect
  3. O usa el comando: chromium-browser --remote-debugging-port=0 <url>
`);
  process.exit(0);
}

const url = args[0];

const cdpIdx = args.indexOf('--cdp');
const cdpPort = cdpIdx !== -1 ? parseInt(args[cdpIdx + 1]) : null;

const waitIdx = args.indexOf('--wait');
const waitMs = waitIdx !== -1 ? parseInt(args[waitIdx + 1]) : 5000;

const keepOpen = args.includes('--keep-open');
const doScreenshot = args.includes('--screenshot');

// Parsear acciones secuenciales
const actions = [];
for (let i = 1; i < args.length; i++) {
  switch(args[i]) {
    case '--click':
      actions.push({ type: 'click', selector: args[++i] });
      break;
    case '--fill':
      actions.push({ type: 'fill', selector: args[++i], value: args[++i] });
      break;
    case '--type':
      actions.push({ type: 'type', selector: args[++i], value: args[++i] });
      break;
    case '--wait-for':
      actions.push({ type: 'waitFor', selector: args[++i] });
      break;
    case '--scroll':
      actions.push({ type: 'scroll', y: parseInt(args[++i]) });
      break;
    case '--eval':
      actions.push({ type: 'eval', js: args[++i] });
      break;
  }
}

(async () => {
  console.log(`\n🌐 Navegando a: ${url}`);

  const launchOpts = {
    headless: true,
    ...(cdpPort ? { args: [`--remote-debugging-port=${cdpPort}`] } : {}),
  };

  const browser = await chromium.launch(launchOpts);
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();

  if (cdpPort) {
    console.log(`\n🔧 CDP disponible en: http://localhost:${cdpPort}`);
    console.log('   Para conectar DevTools remotos:');
    console.log('   → En Chrome: chrome://inspect → Configure → localhost:' + cdpPort);
    console.log('   → O directo: http://localhost:' + cdpPort + '/json\n');
  }

  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    console.log(`✅ Página cargada: ${await page.title()}`);
  } catch(e) {
    console.warn(`⚠️  ${e.message}`);
  }

  // Ejecutar acciones
  for (const action of actions) {
    try {
      switch(action.type) {
        case 'click':
          console.log(`🖱  Click en: ${action.selector}`);
          await page.click(action.selector, { timeout: 10000 });
          await page.waitForTimeout(500);
          break;
        case 'fill':
          console.log(`✏️  Rellenando ${action.selector} con: ${action.value}`);
          await page.fill(action.selector, action.value, { timeout: 10000 });
          break;
        case 'type':
          console.log(`⌨️  Escribiendo en ${action.selector}: ${action.value}`);
          await page.type(action.selector, action.value, { timeout: 10000 });
          break;
        case 'waitFor':
          console.log(`⏳ Esperando selector: ${action.selector}`);
          await page.waitForSelector(action.selector, { timeout: 15000 });
          console.log(`✅ Selector encontrado: ${action.selector}`);
          break;
        case 'scroll':
          console.log(`📜 Scroll a Y=${action.y}`);
          await page.evaluate(y => window.scrollTo(0, y), action.y);
          await page.waitForTimeout(500);
          break;
        case 'eval':
          console.log(`⚙️  Evaluando JS: ${action.js}`);
          const res = await page.evaluate(action.js);
          console.log('   Resultado:', JSON.stringify(res, null, 2));
          break;
      }
    } catch(e) {
      console.error(`❌ Error en acción ${action.type}: ${e.message}`);
    }
  }

  if (waitMs > 0 && !keepOpen) {
    await page.waitForTimeout(waitMs);
  }

  if (doScreenshot) {
    const dir = path.join(__dirname, 'screenshots');
    fs.mkdirSync(dir, { recursive: true });
    const fname = `interact_${Date.now()}.png`;
    const fpath = path.join(dir, fname);
    await page.screenshot({ path: fpath, fullPage: true });
    console.log(`\n📸 Screenshot guardado: ${fpath}`);
  }

  if (keepOpen) {
    console.log('\n⏸  Browser abierto. Presiona Ctrl+C para cerrar.\n');
    await new Promise(resolve => {
      process.on('SIGINT', () => { console.log('\n👋 Cerrando browser...'); resolve(); });
      process.on('SIGTERM', resolve);
    });
  }

  await browser.close();
  console.log('✅ Listo.\n');
})();
