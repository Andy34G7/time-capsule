import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

const links = [
	{ to: '/', label: 'Capsules' },
	{ to: '/create', label: 'Create Capsule' },
];

function Layout() {
	const { isAuthenticated, isLoading, user, login, logout } = useAuth();

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
					<div className="mt-4 flex flex-col gap-2 rounded-2xl bg-base-200/60 p-4 text-sm text-base-content/80 md:flex-row md:items-center md:justify-between">
						{isAuthenticated && user ? (
							<p>
								Signed in as <span className="font-semibold">{user.name || user.email || user.sub}</span>
							</p>
						) : (
							<p>{isLoading ? 'Checking authentication…' : 'Not signed in.'}</p>
						)}
						<div className="flex gap-2">
							{!isAuthenticated ? (
								<button type="button" className="btn btn-primary btn-sm" onClick={login}>
									Log in
								</button>
							) : (
								<button
									type="button"
									className="btn btn-sm"
									onClick={() => logout({ logoutParams: { returnTo: window.location.origin } })}
								>
									Log out
								</button>
							)}
						</div>
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
