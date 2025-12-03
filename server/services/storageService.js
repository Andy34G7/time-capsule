const { getClient, ensureSchema } = require('./dbClient');

function runStatement(executor, sql, args = []) {
	return executor.execute({ sql, args });
}

function mapAttachmentRow(row) {
	if (!row) {
		return null;
	}
	const size = Number(row.size_bytes || 0);
	const posterSize = Number(row.poster_size_bytes || 0) || null;
	const mediaType = row.media_type || (row.content_type?.startsWith('video/') ? 'video' : 'image');
	return {
		id: row.id,
		mediaType,
		fileName: row.file_name,
		contentType: row.content_type,
		size,
		sizeBytes: size,
		width: row.width,
		height: row.height,
		fileId: row.file_id,
		durationSeconds: row.duration_seconds ? Number(row.duration_seconds) : null,
		bitrate: row.bitrate ? Number(row.bitrate) : null,
		poster: row.poster_file_name
			? {
				fileName: row.poster_file_name,
				contentType: row.poster_content_type,
				size: posterSize,
				sizeBytes: posterSize,
				width: row.poster_width,
				height: row.poster_height,
				fileId: row.poster_file_id,
			}
			: null,
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
	const { rows } = await runStatement(
		db,
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
	const { rows } = await runStatement(
		db,
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

async function insertAttachments(dbExecutor, attachments) {
	for (const attachment of attachments) {
		await runStatement(
			dbExecutor,
			`INSERT INTO capsule_attachments (
				id,
				capsule_id,
				media_type,
				file_name,
				content_type,
				size_bytes,
				width,
				height,
				file_id,
				duration_seconds,
				bitrate,
				poster_file_name,
				poster_content_type,
				poster_size_bytes,
				poster_width,
				poster_height,
				poster_file_id,
				created_at
			)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
			,
			[
				attachment.id,
				attachment.capsuleId,
				attachment.mediaType || 'image',
				attachment.fileName,
				attachment.contentType,
				attachment.sizeBytes,
				attachment.width,
				attachment.height,
				attachment.fileId,
				attachment.durationSeconds,
				attachment.bitrate,
				attachment.poster?.fileName || null,
				attachment.poster?.contentType || null,
				attachment.poster?.size || null,
				attachment.poster?.width || null,
				attachment.poster?.height || null,
				attachment.poster?.fileId || null,
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
	const { rows } = await runStatement(
		db,
		`SELECT id, capsule_id, media_type, file_name, content_type, size_bytes, width, height, file_id,
		 duration_seconds, bitrate, poster_file_name, poster_content_type, poster_size_bytes, poster_width, poster_height, poster_file_id, created_at
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
	const tx = await db.transaction('write');
	let committed = false;
	try {
		await runStatement(
			tx,
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
			await insertAttachments(tx, attachments);
		}
		await tx.commit();
		committed = true;
	} catch (error) {
		if (!committed) {
			await tx.rollback().catch(() => {});
		}
		throw error;
	}
	return { ...capsule, attachments };
}

async function deleteCapsule(capsuleId, ownerId) {
	await ensureSchema();
	const db = getClient();
	const tx = await db.transaction('write');
	let committed = false;
	try {
		await runStatement(tx, 'DELETE FROM capsule_attachments WHERE capsule_id = ?', [capsuleId]);
		const result = await runStatement(
			tx,
			'DELETE FROM capsules WHERE id = ? AND owner_id = ?',
			[capsuleId, ownerId],
		);
		if (!result.rowsAffected) {
			await tx.rollback().catch(() => {});
			return false;
		}
		await tx.commit();
		committed = true;
		return true;
	} catch (error) {
		if (!committed) {
			await tx.rollback().catch(() => {});
		}
		throw error;
	}
}

module.exports = {
	getCapsulesByOwner,
	getCapsuleById,
	saveCapsule,
	deleteCapsule,
};