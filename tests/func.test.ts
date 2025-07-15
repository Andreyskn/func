import { describe, expect, test } from 'bun:test';
import { func, type AsyncFuncGen } from '../src';

describe('sync', () => {
	const syncFn = func(function* (arg: string) {
		yield {
			SyncError: 'SyncError message',
			TemplateError: (v: string) => v,
			a: '',
		};
		const { error } = syncFn.utils;

		if (!arg) {
			throw yield* error.SyncError();
		}

		if (arg === 'idk') {
			throw Error('idk');
		}
		return 'no error';
	});

	test('try and fail', () => {
		expect(syncFn('').try).toThrow('SyncError message');
	});

	test('try and succeed', () => {
		expect(syncFn('1').try()).toBe('no error');
	});

	test('catch without error', () => {
		expect(
			syncFn('2').catch((err) => {
				switch (err.name) {
					case 'SyncError':
						return 'known error';
					default:
						return 'unknown error';
				}
			})
		).toBe('no error');
	});

	test('catch with defined error', () => {
		expect(
			syncFn('').catch((err) => {
				switch (err.kind) {
					case 'SyncError':
						return 'known error';
					default:
						return 'unknown error';
				}
			})
		).toBe('known error');
	});

	test('catch UnexpectedError', () => {
		expect(
			syncFn('idk').catch((err) => {
				if (err.kind === 'UnexpectedError') {
					return 'UnexpectedError';
				}
				return err;
			})
		).toBe('UnexpectedError');
	});

	test('label and rethrow unknown error', () => {
		const syncFn = func(function* () {
			yield { SyncError: 'SyncError message' };
			const { error, throws } = syncFn.utils;
			const inner = () => {
				throw Error('unknown');
			};
			yield* throws(yield* error.SyncError(), inner);
		});

		expect(syncFn().try).toThrow('SyncError message');
	});
});

describe('async', () => {
	const asyncFn = func(async function* (arg: string) {
		yield {
			AsyncError: 'AsyncError message',
			TemplateError: (v: string) => v,
			a: '',
		};
		const { error } = asyncFn.utils;
		if (!arg) {
			throw yield* error.AsyncError();
		}
		if (arg === 'idk') {
			throw Error('idk');
		}
		return 'no error';
	});

	test('try and fail', () => {
		expect(async () => await asyncFn('').try()).toThrow('AsyncError message');
	});

	test('try and succeed', async () => {
		expect(await asyncFn('1').try()).toBe('no error');
	});
});

describe('defer util', () => {
	test('basic defer is called after main', () => {
		let called = false;
		const fn = func(function* () {
			const { defer } = fn.utils;
			yield* defer(() => {
				called = true;
			});
			return 42;
		});
		const result = fn().try();
		expect(result).toBe(42);
		expect(called).toBe(true);
	});

	test('defer is called in LIFO order', () => {
		const order: number[] = [];
		const fn = func(function* () {
			const { defer } = fn.utils;
			yield* defer(() => order.push(1));
			yield* defer(() => order.push(2));
			yield* defer(() => order.push(3));
			return 'done';
		});
		fn().try();
		expect(order).toEqual([3, 2, 1]);
	});

	test('defer receives error if main throws', () => {
		let receivedError: any = undefined;
		const fn = func(function* () {
			yield { MyError: 'fail' };
			const { defer, error } = fn.utils;
			yield* defer((err) => {
				receivedError = err;
			});
			throw yield* error.MyError();
		});
		expect(() => fn().try()).toThrow('fail');
		expect(receivedError).toBeInstanceOf(Error);
		expect(receivedError.message).toBe('fail');
	});

	test('defer receives undefined if no error', () => {
		let receivedError: any = 'not called';
		const fn = func(function* () {
			const { defer } = fn.utils;
			yield* defer((err) => {
				receivedError = err;
			});
			return 123;
		});
		fn().try();
		expect(receivedError).toBe(undefined);
	});

	test('defer works with async functions', async () => {
		let called = false;
		const fn = func(async function* () {
			const { defer } = fn.utils;
			yield* defer(() => {
				called = true;
			});
			await new Promise((r) => setTimeout(r, 10));
			return 'async';
		});
		const result = await fn().try();
		expect(result).toBe('async');
		expect(called).toBe(true);
	});

	test('defer is executed in the correct context for concurrent async funcs', async () => {
		const deferCalls = new Map<{ name: string }, string>();
		const fn = func(async function* (name: string) {
			yield { Inner1: '1', Inner2: '1', Outer: '1' };
			const { defer, error } = fn.utils;

			yield* defer((err) => deferCalls.set({ name }, err!.kind));

			if (name === 'Inner1') {
				await new Promise((r) => setTimeout(r, 0));
				throw yield* error.Inner1();
			}

			if (name === 'Inner2') {
				yield* defer((err) => deferCalls.set({ name }, err!.kind));

				await new Promise((r) => setTimeout(r, 5));
				throw yield* error.Inner2();
			}

			if (name === 'Outer') {
				fn('Inner1').option();
				fn('Inner2').option();

				yield* defer((err) => deferCalls.set({ name }, err!.kind));

				await new Promise((r) => setTimeout(r, 10));
				throw yield* error.Outer();
			}
		});
		await fn('Outer').option();
		deferCalls.forEach((v, k) => {
			console.log(k.name, v);
		});

		deferCalls.forEach((v, k) => expect(k.name).toEqual(v));
	});
});

