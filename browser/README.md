# Browser Environment — Playwright + Chromium

Entorno de navegación y auditoría web con acceso completo a DevTools.

## Herramientas

### `audit.js` — Auditoría completa de páginas
```bash
node audit.js <url> [opciones]
```
Analiza seguridad, performance, meta tags, cookies, red, consola JS, formularios, links...

### `interact.js` — Interacción y automatización
```bash
node interact.js <url> [opciones]
```
Click, fill, scroll, eval JS. Soporte CDP para DevTools remotos.

### `scrape.js` — Extracción de datos
```bash
node scrape.js <url> [opciones]
```
Selectores CSS, atributos, tablas, JS personalizado, paginación.

## Ejemplos rápidos

```bash
# Auditoría completa
node audit.js https://example.com --all

# Solo seguridad
node audit.js https://example.com --security --headers

# Screenshot + red
node audit.js https://example.com --screenshot --network --output report.json

# Interactuar con formulario de login
node interact.js https://site.com/login \
  --fill "#email" "test@test.com" \
  --fill "#password" "pass" \
  --click "[type=submit]" \
  --screenshot

# Extraer todos los links
node scrape.js https://example.com --attr "a" "href"

# Extraer tabla como CSV
node scrape.js https://example.com --table "table" --format csv --output data.csv

# JS personalizado en la página
node audit.js https://example.com --js "Object.keys(window).filter(k => k.startsWith('google'))"
```

## Screenshots
Se guardan en `./screenshots/`

## Resultados JSON
Usa `--output archivo.json` en cualquier herramienta.
