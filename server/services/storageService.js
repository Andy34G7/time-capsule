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
		createdAt: row.created_at,
		revealAt: row.reveal_at,
		isLocked: Boolean(row.is_locked),
		passphraseHash: row.passphrase_hash,
	};
}

async function getCapsules() {
	await ensureSchema();
	const db = getClient();
	const { rows } = await db.execute(
		'SELECT id, title, message, author, created_at, reveal_at, is_locked, passphrase_hash FROM capsules ORDER BY datetime(created_at) DESC',
	);
	return rows.map(mapRowToCapsule);
}

async function getCapsuleById(id) {
	await ensureSchema();
	const db = getClient();
	const { rows } = await db.execute(
		' SELECT id, title, message, author, created_at, reveal_at, is_locked, passphrase_hash FROM capsules WHERE id = ? LIMIT 1 ',
		[id],
	);
	return mapRowToCapsule(rows[0]);
}

async function saveCapsule(capsule) {
	await ensureSchema();
	const db = getClient();
	await db.execute(
		`INSERT INTO capsules (id, title, message, author, created_at, reveal_at, is_locked, passphrase_hash)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		[
			capsule.id,
			capsule.title,
			capsule.message,
			capsule.author,
			capsule.createdAt,
			capsule.revealAt,
			capsule.isLocked ? 1 : 0,
			capsule.passphraseHash,
		],
	);
	return capsule;
}

module.exports = {
	getCapsules,
	getCapsuleById,
	saveCapsule,
};