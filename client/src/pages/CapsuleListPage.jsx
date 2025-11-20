import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { listCapsules, formatDate } from '../api/capsules.js';

function CapsuleListPage() {
	const {
		data: capsules,
		isLoading,
		isError,
		error,
		refetch,
		isFetching,
	} = useQuery({ queryKey: ['capsules'], queryFn: listCapsules });

	return (
		<section className="space-y-6 rounded-3xl border border-base-200 bg-base-100 p-6 shadow-xl">
			<div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
				<div>
					<h2 className="text-2xl font-semibold text-base-content">Capsules</h2>
					<p className="text-sm text-base-content/70">Listing comes straight from GET /api/capsules.</p>
				</div>
				<button type="button" className="btn btn-outline" onClick={() => refetch()} disabled={isFetching}>
					{isFetching ? 'Refreshing…' : 'Refresh'}
				</button>
			</div>

			{isLoading && <div className="alert alert-info">Loading capsules…</div>}
			{isError && <div className="alert alert-error">Failed to load capsules: {error.message}</div>}

			{!isLoading && !isError && (
				<div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
					{(capsules ?? []).length === 0 && (
						<div className="alert alert-info">No capsules yet. Create one to test the API!</div>
					)}

					{(capsules ?? []).map((capsule) => (
						<article key={capsule.id} className="card card-bordered bg-base-100 shadow-sm">
							<div className="card-body gap-4">
								<header className="flex items-start justify-between gap-4">
									<div>
										<h3 className="text-lg font-semibold text-base-content">{capsule.title}</h3>
										<p className="text-sm text-base-content/60">
											{capsule.author ? `By ${capsule.author}` : 'Anonymous'}
										</p>
									</div>
									<span
										className={`badge badge-outline font-semibold ${
											capsule.messageAvailable
												? 'badge-success'
												: capsule.isLocked
													? 'badge-warning'
													: 'text-base-content/60'
										}`}
									>
										{capsule.messageAvailable ? 'Message available' : capsule.isLocked ? 'Locked' : 'Hidden'}
									</span>
								</header>
								<dl className="grid gap-3 text-sm text-base-content/80 sm:grid-cols-3">
									<div>
										<dt className="text-xs font-semibold uppercase tracking-widest text-base-content/50">Reveal at</dt>
										<dd className="mt-1 font-semibold text-base-content">{formatDate(capsule.revealAt)}</dd>
									</div>
									<div>
										<dt className="text-xs font-semibold uppercase tracking-widest text-base-content/50">Revealed</dt>
										<dd className="mt-1 font-semibold text-base-content">{capsule.isRevealed ? 'Yes' : 'No'}</dd>
									</div>
									<div>
										<dt className="text-xs font-semibold uppercase tracking-widest text-base-content/50">Locked</dt>
										<dd className="mt-1 font-semibold text-base-content">{capsule.isLocked ? 'Yes' : 'No'}</dd>
									</div>
								</dl>
								<Link className="link link-primary font-semibold" to={`/capsules/${capsule.id}`}>
									Open capsule
								</Link>
							</div>
						</article>
					))}
				</div>
			)}
		</section>
	);
}

export default CapsuleListPage;
