const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const storage = require('./storageService');

const BCRYPT_ROUNDS = Number(process.env.BCRYPT_ROUNDS || 10);

function assertOwner(ownerId) {
  if (!ownerId) {
    const error = new Error('OwnerRequired');
    error.statusCode = 401;
    throw error;
  }
}

// strips password hash from the capsule
function stripSensitiveFields(capsule) {
  const { passphraseHash, ownerId, ...rest } = capsule;
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

function normalizeAttachmentForStorage(attachment, capsuleId, timestamp) {
  return {
    id: uuidv4(),
    capsuleId,
    fileName: attachment.fileName,
    contentType: attachment.contentType,
    sizeBytes: attachment.size,
    size: attachment.size,
    width: attachment.width ?? null,
    height: attachment.height ?? null,
    fileId: attachment.fileId || null,
    createdAt: timestamp,
  };
}

async function createCapsule(payload, ownerId) {
  assertOwner(ownerId);
  const now = new Date().toISOString();
  const revealAt = new Date(payload.revealAt).toISOString();
  const isLocked = Boolean(payload.passphrase);
  const passphraseHash = isLocked ? await bcrypt.hash(payload.passphrase, BCRYPT_ROUNDS) : null;

  const capsule = {
    id: uuidv4(),
    title: payload.title,
    message: payload.message,
    author: payload.author || null,
    ownerId,
    createdAt: now,
    revealAt,
    isLocked,
    passphraseHash,
  };

  const attachments = Array.isArray(payload.attachments)
    ? payload.attachments.map((attachment) => normalizeAttachmentForStorage(attachment, capsule.id, now))
    : [];

  await storage.saveCapsule(capsule, attachments);
  const capsuleWithAttachments = { ...capsule, attachments };
  return messageAvailableFlag(
    capsuleWithAttachments,
    !isLocked && new Date(revealAt) <= new Date(now),
  );
}
// shw capsule reveal dates without sending message body to the client
async function listCapsuleSummaries(ownerId) {
  assertOwner(ownerId);
  const capsules = await storage.getCapsulesByOwner(ownerId);
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
async function getCapsuleStatus(id, ownerId) {
  assertOwner(ownerId);
  const capsule = await storage.getCapsuleById(id, ownerId);
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
async function unlockCapsule(id, passphrase, ownerId) {
  assertOwner(ownerId);
  const capsule = await storage.getCapsuleById(id, ownerId);
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
