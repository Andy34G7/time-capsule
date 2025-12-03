import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { deleteCapsule as deleteCapsuleRequest, formatDate, getAttachmentDownload, getCapsule, unlockCapsule } from '../api/capsules.js';
import { useAuth } from '../context/AuthContext.jsx';

const STATUS_COPY = {
	locked: 'Locked: provide the passphrase below to reveal it.',
	not_revealed: 'Reveal date not reached yet. Come back later.',
	invalid_passphrase: 'Passphrase incorrect.',
	available: 'Available',
};

function describeStatus(status) {
	return STATUS_COPY[status] || status || 'Unknown';
}

function formatSize(bytes) {
	if (!Number.isFinite(bytes)) {
		return 'Unknown size';
	}
	if (bytes < 1024) {
		return `${bytes} B`;
	}
	if (bytes < 1024 * 1024) {
		return `${Math.round(bytes / 1024)} KB`;
	}
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function buildAuthorizedUrl(download) {
	if (!download?.downloadUrl) {
		return null;
	}
	if (!download.authorizationToken) {
		return download.downloadUrl;
	}
	const separator = download.downloadUrl.includes('?') ? '&' : '?';
	return `${download.downloadUrl}${separator}Authorization=${encodeURIComponent(download.authorizationToken)}`;
}

function CapsuleDetailPage() {
	const { capsuleId } = useParams();
	const queryClient = useQueryClient();
	const navigate = useNavigate();
	const [passphrase, setPassphrase] = useState('');
	const [unlockMessage, setUnlockMessage] = useState(null);
	const [attachmentDownloads, setAttachmentDownloads] = useState({});
	const [attachmentError, setAttachmentError] = useState(null);
	const [attachmentsLoading, setAttachmentsLoading] = useState(false);
	const { token } = useAuth();

	const { data, isLoading, isError, error } = useQuery({
		queryKey: ['capsule', capsuleId, token],
		queryFn: () => getCapsule(capsuleId, token),
		enabled: Boolean(capsuleId && token),
	});

	const capsule = data?.capsule;
	const capsuleError = data?.error;
	const isNotFound = data?.status === 404 || capsuleError === 'CapsuleNotFound';

	const unlockedCapsule = unlockMessage?.status === 200 && unlockMessage?.capsule ? unlockMessage.capsule : null;
	const effectiveCapsule = unlockedCapsule || capsule;
	const messageVisible = Boolean(effectiveCapsule?.message);
	const derivedStatusKey = messageVisible ? 'available' : capsuleError ?? (capsule?.isLocked ? 'locked' : 'available');
	const showUnlockForm = capsule?.isLocked && !messageVisible;
	const attachments = effectiveCapsule?.attachments ?? [];
	const attachmentKey = useMemo(
		() =>
			attachments
				.map((attachment) => `${attachment.fileName || attachment.id || attachment.fileId || 'unknown'}:${attachment.poster?.fileName || ''}`)
				.join('|'),
		[attachments],
	);
	const canShowAttachments = messageVisible && attachments.length > 0;

	const unlockMutation = useMutation({
		mutationFn: async (value) => unlockCapsule(capsuleId, value, token),
		onSuccess: (result) => {
			setUnlockMessage(result);
			if (result.status === 200) {
				setPassphrase('');
				queryClient.invalidateQueries({ queryKey: ['capsule', capsuleId, token] });
			}
		},
	});

	const deleteMutation = useMutation({
		mutationFn: async () => deleteCapsuleRequest(capsuleId, token),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['capsules', token] });
			navigate('/');
		},
	});

	const statusCopy = describeStatus(derivedStatusKey);

	useEffect(() => {
		if (!canShowAttachments || !token) {
			setAttachmentDownloads({});
			setAttachmentError(null);
			setAttachmentsLoading(false);
			return;
		}
		let cancelled = false;
		async function fetchDownloads() {
			setAttachmentsLoading(true);
			setAttachmentError(null);
			const requests = [];
			const seen = new Set();
			attachments.forEach((attachment) => {
				if (attachment.fileName && !seen.has(attachment.fileName)) {
					seen.add(attachment.fileName);
					requests.push({ key: attachment.fileName, fileName: attachment.fileName });
				}
				if (attachment.poster?.fileName) {
					const posterKey = `poster:${attachment.poster.fileName}`;
					if (!seen.has(posterKey)) {
						seen.add(posterKey);
						requests.push({ key: posterKey, fileName: attachment.poster.fileName });
					}
				}
			});
			if (requests.length === 0) {
				setAttachmentsLoading(false);
				return;
			}
			const results = await Promise.allSettled(
				requests.map(async ({ key, fileName }) => {
					const download = await getAttachmentDownload(fileName, token);
					return { key, download };
				}),
			);
			if (cancelled) {
				return;
			}
			const aggregated = {};
			let encounteredError = false;
			results.forEach((result, index) => {
				if (result.status === 'fulfilled') {
					aggregated[requests[index].key] = result.value.download;
				} else {
					encounteredError = true;
				}
			});
			setAttachmentDownloads(aggregated);
			setAttachmentError(encounteredError ? 'Some attachments could not be loaded.' : null);
			setAttachmentsLoading(false);
		}
		fetchDownloads().catch((error) => {
			if (!cancelled) {
				setAttachmentError(error.message || 'Unable to load attachments.');
				setAttachmentsLoading(false);
			}
		});
		return () => {
			cancelled = true;
		};
	}, [attachmentKey, attachments, canShowAttachments, token]);

	const handleDelete = () => {
		if (!capsuleId || !token || deleteMutation.isPending) {
			return;
		}
		const confirmed = window.confirm('Delete this capsule permanently? This cannot be undone.');
		if (!confirmed) {
			return;
		}
		deleteMutation.mutate();
	};

	if (isLoading) {
		return <div className="alert alert-info">Loading capsule…</div>;
	}

	if (isError) {
		return <div className="alert alert-error">Failed to load capsule: {error.message}</div>;
	}

	if (!capsuleId) {
		return <div className="alert alert-error">Missing capsule id.</div>;
	}

	if (isNotFound) {
		return (
			<div className="alert alert-error flex flex-col gap-2">
				<p>Capsule not found.</p>
				<Link to="/" className="link link-primary">
					Back to list
				</Link>
			</div>
		);
	}

	return (
		<section className="space-y-6 rounded-3xl border border-base-200 bg-base-100 p-6 shadow-xl">
			<header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
				<div>
					<p className="text-xs font-semibold uppercase tracking-[0.3em] text-base-content/50">Capsule</p>
					<h2 className="mt-1 text-3xl font-semibold text-base-content">{capsule?.title}</h2>
					<p className="mt-2 text-sm text-base-content/70">
						{capsule?.author ? `By ${capsule.author}` : 'Anonymous'} · Created {formatDate(capsule?.createdAt)}
					</p>
				</div>
				<div className="flex flex-wrap gap-2">
					<Link to="/" className="btn btn-ghost">
						Back to list
					</Link>
					<button
						type="button"
						className="btn btn-error"
						onClick={handleDelete}
						disabled={deleteMutation.isPending}
					>
						{deleteMutation.isPending ? 'Deleting…' : 'Delete'}
					</button>
				</div>
			</header>

			<dl className="grid gap-4 text-base-content/80 sm:grid-cols-3">
				<div>
					<dt className="text-xs font-semibold uppercase tracking-widest text-base-content/50">Reveal at</dt>
					<dd className="mt-1 font-semibold text-base-content">{formatDate(capsule?.revealAt)}</dd>
				</div>
				<div>
					<dt className="text-xs font-semibold uppercase tracking-widest text-base-content/50">Status</dt>
					<dd className="mt-1 font-semibold text-base-content">{statusCopy}</dd>
				</div>
				<div>
					<dt className="text-xs font-semibold uppercase tracking-widest text-base-content/50">Locked</dt>
					<dd className="mt-1 font-semibold text-base-content">
						{messageVisible ? 'No (unlocked)' : capsule?.isLocked ? 'Yes' : 'No'}
					</dd>
				</div>
			</dl>

			<section className="rounded-2xl bg-base-200/70 p-6">
				<h3 className="text-xl font-semibold text-base-content">Message</h3>
				{messageVisible ? (
					<p className="mt-3 whitespace-pre-wrap text-base text-base-content">{effectiveCapsule?.message}</p>
				) : (
					<p className="mt-3 text-sm text-base-content/70">Message is hidden until the capsule unlocks.</p>
				)}
			</section>

			{deleteMutation.isError && (
				<div className="alert alert-error">Delete failed: {deleteMutation.error?.message || 'Unknown error'}</div>
			)}

			{canShowAttachments && (
				<section className="rounded-2xl bg-base-200/70 p-6">
					<div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
						<h3 className="text-xl font-semibold text-base-content">Attachments</h3>
						{attachmentsLoading && <span className="text-xs text-base-content/60">Fetching media…</span>}
					</div>
					{attachmentError && <p className="mt-2 text-sm text-error">{attachmentError}</p>}
					<div className="mt-4 grid gap-4 lg:grid-cols-2">
						{attachments.map((attachment) => {
							const key = attachment.id || attachment.fileId || attachment.fileName;
							const isVideo = attachment.mediaType === 'video' || attachment.contentType?.startsWith('video/');
							const download = attachmentDownloads[attachment.fileName];
							const posterDownload = attachment.poster?.fileName
								? attachmentDownloads[`poster:${attachment.poster.fileName}`]
								: null;
							const mediaUrl = buildAuthorizedUrl(download);
							const posterUrl = buildAuthorizedUrl(posterDownload);
							return (
								<article key={key} className="space-y-3 rounded-2xl border border-base-200 bg-base-100 p-4">
									<div className="rounded-xl bg-base-200/60 p-2">
										{isVideo ? (
											mediaUrl ? (
												<video
													src={mediaUrl}
													poster={posterUrl || undefined}
													controls
													preload="metadata"
													className="aspect-video w-full rounded-lg bg-black"
												/>
											) : (
												<div className="skeleton aspect-video w-full rounded-lg" />
											)
										) : mediaUrl ? (
											<img
												src={mediaUrl}
												alt={attachment.fileName || 'Attachment'}
												className="aspect-video w-full rounded-lg object-cover"
											/>
										) : (
											<div className="skeleton aspect-video w-full rounded-lg" />
										)}
									</div>
									<div className="text-sm text-base-content/80">
										<p className="font-semibold text-base-content">{attachment.fileName || 'Attachment'}</p>
										<p>
											{formatSize(attachment.size)} ·{' '}
											{isVideo
												? attachment.durationSeconds
													? `${Number(attachment.durationSeconds).toFixed(1)}s`
													: 'Duration pending'
												: attachment.width && attachment.height
													? `${attachment.width}×${attachment.height}px`
													: 'Dimensions pending'}
										</p>
										{mediaUrl && (
											<a
												href={mediaUrl}
												target="_blank"
												rel="noreferrer"
												className="link link-primary"
											>
												Open in new tab
											</a>
										)}
									</div>
								</article>
							);
						})}
					</div>
				</section>
			)}

			{showUnlockForm && (
				<section className="rounded-2xl border border-dashed border-base-300 bg-base-100 p-6">
					<h3 className="text-xl font-semibold text-base-content">Unlock</h3>
					<p className="mt-2 text-sm text-base-content/70">Provide the passphrase that was set when creating the capsule.</p>
					<form
						onSubmit={(event) => {
							event.preventDefault();
							setUnlockMessage(null);
							unlockMutation.mutate(passphrase);
						}}
						className="mt-4 space-y-4"
					>
						<label className="form-control w-full">
							<div className="label">
								<span className="label-text font-semibold">Passphrase</span>
							</div>
							<input
								type="password"
								value={passphrase}
								onChange={(event) => setPassphrase(event.target.value)}
								placeholder="Enter passphrase"
								className="input input-bordered w-full"
								required
							/>
						</label>
						<button type="submit" className="btn btn-primary" disabled={unlockMutation.isPending}>
							{unlockMutation.isPending ? 'Unlocking…' : 'Unlock'}
						</button>
					</form>
					{unlockMutation.isError && (
						<div className="alert alert-error mt-4">Unlock failed: {unlockMutation.error.message}</div>
					)}
					{unlockMessage && (
						<div
							className={`alert mt-4 ${unlockMessage.status === 200 ? 'alert-success' : 'alert-warning'}`}
						>
							{unlockMessage.status === 200
								? 'Capsule unlocked.'
								: `Unable to unlock: ${describeStatus(unlockMessage.error)}`}
						</div>
					)}
				</section>
			)}
		</section>
	);
}

export default CapsuleDetailPage;
