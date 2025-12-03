const express = require('express');
const { z } = require('zod');
const multer = require('multer');
const sharp = require('sharp');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
const ffprobeInstaller = require('@ffprobe-installer/ffprobe');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs/promises');
const { randomUUID } = require('node:crypto');
const requireAuth = require('../middleware/auth');
const b2Service = require('../services/b2Service');

const router = express.Router();

router.use(requireAuth());

ffmpeg.setFfmpegPath(ffmpegInstaller.path);
ffmpeg.setFfprobePath(ffprobeInstaller.path);

const MAX_IMAGE_BYTES = Number(process.env.MEDIA_MAX_IMAGE_BYTES || 10 * 1024 * 1024);
const IMAGE_RES_CONFIG = process.env.MEDIA_MAX_IMAGE_RES || '1920x1080';
const IMAGE_QUALITY = Number(process.env.MEDIA_IMAGE_QUALITY || 70);

const MAX_VIDEO_BYTES = Number(process.env.MEDIA_MAX_VIDEO_BYTES || 100 * 1024 * 1024);
const VIDEO_RES_CONFIG = process.env.MEDIA_VIDEO_MAX_RES || '1920x1080';
const VIDEO_MAX_BITRATE = Number(process.env.MEDIA_MAX_VIDEO_BITRATE || 4_000_000);
const VIDEO_PRESET = process.env.MEDIA_VIDEO_PRESET || 'veryfast';
const VIDEO_POSTER_WIDTH = Number(process.env.MEDIA_VIDEO_POSTER_WIDTH || 320);
const VIDEO_POSTER_HEIGHT = Number(process.env.MEDIA_VIDEO_POSTER_HEIGHT || 180);
const VIDEO_POSTER_FORMAT = (process.env.MEDIA_VIDEO_POSTER_FORMAT || 'webp').toLowerCase();

const POSTER_CONTENT_TYPE_MAP = {
	webp: 'image/webp',
	jpg: 'image/jpeg',
	jpeg: 'image/jpeg',
	png: 'image/png',
};

const VIDEO_POSTER_CONTENT_TYPE = POSTER_CONTENT_TYPE_MAP[VIDEO_POSTER_FORMAT] || 'image/webp';

const [maxWidthRaw, maxHeightRaw] = IMAGE_RES_CONFIG.split('x');
const MAX_WIDTH = Number(maxWidthRaw) || 1920;
const MAX_HEIGHT = Number(maxHeightRaw) || 1080;

const [videoWidthRaw, videoHeightRaw] = VIDEO_RES_CONFIG.split('x');
const MAX_VIDEO_WIDTH = Number(videoWidthRaw) || 1920;
const MAX_VIDEO_HEIGHT = Number(videoHeightRaw) || 1080;

const imageUpload = multer({
	storage: multer.memoryStorage(),
	limits: { fileSize: MAX_IMAGE_BYTES },
});

const videoUpload = multer({
	storage: multer.memoryStorage(),
	limits: { fileSize: MAX_VIDEO_BYTES },
});

const uploadRequestSchema = z.object({
	contentType: z
		.string()
		.min(1)
		.refine((value) => value.startsWith('image/'), 'Only image uploads are supported'),
	originalFileName: z.string().min(1).max(150).optional(),
});

const downloadRequestSchema = z.object({
	fileName: z.string().min(1),
	expiresInSeconds: z.number().int().min(60).max(3600).optional(),
});

function parse(schema, payload) {
	const parsed = schema.safeParse(payload);
	if (!parsed.success) {
		const error = new Error('ValidationError');
		error.statusCode = 400;
		error.details = parsed.error.flatten().fieldErrors;
		throw error;
	}
	return parsed.data;
}

router.post('/images', async (req, res, next) => {
	try {
		const payload = parse(uploadRequestSchema, req.body);
		const data = await b2Service.getImageUploadTarget({
			ownerId: req.user?.sub,
			contentType: payload.contentType,
			originalFileName: payload.originalFileName,
		});
		res.json({ data });
	} catch (error) {
		next(error);
	}
});

