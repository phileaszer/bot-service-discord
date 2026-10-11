'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');

function loadI18nRuntime() {
  let source = fs.readFileSync(path.join(root, 'site', 'i18n.js'), 'utf8');
  source = source.replace(
    '  window.SentinelI18n = {',
    '  globalThis.__sentinelI18nAudit = { en, placeholderEn, translateValue }; return;\n\n  window.SentinelI18n = {'
  );

  const context = {
    document: { title: '' },
    WeakMap
  };
  vm.runInNewContext(source, context);

  if (!context.__sentinelI18nAudit) {
    throw new Error('Impossible de charger le moteur de traduction Sentinel.');
  }

  return context.__sentinelI18nAudit;
}

function normalize(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/…/g, '...')
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeEntities(value) {
  return value
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function cleanCandidate(value) {
  return decodeEntities(value)
    .replace(/\$\{[^}]+\}/g, '…')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function createAudit() {
  const runtime = loadI18nRuntime();
  const translations = { ...runtime.en, ...runtime.placeholderEn };
  const normalizedTranslations = new Set(Object.keys(translations).map(normalize));
  const ignored = new Set(['FR', 'EN', 'Sentinel', 'Western', 'Style Sentinel', 'Discord', 'PDF', 'XLSX']);

  function isCandidate(value) {
    if (!value || ignored.has(value)) return false;
    if (value.length < 2 || /^[/#.:\d\s%+_-]+$/.test(value)) return false;
    if (/^[!/]/.test(value) || /^(?:width=device-width.*|index, follow|noindex, nofollow|applications\.commands)$/i.test(value)) return false;
    if (/^… ms$/.test(value)) return false;
    if (/^(https?:|\/api\/|data:|assets\/|#[0-9a-f]{3,8}$)/i.test(value)) return false;
    if (/[{}]|=>|\b(?:function|return|const|let|if)\b/.test(value)) return false;
    if (/^[a-z][a-z0-9_-]*$/i.test(value) && !value.includes(' ')) return false;
    return /[A-Za-zÀ-ÿ]/.test(value);
  }

  function isTranslated(value) {
    if (Object.prototype.hasOwnProperty.call(translations, value) || normalizedTranslations.has(normalize(value))) {
      return true;
    }

    // A trailing interpolation is commonly a badge rendered as its own DOM node.
    const withoutTrailingInterpolation = value.replace(/\s+…$/, '').trim();
    if (withoutTrailingInterpolation !== value && (
      Object.prototype.hasOwnProperty.call(translations, withoutTrailingInterpolation)
      || normalizedTranslations.has(normalize(withoutTrailingInterpolation))
    )) {
      return true;
    }

    if (value.includes('…')) {
      let index = 0;
      const sample = value.replace(/…/g, () => String(++index));
      return runtime.translateValue(sample, 'en') !== sample;
    }

    return false;
  }

  function collectMarkup(source, file, output) {
    const withoutIgnored = source
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<!--([\s\S]*?)-->/g, '');

    for (const match of withoutIgnored.matchAll(/>([^<>]+)</g)) {
      const value = cleanCandidate(match[1]);
      if (isCandidate(value) && !isTranslated(value)) {
        output.set(`${file}:text:${value}`, { file, type: 'text', value });
      }
    }

    for (const match of withoutIgnored.matchAll(/(?:placeholder|aria-label|alt|content|data-tooltip)=(['"])(.*?)\1/gs)) {
      const value = cleanCandidate(match[2]);
      if (isCandidate(value) && !isTranslated(value)) {
        output.set(`${file}:attr:${value}`, { file, type: 'attribute', value });
      }
    }
  }

  function collectFrontendJs(source, file, output) {
    for (const match of source.matchAll(/`([^`]*)`/gs)) {
      if (match[1].includes('<')) collectMarkup(match[1], file, output);
    }

    const calls = /\b(?:toast|confirmAction|dashboardErrorMessage)\(\s*(['"`])((?:\\.|(?!\1)[\s\S])*)\1/g;
    for (const match of source.matchAll(calls)) {
      const value = cleanCandidate(match[2].replace(/\\(['"`])/g, '$1'));
      if (isCandidate(value) && !isTranslated(value)) {
        output.set(`${file}:call:${value}`, { file, type: 'message', value });
      }
    }
  }

  const missing = new Map();
  for (const name of fs.readdirSync(path.join(root, 'site'))) {
    const fullPath = path.join(root, 'site', name);
    if (name.endsWith('.html')) collectMarkup(fs.readFileSync(fullPath, 'utf8'), name, missing);
    if (['dashboard.js', 'membre.js', 'status.js', 'updates.js', 'auth.js', 'theme.js'].includes(name)) {
      collectFrontendJs(fs.readFileSync(fullPath, 'utf8'), name, missing);
    }
  }

  return {
    translationCount: Object.keys(translations).length,
    missing: [...missing.values()].sort((a, b) => a.file.localeCompare(b.file) || a.value.localeCompare(b.value, 'fr'))
  };
}

if (require.main === module) {
  const result = createAudit();
  console.log(JSON.stringify({
    translationCount: result.translationCount,
    missingCount: result.missing.length,
    items: result.missing
  }, null, 2));
  if (result.missing.length > 0) process.exitCode = 1;
}

module.exports = { createAudit };
