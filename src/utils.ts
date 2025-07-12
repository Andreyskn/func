import { callStack } from './callStack';
import { isPromise, type AnyFunction } from './common';
import {
	CustomError,
	type DefaultErrorSet,
	type ErrorCreator,
	type ErrorSet,
} from './error';
import { func, type Func } from './func';

export type DeferredFn<E extends ErrorSet> = (error?: CustomError<E>) => void;

export type InferErrors<F extends Func<any, any>> = F extends Func<infer E, any>
	? E
	: never;

export type Utils<
	F extends Func<any, any>,
	E extends ErrorSet = InferErrors<F>,
	EE extends ErrorSet = E & DefaultErrorSet
> = {
	defer: (fn: DeferredFn<EE>) => void;
	call: <F extends () => any>(fn: F) => UtilCallReturn<F>;
} & (E extends DefaultErrorSet
	? {}
	: {
			error: {
				[K in keyof E]: E[K] extends string
					? () => CustomError<E>
					: (...args: Parameters<ErrorCreator & E[K]>) => CustomError<E>;
			};
			throws: <T>(error: CustomError<E>, fn: () => T) => T;
	  });

export type UtilCallReturn<
	F extends AnyFunction,
	R = ReturnType<F>
> = R extends Promise<infer V>
	? Promise<{ ok: true; value: V } | { ok: false; error: any }>
	: { ok: true; value: R } | { ok: false; error: any };

const getContext = () => {
	const context = callStack.peek();

	if (!context) {
		throw Error('Attempted to access FuncUtils outside of func context');
	}

	return context;
};

export const getFuncUtils = <
	F extends Func<any, any>,
	E extends ErrorSet = InferErrors<F>
>(): Utils<F> => {
	let utilsErrorCache: Utils<Func<{}, any>>['error'] | undefined;

	const utils: Utils<Func<any, any>> = {
		get error() {
			return (utilsErrorCache ??= Object.fromEntries(
				Object.entries(getContext().errors).map(([key, message]) => {
					return [
						key,
						(...args: any) =>
							CustomError.init(
								getContext().id,
								key,
								typeof message === 'string' ? message : message(...args)
							),
					];
				})
			));
		},

		defer(fn) {
			(getContext().deferred ??= []).push(fn);
		},

		throws<T>(customError: CustomError<E>, fn: () => T) {
			return func(fn)().catch((err) => {
				customError.cause = err;
				throw customError;
			}) as T;
		},

		call<F extends () => any>(fn: F) {
			return func(() => {
				const out = fn();

				if (isPromise<ReturnType<F>>(out)) {
					return out.then(
						(value) => ({ ok: true, value }),
						(error) => ({ ok: false, error })
					);
				}

				return { ok: true, value: out };
			})().catch((err: CustomError<any>) => ({
				ok: false,
				error: err.cause,
			})) as UtilCallReturn<F>;
		},
	};

	return utils as any as Utils<F>;
};
