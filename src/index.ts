//#region codegen scripts/importer.ts
import * as error from './error';
import * as func from './func';
import * as helpers from './helpers';
import * as module from './module';
import * as utils from './utils';

module.setModules({ func, error, module, helpers, utils });
//#endregion

export type {
	CustomError,
	DEFAULT_ERROR_KIND,
	DefaultErrorSet,
	ErrorCreator,
	ErrorSet,
} from './error';
export { func } from './func';
export type {
	AnyFuncGen,
	AsyncFuncGen,
	CatchHandlerReturn,
	CatchReturn,
	DeferredFn,
	FuncGen,
	FuncProcessor,
	FuncProcessorMethods,
	InferFuncGenErrors,
	InferFuncGenReturn,
	OptionReturn,
	ResultReturn,
} from './func';
export type { AnyFunction, Maybe } from './helpers';
export type {
	DeferCommand,
	ErrorCommand,
	ResultCommand,
	ThrowsCommand,
	UTIL_SYMBOLS,
	UtilCommand,
	UtilCommandBase,
	UtilResultReturn,
	Utils,
	UtilSymbol,
} from './utils';
