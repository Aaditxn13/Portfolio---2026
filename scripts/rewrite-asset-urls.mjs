#!/usr/bin/env node
/* ----------------------------------------------------------------------------
 * rewrite-asset-urls.mjs
 *
 * Walks every HTML/CSS/JS file in the project and rewrites absolute asset
 * URLs to match the current CDN strategy:
 *
 *   * Small/medium assets (png, jpg, svg, audio, fonts, …) →
 *       https://cdn.jsdelivr.net/gh/Aaditxn13/Portfolio---2026@<commit>/asset/...
 *     pinned to a specific commit so jsDelivr serves with an immutable
 *     1-year cache.
 *
 *   * Video files (mp4, webm, mov, m4v) →
 *       https://aaditxn13.github.io/Portfolio---2026/asset/...
 *     GH Pages / Fastly is meaningfully faster than jsDelivr for large
 *     media files in our benchmarks.
 *
 * Pulls the pinned commit from asset/head-boot.js so this script and the
 * runtime resolver always agree. Idempotent: re-running after a sync is a
 * no-op if the commit hash hasn't changed.
 *
 * The absolute-URL rewriters intentionally match both the current
 * Aaditxn13 host AND the legacy aaadityaas host so the first run after the
 * GitHub account migration sweeps all stale URLs forward.
 *
 * Usage:
 *   node scripts/rewrite-asset-urls.mjs            # apply changes
 *   node scripts/rewrite-asset-urls.mjs --dry-run  # show counts only
 * ------------------------------------------------------------------------- */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DRY_RUN = process.argv.includes('--dry-run');

const GH_REPO = 'Aaditxn13/Portfolio---2026';
const GH_PAGES_BASE = 'https://aaditxn13.github.io/Portfolio---2026/';
const LEGACY_GH_REPOS = ['aaadityaas/Portfolio---2026', 'Aaditxn13/Portfolio---2026'];
const LEGACY_GH_PAGES_HOSTS = ['aaadityaas.github.io', 'aaditxn13.github.io'];
const VIDEO_EXTENSIONS = new Set(['mp4', 'webm', 'mov', 'm4v']);

function readPinnedCommit() {
    const file = fs.readFileSync(path.join(REPO_ROOT, 'asset/head-boot.js'), 'utf8');
    const m = /ASSETS_PINNED_COMMIT\s*=\s*'([a-f0-9]+)'/i.exec(file);
    if (!m) throw new Error('Could not find ASSETS_PINNED_COMMIT in asset/head-boot.js');
    return m[1];
}

const PINNED_COMMIT = readPinnedCommit();
const JSDELIVR_BASE = `https://cdn.jsdelivr.net/gh/${GH_REPO}@${PINNED_COMMIT}/`;

const MEDIA_EXTENSIONS = [
    'png', 'jpe?g', 'gif', 'webp', 'avif', 'svg',
    'mp4', 'webm', 'mov', 'm4v',
    'mp3', 'wav', 'ogg',
    'ttf', 'woff2?', 'otf',
    'ico'
].join('|');

const FILES_TO_PROCESS = [
    'index.html', 'about.html', 'play.html',
    'project-1.html', 'project-2.html', 'project-3.html', 'project-4.html',
    'style.css',
    'script.js',
    'case-study-editor.js',
    'asset/dappled-light-shader.js',
    'asset/leaf-fall.js',
    'asset/site-prefetch.js'
];

const stats = { filesChanged: 0, replacements: 0, skipped: 0 };

function pickBase(pathBody) {
    const noQuery = pathBody.split('?')[0];
    const m = /\.([a-z0-9]+)$/i.exec(noQuery);
    const ext = m ? m[1].toLowerCase() : '';
    return VIDEO_EXTENSIONS.has(ext) ? GH_PAGES_BASE : JSDELIVR_BASE;
}

