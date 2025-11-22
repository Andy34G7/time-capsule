const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

async function request(path, { method = 'GET', body, treatErrorsAsData = false, token } = {}) {
	const response = await fetch(`${API_BASE_URL}${path}`, {
		method,
		headers: {
			'Content-Type': 'application/json',
			...(token ? { Authorization: `Bearer ${token}` } : {}),
		},
		body,
	});
	const contentType = response.headers.get('content-type') || '';
	const isJson = contentType.includes('application/json');
	const payload = isJson ? await response.json() : null;
	if (!response.ok && !treatErrorsAsData) {
		const error = new Error(payload?.error || 'RequestFailed');
		error.status = response.status;
		error.details = payload?.details;
		error.payload = payload;
		throw error;
	}
	return { status: response.status, payload };
}

export async function listCapsules(token) {
	const { payload } = await request('/capsules', { token });
	return payload?.data ?? [];
}

export async function createCapsule(capsule, token) {
	const { payload } = await request('/capsules', {
		method: 'POST',
		body: JSON.stringify(capsule),
		token,
	});
	return payload?.data ?? null;
}

export async function getCapsule(capsuleId, token) {
	const { status, payload } = await request(`/capsules/${capsuleId}`, {
		treatErrorsAsData: true,
		token,
	});
	return { status, capsule: payload?.data ?? null, error: payload?.error ?? null };
}

export async function unlockCapsule(capsuleId, passphrase, token) {
	const { status, payload } = await request(`/capsules/${capsuleId}/unlock`, {
		method: 'POST',
		body: JSON.stringify({ passphrase }),
		treatErrorsAsData: true,
		token,
	});
	return { status, capsule: payload?.data ?? null, error: payload?.error ?? null };
}

export function formatDate(timestamp) {
	if (!timestamp) return 'N/A';
	const date = new Date(timestamp);
	if (Number.isNaN(date.getTime())) return 'N/A';
	return date.toLocaleString();
}
