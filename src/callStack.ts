import type { ErrorSet } from './error';
import type { DeferredFn } from './utils';

type Context = {
	readonly id: symbol;
	readonly errors: Readonly<ErrorSet>;
	deferred?: DeferredFn<ErrorSet>[];
};

// FIXME: The callStack is a global mutable array.
// Issue: This can cause issues in concurrent or async-heavy environments (e.g., serverless, web servers).
// Suggestion: Consider using context-local storage (like AsyncLocalStorage in Node.js) for better isolation.
const stack: Context[] = [];

export const callStack = {
	push(context: Context) {
		stack.push(context);
	},
	pop() {
		return stack.pop();
	},
	peek() {
		return stack.at(-1);
	},
};
