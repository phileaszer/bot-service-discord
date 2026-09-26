const crypto = require('crypto');

const sharp = require('sharp');
const { NodeHttpHandler } = require('@smithy/node-http-handler');
const {
    DeleteObjectCommand,
    HeadObjectCommand,
    PutObjectCommand,
    S3Client
} = require('@aws-sdk/client-s3');

function envBoolean(value, fallback = false) {
    if (value === undefined || value === null || value === '') {
        return fallback;
    }

    return String(value).toLowerCase() === 'true';
}

function envInteger(value, fallback, minimum, maximum) {
    const parsed = Number.parseInt(value, 10);

    if (!Number.isFinite(parsed)) {
        return fallback;
    }

    return Math.min(Math.max(parsed, minimum), maximum);
}

function safeProviderName(value) {
    const provider = String(value || 's3').trim().toLowerCase();
    return /^[a-z0-9_-]{1,24}$/.test(provider) ? provider : 's3';
}

function normalizedBaseUrl(value) {
    const raw = String(value || '').trim();

    if (!raw) {
        return null;
    }

    try {
        const url = new URL(raw);

        if (url.protocol !== 'https:') {
            return null;
        }

        url.hash = '';
        url.search = '';
        return url.toString().replace(/\/+$/, '');
    } catch (error) {
        return null;
    }
}

function encodeObjectKey(key) {
    return String(key || '')
        .split('/')
        .map(segment => encodeURIComponent(segment))
        .join('/');
}

function isMissingObjectError(error) {
    return error?.$metadata?.httpStatusCode === 404
        || ['NotFound', 'NoSuchKey'].includes(error?.name)
        || ['NotFound', 'NoSuchKey'].includes(error?.Code);
}

function createObjectStorageFromEnv(env = process.env, options = {}) {
    const enabled = envBoolean(env.SENTINEL_OBJECT_STORAGE_ENABLED, false);
    const provider = safeProviderName(env.SENTINEL_OBJECT_STORAGE_PROVIDER || 's3');
    const endpoint = String(env.SENTINEL_OBJECT_STORAGE_ENDPOINT || '').trim() || null;
    const region = String(env.SENTINEL_OBJECT_STORAGE_REGION || 'auto').trim() || 'auto';
    const bucket = String(env.SENTINEL_OBJECT_STORAGE_BUCKET || '').trim();
    const accessKeyId = String(env.SENTINEL_OBJECT_STORAGE_ACCESS_KEY_ID || '').trim();
    const secretAccessKey = String(env.SENTINEL_OBJECT_STORAGE_SECRET_ACCESS_KEY || '').trim();
    const publicBaseUrl = normalizedBaseUrl(env.SENTINEL_OBJECT_STORAGE_PUBLIC_BASE_URL);
    const connectionTimeout = envInteger(
        env.SENTINEL_OBJECT_STORAGE_CONNECTION_TIMEOUT_MS,
        2500,
        500,
        15000
    );
    const requestTimeout = envInteger(
        env.SENTINEL_OBJECT_STORAGE_REQUEST_TIMEOUT_MS,
        10000,
        1000,
        30000
    );
    const maxAttempts = envInteger(env.SENTINEL_OBJECT_STORAGE_MAX_ATTEMPTS, 2, 1, 4);
    const missing = [];

    if (!bucket) missing.push('bucket');
    if (!accessKeyId) missing.push('accessKeyId');
    if (!secretAccessKey) missing.push('secretAccessKey');
    if (!publicBaseUrl) missing.push('publicBaseUrl');
    if (provider === 'r2' && !endpoint) missing.push('endpoint');

    const configured = enabled && missing.length === 0;
    const client = configured
        ? options.client || new S3Client({
            region,
            endpoint: endpoint || undefined,
            forcePathStyle: envBoolean(env.SENTINEL_OBJECT_STORAGE_FORCE_PATH_STYLE, false),
            requestChecksumCalculation: 'WHEN_REQUIRED',
            responseChecksumValidation: 'WHEN_REQUIRED',
            maxAttempts,
            requestHandler: new NodeHttpHandler({
                connectionTimeout,
                requestTimeout
            }),
            credentials: { accessKeyId, secretAccessKey }
        })
        : null;

    function publicUrl(key) {
        if (!publicBaseUrl) {
            return null;
        }

        return `${publicBaseUrl}/${encodeObjectKey(key)}`;
    }

    return {
        enabled,
        configured,
        provider,
        bucket: bucket || null,
        endpointConfigured: Boolean(endpoint),
        publicBaseUrl,
        missing,
        publicUrl,
        async putIfAbsent({ key, body, contentType, metadata = {} }) {
            if (!configured || !client) {
                throw new Error('Le stockage objet Sentinel n\'est pas configure.');
            }

            let exists = false;

            try {
                await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
                exists = true;
            } catch (error) {
                if (!isMissingObjectError(error)) {
                    throw error;
                }
            }

            if (!exists) {
                await client.send(new PutObjectCommand({
                    Bucket: bucket,
                    Key: key,
                    Body: body,
                    ContentType: contentType,
                    ContentLength: body.length,
                    CacheControl: 'public, max-age=31536000, immutable',
                    ContentDisposition: 'inline',
                    Metadata: Object.fromEntries(
                        Object.entries(metadata)
                            .filter(([, value]) => value !== undefined && value !== null)
                            .map(([name, value]) => [name, String(value).slice(0, 1024)])
                    )
                }));
            }

            return { created: !exists, url: publicUrl(key) };
        },
        async delete(key) {
            if (!configured || !client || !key) {
                return false;
            }

            await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
            return true;
        },
        status() {
            return {
                enabled,
                configured,
                provider,
                bucket: bucket || null,
                endpointConfigured: Boolean(endpoint),
                publicBaseUrl,
                missing: [...missing]
            };
        }
    };
}

