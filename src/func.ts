import {
	CustomError,
	DEFAULT_ERROR_KIND,
	DEFAULT_ERROR_MESSAGE,
	type DefaultErrorSet,
	type ErrorSet,
} from './error';
import {
	isObject,
	isPromise,
	type AnyFunction,
	type Maybe,
	type Replace,
} from './helpers';
import { module } from './module';
import type { UtilCommand, Utils } from './utils';

// TODO: eslint rule to to detect partially called funcs
// FIXME: yield breaks type inference

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

export type ResultReturn<
	F extends AnyFunction,
	E extends ErrorSet,
	R = ReturnType<F>
> = R extends Promise<infer V>
	? Promise<{ ok: true; value: V } | { ok: false; error: CustomError<E> }>
	: { ok: true; value: R } | { ok: false; error: CustomError<E> };

export type FuncGen<R, E extends ErrorSet> = Generator<E | UtilCommand, R>;

export type AsyncFuncGen<R, E extends ErrorSet> = AsyncGenerator<
	E | UtilCommand,
	R
>;

export type AnyFuncGen = FuncGen<any, any> | AsyncFuncGen<any, any>;

export type InferFuncGenReturn<G extends AnyFuncGen> = G extends AsyncFuncGen<
	infer R,
	any
>
	? Promise<R>
	: G extends FuncGen<infer R, any>
	? R
	: never;

export type InferFuncGenErrors<G extends AnyFuncGen> = G extends AsyncFuncGen<
	any,
	infer E
>
	? E
	: G extends FuncGen<any, infer E>
	? E
	: never;

export type FuncProcessor<
	P extends any[],
	G extends FuncGen<any, any> | AsyncFuncGen<any, any>,
	R extends any = InferFuncGenReturn<G>,
	F extends AnyFunction = (...args: P) => R,
	E extends ErrorSet = InferFuncGenErrors<G>
> = ((...args: P) => FuncProcessorMethods<F, E>) & Pick<Utils<E>, 'utils'>;

export type FuncProcessorMethods<
	F extends AnyFunction,
	E extends ErrorSet,
	ED extends ErrorSet = E & DefaultErrorSet
> = {
	try: () => ReturnType<F>;
	catch: <H extends (err: CustomError<ED>) => any>(
		handler: H
	) => CatchReturn<F, H>;
	option: () => OptionReturn<F>;
	result: () => ResultReturn<F, ED>;
};

const enum ContextResultKind {
	Promise,
	Resolved,
	Error,
}
type ContextResultBase<
	K extends ContextResultKind,
	V extends Record<string, any>
> = { kind: K } & V;

type ContextResultPromise = ContextResultBase<
	ContextResultKind.Promise,
	{ promise: Promise<any> }
>;

type ContextResultResolved = ContextResultBase<
	ContextResultKind.Resolved,
	{ value: any }
>;

type ContextResultError = ContextResultBase<
	ContextResultKind.Error,
	{ error: CustomError<any> }
>;

type ContextResult = ContextResultFinal | ContextResultPromise;

type ContextResultFinal = ContextResultResolved | ContextResultError;

export type Context = {
	id: symbol;
	generator: AnyFuncGen;
	errorSet?: Readonly<ErrorSet>;
	result?: ContextResult;
	deferred?: DeferredFn<ErrorSet>[];
	payload?: any;
	utils?: Utils<ErrorSet>;
};

export type DeferredFn<E extends ErrorSet> = (error?: CustomError<E>) => void;

function assertResult(
	ctx: Context
): asserts ctx is Replace<Context, { result: ContextResult }> {
	if (!ctx.result) {
		throw Error('Processing failed. Missing result');
	}
}

function assertResultIsFinal(
	ctx: Context
): asserts ctx is Replace<Context, { result: ContextResultFinal }> {
	assertResult(ctx);
	if (ctx.result.kind === ContextResultKind.Promise) {
		throw Error('Result is not resolved');
	}
}

export const func = <
	P extends any[],
	G extends AnyFuncGen,
	R extends any = InferFuncGenReturn<G>,
	F extends AnyFunction = (...args: P) => R,
	E extends ErrorSet = InferFuncGenErrors<G>
