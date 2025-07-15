export const module = {} as Modules;

export const setModules = (modules: Modules) => {
	Object.assign(module, modules);
};

type Modules = {
	//#region codegen scripts/module.ts
	func: typeof import('./func');
	error: typeof import('./error');
	module: typeof import('./module');
	helpers: typeof import('./helpers');
	utils: typeof import('./utils');
	//#endregion
};