function processFile(relPath) {
    const abs = path.join(REPO_ROOT, relPath);
    if (!fs.existsSync(abs)) {
        console.warn(`  skip (missing): ${relPath}`);
        stats.skipped += 1;
        return;
    }
    const original = fs.readFileSync(abs, 'utf8');
    let content = original;
    let replacements = 0;

    // 1. Existing absolute jsDelivr OR GH Pages URLs → normalize to the
    //    correct CDN for their file type. Catches stale commit hashes AND
    //    the legacy `aaadityaas` GitHub account so URLs migrate cleanly
    //    after the account swap.
    const jsDelivrRepoAlternation = LEGACY_GH_REPOS
        .map((r) => r.replace(/\//g, '\\/'))
        .join('|');
    const ghPagesHostAlternation = LEGACY_GH_PAGES_HOSTS
        .map((h) => h.replace(/\./g, '\\.'))
        .join('|');
    const absoluteRewriters = [
        {
            re: new RegExp(
                `https://cdn\\.jsdelivr\\.net/gh/(?:${jsDelivrRepoAlternation})@[a-f0-9A-Z._-]+/asset/([^\\s"'\`)<>]+?\\.(?:${MEDIA_EXTENSIONS})(?:\\?[^\\s"'\`)<>]*)?)`,
                'gi'
            )
        },
        {
            re: new RegExp(
                `https://(?:${ghPagesHostAlternation})/Portfolio---2026/asset/([^\\s"'\`)<>]+?\\.(?:${MEDIA_EXTENSIONS})(?:\\?[^\\s"'\`)<>]*)?)`,
                'gi'
            )
        }
    ];

    for (const { re } of absoluteRewriters) {
        content = content.replace(re, (match, rest) => {
            const newBase = pickBase(rest);
            const newUrl = `${newBase}asset/${rest}`;
            if (newUrl === match) return match;
            replacements += 1;
            return newUrl;
        });
    }

    // 2. Bare "asset/..." references (without the URL prefix) and "./asset/..."
    //    forms. Skip <script src=...js> (those JS files stay local).
    const bareMatcher = new RegExp(
        `(?<![\\w/.])asset/([^"'\`)<>\\n]+?\\.(?:${MEDIA_EXTENSIONS})(?:\\?[^"'\`)<>\\s]*)?)`,
        'gi'
    );
    content = content.replace(bareMatcher, (match, rest) => {
        replacements += 1;
        return `${pickBase(rest)}asset/${rest}`;
    });

    const dotSlashMatcher = new RegExp(
        `\\./asset/([^"'\`)<>\\n]+?\\.(?:${MEDIA_EXTENSIONS})(?:\\?[^"'\`)<>\\s]*)?)`,
        'gi'
    );
    content = content.replace(dotSlashMatcher, (match, rest) => {
        replacements += 1;
        return `${pickBase(rest)}asset/${rest}`;
    });

    // 3. Sweep preconnect/dns-prefetch hint URLs (no /asset/ suffix, so the
    //    matchers above miss them) and bare host references in scripts.
    const newHost = GH_PAGES_BASE.replace(/^https?:\/\//, '').replace(/\/$/, '');
    for (const legacyHost of LEGACY_GH_PAGES_HOSTS) {
        if (legacyHost === newHost) continue;
        const re = new RegExp(legacyHost.replace(/\./g, '\\.'), 'g');
        content = content.replace(re, (m) => {
            replacements += 1;
            return newHost;
        });
    }
    for (const legacyRepo of LEGACY_GH_REPOS) {
        if (legacyRepo === GH_REPO) continue;
        const re = new RegExp(legacyRepo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
        content = content.replace(re, (m) => {
            replacements += 1;
            return GH_REPO;
        });
    }

    // 4. asset/site-prefetch.js carries the runtime resolver. Make sure it
    //    delegates to the global window.resolveAssetUrl() helper defined in
    //    head-boot.js (single source of truth for CDN routing).
    if (relPath === 'asset/site-prefetch.js') {
        const old = /function resolveMediaSrc\(src, manifest\) \{[\s\S]*?\n    \}/m;
        const fresh =
`function resolveMediaSrc(src, manifest) {
        if (!src || typeof src !== 'string') return '';
        if (src.startsWith('cs-asset:')) return manifest?.[src] || '';
        if (typeof window !== 'undefined' && typeof window.resolveAssetUrl === 'function') {
            const resolved = window.resolveAssetUrl(src);
            if (resolved && resolved !== src) return resolved;
        }
        if (src.startsWith('/')) return src.replace(/^\\//, '');
        return src;
    }`;
        if (old.test(content) && !/window\.resolveAssetUrl/.test(content)) {
            content = content.replace(old, fresh);
            replacements += 1;
        }
    }

    if (replacements === 0) {
        console.log(`  ${relPath} — no changes`);
        return;
    }

    if (DRY_RUN) {
        console.log(`  ${relPath} — would change ${replacements} reference(s)`);
    } else {
        fs.writeFileSync(abs, content, 'utf8');
        console.log(`  ${relPath} — rewrote ${replacements} reference(s)`);
    }
    stats.filesChanged += 1;
    stats.replacements += replacements;
}

console.log(`Rewriting asset URLs${DRY_RUN ? ' [dry run]' : ''}`);
console.log(`  jsDelivr (commit-pinned): ${JSDELIVR_BASE}`);
console.log(`  GH Pages (videos):        ${GH_PAGES_BASE}\n`);
for (const file of FILES_TO_PROCESS) processFile(file);

console.log(
    `\nDone. ${stats.filesChanged} file(s) ${DRY_RUN ? 'would change' : 'changed'}, ` +
    `${stats.replacements} reference(s) ${DRY_RUN ? 'would be' : ''} rewritten.`
);
