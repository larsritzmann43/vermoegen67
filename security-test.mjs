#!/usr/bin/env node

/**
 * Security-Test-Programm fuer Vermoegensaufbau-App
 * Prueft: Dependencies, Code-Patterns, Input-Handling, Build-Config, HTML-Security
 *
 * Ausfuehren: node security-test.mjs
 */

import { execSync } from 'node:child_process';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve('.');
const SRC = join(ROOT, 'src');
const DIST = join(ROOT, 'dist');

// ── Helpers ──────────────────────────────────────────────────────────────────

const RESET = '\x1b[0m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';

const results = { pass: 0, warn: 0, fail: 0 };

function pass(msg) { results.pass++; console.log(`  ${GREEN}PASS${RESET}  ${msg}`); }
function warn(msg) { results.warn++; console.log(`  ${YELLOW}WARN${RESET}  ${msg}`); }
function fail(msg) { results.fail++; console.log(`  ${RED}FAIL${RESET}  ${msg}`); }
function section(title) { console.log(`\n${BOLD}── ${title} ──${RESET}`); }

function readFile(path) {
  try { return readFileSync(path, 'utf-8'); } catch { return null; }
}

/** Recursively collect all files in dir matching extensions */
function collectFiles(dir, exts) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collectFiles(full, exts));
    else if (exts.some(e => entry.name.endsWith(e))) out.push(full);
  }
  return out;
}

// ── 1. Dependency Audit ──────────────────────────────────────────────────────

section('1. Dependency Audit');

try {
  const auditJson = execSync('npm audit --json 2>/dev/null', { cwd: ROOT, encoding: 'utf-8' });
  const audit = JSON.parse(auditJson);

  const vulns = audit.metadata?.vulnerabilities ?? {};
  const total = (vulns.low ?? 0) + (vulns.moderate ?? 0) + (vulns.high ?? 0) + (vulns.critical ?? 0);

  if (total === 0) {
    pass('Keine bekannten Schwachstellen in Dependencies');
  } else {
    const parts = [];
    if (vulns.critical) parts.push(`${vulns.critical} critical`);
    if (vulns.high) parts.push(`${vulns.high} high`);
    if (vulns.moderate) parts.push(`${vulns.moderate} moderate`);
    if (vulns.low) parts.push(`${vulns.low} low`);
    const level = (vulns.critical || vulns.high) ? fail : warn;
    level(`npm audit: ${total} Schwachstelle(n) (${parts.join(', ')})`);
  }
} catch (e) {
  // npm audit exits non-zero when vulnerabilities found
  try {
    const auditJson = execSync('npm audit --json 2>&1 || true', { cwd: ROOT, encoding: 'utf-8' });
    const audit = JSON.parse(auditJson);
    const vulns = audit.metadata?.vulnerabilities ?? {};
    const total = (vulns.low ?? 0) + (vulns.moderate ?? 0) + (vulns.high ?? 0) + (vulns.critical ?? 0);
    if (total === 0) {
      pass('Keine bekannten Schwachstellen in Dependencies');
    } else {
      const parts = [];
      if (vulns.critical) parts.push(`${vulns.critical} critical`);
      if (vulns.high) parts.push(`${vulns.high} high`);
      if (vulns.moderate) parts.push(`${vulns.moderate} moderate`);
      if (vulns.low) parts.push(`${vulns.low} low`);
      const level = (vulns.critical || vulns.high) ? fail : warn;
      level(`npm audit: ${total} Schwachstelle(n) (${parts.join(', ')})`);
    }
  } catch {
    warn('npm audit konnte nicht ausgefuehrt werden');
  }
}

// ── 2. Statische Code-Analyse ────────────────────────────────────────────────

section('2. Statische Code-Analyse (src/)');

const srcFiles = collectFiles(SRC, ['.tsx', '.ts', '.jsx', '.js']);