router.post('/images/download', async (req, res, next) => {
	try {
		const payload = parse(downloadRequestSchema, req.body);
		const data = await b2Service.getPrivateDownloadInfo(
			payload.fileName,
			payload.expiresInSeconds,
		);
		res.json({ data });
	} catch (error) {
		next(error);
	}
});


async function ffprobeAsync(filePath) {
	return new Promise((resolve, reject) => {
		ffmpeg.ffprobe(filePath, (error, metadata) => {
			if (error) {
				reject(error);
			} else {
				resolve(metadata);
			}
		});
	});
}

async function transcodeToMp4(inputPath, outputPath) {
	return new Promise((resolve, reject) => {
		ffmpeg(inputPath)
			.outputOptions([
				'-c:v', 'libx264',
				'-preset', VIDEO_PRESET,
				'-b:v', String(VIDEO_MAX_BITRATE),
				'-maxrate', String(VIDEO_MAX_BITRATE),
				'-bufsize', String(VIDEO_MAX_BITRATE * 2),
				'-vf', `scale=${MAX_VIDEO_WIDTH}:${MAX_VIDEO_HEIGHT}:force_original_aspect_ratio=decrease,setsar=1`,
				'-c:a', 'aac',
				'-b:a', '128k',
				'-movflags', '+faststart',
			])
			.format('mp4')
			.on('error', reject)
			.on('end', resolve)
			.save(outputPath);
	});
}

async function extractPosterFrame(videoPath, posterPath) {
	return new Promise((resolve, reject) => {
		ffmpeg(videoPath)
			.outputOptions([
				'-ss', '00:00:01',
				'-vframes', '1',
				'-vf', `scale=${VIDEO_POSTER_WIDTH}:${VIDEO_POSTER_HEIGHT}:force_original_aspect_ratio=decrease`,
			])
			.format(VIDEO_POSTER_FORMAT === 'jpg' ? 'mjpeg' : VIDEO_POSTER_FORMAT)
			.on('error', reject)
			.on('end', resolve)
			.save(posterPath);
	});
}

async function cleanupFiles(paths) {
	await Promise.allSettled(
		paths.filter(Boolean).map((filePath) => fs.unlink(filePath).catch(() => {})),
	);
}

router.post(
	'/images/compress',
	imageUpload.single('image'),
	async (req, res, next) => {
		try {
			if (!req.file) {
				const err = new Error('ImageFileRequired');
				err.statusCode = 400;
				throw err;
			}
			if (!req.file.mimetype.startsWith('image/')) {
				const err = new Error('UnsupportedImageType');
				err.statusCode = 400;
				throw err;
			}
			const originalMeta = await sharp(req.file.buffer).metadata();
			const pipeline = sharp(req.file.buffer)
				.rotate()
				.resize({
					width: MAX_WIDTH,
					height: MAX_HEIGHT,
					fit: 'inside',
					withoutEnlargement: true,
				})
				.webp({ quality: IMAGE_QUALITY });
			const { data: buffer, info } = await pipeline.toBuffer({ resolveWithObject: true });
			const uploadResult = await b2Service.uploadCompressedImage({
				ownerId: req.user?.sub,
				buffer,
				contentType: 'image/webp',
				originalFileName: req.file.originalname,
				metadata: {
					width: info.width,
					height: info.height,
					format: 'webp',
					originalWidth: originalMeta.width,
					originalHeight: originalMeta.height,
				},
			});
			const download = await b2Service.getPrivateDownloadInfo(uploadResult.fileName);
			res.status(201).json({
				data: {
					fileName: uploadResult.fileName,
					fileId: uploadResult.fileId,
					contentType: uploadResult.contentType,
					size: buffer.length,
					width: info.width,
					height: info.height,
					original: {
						width: originalMeta.width,
						height: originalMeta.height,
					},
					download,
				},
			});
		} catch (error) {
			if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
				error.statusCode = 413;
				error.message = 'ImageTooLarge';
			}
			next(error);
		}
	},
);

