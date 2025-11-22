import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createCapsule } from '../api/capsules.js';
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

function CreateCapsulePage() {
	const [formValues, setFormValues] = useState(defaultValues);
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const { token } = useAuth();

	const handlePreset = (delta) => {
		const targetDate = applyPreset(delta);
		setFormValues((prev) => ({ ...prev, revealAt: formatLocalDateInput(targetDate) }));
	};

	const mutation = useMutation({
		mutationFn: async (payload) => createCapsule(payload, token),
		onSuccess: (savedCapsule) => {
			queryClient.invalidateQueries({ queryKey: ['capsules', token] });
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
		mutation.mutate(payload);
	};

	const showErrors = Boolean(mutation.error?.details);
	const detailEntries = showErrors ? Object.entries(mutation.error.details) : [];

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
				<button type="submit" className="btn btn-primary" disabled={mutation.isPending || !token}>
					{mutation.isPending ? 'Saving…' : !token ? 'Waiting for login…' : 'Create capsule'}
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
