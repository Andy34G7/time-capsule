import { createContext, useContext, useMemo, useState, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import { GoogleOAuthProvider, useGoogleLogin } from '@react-oauth/google';
import { jwtDecode } from 'jwt-decode';

const AuthStateContext = createContext(null);

function useTokenStorage() {
	const [token, setToken] = useState(() => localStorage.getItem('tc.idToken'));

	const persist = useCallback((value) => {
		if (value) {
			localStorage.setItem('tc.idToken', value);
		} else {
			localStorage.removeItem('tc.idToken');
		}
		setToken(value);
	}, []);

	return [token, persist];
}

function AuthContextProvider({ children }) {
	const [storedToken, setStoredToken] = useTokenStorage();
	const [user, setUser] = useState(() => (storedToken ? jwtDecode(storedToken) : null));
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState(null);

	useEffect(() => {
		if (storedToken) {
			try {
				setUser(jwtDecode(storedToken));
			} catch (decodeError) {
				console.error('Failed to decode token', decodeError);
				setStoredToken(null);
				setUser(null);
			}
		} else {
			setUser(null);
		}
	}, [storedToken, setStoredToken]);

	const exchangeCode = useCallback(async (code) => {
		const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/auth/google/exchange`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ code, redirectUri: import.meta.env.VITE_GOOGLE_REDIRECT_URI }),
		});
		if (!response.ok) {
			const payload = await response.json().catch(() => ({}));
			const err = new Error(payload.error || 'GoogleExchangeFailed');
			err.details = payload.details;
			throw err;
		}
		return response.json();
	}, []);

	const loginFunction = useGoogleLogin({
		flow: 'auth-code',
		scope: 'openid email profile',
		redirect_uri: import.meta.env.VITE_GOOGLE_REDIRECT_URI,
		onSuccess: async (codeResponse) => {
			setError(null);
			setIsLoading(true);
			try {
				const data = await exchangeCode(codeResponse.code);
				if (!data?.idToken) {
					throw new Error('Missing idToken from exchange');
				}
				setStoredToken(data.idToken);
			} catch (err) {
				console.error('Login failed', err);
				setError(err);
			} finally {
				setIsLoading(false);
			}
		},
		onError: (authError) => {
			console.error('Google login error', authError);
			setError(new Error('GoogleAuthError'));
		},
	});

	const logout = useCallback(() => {
		setStoredToken(null);
		setUser(null);
	}, [setStoredToken]);

	const contextValue = useMemo(
		() => ({
			isAuthenticated: Boolean(storedToken),
			isLoading,
			error,
			user,
			login: () => loginFunction(),
			logout,
			token: storedToken,
		}),
		[storedToken, isLoading, error, user, loginFunction, logout],
	);

	return <AuthStateContext.Provider value={contextValue}>{children}</AuthStateContext.Provider>;
}

AuthContextProvider.propTypes = {
	children: PropTypes.node.isRequired,
};

export function AuthProvider({ children }) {
	const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
	return (
		<GoogleOAuthProvider clientId={clientId} onScriptLoadError={(error) => console.error('Google script error', error)}>
			<AuthContextProvider>{children}</AuthContextProvider>
		</GoogleOAuthProvider>
	);
}

AuthProvider.propTypes = {
	children: PropTypes.node.isRequired,
};

export function useAuth() {
	const context = useContext(AuthStateContext);
	if (!context) {
		throw new Error('useAuth must be used within AuthProvider');
	}
	return context;
}

export default AuthProvider;
