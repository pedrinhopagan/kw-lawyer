import { type } from "arktype";

const INTERNAL_PATH = /^\/(?!\/)[^\s]*$/u;

const redirectSearchSchema = type({ "+": "delete", "redirect?": "string" }).pipe(
	({ redirect }): { redirect?: string } => {
		if (!redirect || !INTERNAL_PATH.test(redirect)) {
			return {};
		}

		return { redirect };
	},
);

export const validateRedirectSearch = redirectSearchSchema.assert;
