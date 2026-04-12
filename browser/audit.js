#!/usr/bin/env node
/**
 * Browser Audit Tool
 * Usage: node audit.js <url> [opciones]
 *
 * Opciones:
 *   --screenshot        Captura pantalla
 *   --network           Registra todo el tráfico de red
 *   --console           Captura mensajes de consola
 *   --cookies           Muestra cookies
 *   --headers           Muestra headers de respuesta
 *   --links             Extrae todos los links
 *   --forms             Extrae formularios
 *   --storage           Muestra localStorage y sessionStorage
 *   --meta              Extrae meta tags y SEO info
 *   --performance       Métricas de rendimiento
 *   --security          Info de seguridad (HTTPS, CSP, HSTS, etc.)
 *   --all               Activa todas las opciones
 *   --output <file>     Guarda resultado en archivo JSON
 *   --wait <ms>         Espera N ms antes de auditar (default: 2000)
 *   --viewport <WxH>    Tamaño de viewport (default: 1280x800)
 *   --ua <string>       User-Agent personalizado
 *   --js <script>       Ejecuta JS personalizado en la página
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);

if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
  console.log(`
╔══════════════════════════════════════════════════════╗
║           Browser Audit Tool - Playwright            ║
╚══════════════════════════════════════════════════════╝

Uso: node audit.js <url> [opciones]

Opciones:
  --screenshot        Captura pantalla (guarda en screenshots/)
  --network           Registra tráfico de red completo
  --console           Captura mensajes de consola JS
  --cookies           Muestra todas las cookies
  --headers           Headers de respuesta HTTP
  --links             Extrae todos los enlaces
  --forms             Extrae formularios y sus campos
  --storage           localStorage y sessionStorage
  --meta              Meta tags, title, description, OG tags
  --performance       Métricas Web Vitals y timing
  --security          CSP, HSTS, X-Frame-Options, etc.
  --all               Activa todo lo anterior
  --output <file>     Exporta resultado a JSON
  --wait <ms>         Tiempo de espera tras carga (default: 2000)
  --viewport <WxH>    Viewport, ej: 1920x1080 (default: 1280x800)
  --ua <string>       User-Agent personalizado
  --js "<script>"     Ejecuta JS en la página y muestra resultado

Ejemplos:
  node audit.js https://example.com --all
  node audit.js https://example.com --security --headers --output result.json
  node audit.js https://example.com --js "document.title"
  node audit.js https://example.com --screenshot --network
`);
  process.exit(0);
}

const url = args[0];
const opts = {
  screenshot: args.includes('--screenshot') || args.includes('--all'),
  network:    args.includes('--network')    || args.includes('--all'),
  console:    args.includes('--console')    || args.includes('--all'),
  cookies:    args.includes('--cookies')    || args.includes('--all'),
  headers:    args.includes('--headers')    || args.includes('--all'),
  links:      args.includes('--links')      || args.includes('--all'),
  forms:      args.includes('--forms')      || args.includes('--all'),
  storage:    args.includes('--storage')    || args.includes('--all'),
  meta:       args.includes('--meta')       || args.includes('--all'),
  performance:args.includes('--performance')|| args.includes('--all'),
  security:   args.includes('--security')   || args.includes('--all'),
};

const outputIdx = args.indexOf('--output');
const outputFile = outputIdx !== -1 ? args[outputIdx + 1] : null;

const waitIdx = args.indexOf('--wait');
const waitMs = waitIdx !== -1 ? parseInt(args[waitIdx + 1]) : 2000;

const viewportIdx = args.indexOf('--viewport');
const viewportStr = viewportIdx !== -1 ? args[viewportIdx + 1] : '1280x800';
const [vpW, vpH] = viewportStr.split('x').map(Number);

const uaIdx = args.indexOf('--ua');
const userAgent = uaIdx !== -1 ? args[uaIdx + 1] : null;

const jsIdx = args.indexOf('--js');
const customJs = jsIdx !== -1 ? args[jsIdx + 1] : null;

// Si no se especificó ninguna opción, activar todo
const anyOpt = Object.values(opts).some(Boolean) || customJs;
if (!anyOpt) {
  Object.keys(opts).forEach(k => opts[k] = true);
}

const result = { url, timestamp: new Date().toISOString(), data: {} };
const networkRequests = [];
const consoleLogs = [];
const responseHeaders = {};

function printSection(title) {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  ${title}`);
  console.log('═'.repeat(60));
}

function printJSON(obj) {
  console.log(JSON.stringify(obj, null, 2));
}

(async () => {
  console.log(`\n🌐 Auditando: ${url}`);
  console.log(`⏱  Timestamp: ${result.timestamp}`);

  const launchOpts = { headless: true };
  const browser = await chromium.launch(launchOpts);
  const context = await browser.newContext({
    viewport: { width: vpW, height: vpH },
    ...(userAgent ? { userAgent } : {}),
    ignoreHTTPSErrors: true,
  });
  const page = await context.newPage();

  // Captura de red
  if (opts.network) {
    page.on('request', req => {
      networkRequests.push({
        type: 'request',
        method: req.method(),
        url: req.url(),
        resourceType: req.resourceType(),
        headers: req.headers(),
        postData: req.postData() || null,
      });
    });
    page.on('response', async res => {
      const entry = {
        type: 'response',
        status: res.status(),
        url: res.url(),
        headers: res.headers(),
      };
      networkRequests.push(entry);
      if (res.url() === url || res.url() === url + '/') {
        Object.assign(responseHeaders, res.headers());
      }
    });
    page.on('requestfailed', req => {
      networkRequests.push({
        type: 'failed',
        url: req.url(),
        failure: req.failure()?.errorText,
      });
    });
  }

  // Captura de consola
  if (opts.console) {
    page.on('console', msg => {
      consoleLogs.push({ type: msg.type(), text: msg.text(), location: msg.location() });
    });
    page.on('pageerror', err => {
      consoleLogs.push({ type: 'pageerror', text: err.message });
    });
  }

  // Headers para security aunque no esté --network
  if (opts.security || opts.headers) {
    page.on('response', async res => {
      if (res.url() === url || res.url() === url + '/') {
        Object.assign(responseHeaders, res.headers());
      }
    });
  }

  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
  } catch (e) {
    console.warn(`⚠️  Timeout/error al cargar (continuando): ${e.message}`);
  }

  if (waitMs > 0) await page.waitForTimeout(waitMs);

  // ── SCREENSHOT ───────────────────────────────────────────
  if (opts.screenshot) {
    const dir = path.join(__dirname, 'screenshots');
    fs.mkdirSync(dir, { recursive: true });
    const fname = `screenshot_${Date.now()}.png`;
    const fpath = path.join(dir, fname);
    await page.screenshot({ path: fpath, fullPage: true });
    printSection('📸 Screenshot');
    console.log(`Guardado en: ${fpath}`);
    result.data.screenshot = fpath;
  }

  // ── META / SEO ────────────────────────────────────────────
  if (opts.meta) {
    const meta = await page.evaluate(() => {
      const getMeta = (name) =>
        document.querySelector(`meta[name="${name}"]`)?.content ||
        document.querySelector(`meta[property="${name}"]`)?.content || null;
      const allMeta = {};
      document.querySelectorAll('meta').forEach(m => {
        const key = m.name || m.getAttribute('property') || m.httpEquiv;
        if (key) allMeta[key] = m.content;
      });
      return {
        title: document.title,
        description: getMeta('description'),
        keywords: getMeta('keywords'),
        author: getMeta('author'),
        robots: getMeta('robots'),
        canonical: document.querySelector('link[rel="canonical"]')?.href || null,
        og_title: getMeta('og:title'),
        og_description: getMeta('og:description'),
        og_image: getMeta('og:image'),
        og_type: getMeta('og:type'),
        twitter_card: getMeta('twitter:card'),
        twitter_title: getMeta('twitter:title'),
        charset: document.characterSet,
        lang: document.documentElement.lang,
        allMeta,
      };
    });
    printSection('🏷  Meta / SEO');
    printJSON(meta);
    result.data.meta = meta;
  }

  // ── PERFORMANCE ───────────────────────────────────────────
  if (opts.performance) {
    const perf = await page.evaluate(() => {
      const t = performance.timing;
      const nav = performance.getEntriesByType('navigation')[0];
      const paint = {};
      performance.getEntriesByType('paint').forEach(e => paint[e.name] = Math.round(e.startTime));
      return {
        dns: t.domainLookupEnd - t.domainLookupStart,
        tcp: t.connectEnd - t.connectStart,
        ttfb: t.responseStart - t.requestStart,
        download: t.responseEnd - t.responseStart,
        dom_interactive: t.domInteractive - t.navigationStart,
        dom_complete: t.domComplete - t.navigationStart,
        load_event: t.loadEventEnd - t.navigationStart,
        paint,
        transferSize: nav?.transferSize,
        encodedBodySize: nav?.encodedBodySize,
        decodedBodySize: nav?.decodedBodySize,
      };
    });
    printSection('⚡ Performance (ms)');
    printJSON(perf);
    result.data.performance = perf;
  }

  // ── SECURITY ──────────────────────────────────────────────
  if (opts.security) {
    const securityHeaders = [
      'content-security-policy',
      'strict-transport-security',
      'x-frame-options',
      'x-content-type-options',
      'referrer-policy',
      'permissions-policy',
      'cross-origin-opener-policy',
      'cross-origin-embedder-policy',
      'cross-origin-resource-policy',
      'x-xss-protection',
      'cache-control',
    ];
    const found = {};
    const missing = [];
    securityHeaders.forEach(h => {
      if (responseHeaders[h]) found[h] = responseHeaders[h];
      else missing.push(h);
    });

    const isHttps = url.startsWith('https://');
    const mixedContent = await page.evaluate(() => {
      const insecure = [];
      document.querySelectorAll('[src],[href]').forEach(el => {
        const src = el.src || el.href;
        if (src && src.startsWith('http://')) insecure.push(src);
      });
      return insecure.slice(0, 20);
    });

    printSection('🔒 Seguridad');
    console.log(`\nHTTPS: ${isHttps ? '✅ Sí' : '❌ No'}`);
    console.log('\nHeaders de seguridad presentes:');
    if (Object.keys(found).length) printJSON(found);
    else console.log('  (ninguno detectado)');
    console.log('\nHeaders de seguridad ausentes:');
    missing.forEach(h => console.log(`  ❌ ${h}`));
    if (mixedContent.length) {
      console.log('\nContenido mixto (HTTP en HTTPS):');
      mixedContent.forEach(u => console.log(`  ⚠️  ${u}`));
    }
    result.data.security = { isHttps, found, missing, mixedContent };
  }

  // ── HEADERS ───────────────────────────────────────────────
  if (opts.headers) {
    printSection('📋 Headers de Respuesta');
    printJSON(responseHeaders);
    result.data.headers = responseHeaders;
  }

  // ── COOKIES ───────────────────────────────────────────────
  if (opts.cookies) {
    const cookies = await context.cookies();
    printSection('🍪 Cookies');
    cookies.forEach(c => {
      const flags = [
        c.secure ? '🔒 Secure' : '⚠️ !Secure',
        c.httpOnly ? '🛡 HttpOnly' : '⚠️ !HttpOnly',
        c.sameSite ? `SameSite=${c.sameSite}` : '⚠️ !SameSite',
      ];
      console.log(`  ${c.name} = ${c.value.substring(0, 40)}${c.value.length > 40 ? '...' : ''}`);
      console.log(`    Domain: ${c.domain} | Path: ${c.path} | ${flags.join(' | ')}`);
      if (c.expires > 0) console.log(`    Expira: ${new Date(c.expires * 1000).toISOString()}`);
    });
    if (!cookies.length) console.log('  (sin cookies)');
    result.data.cookies = cookies;
  }

  // ── STORAGE ───────────────────────────────────────────────
  if (opts.storage) {
    const storage = await page.evaluate(() => ({
      localStorage: { ...localStorage },
      sessionStorage: { ...sessionStorage },
    }));
    printSection('💾 Web Storage');
    console.log('localStorage:');
    printJSON(storage.localStorage);
    console.log('\nsessionStorage:');
    printJSON(storage.sessionStorage);
    result.data.storage = storage;
  }

  // ── LINKS ─────────────────────────────────────────────────
  if (opts.links) {
    const links = await page.evaluate(() => {
      const seen = new Set();
      return Array.from(document.querySelectorAll('a[href]'))
        .map(a => ({ text: a.textContent.trim().substring(0, 60), href: a.href, rel: a.rel || null }))
        .filter(l => { if (seen.has(l.href)) return false; seen.add(l.href); return true; });
    });
    printSection(`🔗 Links (${links.length})`);
    links.forEach(l => console.log(`  [${l.rel || 'link'}] ${l.text} → ${l.href}`));
    result.data.links = links;
  }

  // ── FORMS ─────────────────────────────────────────────────
  if (opts.forms) {
    const forms = await page.evaluate(() =>
      Array.from(document.forms).map(f => ({
        id: f.id || null,
        name: f.name || null,
        action: f.action,
        method: f.method || 'get',
        fields: Array.from(f.elements).map(el => ({
          tag: el.tagName.toLowerCase(),
          type: el.type || null,
          name: el.name || null,
          id: el.id || null,
          placeholder: el.placeholder || null,
          required: el.required,
          autocomplete: el.autocomplete || null,
        })),
      }))
    );
    printSection(`📝 Formularios (${forms.length})`);
    printJSON(forms);
    result.data.forms = forms;
  }

  // ── NETWORK ───────────────────────────────────────────────
  if (opts.network) {
    const requests = networkRequests.filter(r => r.type === 'request');
    const responses = networkRequests.filter(r => r.type === 'response');
    const failed = networkRequests.filter(r => r.type === 'failed');

    printSection(`🌐 Red — ${requests.length} peticiones, ${failed.length} fallidas`);

    const byType = {};
    requests.forEach(r => {
      byType[r.resourceType] = (byType[r.resourceType] || 0) + 1;
    });
    console.log('\nPor tipo de recurso:');
    Object.entries(byType).sort((a,b) => b[1]-a[1]).forEach(([t, n]) => console.log(`  ${t}: ${n}`));

    const thirdParty = new Set();
    const mainHost = new URL(url).hostname;
    requests.forEach(r => {
      try {
        const h = new URL(r.url).hostname;
        if (h !== mainHost) thirdParty.add(h);
      } catch {}
    });
    console.log(`\nDominios de terceros (${thirdParty.size}):`);
    [...thirdParty].forEach(h => console.log(`  • ${h}`));

    if (failed.length) {
      console.log('\nPeticiones fallidas:');
      failed.forEach(r => console.log(`  ❌ ${r.url} — ${r.failure}`));
    }
    result.data.network = { requests, responses, failed, byType, thirdParty: [...thirdParty] };
  }

  // ── CONSOLE ───────────────────────────────────────────────
  if (opts.console) {
    printSection(`🖥  Consola JS (${consoleLogs.length} mensajes)`);
    consoleLogs.forEach(l => {
      const icon = { error: '❌', warning: '⚠️', log: '📝', info: 'ℹ️', pageerror: '💥' }[l.type] || '•';
      console.log(`  ${icon} [${l.type}] ${l.text}`);
      if (l.location?.url) console.log(`      en ${l.location.url}:${l.location.lineNumber}`);
    });
    if (!consoleLogs.length) console.log('  (sin mensajes)');
    result.data.console = consoleLogs;
  }

  // ── JS PERSONALIZADO ──────────────────────────────────────
  if (customJs) {
    printSection('⚙️  JS Personalizado');
    try {
      const jsResult = await page.evaluate(customJs);
      console.log('Resultado:');
      printJSON(jsResult);
      result.data.customJs = jsResult;
    } catch (e) {
      console.error(`Error: ${e.message}`);
      result.data.customJs = { error: e.message };
    }
  }

  // ── OUTPUT JSON ───────────────────────────────────────────
  if (outputFile) {
    const outPath = path.resolve(outputFile);
    fs.writeFileSync(outPath, JSON.stringify(result, null, 2));
    console.log(`\n✅ Resultado guardado en: ${outPath}`);
  }

  await browser.close();
  console.log('\n✅ Auditoría completa.\n');
})();
