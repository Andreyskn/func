import { describe, expect, test } from 'bun:test';
import { func } from '../src/func';
import { getFuncUtils } from '../src/utils';

describe('sync', () => {
	const syncFn = func(
		{
			SyncError: 'SyncError message',
			TemplateError: (v: string) => v,
			a: '',
		},
		<T extends string>(arg: T) => {
			const { error } = getFuncUtils<typeof syncFn>();

			if (!arg) {
				throw error.SyncError();
			}
			if (arg === 'idk') {
				throw Error('idk');
			}
			return 'no error';
		}
	);

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
		const syncFn = func({ SyncError: 'SyncError message' }, () => {
			const { error, throws } = getFuncUtils<typeof syncFn>();
			const inner = () => {
				throw Error('unknown');
			};
			throws(error.SyncError(), inner);
		});

		expect(syncFn().try).toThrow('SyncError message');
	});
});

describe('async', () => {
	const asyncFn = func(
		{
			AsyncError: 'AsyncError message',
			TemplateError: (v: string) => v,
			a: '',
		},
		async (arg: string) => {
			const { error } = getFuncUtils<typeof asyncFn>();
			if (!arg) {
				throw error.AsyncError();
			}
			if (arg === 'idk') {
				throw Error('idk');
			}
			return 'no error';
		}
	);

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
		const fn = func(() => {
			const { defer } = getFuncUtils<typeof fn>();
			defer(() => {
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
		const fn = func(() => {
			const { defer } = getFuncUtils<typeof fn>();
			defer(() => order.push(1));
			defer(() => order.push(2));
			defer(() => order.push(3));
			return 'done';
		});
		fn().try();
		expect(order).toEqual([3, 2, 1]);
	});

	test('defer receives error if main throws', () => {
		let receivedError: any = undefined;
		const fn = func({ MyError: 'fail' }, () => {
			const { defer, error } = getFuncUtils<typeof fn>();
			defer((err) => {
				receivedError = err;
			});
			throw error.MyError();
		});
		expect(() => fn().try()).toThrow('fail');
		expect(receivedError).toBeInstanceOf(Error);
		expect(receivedError.message).toBe('fail');
	});

	test('defer receives undefined if no error', () => {
		let receivedError: any = 'not called';
		const fn = func(() => {
			const { defer } = getFuncUtils<typeof fn>();
			defer((err) => {
				receivedError = err;
			});
			return 123;
		});
		fn().try();
		expect(receivedError).toBe(undefined);
	});

	test('defer works with async functions', async () => {
		let called = false;
		const fn = func(async () => {
			const { defer } = getFuncUtils<typeof fn>();
			defer(() => {
				called = true;
			});
			await new Promise((r) => setTimeout(r, 10));
			return 'async';
		});
		const result = await fn().try();
		expect(result).toBe('async');
		expect(called).toBe(true);
	});

	test.only('defer is executed in the correct context for concurrent async funcs', async () => {
		const deferCalls = new Map<string, string>();
		const fn = func(
			{ Inner1: '', Inner2: '', Outer: '' },
			async (name: string) => {
				const { defer, error } = getFuncUtils<typeof fn>();

				defer((err) => deferCalls.set(name, err!.kind));

				if (name === 'Inner1') {
					await new Promise((r) => setTimeout(r, 0));
					throw error.Inner1();
				}

				if (name === 'Inner2') {
					defer((err) => deferCalls.set(name, err!.kind));

					await new Promise((r) => setTimeout(r, 5));
					throw error.Inner2();
				}

				if (name === 'Outer') {
					fn('Inner1').call();
					fn('Inner2').call();

					defer((err) => deferCalls.set(name, err!.kind));

					await new Promise((r) => setTimeout(r, 10));
					throw error.Outer();
				}
			}
		);
		await fn('Outer').call();
		deferCalls.forEach((v, k) => expect(k).toEqual(v));
	});
});

describe('option method', () => {
	test('returns value on success', () => {
		const fn = func((x: number) => x + 1);
		expect(fn(1).option()).toBe(2);
	});

	test('returns undefined on error', () => {
		const fn = func({ MyError: 'fail' }, (x: number) => {
			if (x === 0) throw new Error('fail');
			return x + 1;
		});
		expect(fn(0).option()).toBe(undefined as any);
	});

	test('works with async success', async () => {
		const fn = func(async (x: number) => Promise.resolve(x + 1));
		expect(await fn(2).option()).toBe(3);
	});

	test('returns undefined on async error', async () => {
		const fn = func({ MyError: 'fail' }, async (x: number) => {
			if (x === 0) throw new Error('fail');
			return x + 1;
		});
		expect(await fn(0).option()).toBe(undefined as any);
	});
});

describe('call util', () => {
	test('returns ok:true and value on success', () => {
		const fn = func(() => {
			const { call } = getFuncUtils<typeof fn>();
			return call(() => 42);
		});
		const result = fn().try() as { ok: true; value: number };
		expect(result).toEqual({ ok: true, value: 42 });
	});

	test('returns ok:false and error on throw', () => {
		const fn = func(() => {
			const { call } = getFuncUtils<typeof fn>();
			return call(() => {
				throw new Error('fail');
			});
		});
		const result = fn().try() as { ok: false; error: any };
		expect(result.ok).toBe(false);
		expect(result.error).toBeInstanceOf(Error);
	});

	test('works with async success', async () => {
		const fn = func(async () => {
			const { call } = getFuncUtils<typeof fn>();
			return await call(async () => 123);
		});
		const result = (await fn().try()) as { ok: true; value: number };
		expect(result).toEqual({ ok: true, value: 123 });
	});

	test('works with async error', async () => {
		const fn = func(async () => {
			const { call } = getFuncUtils<typeof fn>();
			return await call(async () => {
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
		const fn = func({ MyError: 'fail' }, () => {
			const { error, throws } = getFuncUtils<typeof fn>();
			throws(error.MyError(), () => {
				throw new Error('inner');
			});
		});
		expect(() => fn().try()).toThrow('fail');
	});

	test('throws wraps unknown error', () => {
		const fn = func({ MyError: 'fail' }, () => {
			const { error, throws } = getFuncUtils<typeof fn>();
			throws(error.MyError(), () => {
				throw 123;
			});
		});
		expect(() => fn().try()).toThrow('fail');
	});
});

describe('catch method', () => {
	test('handler receives error', () => {
		const fn = func({ MyError: 'fail' }, () => {
			const { error } = getFuncUtils<typeof fn>();
			if (1 === 1) throw error.MyError();
			return '';
		});
		const result = fn().catch((err) => err.message);
		expect(result).toBe('fail');
	});

	test('works with async', async () => {
		const fn = func({ MyError: 'fail' }, async () => {
			const { error } = getFuncUtils<typeof fn>();
			throw error.MyError();
		});
		const result = await fn().catch((err) => err.message);
		expect(result).toBe('fail');
	});
});

describe('call method', () => {
	test('returns ok:true and value on success', () => {
		const fn = func((x: number) => x + 1);
		const result = fn(2).call() as { ok: true; value: number };
		expect(result).toEqual({ ok: true, value: 3 });
	});

	test('returns ok:false and error on error', () => {
		const fn = func({ MyError: 'fail' }, () => {
			throw new Error('fail');
		});
		const result = fn().call() as { ok: false; error: any };
		expect(result.ok).toBe(false);
		expect(result.error).toBeInstanceOf(Error);
	});

	test('works with async success', async () => {
		const fn = func(async (x: number) => x + 1);
		const result = (await fn(2).call()) as { ok: true; value: number };
		expect(result).toEqual({ ok: true, value: 3 });
	});

	test('works with async error', async () => {
		const fn = func({ MyError: 'fail' }, async () => {
			throw new Error('fail');
		});
		const result = (await fn().call()) as { ok: false; error: any };
		expect(result.ok).toBe(false);
		expect(result.error).toBeInstanceOf(Error);
	});
});

describe('multilayer error propagation', () => {
	test('error thrown through multiple func layers', () => {
		const fn0 = func({ fn0: 'fn0 m' }, () => {
			throw new Error('initial');
		});
		const fn1 = func({ fn1: 'fn1 m' }, () => {
			fn0().try();
		});
		const fn2 = func({ fn2: 'fn2 m' }, () => {
			fn1().try();
		});
		const fn3 = func({ fn3: 'fn3 m' }, () => {
			fn2().try();
		});
		expect(() => fn3().try()).toThrow('initial');
	});

	test('custom error thrown through multiple func layers', () => {
		const fn0 = func({ fn0: 'fn0 m' }, () => {
			const { error } = getFuncUtils<typeof fn0>();
			throw error.fn0();
		});
		const fn1 = func({ fn1: 'fn1 m' }, () => {
			fn0().try();
		});
		const fn2 = func({ fn2: 'fn2 m' }, () => {
			fn1().try();
		});
		const fn3 = func({ fn3: 'fn3 m' }, () => {
			fn2().try();
		});
		expect(() => fn3().try()).toThrow('fn0 m');
	});
});
