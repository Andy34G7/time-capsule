const { getClient, ensureSchema } = require('./dbClient');

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
	return rows.map(mapRowToCapsule);
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
	return mapRowToCapsule(rows[0]);
}

async function saveCapsule(capsule) {
	await ensureSchema();
	const db = getClient();
	await db.execute(
		`INSERT INTO capsules (id, title, message, author, owner_id, created_at, reveal_at, is_locked, passphrase_hash)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
	return capsule;
}

module.exports = {
	getCapsulesByOwner,
	getCapsuleById,
	saveCapsule,
};