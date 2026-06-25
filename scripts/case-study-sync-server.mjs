#!/usr/bin/env node
/**
 * Local dev server — writes editor changes into the repo:
 * - Case studies → content/case-study-*.json + asset/case-studies/*
 * - Homepage project cards → content/home-project-cards.json + index.html backgrounds
 *
 * Run: npm run case-study:sync
 */

import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.CASE_STUDY_SYNC_PORT || 4567);

const CASE_CONTENT_FILES = {
    'zapp-account': 'content/case-study-zapp-account.json',
    'growth-experiments': 'content/case-study-growth-experiments.json',
    'now-and-me': 'content/case-study-now-and-me.json',
    'project-3': 'content/case-study-project-3.json'
};

const MANIFEST_PATH = 'content/case-study-asset-manifest.json';
const HOME_CARDS_CONFIG_PATH = 'content/home-project-cards.json';

function sendJson(res, status, payload) {
    res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
    });
    res.end(JSON.stringify(payload));
}

function slugify(value) {
    return String(value || 'asset')
        .toLowerCase()
        .replace(/[^a-z0-9.]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'asset';
}

function extensionFromMime(mimeType, fallbackName = '') {
    const fromName = path.extname(fallbackName).toLowerCase();
    if (fromName) return fromName;
    const map = {
        'image/png': '.png',
        'image/jpeg': '.jpg',
        'image/jpg': '.jpg',
        'image/webp': '.webp',
        'image/gif': '.gif',
        'video/mp4': '.mp4',
        'video/webm': '.webm',
        'video/quicktime': '.mov'
    };
    return map[String(mimeType || '').toLowerCase()] || '.bin';
}

function assetPathFor(caseId, ref, meta = {}, knownPaths = {}) {
    if (knownPaths[ref]) return knownPaths[ref];
    const suffix = String(ref).split(':').pop() || 'asset';
    const uid = meta.uid || suffix;
    const originalName = meta.originalName || 'asset';
    const ext = extensionFromMime(meta.mimeType, originalName);
    const stem = slugify(path.basename(originalName, path.extname(originalName)) || 'asset');
    return `asset/case-studies/${caseId}/${uid}-${stem}${ext}`;
}

function resolveWithinRoot(relativePath) {
    const resolved = path.resolve(ROOT, relativePath);
    if (!resolved.startsWith(ROOT)) {
        throw new Error('Invalid path');
    }
    return resolved;
}

async function readJson(relativePath, fallback = {}) {
    try {
        const raw = await fs.readFile(resolveWithinRoot(relativePath), 'utf8');
        return JSON.parse(raw);
    } catch {
        return fallback;
    }
}

async function writeJson(relativePath, value) {
    const abs = resolveWithinRoot(relativePath);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function parseDataImage(value) {
    if (typeof value !== 'string' || !value.startsWith('data:')) return null;
    const match = /^data:([^;]+);base64,(.+)$/i.exec(value);
    if (!match) return null;
    return { mimeType: match[1], data: match[2] };
}

function homeCardAssetPath(cardKey, mimeType) {
    const ext = extensionFromMime(mimeType, `${cardKey}.png`);
    if (ext.startsWith('.')) return `asset/home-project-cards/${cardKey}${ext}`;
    return `asset/home-project-cards/${cardKey}.png`;
}

async function handleHomeCardsSync(body) {
    // Overlay-only sync: never modifies index.html shader backgrounds.
    const cardsInput = body?.cards;
    if (!cardsInput || typeof cardsInput !== 'object') {
        throw new Error('Invalid home cards payload');
    }

    const syncedCards = {};
    let assetsWritten = 0;

    for (const [cardKey, rawState] of Object.entries(cardsInput)) {
        if (!/^card-\d+$/.test(cardKey) || !rawState || typeof rawState !== 'object') continue;

        let src = typeof rawState.src === 'string' ? rawState.src : '';
        const embedded = parseDataImage(src) || (rawState.imageData
            ? { mimeType: rawState.mimeType || 'image/png', data: rawState.imageData }
            : null);

        if (embedded) {
            const assetPath = homeCardAssetPath(cardKey, embedded.mimeType);
            const absAssetPath = resolveWithinRoot(assetPath);
            await fs.mkdir(path.dirname(absAssetPath), { recursive: true });
            await fs.writeFile(absAssetPath, Buffer.from(embedded.data, 'base64'));
            src = assetPath;
            assetsWritten += 1;
        }

        if (!src || src.startsWith('data:')) continue;

        syncedCards[cardKey] = {
            src,
            x: Number(rawState.x) || 0,
            y: Number(rawState.y) || 0,
            scale: Number(rawState.scale) || 1,
            rotate: Number(rawState.rotate) || 0
        };
    }

    const repoVersion = Date.now();
    const config = {
        __editor: {
            repoVersion,
            syncedAt: new Date().toISOString(),
            dirty: false
        },
        cards: syncedCards
    };

    await writeJson(HOME_CARDS_CONFIG_PATH, config);

    return {
        ok: true,
        contentPath: HOME_CARDS_CONFIG_PATH,
        repoVersion,
        syncedAt: config.__editor.syncedAt,
        assetsWritten,
        cards: syncedCards
    };
}

async function handleSync(body) {
    const caseId = body?.caseId;
    const doc = body?.doc;
    const assets = Array.isArray(body?.assets) ? body.assets : [];
    const knownPaths = body?.knownPaths && typeof body.knownPaths === 'object' ? body.knownPaths : {};

    if (!caseId || !CASE_CONTENT_FILES[caseId]) {
        throw new Error(`Unknown case study id: ${caseId || '(missing)'}`);
    }
    if (!doc || typeof doc !== 'object' || !Array.isArray(doc.sections)) {
        throw new Error('Invalid case study document');
    }

    const manifest = await readJson(MANIFEST_PATH, {});
    const manifestUpdates = {};

    for (const asset of assets) {
        const ref = asset?.ref;
        const data = asset?.data;
        if (!ref || typeof ref !== 'string' || !data) continue;

        const relativeAssetPath = assetPathFor(caseId, ref, asset, { ...manifest, ...knownPaths });
        const absAssetPath = resolveWithinRoot(relativeAssetPath);
        await fs.mkdir(path.dirname(absAssetPath), { recursive: true });
        await fs.writeFile(absAssetPath, Buffer.from(data, 'base64'));
        manifest[ref] = relativeAssetPath.replace(/\\/g, '/');
        manifestUpdates[ref] = manifest[ref];
    }

    const repoVersion = Date.now();
    const syncedDoc = {
        ...doc,
        id: caseId,
        __editor: {
            repoVersion,
            syncedAt: new Date().toISOString(),
            dirty: false
        }
    };

    const contentPath = CASE_CONTENT_FILES[caseId];
    await writeJson(contentPath, syncedDoc);
    await writeJson(MANIFEST_PATH, manifest);

    return {
        ok: true,
        caseId,
        contentPath,
        manifestPath: MANIFEST_PATH,
        repoVersion,
        syncedAt: syncedDoc.__editor.syncedAt,
        assetsWritten: Object.keys(manifestUpdates).length,
        manifestUpdates
    };
}

const server = http.createServer(async (req, res) => {
    if (req.method === 'OPTIONS') {
        sendJson(res, 204, {});
        return;
    }

    if (req.method === 'GET' && req.url === '/health') {
        sendJson(res, 200, { ok: true, root: ROOT, port: PORT, features: ['case-studies', 'home-cards'] });
        return;
    }

    if (req.method === 'POST' && req.url === '/sync/home-cards') {
        try {
            const chunks = [];
            for await (const chunk of req) chunks.push(chunk);
            const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
            const result = await handleHomeCardsSync(body);
            sendJson(res, 200, result);
        } catch (error) {
            sendJson(res, 400, { ok: false, error: error.message || 'Home card sync failed' });
        }
        return;
    }

    if (req.method === 'POST' && req.url === '/sync') {
        try {
            const chunks = [];
            for await (const chunk of req) chunks.push(chunk);
            const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
            const result = await handleSync(body);
            sendJson(res, 200, result);
        } catch (error) {
            sendJson(res, 400, { ok: false, error: error.message || 'Sync failed' });
        }
        return;
    }

    sendJson(res, 404, { ok: false, error: 'Not found' });
});

server.listen(PORT, () => {
    console.log(`Portfolio sync server listening on http://localhost:${PORT}`);
    console.log(`Writing into ${ROOT}`);
    console.log('Keep this running while editing case studies or homepage project cards locally.');
});
