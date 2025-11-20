import { NavLink, Outlet } from 'react-router-dom';

const links = [
	{ to: '/', label: 'Capsules' },
	{ to: '/create', label: 'Create Capsule' },
];

function Layout() {
	return (
		<div className="min-h-screen bg-base-200">
			<div className="mx-auto flex min-h-screen max-w-5xl flex-col gap-6 p-6 lg:p-10">
				<header className="rounded-3xl border border-base-200 bg-base-100 p-6 shadow-xl">
					<div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
						<div>
							<p className="text-xs font-semibold uppercase tracking-[0.3em] text-base-content/60">Time Capsule</p>
							<h1 className="mt-2 text-3xl font-semibold text-base-content">Future messages, current status.</h1>
							<p className="mt-2 text-base text-base-content/70">
								Hmmmmmmmmmmmmmmm (come up with caption pls)
							</p>
						</div>
						<nav className="flex flex-wrap gap-2">
							{links.map((link) => (
								<NavLink
									key={link.to}
									to={link.to}
									className={({ isActive }) =>
										`btn btn-sm ${isActive ? 'btn-primary' : 'btn-ghost bg-base-200'}`
									}
									end={link.to === '/'}
								>
									{link.label}
								</NavLink>
							))}
						</nav>
					</div>
				</header>
				<main className="flex-1 space-y-6">
					<Outlet />
				</main>
				<footer className="text-center text-sm text-base-content/60">
					Made with &lt;3, for ProgChamp by ACM PESUECC
				</footer>
			</div>
		</div>
	);
}

export default Layout;
