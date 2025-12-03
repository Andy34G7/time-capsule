const BackblazeB2 = require('backblaze-b2');
const { randomUUID } = require('node:crypto');

const B2_KEY_ID = process.env.B2_APPLICATION_KEY_ID;
const B2_KEY = process.env.B2_APPLICATION_KEY;
const B2_BUCKET_ID = process.env.B2_BUCKET_ID;
const B2_BUCKET_NAME = process.env.B2_BUCKET_NAME;
const B2_IMAGE_PREFIX = process.env.B2_IMAGE_PREFIX || 'capsules/images';
const B2_VIDEO_PREFIX = process.env.B2_VIDEO_PREFIX || 'capsules/videos';
const B2_DOWNLOAD_URL = process.env.B2_DOWNLOAD_URL;

const SUPPORTED_IMAGE_TYPES = new Set([
	'image/jpeg',
	'image/png',
	'image/webp',
	'image/avif',
	'image/gif',
]);

const SUPPORTED_VIDEO_TYPES = new Set([
	'video/mp4',
	'video/mpeg',
	'video/quicktime',
	'video/x-matroska',
	'video/webm',
	'video/ogg',
]);

let client;
let authorization;
let lastAuthorizedAt = 0;
const AUTH_CACHE_WINDOW_MS = 1000 * 60 * 20; // 20 minutes

function ensureConfig() {
	if (!B2_KEY_ID || !B2_KEY || !B2_BUCKET_ID || !B2_BUCKET_NAME) {
		const err = new Error('BackblazeB2Misconfigured');
		err.statusCode = 500;
		throw err;
	}
}

function getClient() {
	if (!client) {
		client = new BackblazeB2({
			applicationKeyId: B2_KEY_ID,
			applicationKey: B2_KEY,
		});
	}
	return client;
}

async function authorize(force = false) {
	const now = Date.now();
	if (!force && authorization && now - lastAuthorizedAt < AUTH_CACHE_WINDOW_MS) {
		return authorization;
	}
	const b2 = getClient();
	const auth = await b2.authorize();
	authorization = auth.data;
	lastAuthorizedAt = now;
	return authorization;
}

function inferExtension(contentType) {
	switch (contentType) {
		case 'image/jpeg':
			return 'jpg';
		case 'image/png':
			return 'png';
		case 'image/webp':
			return 'webp';
		case 'image/avif':
			return 'avif';
		case 'image/gif':
			return 'gif';
		case 'video/mp4':
			return 'mp4';
		case 'video/mpeg':
			return 'mpg';
		case 'video/quicktime':
			return 'mov';
		case 'video/x-matroska':
			return 'mkv';
		case 'video/webm':
			return 'webm';
		case 'video/ogg':
			return 'ogv';
		default:
			return 'bin';
	}
}

function sanitizeFileName(original) {
	if (!original) {
		return null;
	}
	return original
		.toLowerCase()
		.replace(/[^a-z0-9\.\-_/]+/gi, '-')
		.replace(/-+/g, '-')
		.replace(/^-|-$/g, '')
		.slice(0, 80);
}

function buildObjectKey({ ownerId, originalFileName, contentType, prefix = B2_IMAGE_PREFIX, fallbackBase = 'asset' }) {
	const extension = inferExtension(contentType);
	const safeOriginal = sanitizeFileName(originalFileName);
	const base = safeOriginal ? safeOriginal.replace(/\.[^.]+$/, '') : fallbackBase;
	const uuidSuffix = randomUUID();
	return `${prefix}/${ownerId || 'anonymous'}/${Date.now()}-${uuidSuffix}-${base}.${extension}`;
}

async function getImageUploadTarget({ ownerId, contentType, originalFileName }) {
	ensureConfig();
	if (!contentType || !SUPPORTED_IMAGE_TYPES.has(contentType)) {
		const err = new Error('UnsupportedImageType');
		err.statusCode = 400;
		throw err;
	}
	await authorize();
	const b2 = getClient();
	const upload = await b2.getUploadUrl({ bucketId: B2_BUCKET_ID });
	const fileName = buildObjectKey({ ownerId, originalFileName, contentType, prefix: B2_IMAGE_PREFIX, fallbackBase: 'image' });
	return {
		uploadUrl: upload.data.uploadUrl,
		authorizationToken: upload.data.authorizationToken,
		bucketId: B2_BUCKET_ID,
		fileName,
		contentType,
		uploadHeaders: {
			'X-Bz-File-Name': encodeURIComponent(fileName),
			'Content-Type': contentType,
			'X-Bz-Content-Sha1': 'do_not_verify',
		},
	};
}

