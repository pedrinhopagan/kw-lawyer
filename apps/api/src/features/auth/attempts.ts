const ATTEMPT_MAX_KEYS = 5_000;

const windows = new Map<string, { count: number; resetAt: number }>();

export function registerAttempt(key: string, options: { windowMs: number }) {
	const now = Date.now();

	if (windows.size > ATTEMPT_MAX_KEYS) {
		for (const [staleKey, window] of windows) {
			if (window.resetAt <= now) {
				windows.delete(staleKey);
			}
		}
	}

	const current = windows.get(key);

	if (!current || current.resetAt <= now) {
		windows.set(key, { count: 1, resetAt: now + options.windowMs });

		return 1;
	}

	current.count += 1;

	return current.count;
}
