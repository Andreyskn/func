export type AnyFunction = (...args: any) => any;

export type Maybe<T> = T | undefined;

export type Replace<
	T extends Record<any, any>,
	R extends Partial<Record<keyof T, unknown>>
> = OmitType<T, keyof R> & R;

export type OmitType<T, K extends keyof T> = Pick<T, Exclude<keyof T, K>>;

export type ExcludeType<T, U extends T> = T extends U ? never : T;

export type ExtractType<T, U extends T> = T extends U ? T : never;

export const isPromise = <T = any>(value: unknown): value is Promise<T> => {
	return Boolean(
		value && typeof (value as { then: unknown }).then === 'function'
	);
};

export const isObject = (x: unknown): x is Record<keyof any, unknown> => {
	return !!x && typeof x === 'object' && !Array.isArray(x);
};
