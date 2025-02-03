/* eslint-disable @typescript-eslint/naming-convention */
import * as http from 'http';

export enum SchemaType {
	sqlScript = 0,
	data = 1,
	dll = 2,
	entity = 3,
	clientUnit = 4,
	sourceCode = 5,
	process = 6,
	case = 7,
	processUserTask = 8,
	unknown = -1,
}

export enum ChangeState {
	unchanged = 0,
	added = 1,
	changed = 2,
}

export enum ChangeStateSchemaType {
	schemaResource = 6,
	schema = 1
}

export interface ErrorInfo {
	errorCode: any;
	message: any;
	stackTrace: any;
}

export interface PackageMetaInfo {
	createdBy: string;
	createdOn: string;
	description: string;
	id: string;
	isReadOnly: boolean;
	maintainer: string;
	modifiedBy: string;
	modifiedOn: string;
	name: string;
	position: number;
	type: number;
	uId: string;
	version: string;
}

export interface Response {
	errorInfo: null | ErrorInfo;
	success: boolean;
}

export interface GetPackageStateResponse extends Response {
	hasForeignLock: boolean;
	isOutdated: boolean;
}

export interface GetPackagesResponse extends Response {
	packages: Array<PackageMetaInfo>;
}

export interface PackageChangeEntryItem {
	cultureName: string | null;
	name: string;
	state: ChangeState;
	stateCaption: string;
	stateName: string;
	type: number;
	typeCaption: string;
	typeName: string;
	uId: string;
}

export interface PackageChangeEntry {
	items: Array<PackageChangeEntryItem>;
	name: string;
	state: ChangeState;
	stateCaption: string;
	stateName: string;
	type: number;
	typeCaption: string;
	typeName: string;
	uId: string;
}

export interface BuildResponse extends Response {
	buildResult: number;
	message: string;
	errors: Array<any> | null;
}

export interface GetWorkspaceItemsResponse extends Response {
	items: Array<WorkSpaceItem>;
}

export interface GetSchemaResponse extends Response {
	schema: Schema;
}

export interface SaveSchemaResponse extends Response {
	buildResult: Number;
	errorInfo: null | any;
	errors: null | any;
	message: null | string;
	schemaUid: string;
	success: boolean;
}

export interface ExportSchema {
	Caption: string;
	DenyExtending: boolean;
	Description: string;
	ExtendParent: boolean;
	Js?: string;
	SourceCode?: string;
	Less: string;
	LocalizableValues: Array<{		
		Culture: string;
		ImageData:string;
		Key:string;
		ResourceType:string;
		Value:string;
	}>;
	ManagerName: string;
	MetaData: string;
	Name: string;
	ParentUId: string;
	Properties: Array<{
		Name: string;
		Value: string;
	}>;
	UId: string;
	Version: string;
}

// Casts C# server schema to normal client schema. Does not map all properties!
export function CastSchemaFromeExport(expSchema: ExportSchema) : Schema {
	var schema: Schema = {
		name: expSchema.Name,
		uId: expSchema.UId,
		body: expSchema.Js ?? expSchema.SourceCode ?? "ERROR! CONTACT DEVELOPER!",
		dependencies: "",
		id: "",
		isReadOnly: false,
		package: undefined,
		caption: expSchema.LocalizableValues.filter(x => x.Key === 'Caption').map(x => { return { cultureName: x.Culture, value: x.Value };  }),
		description: [],
		localizableStrings: [],
		extendParent: expSchema.ExtendParent,
		less: expSchema.Less
	};
	return schema;
}

export interface Schema {
	name: string;
	uId: string;
	body: string | null;
	dependencies: any | null;
	id: string;
	isReadOnly: boolean;
	package: undefined | PackageMetaInfo;
	caption: Array<{ cultureName: string; value: string }>;
	description: Array<any>;
	localizableStrings: Array<{ uId: string, name: string, parentSchemaUId: string }>;
	extendParent: boolean;
	less: string | null;
}

enum ClientShemaType {
	Module = 5
	// Incomplete list
}

export interface SourceCodeSchema extends Schema {
	body: string;
}

export interface ClientUnitSchema extends Schema {
	body: string;
	schemaType: ClientShemaType;
	parent: Partial<Schema>;
	images: Array<{ uId: string, name: string, parentSchemaUId: string, isChanged: boolean }>;
	less: string;
	group: string;
	messages: Array<any>;
	parameters: Array<any>;
}

export interface EntitySchema extends Schema {
	administratedByColumns: boolean;
	administratedByOperations: boolean;
	administratedByRecords: boolean;
	columns: Array<any>;
	handledEventNames: Array<string>;
	//not completed
}

export function isSchema(object: any): object is Schema {
	return 'uId' in object
		&& 'name' in object
		&& 'body' in object
		&& 'isReadOnly' in object
		&& 'parent' in object;
}

export interface WorkSpaceItem {
	id: string;
	uId: string;
	isChanged: boolean;
	isLocked: boolean;
	isReadOnly: boolean;
	modifiedOn: string;
	name: string;
	packageName: string;
	packageRepository: string | undefined;
	packageUId: string;
	title: string | undefined;
	type: SchemaType;
}

export function isWorkspaceItem(object: any): object is WorkSpaceItem {
	return 'uId' in object
		&& 'name' in object
		&& 'type' in object
		&& 'packageName' in object
		&& 'packageUId' in object;
}

export function isBuildResponse(object: any): object is BuildResponse {
    return 'buildResult' in object;
}


export class ClientPostResponse<ResponseType extends Response> {
	body: ResponseType;
	response: http.IncomingMessage;
	constructor(body: any, response: http.IncomingMessage) {
		this.body = body;
		this.response = response;
	}
}