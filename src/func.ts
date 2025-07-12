import { callStack } from './callStack';
import { isPromise, type AnyFunction, type Maybe } from './common';
import {
	CustomError,
	DEFAULT_ERROR_KIND,
	DEFAULT_ERROR_MESSAGE,
	type DefaultErrorSet,
	type ErrorSet,
} from './error';
import type { DeferredFn } from './utils';

// TODO: eslint rule to to detect partially called funcs

export type Func<E extends ErrorSet, F extends AnyFunction> = (
	...args: Parameters<F>
) => FuncMethods<F, E>;

export type FuncMethods<
	F extends AnyFunction,
	E extends ErrorSet,
	EE extends ErrorSet = E & DefaultErrorSet
> = {
	try: () => ReturnType<F>;
	catch: <H extends (err: CustomError<EE>) => any>(
		handler: H
	) => CatchReturn<F, H>;
	option: () => OptionReturn<F>;
	call: () => CallReturn<F, EE>;
};

export type CatchHandlerReturn<
	H extends AnyFunction,
	R = ReturnType<H>
> = R extends void ? undefined : R;

export type CatchReturn<
	F extends AnyFunction,
	H extends AnyFunction
> = ReturnType<F> extends Promise<infer FV>
	? Promise<CatchHandlerReturn<H> | FV>
	: CatchHandlerReturn<H> | ReturnType<F>;

export type OptionReturn<
	F extends AnyFunction,
	R = ReturnType<F>
> = R extends Promise<infer V> ? Promise<Maybe<V>> : Maybe<R>;

export type CallReturn<
	F extends AnyFunction,
	E extends ErrorSet,
	R = ReturnType<F>
> = R extends Promise<infer V>
	? Promise<{ ok: true; value: V } | { ok: false; error: CustomError<E> }>
	: { ok: true; value: R } | { ok: false; error: CustomError<E> };

type Result<E extends ErrorSet, F extends AnyFunction> =
	| ResultValue<F>
	| ResultError<E>
	| ResultPromise<F>
	| ResultInitial;

type ResultValue<F extends AnyFunction> = {
	type: 'value';
	value: ReturnType<F>;
};

type ResultError<E extends ErrorSet> = {
	type: 'error';
	value: CustomError<E>;
};

type ResultPromise<F extends AnyFunction> = {
	type: 'promise';
	value: Promise<ReturnType<F>>;
};

type ResultInitial = {
	type: 'initial';
	value: undefined;
};

type ResultSettled<T extends Result<any, any>> = Exclude<T, ResultInitial>;

export function func<F extends AnyFunction>(fn: F): Func<DefaultErrorSet, F>;

export function func<E extends ErrorSet, F extends AnyFunction>(
	errors: E,
	fn: F
): Func<E, F>;

export function func<E extends ErrorSet, F extends AnyFunction>(
	errorsOrFn: E | F,
	maybeFn?: F
): Func<E, F> {
	const id = Symbol();
	const errors: ErrorSet = {};
	let fn!: F;

	if (typeof errorsOrFn === 'function') {
		fn = errorsOrFn;
	} else {
		Object.assign(errors, errorsOrFn);
		fn = maybeFn!;
	}

	const execute: <T extends Result<E, F>>(
		result: T,
		...args: Parameters<F>
	) => asserts result is ResultSettled<T> = (
		result: Result<E, F>,
		...args: Parameters<F>
	) => {
		try {
			callStack.push({ id, errors });

			const out = fn(...args);

			if (isPromise(out)) {
				result.type = 'promise';
				result.value = out
					.catch((err: any) => onError(result, err))
					.finally(() => onExit(result));
			} else {
				result.type = 'value';
				result.value = out;
			}
		} catch (err) {
			onError(result, err);
		} finally {
			if (result.type !== 'promise') {
				onExit(result);
			}
		}
	};

	const onError = (result: Result<E, F>, err: unknown) => {
		result.type = 'error';
		if (err instanceof CustomError && err.id === id) {
			result.value = err;
			return;
		}

		const message =
			(err && typeof err === 'object' && (err as any).message) ||
			DEFAULT_ERROR_MESSAGE;

		const error = CustomError.wrap(err, id, DEFAULT_ERROR_KIND, message);
		result.value = error;
	};

	const onExit = (result: Result<E, F>) => {
		const context = callStack.pop();

		if (context?.deferred) {
			const { deferred } = context;
			const errors: any[] = [];

			while (deferred.length) {
				const deferredFn = deferred.pop()! as DeferredFn<E>;

				try {
					deferredFn(result.type === 'error' ? result.value : undefined);
				} catch (e) {
					errors.push(e);
				}
			}

			if (errors.length) {
				// TODO: AggregateError https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/AggregateError
				result.type = 'error';
				result.value = errors[0]; // TODO: don't forget the previous error
			}
		}
	};

	return (...args) => ({
		try() {
			const result = {
				type: 'initial',
				value: undefined,
			} as any as ResultSettled<Result<E, F>>;
			execute(result, ...args);

			const handleSyncResult = () => {
				if (result.type === 'error') {
					throw result.value;
				}
				return result.value as ReturnType<F>;
			};

			if (result.type === 'promise') {
				return result.value.then(handleSyncResult) as ReturnType<F>;
			}

			return handleSyncResult();
		},

		catch<H extends (err: CustomError<E>) => any>(
			handler: H,
			r: Result<E, F> = {
				type: 'initial',
				value: undefined,
			}
		) {
			const result = r as any as ResultSettled<Result<E, F>>;
			execute(result, ...args);

			const handleSyncResult = () => {
				if (result.type === 'error') {
					return handler(result.value) as ReturnType<H>;
				}
				return (result as ResultValue<F>).value;
			};

			if (result.type === 'promise') {
				return result.value.then(handleSyncResult) as CatchReturn<F, H>;
			}

			return handleSyncResult() as CatchReturn<F, H>;
		},

		option() {
			return this.catch(() => undefined);
		},

		call() {
			const result: Result<E, F> = {
				type: 'initial',
				value: undefined,
			} as any as ResultSettled<Result<E, F>>;
			// FIXME:
			// @ts-ignore
			const out = this.catch((error) => error, result);

			if (isPromise(out)) {
				const result = (out as Promise<any>).then((value) => {
					return value instanceof CustomError
						? { ok: false, error: value }
						: { ok: true, value };
				});
				return result as CallReturn<F, E>;
			}

			if (result.type === 'error') {
				return { ok: false, error: result.value } as CallReturn<F, E>;
			} else {
				return { ok: true, value: result.value } as CallReturn<F, E>;
			}
		},
	});
}