// 2a) Gefaehrliche DOM-Patterns
const dangerousPatterns = [
  { regex: /dangerouslySetInnerHTML/g, label: 'dangerouslySetInnerHTML' },
  { regex: /\beval\s*\(/g, label: 'eval()' },
  { regex: /\.innerHTML\s*=/g, label: 'innerHTML Zuweisung' },
  { regex: /document\.write\s*\(/g, label: 'document.write()' },
  { regex: /new\s+Function\s*\(/g, label: 'new Function()' },
];

let dangerousFound = false;
for (const file of srcFiles) {
  const content = readFile(file);
  if (!content) continue;
  const rel = file.replace(ROOT + '/', '');
  for (const { regex, label } of dangerousPatterns) {
    const matches = content.match(regex);
    if (matches) {
      fail(`${label} gefunden in ${rel} (${matches.length}x)`);
      dangerousFound = true;
    }
  }
}
if (!dangerousFound) pass('Keine gefaehrlichen DOM-Patterns (eval, innerHTML, etc.)');

// 2b) Hartkodierte Secrets / API-Keys
const secretPatterns = [
  { regex: /(?:api[_-]?key|apikey|secret|token|password|auth)\s*[:=]\s*['"][^'"]{8,}['"]/gi, label: 'Verdaechtiger Secret/Key' },
  { regex: /(?:sk|pk)[-_](?:live|test)[-_][a-zA-Z0-9]{20,}/g, label: 'Stripe-aehnlicher Key' },
  { regex: /AIza[a-zA-Z0-9_-]{35}/g, label: 'Google API Key' },
  { regex: /ghp_[a-zA-Z0-9]{36}/g, label: 'GitHub Personal Access Token' },
  { regex: /-----BEGIN (?:RSA )?PRIVATE KEY-----/g, label: 'Private Key' },
];

let secretsFound = false;
for (const file of srcFiles) {
  const content = readFile(file);
  if (!content) continue;
  const rel = file.replace(ROOT + '/', '');
  for (const { regex, label } of secretPatterns) {
    regex.lastIndex = 0;
    if (regex.test(content)) {
      fail(`${label} gefunden in ${rel}`);
      secretsFound = true;
    }
  }
}
if (!secretsFound) pass('Keine hartkodierten Secrets/API-Keys gefunden');

// 2c) target="_blank" ohne rel="noopener"
let blankIssues = false;
for (const file of srcFiles) {
  const content = readFile(file);
  if (!content) continue;
  const rel = file.replace(ROOT + '/', '');
  // Find target="_blank" and check if the same tag has rel="noopener"
  const tagRegex = /<a\b[^>]*target\s*=\s*["']_blank["'][^>]*>/gi;
  let match;
  while ((match = tagRegex.exec(content)) !== null) {
    if (!/rel\s*=\s*["'][^"']*noopener[^"']*["']/i.test(match[0])) {
      fail(`target="_blank" ohne rel="noopener" in ${rel}`);
      blankIssues = true;
    }
  }
}
if (!blankIssues) pass('Alle target="_blank" Links haben rel="noopener" (oder keine vorhanden)');

// ── 3. Input-Validierung ─────────────────────────────────────────────────────

section('3. Input-Validierung');

const appContent = readFile(join(SRC, 'App.tsx')) ?? '';

// 3a) Slider min/max Attribute
const rangeInputs = [...appContent.matchAll(/<input[^>]*type\s*=\s*["']range["'][^>]*>/gi)];

if (rangeInputs.length === 0) {
  warn('Keine range-Inputs in App.tsx gefunden');
} else {
  let allBounded = true;
  for (const [tag] of rangeInputs) {
    const hasMin = /\bmin\s*=/.test(tag);
    const hasMax = /\bmax\s*=/.test(tag);
    if (!hasMin || !hasMax) {
      fail(`Range-Input ohne min/max: ${tag.substring(0, 80)}...`);
      allBounded = false;
    }
  }
  if (allBounded) pass(`Alle ${rangeInputs.length} Range-Inputs haben min/max Grenzen`);
}

// 3b) Number()/parseInt() ohne Validierung
const numberCalls = [...appContent.matchAll(/(?:Number|parseInt|parseFloat)\s*\([^)]*\)/g)];
if (numberCalls.length > 0) {
  // Check if there's any NaN-guarding near the usage
  let unguarded = 0;
  for (const [call] of numberCalls) {
    // Slider onChange with Number(e.target.value) is safe because range inputs always produce valid numbers
    if (/Number\s*\(\s*e\.target\.value\s*\)/.test(call)) continue;
    // Check for isNaN, Number.isFinite guards near the call
    unguarded++;
  }
  if (unguarded > 0) {
    warn(`${unguarded} Number()/parseInt()-Aufruf(e) ohne explizite NaN-Pruefung (Slider-Inputs sind sicher)`);
  } else {
    pass('Alle Number()-Aufrufe sind an Slider-Inputs gebunden (sicher)');
  }
} else {
  pass('Keine Number()/parseInt()-Aufrufe gefunden');
}

// 3c) Extreme-Werte-Test: Simuliere Berechnungslogik mit Grenzwerten
const extremeTests = [
  { childAge: 67, monthlyPension: 1500, label: 'childAge=67 (0 Monate Ansparzeit)' },
  { childAge: 0, monthlyPension: 1500, label: 'childAge=0 (max. Ansparzeit)' },
  { childAge: 50, monthlyPension: 3000, label: 'childAge=50, pension=3000' },
  { childAge: 7, monthlyPension: 0, label: 'monthlyPension=0' },
  { childAge: -5, monthlyPension: 1500, label: 'childAge=-5 (negativ)' },
  { childAge: 100, monthlyPension: 1500, label: 'childAge=100 (>67)' },
];

const netRateAccumulation = 1.075;
const netRateDecumulation = 1.03;

function simulateCalc(childAge, monthlyPension) {
  const targetPension = monthlyPension;
  const i2 = Math.pow(netRateDecumulation, 1 / 12) - 1;
  const monthsDecumulation = (100 - 67) * 12;
  const targetWealth = targetPension * (1 - Math.pow(1 + i2, -monthsDecumulation)) / i2;

  const i1 = Math.pow(netRateAccumulation, 1 / 12) - 1;
  const monthsAccumulation = (67 - childAge) * 12;

  if (monthsAccumulation <= 0) return { targetWealth, contribution: Infinity };

  const fvFactor = ((Math.pow(1 + i1, monthsAccumulation) - 1) / i1) * (1 + i1);
  return { targetWealth, contribution: targetWealth / fvFactor };
}

let extremeFails = 0;
for (const { childAge, monthlyPension, label } of extremeTests) {
  const { contribution } = simulateCalc(childAge, monthlyPension);
  if (!Number.isFinite(contribution) && childAge >= 0 && childAge < 67 && monthlyPension > 0) {
    fail(`Berechnung liefert ${contribution} fuer ${label}`);
    extremeFails++;
  } else if (Number.isNaN(contribution)) {
    fail(`Berechnung liefert NaN fuer ${label}`);
    extremeFails++;
  } else if (contribution < 0 && monthlyPension > 0) {
    warn(`Negativer Sparbeitrag (${contribution.toFixed(2)}) fuer ${label}`);
    extremeFails++;
  } else {
    pass(`Grenzwert-Test OK: ${label} → ${Number.isFinite(contribution) ? contribution.toFixed(2) + ' EUR' : String(contribution)}`);
  }
}

// ── 4. Build-Konfiguration ───────────────────────────────────────────────────

section('4. Build-Konfiguration');

// 4a) Source Maps im Production-Build
const viteConfig = readFile(join(ROOT, 'vite.config.ts')) ?? '';
const hasSourceMapConfig = /sourcemap\s*:/i.test(viteConfig);

if (existsSync(DIST)) {
  const distFiles = collectFiles(DIST, ['.map']);
  if (distFiles.length > 0) {
    warn(`${distFiles.length} Source-Map-Datei(en) im dist/-Ordner gefunden`);
    for (const f of distFiles) {
      console.log(`         ${DIM}${f.replace(ROOT + '/', '')}${RESET}`);
    }
  } else {
    // Check if JS files contain inline sourceMappingURL
    const jsFiles = collectFiles(DIST, ['.js']);
    let inlineMaps = false;
    for (const f of jsFiles) {
      const content = readFile(f);
      if (content && /\/\/# sourceMappingURL=data:/.test(content)) {
        warn(`Inline Source Map in ${f.replace(ROOT + '/', '')}`);
        inlineMaps = true;
      }
    }
    if (!inlineMaps) pass('Keine Source Maps im Production-Build');
  }
} else {
  warn('dist/-Ordner nicht vorhanden (noch kein Production-Build erstellt)');
}

// 4b) Sensible Dateien im dist/
const sensitiveFiles = ['.env', '.env.local', '.env.production', 'credentials.json', 'secrets.json', '.npmrc'];
if (existsSync(DIST)) {
  let sensitiveFound = false;
  for (const name of sensitiveFiles) {
    if (existsSync(join(DIST, name))) {
      fail(`Sensible Datei im dist/-Ordner: ${name}`);
      sensitiveFound = true;
    }
  }
  // Also check if any .env files exist in root that could be copied
  for (const name of ['.env', '.env.local', '.env.production']) {
    if (existsSync(join(ROOT, name))) {
      warn(`${name} existiert im Projektroot – sicherstellen, dass sie nicht im Build landet`);
    }
  }
  if (!sensitiveFound) pass('Keine sensiblen Dateien im dist/-Ordner');
} else {
  warn('dist/-Ordner nicht vorhanden – Pruefung uebersprungen');
}

// ── 5. HTML-Security ─────────────────────────────────────────────────────────

section('5. HTML-Security');

const indexHtml = readFile(join(ROOT, 'index.html')) ?? '';
const distIndexHtml = readFile(join(DIST, 'index.html'));
const htmlToCheck = distIndexHtml ?? indexHtml;

if (!htmlToCheck) {
  warn('Keine index.html gefunden');
} else {
  // 5a) CSP Meta-Tag
  if (/content-security-policy/i.test(htmlToCheck)) {
    pass('Content-Security-Policy Meta-Tag vorhanden');
  } else {
    warn('Kein Content-Security-Policy Meta-Tag in index.html (empfohlen fuer XSS-Schutz)');
  }

  // 5b) X-Frame-Options (nur als Meta-Tag moeglich, normalerweise Server-Header)
  if (/x-frame-options/i.test(htmlToCheck)) {
    pass('X-Frame-Options Hinweis vorhanden');
  } else {
    warn('Kein X-Frame-Options – Clickjacking-Schutz fehlt (normalerweise Server-Header)');
  }

  // 5c) Referrer-Policy
  if (/referrer-policy/i.test(htmlToCheck) || /<meta[^>]*name=["']referrer["']/i.test(htmlToCheck)) {
    pass('Referrer-Policy vorhanden');
  } else {
    warn('Keine Referrer-Policy in index.html');
  }

  // 5d) charset und viewport (Basics)
  if (/charset\s*=\s*["']?utf-8/i.test(htmlToCheck)) {
    pass('UTF-8 Charset deklariert');
  } else {
    warn('Kein UTF-8 Charset in index.html');
  }
}

// ── Zusammenfassung ──────────────────────────────────────────────────────────

console.log(`\n${BOLD}══ Zusammenfassung ══${RESET}`);
console.log(`  ${GREEN}PASS${RESET}: ${results.pass}`);
console.log(`  ${YELLOW}WARN${RESET}: ${results.warn}`);
console.log(`  ${RED}FAIL${RESET}: ${results.fail}`);

const total = results.pass + results.warn + results.fail;
if (results.fail > 0) {
  console.log(`\n  ${RED}${BOLD}${results.fail} von ${total} Checks fehlgeschlagen!${RESET}`);
  process.exit(1);
} else if (results.warn > 0) {
  console.log(`\n  ${YELLOW}${BOLD}Alle Checks bestanden, aber ${results.warn} Warnung(en).${RESET}`);
  process.exit(0);
} else {
  console.log(`\n  ${GREEN}${BOLD}Alle ${total} Checks bestanden!${RESET}`);
  process.exit(0);
}
