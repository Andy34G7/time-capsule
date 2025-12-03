const express = require('express');
const { z } = require('zod');
const capsuleService = require('../services/capsuleService');
const requireAuth = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth());

//dev note: schema is to set certain rules for the objects we create. 
//usually good practice to have a schema validation to avoid bad data being processed
// @Andy34G7: i was asked to use zod during my internship at comono, that's carried over here
const posterSchema = z.object({
	fileName: z.string().min(1).max(255),
	contentType: z
		.string()
		.min(1)
		.refine((value) => value.startsWith('image/') || value.startsWith('video/'), 'Attachments must be images or videos'),
	size: z.number().int().min(1),
	width: z.number().int().min(1).max(8000).optional(),
	height: z.number().int().min(1).max(8000).optional(),
	fileId: z.string().min(1).optional(),
});

const attachmentSchema = z.object({
	mediaType: z.enum(['image', 'video']).optional(),
	fileName: z.string().min(1).max(255),
	contentType: z.string().min(1),
	size: z.number().int().min(1),
	width: z.number().int().min(1).max(8000).optional(),
	height: z.number().int().min(1).max(8000).optional(),
	fileId: z.string().min(1).optional(),
	durationSeconds: z.number().positive().optional(),
	bitrate: z.number().int().positive().optional(),
	poster: posterSchema.optional(),
});

const createCapsuleSchema = z.object({
	title: z.string().min(1).max(120),
	message: z.string().min(1).max(2000),
	author: z.string().min(1).max(80).optional(),
	revealAt: z.string().datetime({ offset: true }), //datetime is deprecated apparently, need to look for alternatives
	passphrase: z.string().min(6).max(128).optional(),
	attachments: z.array(attachmentSchema).max(5).optional(),
});

// schema for the passphrase unlocking the capsule. for now, it has to be atleast 1 character
//NOTE: will people remember passphrases after years? need to switch this out later?
const unlockSchema = z.object({
	passphrase: z.string().min(1, 'Passphrase is required'),
});

// handles validation by parsing the payload.
// this part was so painful to me i dont want to do this.
// on other note, sometimes you don't need comments when function names are very clear. another good practice i picked up.
function handleValidation(schema, payload) {
	const parsed = schema.safeParse(payload);
	if (!parsed.success) {
		const issues = parsed.error.flatten();
		const detail = issues.fieldErrors || {};
		const error = new Error('ValidationError');
		error.statusCode = 400;
		error.details = detail;
		throw error;
	}
	return parsed.data;
}
// on a get request, 
router.get('/', async (req, res, next) => {
	try {
		const ownerId = req.user?.sub;
		const capsules = await capsuleService.listCapsuleSummaries(ownerId);
		res.json({ data: capsules });
	} catch (error) {
		next(error);
	}
});

router.post('/', async (req, res, next) => {
	try {
		const payload = handleValidation(createCapsuleSchema, req.body);
		const capsule = await capsuleService.createCapsule(payload, req.user?.sub);
		res.status(201).json({ data: capsule });
	} catch (error) {
		next(error);
	}
});

router.get('/:id', async (req, res, next) => {
	try {
		const result = await capsuleService.getCapsuleStatus(req.params.id, req.user?.sub);
		if (result.status === 'not_found') {
			return res.status(404).json({ error: 'CapsuleNotFound' });
		}
		if (result.status === 'available') {
			return res.json({ data: result.capsule });
		}
		return res.status(403).json({ error: result.status, data: result.capsule });
	} catch (error) {
		next(error);
	}
});
// NOTE: add admin override later
router.post('/:id/unlock', async (req, res, next) => {
	try {
		const payload = handleValidation(unlockSchema, req.body);
		const result = await capsuleService.unlockCapsule(
			req.params.id,
			payload.passphrase,
			req.user?.sub,
		);

		if (result.status === 'not_found') {
			return res.status(404).json({ error: 'CapsuleNotFound' });
		}

		if (result.status === 'unlocked' || result.status === 'available') {
			return res.json({ data: result.capsule, status: result.status });
		}

		return res.status(403).json({ error: result.status, data: result.capsule });
	} catch (error) {
		next(error);
	}
});

router.delete('/:id', async (req, res, next) => {
	try {
		const result = await capsuleService.deleteCapsule(req.params.id, req.user?.sub);
		if (result.status === 'not_found') {
			return res.status(404).json({ error: 'CapsuleNotFound' });
		}
		return res.status(204).send();
	} catch (error) {
		next(error);
	}
});

module.exports = router;