router.post(
	'/videos/process',
	videoUpload.single('video'),
	async (req, res, next) => {
		const tempFiles = [];
		try {
			if (!req.file) {
				const err = new Error('VideoFileRequired');
				err.statusCode = 400;
				throw err;
			}
			if (!req.file.mimetype.startsWith('video/')) {
				const err = new Error('UnsupportedVideoType');
				err.statusCode = 400;
				throw err;
			}
			if (!b2Service.SUPPORTED_VIDEO_TYPES.has(req.file.mimetype)) {
				const err = new Error('UnsupportedVideoType');
				err.statusCode = 400;
				throw err;
			}
			const inputPath = path.join(os.tmpdir(), `${randomUUID()}-input`);
			tempFiles.push(inputPath);
			await fs.writeFile(inputPath, req.file.buffer);
			const optimizedPath = path.join(os.tmpdir(), `${randomUUID()}-optimized.mp4`);
			tempFiles.push(optimizedPath);
			await transcodeToMp4(inputPath, optimizedPath);
			const posterPath = path.join(os.tmpdir(), `${randomUUID()}-poster.${VIDEO_POSTER_FORMAT}`);
			tempFiles.push(posterPath);
			await extractPosterFrame(optimizedPath, posterPath);
			const optimizedMetadata = await ffprobeAsync(optimizedPath);
			const optimizedVideoStream = optimizedMetadata.streams.find((stream) => stream.codec_type === 'video');
			const durationSeconds = Number(optimizedMetadata.format?.duration) || null;
			const bitrate = Number(optimizedMetadata.format?.bit_rate) || VIDEO_MAX_BITRATE;
			const optimizedBuffer = await fs.readFile(optimizedPath);
			const posterBuffer = await fs.readFile(posterPath);
			const posterMeta = await sharp(posterBuffer).metadata();
			const videoUploadResult = await b2Service.uploadBinaryAsset({
				ownerId: req.user?.sub,
				buffer: optimizedBuffer,
				contentType: 'video/mp4',
				originalFileName: req.file.originalname,
				metadata: {
					width: optimizedVideoStream?.width,
					height: optimizedVideoStream?.height,
					durationSeconds,
					bitrate,
					format: 'mp4',
				},
				prefix: b2Service.B2_VIDEO_PREFIX,
				fallbackBase: 'video',
			});
			const posterUploadResult = await b2Service.uploadBinaryAsset({
				ownerId: req.user?.sub,
				buffer: posterBuffer,
				contentType: VIDEO_POSTER_CONTENT_TYPE,
				originalFileName: `${path.parse(req.file.originalname).name || 'video'}-poster.${VIDEO_POSTER_FORMAT}`,
				metadata: {
					width: posterMeta.width,
					height: posterMeta.height,
					format: VIDEO_POSTER_FORMAT,
				},
				prefix: b2Service.B2_IMAGE_PREFIX,
				fallbackBase: 'poster',
			});
			const download = await b2Service.getPrivateDownloadInfo(videoUploadResult.fileName);
			const posterDownload = await b2Service.getPrivateDownloadInfo(posterUploadResult.fileName);
			res.status(201).json({
				data: {
					mediaType: 'video',
					fileName: videoUploadResult.fileName,
					fileId: videoUploadResult.fileId,
					contentType: 'video/mp4',
					size: optimizedBuffer.length,
					width: optimizedVideoStream?.width || null,
					height: optimizedVideoStream?.height || null,
					durationSeconds,
					bitrate,
					poster: {
						fileName: posterUploadResult.fileName,
						fileId: posterUploadResult.fileId,
						contentType: VIDEO_POSTER_CONTENT_TYPE,
						size: posterBuffer.length,
						width: posterMeta.width,
						height: posterMeta.height,
						download: posterDownload,
					},
					download,
				},
			});
		} catch (error) {
			if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
				error.statusCode = 413;
				error.message = 'VideoTooLarge';
			}
			next(error);
		} finally {
			await cleanupFiles(tempFiles);
		}
	},
);

module.exports = router;
