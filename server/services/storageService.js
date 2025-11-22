const { getClient, ensureSchema } = require('./dbClient');

function mapAttachmentRow(row) {
	if (!row) {
		return null;
	}
	const size = Number(row.size_bytes || 0);
	return {
		id: row.id,
		fileName: row.file_name,
		contentType: row.content_type,
		size,
		sizeBytes: size,
		width: row.width,
		height: row.height,
		fileId: row.file_id,
		createdAt: row.created_at,
	};
}

function mapRowToCapsule(row) {
	if (!row) {
		return null;
	}
	return {
		id: row.id,
		title: row.title,
		message: row.message,
		author: row.author,
		ownerId: row.owner_id,
		createdAt: row.created_at,
		revealAt: row.reveal_at,
		isLocked: Boolean(row.is_locked),
		passphraseHash: row.passphrase_hash,
	};
}

async function getCapsulesByOwner(ownerId) {
	if (!ownerId) {
		return [];
	}
	await ensureSchema();
	const db = getClient();
	const { rows } = await db.execute(
		`SELECT id, title, message, author, owner_id, created_at, reveal_at, is_locked, passphrase_hash
		 FROM capsules WHERE owner_id = ? ORDER BY datetime(created_at) DESC`,
		[ownerId],
	);
	const capsules = rows.map(mapRowToCapsule);
	const attachments = await getAttachmentsForCapsules(capsules.map((cap) => cap.id));
	return capsules.map((capsule) => ({
		...capsule,
		attachments: attachments.get(capsule.id) || [],
	}));
}

async function getCapsuleById(id, ownerId) {
	await ensureSchema();
	const db = getClient();
	const params = ownerId ? [id, ownerId] : [id];
	const whereClause = ownerId ? 'WHERE id = ? AND owner_id = ?' : 'WHERE id = ?';
	const { rows } = await db.execute(
		`SELECT id, title, message, author, owner_id, created_at, reveal_at, is_locked, passphrase_hash FROM capsules ${whereClause} LIMIT 1`,
		params,
	);
	const capsule = mapRowToCapsule(rows[0]);
	if (!capsule) {
		return null;
	}
	const attachmentMap = await getAttachmentsForCapsules([capsule.id]);
	return { ...capsule, attachments: attachmentMap.get(capsule.id) || [] };
}

async function insertAttachments(db, attachments) {
	for (const attachment of attachments) {
		await db.execute(
			`INSERT INTO capsule_attachments (id, capsule_id, file_name, content_type, size_bytes, width, height, file_id, created_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
			,
			[
				attachment.id,
				attachment.capsuleId,
				attachment.fileName,
				attachment.contentType,
				attachment.sizeBytes,
				attachment.width,
				attachment.height,
				attachment.fileId,
				attachment.createdAt,
			],
		);
	}
}

async function getAttachmentsForCapsules(capsuleIds) {
	if (!capsuleIds || capsuleIds.length === 0) {
		return new Map();
	}
	await ensureSchema();
	const db = getClient();
	const placeholders = capsuleIds.map(() => '?').join(',');
	const { rows } = await db.execute(
		`SELECT id, capsule_id, file_name, content_type, size_bytes, width, height, file_id, created_at
		 FROM capsule_attachments WHERE capsule_id IN (${placeholders}) ORDER BY datetime(created_at) ASC`,
		capsuleIds,
	);
	const map = new Map();
	for (const row of rows) {
		const attachment = mapAttachmentRow(row);
		if (!attachment) continue;
		const list = map.get(row.capsule_id) || [];
		list.push(attachment);
		map.set(row.capsule_id, list);
	}
	return map;
}

async function saveCapsule(capsule, attachments = []) {
	await ensureSchema();
	const db = getClient();
	await db.execute('BEGIN');
	try {
		await db.execute(
			`INSERT INTO capsules (id, title, message, author, owner_id, created_at, reveal_at, is_locked, passphrase_hash)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
			,
			[
				capsule.id,
				capsule.title,
				capsule.message,
				capsule.author,
				capsule.ownerId,
				capsule.createdAt,
				capsule.revealAt,
				capsule.isLocked ? 1 : 0,
				capsule.passphraseHash,
			],
		);
		if (attachments.length) {
			await insertAttachments(db, attachments);
		}
		await db.execute('COMMIT');
	} catch (error) {
		await db.execute('ROLLBACK');
		throw error;
	}
	return { ...capsule, attachments };
}

module.exports = {
	getCapsulesByOwner,
	getCapsuleById,
	saveCapsule,
};