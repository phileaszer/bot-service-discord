'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

function extractObjectLiteral(source, marker) {
    const start = source.indexOf(marker);
    if (start < 0) throw new Error(`Bloc introuvable : ${marker}`);
    const objectStart = source.indexOf('{', start + marker.length);
    let depth = 0;
    let quote = null;
    let escaped = false;

    for (let index = objectStart; index < source.length; index += 1) {
        const char = source[index];
        if (quote) {
            if (escaped) escaped = false;
            else if (char === '\\') escaped = true;
            else if (char === quote) quote = null;
            continue;
        }
        if (char === "'" || char === '"' || char === '`') {
            quote = char;
            continue;
        }
        if (char === '{') depth += 1;
        if (char === '}') {
            depth -= 1;
            if (depth === 0) return source.slice(objectStart, index + 1);
        }
    }

    throw new Error(`Bloc incomplet : ${marker}`);
}

function translationKeysUsed(source) {
    const keys = new Set();
    let cursor = 0;

    while ((cursor = source.indexOf('t(', cursor)) >= 0) {
        const previous = source[cursor - 1] || '';
        if (/[A-Za-z0-9_$]/.test(previous)) {
            cursor += 2;
            continue;
        }

        let index = cursor + 2;
        let depth = 0;
        let quote = null;
        let escaped = false;
        for (; index < source.length; index += 1) {
            const char = source[index];
            if (quote) {
                if (escaped) escaped = false;
                else if (char === '\\') escaped = true;
                else if (char === quote) quote = null;
                continue;
            }
            if (char === "'" || char === '"' || char === '`') quote = char;
            else if ('([{'.includes(char)) depth += 1;
            else if (')]}'.includes(char)) depth = Math.max(depth - 1, 0);
            else if (char === ',' && depth === 0) break;
        }

        const rest = source.slice(index + 1);
        const literal = rest.match(/^\s*(['"])([A-Za-z0-9_.-]+)\1/);
        if (literal) keys.add(literal[2]);
        cursor = index + 1;
    }

    return keys;
}

function auditBotI18n(source) {
    const literal = extractObjectLiteral(source, 'const I18N =');
    const dictionary = new vm.Script(`(${literal})`).runInNewContext(Object.create(null), { timeout: 1000 });
    const languages = Object.keys(dictionary);
    const errors = [];
    const warnings = [];

    if (!dictionary.fr || !dictionary.en) errors.push('Les dictionnaires fr et en sont obligatoires.');
    const frenchKeys = new Set(Object.keys(dictionary.fr || {}));
    const englishKeys = new Set(Object.keys(dictionary.en || {}));

    for (const key of frenchKeys) {
        if (!englishKeys.has(key)) errors.push(`Traduction anglaise manquante : ${key}`);
    }
    for (const key of englishKeys) {
        if (!frenchKeys.has(key)) errors.push(`Traduction française manquante : ${key}`);
    }

    const usedKeys = translationKeysUsed(source);
    for (const key of usedKeys) {
        if (!frenchKeys.has(key) || !englishKeys.has(key)) {
            errors.push(`Clé utilisée sans traduction complète : ${key}`);
        }
    }

    const frenchSignals = /\b(?:ajouter|choisir|configuré|désormais|dossier|enregistrer|erreur|fermer|français|gérer|introuvable|membre|obligatoire|paramètres|rôle|salon|serveur|supprimer|vérifie)\b/i;
    for (const [key, value] of Object.entries(dictionary.en || {})) {
        if (typeof value === 'string' && frenchSignals.test(value)) {
            warnings.push(`Texte anglais à vérifier (${key}) : ${value.slice(0, 100)}`);
        }
    }

    return {
        languages,
        counts: Object.fromEntries(languages.map(language => [language, Object.keys(dictionary[language]).length])),
        usedKeyCount: usedKeys.size,
        errors,
        warnings
    };
}

if (require.main === module) {
    const source = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8');
    const result = auditBotI18n(source);
    console.log(`Traductions Discord : ${result.counts.fr || 0} FR, ${result.counts.en || 0} EN, ${result.usedKeyCount} clés utilisées.`);
    result.warnings.forEach(warning => console.warn(`AVERTISSEMENT: ${warning}`));
    result.errors.forEach(error => console.error(`ERREUR: ${error}`));
    if (result.errors.length) process.exitCode = 1;
}

module.exports = { auditBotI18n, extractObjectLiteral, translationKeysUsed };
