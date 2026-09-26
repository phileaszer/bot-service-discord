const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const sharp = require('sharp');
const {
    createObjectStorageFromEnv,
    embedMediaObjectKey,
    optimizeEmbedImage
} = require('../database/object-storage');

async function testImageOptimization() {
    const source = await sharp({
        create: {
            width: 3200,
            height: 1800,
            channels: 4,
            background: { r: 255, g: 45, b: 154, alpha: 1 }
        }
    }).png().toBuffer();
    const first = await optimizeEmbedImage(source, {
        quality: 82,
        maxDimension: 1200,
        maxPixels: 10000000
    });
    const second = await optimizeEmbedImage(source, {
        quality: 82,
        maxDimension: 1200,
        maxPixels: 10000000
    });
    const metadata = await sharp(first.buffer).metadata();

    assert.equal(metadata.format, 'webp');
    assert(first.width <= 1200 && first.height <= 1200);
    assert.equal(first.contentHash, second.contentHash);
    assert.equal(
        embedMediaObjectKey(first.contentHash),
        `sentinel/embeds/${first.contentHash.slice(0, 2)}/${first.contentHash}.webp`
    );

    const gif = Buffer.from('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==', 'base64');
    const optimizedGif = await optimizeEmbedImage(gif);
    assert.equal((await sharp(optimizedGif.buffer).metadata()).format, 'webp');
}

async function testObjectStorageClient() {
    const calls = [];
    const client = {
        async send(command) {
            calls.push(command.constructor.name);

            if (command.constructor.name === 'HeadObjectCommand') {
                const error = new Error('missing');
                error.name = 'NotFound';
                throw error;
            }

            return {};
        }
    };
    const storage = createObjectStorageFromEnv({
        SENTINEL_OBJECT_STORAGE_ENABLED: 'true',
        SENTINEL_OBJECT_STORAGE_PROVIDER: 'r2',
        SENTINEL_OBJECT_STORAGE_ENDPOINT: 'https://example.r2.cloudflarestorage.com',
        SENTINEL_OBJECT_STORAGE_REGION: 'auto',
        SENTINEL_OBJECT_STORAGE_BUCKET: 'sentinel-media',
        SENTINEL_OBJECT_STORAGE_ACCESS_KEY_ID: 'test',
        SENTINEL_OBJECT_STORAGE_SECRET_ACCESS_KEY: 'secret',
        SENTINEL_OBJECT_STORAGE_PUBLIC_BASE_URL: 'https://media.example.test'
    }, { client });

    assert.equal(storage.configured, true);
    const result = await storage.putIfAbsent({
        key: 'sentinel/embeds/ab/file.webp',
        body: Buffer.from('webp'),
        contentType: 'image/webp'
    });
    assert.equal(result.url, 'https://media.example.test/sentinel/embeds/ab/file.webp');
    await storage.delete('sentinel/embeds/ab/file.webp');
    assert.deepEqual(calls, ['HeadObjectCommand', 'PutObjectCommand', 'DeleteObjectCommand']);
}

function testDatabaseMediaStatus() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sentinel-object-storage-'));
    const databasePath = path.join(root, 'service.db');
    process.env.DATABASE_PATH = databasePath;
    const db = require('../database/database');

    try {
        const columns = db.prepare('PRAGMA table_info(embed_media_objects)').all()
            .map(column => column.name);

        for (const name of ['storage_provider', 'storage_bucket', 'storage_key', 'public_url']) {
            assert(columns.includes(name));
        }

        const now = new Date().toISOString();
        const insertObject = db.prepare(`
            INSERT INTO embed_media_objects (
                content_hash, file_name, mime_type, size_bytes,
                storage_provider, storage_bucket, storage_key, public_url,
                created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        insertObject.run('a'.repeat(64), 'a.webp', 'image/webp', 10, 'local', null, null, null, now, now);
        insertObject.run(
            'b'.repeat(64),
            'b.webp',
            'image/webp',
            20,
            'r2',
            'sentinel-media',
            'sentinel/embeds/bb/b.webp',
            'https://media.example.test/sentinel/embeds/bb/b.webp',
            now,
            now
        );
        db.prepare(`
            INSERT INTO embed_media_links (
                content_hash, guild_id, message_id, slot, status, created_at, updated_at
            ) VALUES (?, ?, ?, ?, 'active', ?, ?)
        `).run('b'.repeat(64), '123', '456', 'image', now, now);

        const { getDatabaseStorageStatus } = require('../database/storage');
        const status = getDatabaseStorageStatus(db, {
            databasePath,
            backupDirectory: path.join(root, 'backups'),
            archiveDirectory: path.join(root, 'archives'),
            mediaDirectory: path.join(root, 'media')
        });

        assert.equal(status.media.objectBytes, 10);
        assert.equal(status.media.externalObjectBytes, 20);
        assert.equal(status.media.logicalObjectBytes, 30);
        assert.equal(status.managedBytes, status.databaseBytes + 10);
    } finally {
        db.close();
        fs.rmSync(root, { recursive: true, force: true });
    }
}

async function main() {
    await testImageOptimization();
    await testObjectStorageClient();
    testDatabaseMediaStatus();
    console.log('Object storage tests passed.');
}

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
