// const stack: string[] = [];

// const callStack = {
// 	push(item: string) {
// 		stack.push(item);
// 		console.log('push', stack);
// 	},
// 	pop(wanted: string) {
// 		const popped = stack.pop();
// 		console.log({ wanted, popped });

// 		return popped;
// 	},
// 	peek() {
// 		return stack.at(-1);
// 	},
// };

// const f = async () => {
// 	callStack.push('async');

// 	console.log('---', ['async', 'at ' + callStack.peek()]);

// 	await sleep(1);

// 	console.log('---', ['async', 'at ' + callStack.peek()]);

// 	callStack.pop('async');
// };

// (async () => {
// 	callStack.push('initial');

// 	f();

// 	(() => {
// 		callStack.push('sync');

// 		console.log('---', ['sync', 'at ' + callStack.peek()]);

// 		callStack.pop('sync');
// 	})();

// 	console.log('---', ['initial', 'at ' + callStack.peek()]);

// 	callStack.pop('initial');
// })();

/**

push [ "initial" ]
push [ "initial", "async" ]

--- [ "async", "at async" ]

push [ "initial", "async", "sync" ]

--- [ "sync", "at sync" ]

{
  wanted: "sync",
  popped: "sync",
}

--- [ "initial", "at async" ]

{
  wanted: "initial",
  popped: "async",
}

--- [ "async", "at initial" ]

{
  wanted: "async",
  popped: "initial",
}

 */

export {};
