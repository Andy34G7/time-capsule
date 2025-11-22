import { useAuth } from '../context/AuthContext.jsx';

function RequireAuth({ children }) {
	const { isAuthenticated, isLoading, error, login } = useAuth();

	if (isLoading) {
		return <div className="alert alert-info">Checking login status…</div>;
	}

	if (error) {
		return <div className="alert alert-error">Authentication error: {error.message}</div>;
	}

	if (!isAuthenticated) {
		return (
			<div className="alert alert-warning flex flex-col gap-3">
				<p>Sign in to view your capsules.</p>
				<button type="button" className="btn btn-primary btn-sm self-start" onClick={login}>
					Log in
				</button>
			</div>
		);
	}

	return children;
}

export default RequireAuth;
