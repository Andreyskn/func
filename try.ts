import { func, type AsyncFuncGen } from './src';

type SyncFnErrors = {
	SyncError: string;
	TemplateError: (v: string) => string;
};

const syncFn = func(async function* (
	arg: string
): AsyncFuncGen<string, SyncFnErrors> {
	yield {
		SyncError: 'SyncError message',
		TemplateError: (v: string) => v,
	};

	const { error, defer, result, throws } = syncFn.utils;

	if (!arg) {
		const r = yield* throws(yield* error.TemplateError('AAA'), async () => {
			await new Promise((r) => setTimeout(r, 10));
			// if (1 + 1) throw 123;
			return 'asdasd';
		});
		// console.log(r);

		throw yield* error.SyncError();
	}

	if (arg === 'idk') {
		throw Error('idk');
	}

	return 'no error';
});

// TODO: fix stack trace
const result = await syncFn('').try();
console.log(result);
