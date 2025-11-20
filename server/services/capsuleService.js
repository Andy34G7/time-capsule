const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const storage = require('./storageService');

const BCRYPT_ROUNDS = Number(process.env.BCRYPT_ROUNDS || 10);

// strips password hash from the capsule
function stripSensitiveFields(capsule) {
  const { passphraseHash, ...rest } = capsule;
  return rest;
}

// returns an object with boolean values to check if the capsule is available
function messageAvailableFlag(capsule, messageAvailable) {
  const sanitized = stripSensitiveFields(capsule);
  if (!messageAvailable) {
    delete sanitized.message;
  }
  sanitized.messageAvailable = Boolean(messageAvailable);
  return sanitized;
}

async function createCapsule(payload) {
  const now = new Date().toISOString();
  const revealAt = new Date(payload.revealAt).toISOString();
  const isLocked = Boolean(payload.passphrase);
  const passphraseHash = isLocked ? await bcrypt.hash(payload.passphrase, BCRYPT_ROUNDS) : null;

  const capsule = {
    id: uuidv4(),
    title: payload.title,
    message: payload.message,
    author: payload.author || null,
    createdAt: now,
    revealAt,
    isLocked,
    passphraseHash,
  };

  await storage.saveCapsule(capsule);
  return messageAvailableFlag(capsule, !isLocked && new Date(revealAt) <= new Date(now));
}
// shw capsule reveal dates without sending message body to the client
async function listCapsuleSummaries() { 
  const capsules = await storage.getCapsules();
  const now = new Date();
  return capsules.map((capsule) => {
    const revealReached = new Date(capsule.revealAt) <= now;
    const messageAvailable = revealReached && !capsule.isLocked;
    const sanitized = messageAvailableFlag(capsule, messageAvailable);
    delete sanitized.message; // ensure listings never expose message bodies
    sanitized.isRevealed = revealReached;
    return sanitized;
  });
}
// a function to check if capsule can be shown, uses messageAvailableFlag to hide message if not
async function getCapsuleStatus(id) {
  const capsule = await storage.getCapsuleById(id);
  if (!capsule) {
    return { status: 'not_found' };
  }
  const now = new Date();
  const revealReached = new Date(capsule.revealAt) <= now;
  if (capsule.isLocked) {
    return { status: 'locked', capsule: messageAvailableFlag(capsule, false) };
  }
  if (!revealReached) {
    return { status: 'not_revealed', capsule: messageAvailableFlag(capsule, false) };
  }
  return { status: 'available', capsule: messageAvailableFlag(capsule, true) };
}
// function to unlock the capsule with the passphrase. checks if capsule is locked and verifies passphrase
async function unlockCapsule(id, passphrase) {
  const capsule = await storage.getCapsuleById(id);
  if (!capsule) {
    return { status: 'not_found' };
  }
  if (!capsule.isLocked) {
    const now = new Date();
    const revealReached = new Date(capsule.revealAt) <= now;
    if (revealReached) {
      return { status: 'available', capsule: messageAvailableFlag(capsule, true) };
    }
    return { status: 'not_revealed', capsule: messageAvailableFlag(capsule, false) };
  }
  if (!capsule.passphraseHash) {
    return { status: 'invalid_passphrase', capsule: messageAvailableFlag(capsule, false) };
  }
  const isValid = await bcrypt.compare(passphrase, capsule.passphraseHash);
  if (!isValid) {
    return { status: 'invalid_passphrase', capsule: messageAvailableFlag(capsule, false) };
  }
  return { status: 'unlocked', capsule: messageAvailableFlag(capsule, true) };
}

module.exports = {
  createCapsule,
  listCapsuleSummaries,
  getCapsuleStatus,
  unlockCapsule,
};
