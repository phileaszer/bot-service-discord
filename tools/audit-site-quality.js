'use strict';

const fs = require('fs');
const path = require('path');

function auditHtml(filePath, source) {
    const errors = [];
    const name = path.basename(filePath);
    const count = pattern => (source.match(pattern) || []).length;

    if (!/<html\s[^>]*lang=["'][^"']+["']/i.test(source)) errors.push('attribut lang manquant');
    if (!/<meta\s[^>]*name=["']viewport["']/i.test(source)) errors.push('viewport mobile manquant');
    if (!/<title>[^<]+<\/title>/i.test(source)) errors.push('titre de page manquant');
    if (!/<meta\s[^>]*name=["']description["'][^>]*content=["'][^"']+/i.test(source)
        && !/<meta\s[^>]*content=["'][^"']+["'][^>]*name=["']description["']/i.test(source)) {
        errors.push('description manquante');
    }
    if (!/<main\b/i.test(source) && name !== '404.html') errors.push('contenu principal <main> manquant');
    if (!/theme\.js(?:\?|["'])/i.test(source) && name !== '404.html') errors.push('theme.js manquant');

    const ids = [...source.matchAll(/\sid=["']([^"']+)["']/gi)].map(match => match[1]);
    const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
    if (duplicates.length) errors.push(`identifiants dupliqués : ${[...new Set(duplicates)].join(', ')}`);

    for (const image of source.matchAll(/<img\b[^>]*>/gi)) {
        if (!/\salt=["'][^"']*["']/i.test(image[0])) errors.push(`image sans alt : ${image[0].slice(0, 80)}`);
    }
    for (const link of source.matchAll(/<a\b[^>]*target=["']_blank["'][^>]*>/gi)) {
        if (!/\srel=["'][^"']*noopener/i.test(link[0])) errors.push('lien externe sans rel=noopener');
    }

    const headings = count(/<h1\b/gi);
    if (headings !== 1 && !['dashboard.html', 'membre.html', '404.html'].includes(name)) {
        errors.push(`${headings} titre(s) h1 au lieu de 1`);
    }
    return errors;
}

function auditSite(siteDirectory) {
    const results = [];
    for (const name of fs.readdirSync(siteDirectory).filter(file => file.endsWith('.html')).sort()) {
        const filePath = path.join(siteDirectory, name);
        const errors = auditHtml(filePath, fs.readFileSync(filePath, 'utf8'));
        results.push({ name, errors });
    }
    return results;
}

if (require.main === module) {
    const results = auditSite(path.join(__dirname, '..', 'site'));
    const failures = results.filter(result => result.errors.length);
    results.forEach(result => {
        if (result.errors.length) console.error(`${result.name}: ${result.errors.join(' ; ')}`);
    });
    console.log(`Qualité du site : ${results.length - failures.length}/${results.length} pages conformes.`);
    if (failures.length) process.exitCode = 1;
}

module.exports = { auditHtml, auditSite };
