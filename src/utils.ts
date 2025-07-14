import {
	CustomError,
	type DefaultErrorSet,
	type ErrorCreator,
	type ErrorSet,
} from './error';
import type { Context, DeferredFn } from './func';
import { isPromise, type AnyFunction } from './helpers';
import { store } from './store';

export type Utils<
	E extends ErrorSet,
	ED extends ErrorSet = E & DefaultErrorSet
> = {
	utils: {
		defer: (fn: DeferredFn<ED>) => Generator<DeferCommand, void>;
		result: <F extends () => any>(
			fn: F
		) => Generator<ResultCommand, UtilResultReturn<F>>;
	} & (E extends DefaultErrorSet
		? {}
		: {
				error: {
					[K in keyof E]: E[K] extends string
						? () => Generator<ErrorCommand, CustomError<E>>
						: (
								...args: Parameters<ErrorCreator & E[K]>
						  ) => Generator<ErrorCommand, CustomError<E>>;
				};
				throws: <T>(
					error: CustomError<E>,
					fn: () => T
				) => Generator<ThrowsCommand, T>;
		  });
	execute: (cmd: UtilCommand) => any;
};

export type UtilResultReturn<
	F extends AnyFunction,
	R = ReturnType<F>
> = R extends Promise<infer V>
	? Promise<{ ok: true; value: V } | { ok: false; error: any }>
	: { ok: true; value: R } | { ok: false; error: any };

const ERROR = Symbol('ERROR');
const DEFER = Symbol('DEFER');
const THROWS = Symbol('THROWS');
const RESULT = Symbol('RESULT');

const UTIL_SYMBOLS = [ERROR, DEFER, THROWS, RESULT] as const;

type UtilSymbol = (typeof UTIL_SYMBOLS)[number];

type UtilCommandBase<S extends UtilSymbol, T> = { kind: S; payload: T };

type ErrorCommand = UtilCommandBase<
	typeof ERROR,
	{ errorKind: string; args: any[] }
>;

type DeferCommand = UtilCommandBase<
	typeof DEFER,
	{ fn: (err?: CustomError<any>) => void }
>;

type ThrowsCommand = UtilCommandBase<
	typeof THROWS,
	{ error: CustomError<any>; fn: () => unknown }
>;

type ResultCommand = UtilCommandBase<typeof RESULT, { fn: () => unknown }>;

export type UtilCommand =
	| ErrorCommand
	| DeferCommand
	| ThrowsCommand
	| ResultCommand;

function* defer(
	fn: (err?: CustomError<any>) => void
): Generator<DeferCommand, void> {
	return yield { kind: DEFER, payload: { fn } };
}

function* result(fn: () => any): Generator<ResultCommand, any> {
	return yield { kind: RESULT, payload: { fn } };
}

function* throws(error: any, fn: () => any): Generator<ThrowsCommand, any> {
	return yield { kind: THROWS, payload: { error, fn } };
}

const error = new Proxy(
	{},
	{
		get(_, errorKind: string) {
			return function* (
				...args: any[]
			): Generator<ErrorCommand, CustomError<any>> {
				return yield { kind: ERROR, payload: { errorKind, args } };
			};
		},
	}
);

export const isUtilsCommand = (v: Record<keyof any, any>): boolean => {
	return UTIL_SYMBOLS.includes(v['kind']);
};

export const initUtils = (ctx: Context) => {
	const utils = {
		utils: {
			error,
			defer,
			throws,
			result,
		},
		execute: ({ kind, payload }: UtilCommand) => {
			switch (kind) {
				case DEFER:
					(ctx.deferred ??= []).push(payload.fn);
					break;

				case ERROR: {
					const { args, errorKind } = payload;
					const message = ctx.errorSet![errorKind];

					return CustomError.init(
						ctx.id,
						errorKind,
						typeof message === 'string' ? message : message(...args)
					);
				}

				case THROWS:
					return store
						.func(function* () {
							const out = payload.fn();

							if (isPromise(out)) {
								// TODO: test
								return out.catch((err) => {
									payload.error.cause = err;
									throw payload.error;
								});
							}

							return out;
						})()
						.catch((err) => {
							payload.error.cause = err;
							throw payload.error;
						});

				case RESULT:
					return store
						.func(function* () {
							const out = payload.fn();

							if (isPromise(out)) {
								return out.then(
									(value) => ({ ok: true, value }),
									(error) => ({ ok: false, error })
								);
							}

							return { ok: true, value: out };
						})()
						.catch((err) => ({
							ok: false,
							error: err.cause,
						}));
			}
		},
	} satisfies Utils<ErrorSet>;

	ctx.utils = utils;
	return utils;
};

store.setInitUtils(initUtils);
store.setIsUtilsCommand(isUtilsCommand);
