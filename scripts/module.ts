#!/usr/bin/env bun
import { Glob } from 'bun';
import path from 'path';

const glob = new Glob('**/*.ts');
const src = path.join(import.meta.dir, '../src');

const moduleNames: string[] = [];

for await (const file of glob.scan(src)) {
	if (!file.includes('index')) {
		moduleNames.push(path.parse(file).name);
	}
}

moduleNames.forEach((name) => {
	console.log(`${name}: typeof import('./${name}');`);
});