>(
	fn: (...args: P) => G
): FuncProcessor<P, G> => {
	const process = (ctx: Context) => {
		try {
			while (true) {
				const { payload, generator, utils } = ctx;
				ctx.payload = undefined;

				const result = generator.next(payload);

				if (isPromise(result)) {
					ctx.result = { kind: ContextResultKind.Promise, promise: result };
					break;
				}

				const { value, done } = result;

				if (done) {
					ctx.result = { kind: ContextResultKind.Resolved, value };
					break;
				}

				if (!isObject(value)) {
					throw Error(`Expected object, received "${value}"`);
				}

				if (module.utils.isUtilsCommand(value)) {
					ctx.payload = utils?.execute(value);
				} else {
					ctx.errorSet = value as E;
				}
			}
		} catch (error) {
			handleCatch(ctx, error);
		} finally {
			return handleFinally(ctx);
		}
	};

	const processAsync = async (ctx: Context) => {
		try {
			while (true) {
				const { payload, generator, result, utils } = ctx;
				ctx.payload = undefined;

				const firstYield = (result as Maybe<ContextResultPromise>)?.promise;
				ctx.result = undefined;

				const { value, done } =
					(await firstYield) ?? (await generator.next(payload));

				if (done) {
					ctx.result = { kind: ContextResultKind.Resolved, value };
					break;
				}

				if (!isObject(value)) {
					throw Error(`Expected object, received "${value}"`);
				}

				if (module.utils.isUtilsCommand(value)) {
					ctx.payload = utils?.execute(value);
				} else {
					ctx.errorSet = value as E;
				}
			}
		} catch (error) {
			handleCatch(ctx, error);
		} finally {
			return handleFinally(ctx);
		}
	};

	const handleCatch = (ctx: Context, error: unknown) => {
		if (CustomError.getOriginContextId(error) === ctx.id) {
			ctx.result = {
				kind: ContextResultKind.Error,
				error: error as CustomError<E>,
			};
			return;
		}

		const message =
			(!!error && error instanceof Error && error.message) ||
			DEFAULT_ERROR_MESSAGE;

		ctx.result = {
			kind: ContextResultKind.Error,
			error: CustomError.wrap(error, ctx.id, DEFAULT_ERROR_KIND, message),
		};
	};

	const handleFinally = (ctx: Context) => {
		assertResult(ctx);

		if (ctx.result.kind === ContextResultKind.Promise) {
			return;
		}

		if (ctx?.deferred) {
			const { deferred } = ctx;
			const errors: any[] = [];

			while (deferred.length) {
				const deferredFn = deferred.pop()! as DeferredFn<E>;

				try {
					// pass AggregateError
					deferredFn(
						ctx.result.kind === ContextResultKind.Error
							? ctx.result.error
							: undefined
					);
				} catch (e) {
					errors.push(e);
				}
			}

			if (errors.length) {
				// TODO: AggregateError https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/AggregateError
				ctx.result = { kind: ContextResultKind.Error, error: errors[0] }; // don't forget the original error
			}
		}
	};

	const processor = (...args: P) => {
		const ctx: Context = {
			id: Symbol(),
			generator: fn(...args),
		};
		Object.assign(processor, module.utils.initUtils(ctx));

		const methods: FuncProcessorMethods<F, E> = {
			try() {
				const handleResult = () => {
					assertResultIsFinal(ctx);

					if (ctx.result.kind === ContextResultKind.Error) {
						throw ctx.result.error;
					} else {
						return ctx.result.value;
					}
				};

				process(ctx);

				if (ctx.result?.kind === ContextResultKind.Promise) {
					return processAsync(ctx).then(handleResult);
				} else {
					return handleResult();
				}
			},

			catch(handler) {
				const handleResult = () => {
					assertResultIsFinal(ctx);

					if (ctx.result.kind === ContextResultKind.Error) {
						return handler(ctx.result.error);
					} else {
						return ctx.result.value;
					}
				};

				process(ctx);

				if (ctx.result?.kind === ContextResultKind.Promise) {
					return processAsync(ctx).then(handleResult);
				} else {
					return handleResult();
				}
			},

			option() {
				return this.catch(() => undefined);
			},

			result() {
				const handleResult = (result: any) => {
					if (result instanceof CustomError) {
						return { ok: false, error: result };
					} else {
						return { ok: true, value: result };
					}
				};

				const result = this.catch((error) => error);

				if (isPromise(result)) {
					return result.then(handleResult);
				} else {
					return handleResult(result);
				}
			},
		};

		return methods;
	};

	return processor as any;
};
