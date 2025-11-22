import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { formatDate, getCapsule, unlockCapsule } from '../api/capsules.js';
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

function CapsuleDetailPage() {
	const { capsuleId } = useParams();
	const queryClient = useQueryClient();
	const [passphrase, setPassphrase] = useState('');
	const [unlockMessage, setUnlockMessage] = useState(null);
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

	const statusCopy = describeStatus(derivedStatusKey);

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
				<Link to="/" className="btn btn-ghost">
					Back to list
				</Link>
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
