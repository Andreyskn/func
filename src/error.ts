export const DEFAULT_ERROR_KIND = 'UnexpectedError';
export const DEFAULT_ERROR_MESSAGE = 'Something went wrong';

export type ErrorSet = Record<string, string | ErrorCreator>;

export type DefaultErrorSet = {
	[k in typeof DEFAULT_ERROR_KIND]: string;
};

export type ErrorCreator = (...args: any) => string;

export class CustomError<T extends ErrorSet> extends Error {
	static init = <T extends ErrorSet>(
		id: symbol,
		kind: string & keyof T,
		message: string,
		cause?: unknown
	) => {
		return new CustomError(id, kind, message, cause);
	};

	static wrap = <T extends ErrorSet>(
		err: unknown,
		id: symbol,
		kind: string & keyof T,
		message: string
	) => {
		if (err instanceof CustomError) {
			// FIXME: Issue: Mutating error objects can lead to confusing stack traces and error propagation issues.
			// Suggestion: Prefer creating a new error instance, or at least document this behavior clearly.
			err.cause = err.cause ?? { ...err };
			err.id = id;
			err.kind = kind;
			err.message = message;
			err.name = `${kind} [cause below]`;
			err.stack = undefined;
			return err;
		} else {
			return CustomError.init(id, kind, message, err);
		}
	};

	constructor(
		public id: symbol, // TODO: hide id prop [Symbol.id]
		public kind: string & keyof T,
		public message: string,
		public cause?: unknown
	) {
		const { stackTraceLimit } = Error;
		Error.stackTraceLimit = 0;
		super(message);
		Error.stackTraceLimit = stackTraceLimit;
		Error.captureStackTrace(this, CustomError.init);

		this.name = kind;
	}
}