function buildDownloadUrl(fileName) {
	if (!fileName) {
		throw new Error('FileNameRequired');
	}
	const base = B2_DOWNLOAD_URL || authorization?.downloadUrl;
	if (!base) {
		const err = new Error('BackblazeB2NotAuthorized');
		err.statusCode = 500;
		throw err;
	}
	return `${base}/file/${B2_BUCKET_NAME}/${encodeURIComponent(fileName)}`;
}

async function getPrivateDownloadInfo(fileName, validDurationSeconds = 300) {
	ensureConfig();
	if (!fileName) {
		const err = new Error('FileNameRequired');
		err.statusCode = 400;
		throw err;
	}
	await authorize();
	const b2 = getClient();
	const duration = Math.min(Math.max(validDurationSeconds, 60), 3600);
	const auth = await b2.getDownloadAuthorization({
		bucketId: B2_BUCKET_ID,
		fileNamePrefix: fileName,
		validDurationInSeconds: duration,
	});
	return {
		downloadUrl: buildDownloadUrl(fileName),
		authorizationToken: auth.data.authorizationToken,
		expiresInSeconds: duration,
	};
}

async function uploadCompressedImage({ ownerId, buffer, contentType, originalFileName, metadata }) {
	return uploadBinaryAsset({
		ownerId,
		buffer,
		contentType,
		originalFileName,
		metadata,
		prefix: B2_IMAGE_PREFIX,
		fallbackBase: 'image',
	});
}

async function uploadBinaryAsset({ ownerId, buffer, contentType, originalFileName, metadata, prefix = B2_IMAGE_PREFIX, fallbackBase = 'asset' }) {
	ensureConfig();
	if (!buffer || !buffer.length) {
		const err = new Error('AssetBufferRequired');
		err.statusCode = 400;
		throw err;
	}
	await authorize();
	const b2 = getClient();
	const fileName = buildObjectKey({ ownerId, originalFileName, contentType, prefix, fallbackBase });
	const uploadTarget = await b2.getUploadUrl({ bucketId: B2_BUCKET_ID });
	const fileInfo = {};
	if (metadata?.width) {
		fileInfo['src-width'] = String(metadata.width);
	}
	if (metadata?.height) {
		fileInfo['src-height'] = String(metadata.height);
	}
	if (metadata?.format) {
		fileInfo['src-format'] = metadata.format;
	}
	if (metadata?.durationSeconds) {
		fileInfo['duration-seconds'] = String(metadata.durationSeconds);
	}
	if (metadata?.bitrate) {
		fileInfo['bitrate'] = String(metadata.bitrate);
	}
	const upload = await b2.uploadFile({
		fileName,
		data: buffer,
		mime: contentType,
		info: Object.keys(fileInfo).length ? fileInfo : undefined,
		uploadUrl: uploadTarget.data.uploadUrl,
		uploadAuthToken: uploadTarget.data.authorizationToken,
	});
	return {
		fileId: upload.data.fileId,
		fileName,
		contentType,
		contentLength: buffer.length,
		metadata,
		prefix,
	};
}

async function deleteFileVersion(fileName, fileId) {
	ensureConfig();
	if (!fileName || !fileId) {
		const err = new Error('FileNameAndIdRequired');
		err.statusCode = 400;
		throw err;
	}
	await authorize();
	const b2 = getClient();
	await b2.deleteFileVersion({ fileName, fileId });
}

module.exports = {
	getImageUploadTarget,
	getPrivateDownloadInfo,
	uploadCompressedImage,
	uploadBinaryAsset,
	deleteFileVersion,
	SUPPORTED_IMAGE_TYPES,
	SUPPORTED_VIDEO_TYPES,
	B2_IMAGE_PREFIX,
	B2_VIDEO_PREFIX,
};
