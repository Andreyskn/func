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

moduleNames.filter((n) => n !== 'index');

moduleNames.forEach((name) => {
	console.log(`import * as ${name} from './${name}';`);
});

console.log(`
module.setModules({${moduleNames}})`);
