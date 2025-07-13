import type { func } from './func';
import type { initUtils, isUtilsCommand } from './utils';

const storeItems: {
	func?: typeof func;
	initUtils?: typeof initUtils;
	isUtilsCommand?: typeof isUtilsCommand;
} = {};

export const store = {
	get func() {
		return storeItems.func!;
	},
	setFunc: (v: typeof func) => {
		storeItems.func = v;
	},
	get initUtils() {
		return storeItems.initUtils!;
	},
	setInitUtils: (v: typeof initUtils) => {
		storeItems.initUtils = v;
	},
	get isUtilsCommand() {
		return storeItems.isUtilsCommand!;
	},
	setIsUtilsCommand: (v: typeof isUtilsCommand) => {
		storeItems.isUtilsCommand = v;
	},
};
