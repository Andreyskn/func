export type AnyFunction = (...args: any) => any;

export type Maybe<T> = T | undefined;

export const isPromise = <T = any>(value: unknown): value is Promise<T> => {
	return Boolean(
		value && typeof (value as { then: unknown }).then === 'function'
	);
};
