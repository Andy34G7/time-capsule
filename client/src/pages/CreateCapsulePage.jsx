import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createCapsule, uploadCompressedImage, uploadVideoAttachment } from '../api/capsules.js';
import { useAuth } from '../context/AuthContext.jsx';

const REVEAL_PRESETS = [
	{ label: 'In 1 week', days: 7 },
	{ label: 'In 1 month', months: 1 },
	{ label: 'In 3 months', months: 3 },
	{ label: 'In 6 months', months: 6 },
	{ label: 'In 1 year', years: 1 },
];

function formatLocalDateInput(date) {
	const pad = (value) => String(value).padStart(2, '0');
	const year = date.getFullYear();
	const month = pad(date.getMonth() + 1);
	const day = pad(date.getDate());
	const hours = pad(date.getHours());
	const minutes = pad(date.getMinutes());
	return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function applyPreset(delta) {
	const date = new Date();
	const next = new Date(date);
	if (delta.years) {
		next.setFullYear(next.getFullYear() + delta.years);
	}
	if (delta.months) {
		next.setMonth(next.getMonth() + delta.months);
	}
	if (delta.days) {
		next.setDate(next.getDate() + delta.days);
	}
	if (delta.hours) {
		next.setHours(next.getHours() + delta.hours);
	}
	return next;
}

const defaultValues = {
	title: '',
	author: '',
	message: '',
	revealAt: '',
	passphrase: '',
};

const MAX_ATTACHMENTS = 5;
const MAX_IMAGE_BYTES = Number(import.meta.env.VITE_MEDIA_MAX_IMAGE_BYTES || 2 * 1024 * 1024);
const MAX_IMAGE_MB = Math.round((MAX_IMAGE_BYTES / (1024 * 1024)) * 10) / 10;
const MAX_VIDEO_BYTES = Number(import.meta.env.VITE_MEDIA_MAX_VIDEO_BYTES || 100 * 1024 * 1024);
const MAX_VIDEO_MB = Math.round((MAX_VIDEO_BYTES / (1024 * 1024)) * 10) / 10;

function formatSize(bytes) {
	if (!bytes && bytes !== 0) {
		return '0 B';
	}
	if (bytes < 1024) {
		return `${bytes} B`;
	}
	if (bytes < 1024 * 1024) {
		return `${Math.round(bytes / 1024)} KB`;
	}
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function CreateCapsulePage() {
	const [formValues, setFormValues] = useState({ ...defaultValues });
	const [attachments, setAttachments] = useState([]);
	const [uploadState, setUploadState] = useState({ isUploading: false, error: null, kind: null });
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const { token } = useAuth();
	const attachmentsRef = useRef(attachments);

	useEffect(() => {
		attachmentsRef.current = attachments;
	}, [attachments]);

	useEffect(
		() => () => {
			attachmentsRef.current.forEach((item) => {
				if (item.previewUrl) {
					URL.revokeObjectURL(item.previewUrl);
				}
			});
		},
		[],
	);

	const handlePreset = (delta) => {
		const targetDate = applyPreset(delta);
		setFormValues((prev) => ({ ...prev, revealAt: formatLocalDateInput(targetDate) }));
	};

	const clearAttachments = () => {
		setAttachments((previous) => {
			previous.forEach((item) => {
				if (item.previewUrl) {
					URL.revokeObjectURL(item.previewUrl);
				}
			});
			return [];
		});
	};

	const resetFormValues = () => {
		setFormValues({ ...defaultValues });
	};

	const mutation = useMutation({
		mutationFn: async (payload) => createCapsule(payload, token),
		onSuccess: (savedCapsule) => {
			queryClient.invalidateQueries({ queryKey: ['capsules', token] });
			clearAttachments();
			resetFormValues();
			navigate(`/capsules/${savedCapsule.id}`);
		},
	});

	const onChange = (event) => {
		const { name, value } = event.target;
		setFormValues((prev) => ({ ...prev, [name]: value }));
	};

	const onSubmit = (event) => {
		event.preventDefault();
		const payload = {
			title: formValues.title.trim(),
			message: formValues.message.trim(),
			revealAt: new Date(formValues.revealAt).toISOString(),
		};
		if (formValues.author.trim()) {
			payload.author = formValues.author.trim();
		}
		if (formValues.passphrase.trim()) {
			payload.passphrase = formValues.passphrase.trim();
		}
		if (attachments.length > 0) {
			payload.attachments = attachments.map((attachment) => {
				const base = {
					mediaType: attachment.mediaType || 'image',
					fileName: attachment.fileName,
					contentType: attachment.contentType,
					size: attachment.size,
					width: attachment.width,
					height: attachment.height,
					fileId: attachment.fileId,
				};
				if (attachment.durationSeconds) {
					base.durationSeconds = attachment.durationSeconds;
				}
				if (attachment.bitrate) {
					base.bitrate = attachment.bitrate;
				}
				if (attachment.poster) {
					base.poster = {
						fileName: attachment.poster.fileName,
						contentType: attachment.poster.contentType,
						size: attachment.poster.size,
						width: attachment.poster.width,
						height: attachment.poster.height,
						fileId: attachment.poster.fileId,
					};
				}
				return base;
			});
		}
		mutation.mutate(payload);
	};

	const handleAttachmentError = (message) => {
		setUploadState({ isUploading: false, error: message, kind: null });
	};

	const handleAttachmentChange = async (event) => {
		const file = event.target.files?.[0];
		event.target.value = '';
		if (!file) {
			return;
		}
		if (!token) {
			handleAttachmentError('Log in to attach media.');
			return;
		}
		if (attachments.length >= MAX_ATTACHMENTS) {
			handleAttachmentError(`You can attach up to ${MAX_ATTACHMENTS} items.`);
			return;
		}
		if (file.size > MAX_IMAGE_BYTES) {
			handleAttachmentError(`Each image must be ${MAX_IMAGE_MB} MB or smaller.`);
			return;
		}
		setUploadState({ isUploading: true, error: null, kind: 'image' });
		try {
			const uploaded = await uploadCompressedImage(file, token);
			const previewUrl = URL.createObjectURL(file);
			setAttachments((prev) => [
				...prev,
				{
					mediaType: 'image',
					...uploaded,
					originalName: file.name,
					previewUrl,
				},
			]);
			setUploadState({ isUploading: false, error: null, kind: null });
		} catch (error) {
			const responseMessage = error?.payload?.error || error?.message || 'Upload failed.';
			handleAttachmentError(responseMessage);
		}
	};

	const handleVideoChange = async (event) => {
		const file = event.target.files?.[0];
		event.target.value = '';
		if (!file) {
			return;
		}
		if (!token) {
			handleAttachmentError('Log in to attach media.');
			return;
		}
		if (attachments.length >= MAX_ATTACHMENTS) {
			handleAttachmentError(`You can attach up to ${MAX_ATTACHMENTS} items.`);
			return;
		}
		if (file.size > MAX_VIDEO_BYTES) {
			handleAttachmentError(`Each video must be ${MAX_VIDEO_MB} MB or smaller.`);
			return;
		}
		setUploadState({ isUploading: true, error: null, kind: 'video' });
		try {
			const uploaded = await uploadVideoAttachment(file, token);
			const previewUrl = URL.createObjectURL(file);
			setAttachments((prev) => [
				...prev,
				{
					mediaType: 'video',
					...uploaded,
					originalName: file.name,
					previewUrl,
				},
			]);
			setUploadState({ isUploading: false, error: null, kind: null });
		} catch (error) {
			const responseMessage = error?.payload?.error || error?.message || 'Video upload failed.';
			handleAttachmentError(responseMessage);
		}
	};

	const handleRemoveAttachment = (fileName) => {
		setAttachments((prev) =>
			prev.filter((attachment) => {
				if (attachment.fileName === fileName) {
					if (attachment.previewUrl) {
						URL.revokeObjectURL(attachment.previewUrl);
					}
					return false;
				}
				return true;
			}),
		);
	};

	const showErrors = Boolean(mutation.error?.details);
	const detailEntries = showErrors ? Object.entries(mutation.error.details) : [];
	const disableSubmit = mutation.isPending || uploadState.isUploading || !token;
	const remainingAttachments = MAX_ATTACHMENTS - attachments.length;

	return (
		<section className="space-y-6 rounded-3xl border border-base-200 bg-base-100 p-6 shadow-xl">
			<header>
				<p className="text-xs font-semibold uppercase tracking-[0.3em] text-base-content/50">Create capsule</p>
				<h2 className="mt-2 text-3xl font-semibold text-base-content">Send a message to the future.</h2>
			</header>
			<form className="mt-4 space-y-4" onSubmit={onSubmit}>
				<label className="form-control w-full">
					<div className="label">
						<span className="label-text font-semibold">Title *</span>
					</div>
					<input
						name="title"
						value={formValues.title}
						onChange={onChange}
						placeholder="e.g. Dear future me"
						className="input input-bordered w-full"
						required
					/>
				</label>
				<label className="form-control w-full">
					<div className="label">
						<span className="label-text font-semibold">Author</span>
					</div>
					<input
						name="author"
						value={formValues.author}
						onChange={onChange}
						placeholder="Name for display (optional)"
						className="input input-bordered w-full"
					/>
				</label>
				<label className="form-control w-full">
					<div className="label">
						<span className="label-text font-semibold">Message *</span>
					</div>
					<textarea
						name="message"
						value={formValues.message}
						onChange={onChange}
						rows={6}
						placeholder="What should be revealed later?"
						className="textarea textarea-bordered"
						required
					/>
				</label>
				<label className="form-control w-full">
					<div className="label">
						<span className="label-text font-semibold">Images</span>
						<span className="label-text-alt text-xs text-base-content/60">
							Up to {MAX_ATTACHMENTS} items combined • {MAX_IMAGE_MB} MB per image
						</span>
					</div>
					<input
						type="file"
						accept="image/*"
						onChange={handleAttachmentChange}
						className="file-input file-input-bordered w-full"
						disabled={uploadState.isUploading || !token || remainingAttachments <= 0}
					/>
				</label>
				<label className="form-control w-full">
					<div className="label">
						<span className="label-text font-semibold">Videos</span>
						<span className="label-text-alt text-xs text-base-content/60">
							Max size {MAX_VIDEO_MB} MB • auto-compressed to MP4 (H.264)
						</span>
					</div>
					<input
						type="file"
						accept="video/*"
						onChange={handleVideoChange}
						className="file-input file-input-bordered w-full"
						disabled={uploadState.isUploading || !token || remainingAttachments <= 0}
					/>
				</label>
				{uploadState.error && <p className="mt-2 text-sm text-error">{uploadState.error}</p>}
				{attachments.length > 0 && (
						<ul className="mt-4 space-y-3">
							{attachments.map((attachment) => {
								const isVideo = attachment.mediaType === 'video';
								const durationSeconds = typeof attachment.durationSeconds === 'number'
									? attachment.durationSeconds
									: attachment.durationSeconds
										? Number(attachment.durationSeconds)
										: null;
								return (
									<li
										key={attachment.fileName}
										className="flex items-center gap-4 rounded-2xl border border-base-200 p-3"
									>
									<div className="avatar">
										<div className="mask mask-squircle h-16 w-16 overflow-hidden bg-base-200">
											{isVideo ? (
												attachment.previewUrl ? (
													<video
														src={attachment.previewUrl}
														className="h-full w-full object-cover"
														muted
														playsInline
													/>
												) : (
													<span className="grid h-full w-full place-items-center text-xs text-base-content/50">Video</span>
												)
											) : attachment.previewUrl ? (
												<img src={attachment.previewUrl} alt={attachment.originalName || 'Attachment preview'} />
											) : (
												<span className="grid h-full w-full place-items-center text-xs text-base-content/50">Image</span>
											)}
										</div>
									</div>
									<div className="flex-1 text-sm">
										<p className="font-semibold text-base-content flex items-center gap-2">
											{isVideo ? (
												<span className="badge badge-primary badge-sm">Video</span>
											) : (
												<span className="badge badge-secondary badge-sm">Image</span>
											)}
											<span>{attachment.originalName || attachment.fileName}</span>
										</p>
										<p className="text-base-content/70">
											{formatSize(attachment.size)} ·{' '}
											{isVideo
												? durationSeconds
													? `${durationSeconds.toFixed(1)}s`
													: 'duration pending'
												: attachment.width && attachment.height
												? `${attachment.width}×${attachment.height}px`
												: 'dimensions pending'}
										</p>
									</div>
									<button
										type="button"
										className="btn btn-sm btn-ghost"
										onClick={() => handleRemoveAttachment(attachment.fileName)}
									>
										Remove
									</button>
								</li>
								);
							})}
						</ul>
				)}
				{remainingAttachments > 0 && (
					<p className="mt-2 text-xs text-base-content/60">{remainingAttachments} slot(s) left</p>
				)}
				<label className="form-control w-full">
					<div className="label">
						<span className="label-text font-semibold">Reveal at *</span>
					</div>
					<input
						type="datetime-local"
						name="revealAt"
						value={formValues.revealAt}
						onChange={onChange}
						className="input input-bordered w-full"
						required
					/>
					<div className="label mt-2 flex-wrap gap-2">
						<span className="label-text text-xs uppercase tracking-widest text-base-content/60">Quick picks</span>
						<div className="flex flex-wrap gap-2">
							{REVEAL_PRESETS.map((preset) => (
								<button
									type="button"
									key={preset.label}
									className="btn btn-xs"
									onClick={() => handlePreset(preset)}
								>
									{preset.label}
								</button>
							))}
						</div>
					</div>
				</label>
				<label className="form-control w-full">
					<div className="label">
						<span className="label-text font-semibold">Passphrase</span>
					</div>
					<input
						type="password"
						name="passphrase"
						value={formValues.passphrase}
						onChange={onChange}
						placeholder="Optional lock"
						className="input input-bordered w-full"
					/>
				</label>
				<button type="submit" className="btn btn-primary" disabled={disableSubmit}>
					{mutation.isPending
						? 'Saving…'
						: uploadState.isUploading
							? uploadState.kind === 'video'
								? 'Processing video…'
								: 'Processing image…'
							: !token
								? 'Waiting for login…'
								: 'Create capsule'}
				</button>
			</form>
			{mutation.isError && (
				<div className="alert alert-error flex flex-col gap-2">
					<p>Unable to create capsule.</p>
					{showErrors && (
						<ul className="list-disc pl-6">
							{detailEntries.map(([field, issues]) => (
								<li key={field}>
									<strong>{field}:</strong> {issues.join(', ')}
								</li>
							))}
						</ul>
					)}
				</div>
			)}
		</section>
	);
}

export default CreateCapsulePage;
