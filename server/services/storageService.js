const fs = require('node:fs/promises');
const path = require('node:path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'capsules-dev.json');

async function ensureDataFile() {
	try {
		await fs.access(DATA_FILE);
	} catch (error) {
		await fs.mkdir(DATA_DIR, { recursive: true });
		await fs.writeFile(DATA_FILE, '[]');
	}
}

async function readCapsules() {
	await ensureDataFile();
	const raw = await fs.readFile(DATA_FILE, 'utf8');
	try {
		return JSON.parse(raw || '[]');
	} catch (error) {
		return [];
	}
}

async function writeCapsules(capsules) {
	await fs.writeFile(DATA_FILE, JSON.stringify(capsules, null, 2));
}

async function getCapsules() {
	return readCapsules();
}

async function getCapsuleById(id) {
	const capsules = await readCapsules();
	return capsules.find((capsule) => capsule.id === id) || null;
}

async function saveCapsule(capsule) {
	const capsules = await readCapsules();
	capsules.push(capsule);
	await writeCapsules(capsules);
	return capsule;
}

module.exports = {
	getCapsules,
	getCapsuleById,
	saveCapsule,
};