describe('option method', () => {
	test('returns value on success', () => {
		const fn = func(function* (x: number) {
			return x + 1;
		});
		expect(fn(1).option()).toBe(2);
	});

	test('returns undefined on error', () => {
		const fn = func(function* (x: number) {
			yield { MyError: 'fail' };
			if (x === 0) throw new Error('fail');
			return x + 1;
		});
		expect(fn(0).option()).toBe(undefined as any);
	});

	test('works with async success', async () => {
		const fn = func(async function* (x: number) {
			return x + 1;
		});
		expect(await fn(2).option()).toBe(3);
	});

	test('returns undefined on async error', async () => {
		const fn = func(async function* (x: number) {
			yield { MyError: 'fail' };
			if (x === 0) throw new Error('fail');
			return x + 1;
		});
		expect(await fn(0).option()).toBe(undefined as any);
	});
});

describe('result util', () => {
	test('returns ok:true and value on success', () => {
		const fn = func(function* () {
			const { result } = fn.utils;
			return yield* result(() => 42);
		});
		const result = fn().try() as { ok: true; value: number };
		expect(result).toEqual({ ok: true, value: 42 });
	});

	test('returns ok:false and error on throw', () => {
		const fn = func(function* () {
			const { result } = fn.utils;
			return yield* result(() => {
				throw new Error('fail');
			});
		});
		const result = fn().try() as { ok: false; error: any };
		expect(result.ok).toBe(false);
		expect(result.error).toBeInstanceOf(Error);
	});

	test('works with async success', async () => {
		const fn = func(async function* () {
			const { result } = fn.utils;
			return yield* result(async () => 123);
		});
		const result = (await fn().try()) as { ok: true; value: number };
		expect(result).toEqual({ ok: true, value: 123 });
	});

	test('works with async error', async () => {
		const fn = func(async function* () {
			const { result } = fn.utils;
			return yield* result(async () => {
				throw new Error('fail');
			});
		});
		const result = (await fn().try()) as { ok: false; error: any };
		expect(result.ok).toBe(false);
		expect(result.error).toBeInstanceOf(Error);
	});
});

describe('throws util', () => {
	test('rethrows with custom error', () => {
		const fn = func(function* () {
			yield { MyError: 'fail' };
			const { error, throws } = fn.utils;
			yield* throws(yield* error.MyError(), () => {
				throw new Error('inner');
			});
		});
		expect(fn().try).toThrow('fail');
	});

	test('rethrows with custom error. async', async () => {
		const fn = func(async function* (): AsyncFuncGen<
			number,
			{ MyError: string }
		> {
			yield { MyError: 'fail' };
			const { error, throws } = fn.utils;
			return yield* throws(yield* error.MyError(), async () => {
				await new Promise((r) => setTimeout(r, 0));
				if (1) throw 123;
				return 1;
			});
		});
		const result = await fn().catch((e) => e);
		expect(result).toBeInstanceOf(Error);
		expect((result as Error).message).toBe('fail');
	});
});

describe('catch method', () => {
	test('handler receives error', () => {
		const fn = func(function* () {
			yield { MyError: 'fail' };
			const { error } = fn.utils;
			if (1 === 1) throw yield* error.MyError();
			return '';
		});
		const result = fn().catch((err) => err.message);
		expect(result).toBe('fail');
	});

	test('works with async', async () => {
		const fn = func(async function* () {
			yield { MyError: 'fail' };
			const { error } = fn.utils;
			throw yield* error.MyError();
		});
		const result = await fn().catch((err) => err.message);
		expect(result).toBe('fail');
	});
});

describe('result method', () => {
	test('returns ok:true and value on success', () => {
		const fn = func(function* (x: number) {
			return x + 1;
		});
		const result = fn(2).result() as { ok: true; value: number };
		expect(result).toEqual({ ok: true, value: 3 });
	});

	test('returns ok:false and error on error', () => {
		const fn = func(function* () {
			throw new Error('fail');
		});
		const result = fn().result() as { ok: false; error: any };
		expect(result.ok).toBe(false);
		expect(result.error).toBeInstanceOf(Error);
	});

	test('works with async success', async () => {
		const fn = func(async function* (x: number) {
			return x + 1;
		});
		const result = (await fn(2).result()) as { ok: true; value: number };
		expect(result).toEqual({ ok: true, value: 3 });
	});

	test('works with async error', async () => {
		const fn = func(async function* () {
			throw new Error('fail');
		});
		const result = (await fn().result()) as { ok: false; error: any };
		expect(result.ok).toBe(false);
		expect(result.error).toBeInstanceOf(Error);
	});
});

describe('multilayer error propagation', () => {
	test('error thrown through multiple func layers', () => {
		const fn0 = func(function* () {
			yield { fn0: 'fn0 m' };
			throw new Error('initial');
		});
		const fn1 = func(function* () {
			yield { fn1: 'fn1 m' };
			fn0().try();
		});
		const fn2 = func(function* () {
			yield { fn2: 'fn2 m' };
			fn1().try();
		});
		const fn3 = func(function* () {
			yield { fn3: 'fn3 m' };
			fn2().try();
		});
		expect(() => fn3().try()).toThrow('initial');
	});

	test('custom error thrown through multiple func layers', () => {
		const fn0 = func(function* () {
			yield { fn0: 'fn0 m' };
			const { error } = fn0.utils;
			throw yield* error.fn0();
		});
		const fn1 = func(function* () {
			yield { fn1: 'fn1 m' };
			fn0().try();
		});
		const fn2 = func(function* () {
			yield { fn2: 'fn2 m' };
			fn1().try();
		});
		const fn3 = func(function* () {
			yield { fn3: 'fn3 m' };
			fn2().try();
		});
		expect(() => fn3().try()).toThrow('fn0 m');
	});
});
