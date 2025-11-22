const express = require('express');
const { z } = require('zod');
const multer = require('multer');
const sharp = require('sharp');
const requireAuth = require('../middleware/auth');
const b2Service = require('../services/b2Service');

const router = express.Router();

router.use(requireAuth());

const MAX_IMAGE_BYTES = Number(process.env.MEDIA_MAX_IMAGE_BYTES || 10 * 1024 * 1024);
const IMAGE_RES_CONFIG = process.env.MEDIA_MAX_IMAGE_RES || '1920x1080';
const IMAGE_QUALITY = Number(process.env.MEDIA_IMAGE_QUALITY || 70);

const [maxWidthRaw, maxHeightRaw] = IMAGE_RES_CONFIG.split('x');
const MAX_WIDTH = Number(maxWidthRaw) || 1920;
const MAX_HEIGHT = Number(maxHeightRaw) || 1080;

const upload = multer({
	storage: multer.memoryStorage(),
	limits: { fileSize: MAX_IMAGE_BYTES },
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

router.post(
	'/images/compress',
	upload.single('image'),
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

module.exports = router;