function getImageOptimizationOptions(env = process.env) {
    return {
        quality: envInteger(env.EMBED_MEDIA_WEBP_QUALITY, 82, 45, 100),
        maxDimension: envInteger(env.EMBED_MEDIA_MAX_DIMENSION, 2560, 320, 8192),
        maxPixels: envInteger(env.EMBED_MEDIA_MAX_PIXELS, 40000000, 1000000, 100000000)
    };
}

async function optimizeEmbedImage(buffer, options = {}) {
    const quality = envInteger(options.quality, 82, 45, 100);
    const maxDimension = envInteger(options.maxDimension, 2560, 320, 8192);
    const maxPixels = envInteger(options.maxPixels, 40000000, 1000000, 100000000);
    const image = sharp(buffer, {
        animated: true,
        failOn: 'error',
        limitInputPixels: maxPixels
    });
    const metadata = await image.metadata();
    const width = Number(metadata.width || 0);
    const height = Number(metadata.height || 0);
    const pages = Math.max(Number(metadata.pages || 1), 1);

    if (!width || !height || width * height * pages > maxPixels) {
        throw new Error('Dimensions de l\'image non autorisees.');
    }

    const { data, info } = await image
        .rotate()
        .resize({
            width: maxDimension,
            height: maxDimension,
            fit: 'inside',
            withoutEnlargement: true
        })
        .webp({
            quality,
            effort: 5,
            smartSubsample: true
        })
        .toBuffer({ resolveWithObject: true });
    const contentHash = crypto.createHash('sha256').update(data).digest('hex');

    return {
        buffer: data,
        size: data.length,
        contentHash,
        mimeType: 'image/webp',
        extension: 'webp',
        width: Number(info.width || 0),
        height: Number(info.height || 0),
        pages,
        originalSize: buffer.length
    };
}

function embedMediaObjectKey(contentHash) {
    const hash = String(contentHash || '').toLowerCase();

    if (!/^[a-f0-9]{64}$/.test(hash)) {
        throw new Error('Empreinte media Sentinel invalide.');
    }

    return `sentinel/embeds/${hash.slice(0, 2)}/${hash}.webp`;
}

module.exports = {
    createObjectStorageFromEnv,
    embedMediaObjectKey,
    getImageOptimizationOptions,
    optimizeEmbedImage
};
