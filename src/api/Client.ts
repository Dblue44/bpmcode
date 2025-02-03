/* eslint-disable @typescript-eslint/naming-convention */
import * as vscode from 'vscode';
import * as BPMSoft from './TypeDefinitions';
import { retryAsync, wait } from 'ts-retry';
import { createAsyncQueue } from '../common/AsyncQueue';
import { ConfigurationHelper } from '../common/ConfigurationHelper';
import { ConnectionInfo } from './ConnectionInfo';
import { DesignerReqestType, DesignerServiceEndpoints, DesignerServiceMethods, Endpoints, ReqestType } from './Endpoints';
import { HttpHelper } from '../common/HttpHelper';

export class ApiClient {
	cookies: Array<string> = [];
	connectionInfo?: ConnectionInfo;

	private requestQueue = createAsyncQueue<any>();

	isConnected() {
		return this.connectionInfo !== undefined && this.getBPMCSRF() !== null;
	}

	private getBPMCSRF(): string {
		let cookie = this.cookies.find((x: string) => x.startsWith('BPMCSRF'));
		if (cookie) {
			return cookie.split(';')[0].split('=')[1];
		} else {
			throw new Error("Client not connected");
		}
	}

	sendApiRequest(path: string, postData: any = null): Promise<any> {
		if (!this.isConnected()) {
			throw new Error("Client not connected");
		}

		return HttpHelper.Post(this.connectionInfo!, path, postData, {
			'BPMCSRF': this.getBPMCSRF(),
			'Cookie': this.cookies.join(';'),
		});
	}

	async retrySendApiRequest<ResponseType extends BPMSoft.Response>(path: string, postData: any = null): Promise<BPMSoft.ClientPostResponse<ResponseType>> {
		if (!this.isConnected()) {
			throw new Error("Client not connected");
		}

		if (!this.cookies || this.cookies.length === 0 || this.isConnected() === false) {
			await this.login(this.connectionInfo!);
		}

		let response = await retryAsync(() => this.sendApiRequest(path, postData), ConfigurationHelper.getRetryPolicy());

		if (response.response.statusCode === 401) {
			await this.login(this.connectionInfo!);
			return await this.retrySendApiRequest(path, postData);
		} else if (response.response.statusCode !== 200) {
			console.error(response.body);
			throw Error(response.response.statusMessage);
		}

		if (!HttpHelper.isJSON(response.body)) {
			console.error(response.body);
			throw new Error("Provided response is not a valid JSON string. See console for details.");
		}

		response.body = JSON.parse(response.body);

		// Skip error handling for build response
		if (BPMSoft.isBuildResponse(response.body)) {
			return response as BPMSoft.ClientPostResponse<ResponseType>;
		}

		if (response.body.success === false) {
			console.error(response.body);
			throw Error(response.body.errorInfo.message);
		}

		return response as BPMSoft.ClientPostResponse<ResponseType>;
	}

	async enqueueRequest<ResponseType extends BPMSoft.Response>(endpoint: string, data?: any): Promise<ResponseType | null> {
		try {
			return this.requestQueue.push(async () => { return (await this.retrySendApiRequest<ResponseType>(endpoint, data)).body; });
		} catch (err: any) {
			console.error(err);
			vscode.window.showErrorMessage(err.message || err.body);
			return null;
		}
	}

	async enqueueCommand<ResponseType extends BPMSoft.Response>(type: ReqestType, data?: any): Promise<ResponseType | null> {
		try {
			return this.requestQueue.push(async () => { return (await this.retrySendApiRequest<ResponseType>(Endpoints[type], data)).body; });
		} catch (err: any) {
			console.error(err);
			vscode.window.showErrorMessage(err.message || err.body);
			return null;
		}
	}

	private async tryLogin(connectionInfo: ConnectionInfo) {
		const data = {
			"UserName": connectionInfo.login,
			"UserPassword": connectionInfo.password
		};

		if (!this.connectionInfo) {
			throw new Error("No connection information provided.");
		}

		const retryPolicy = ConfigurationHelper.getRetryPolicy();
		let response = await retryAsync(async () => {
			let endpoint = Endpoints[ReqestType.Login];
			return await HttpHelper.Post(this.connectionInfo!, endpoint, data);
		}, 
		retryPolicy);

		if (response.response.statusCode !== 200) {
			console.error(response.body);
			throw Error(`Http error: ${response.response.statusMessage}`);
		}

		if (response.body.Code === 1) {
			throw Error(response.body.Message);
		}

		this.cookies = response.response.headers['set-cookie'];
		return response;
	}

	async login(connectionInfo: ConnectionInfo): Promise<boolean> {
		this.connectionInfo = connectionInfo;
		let response = await this.tryLogin(connectionInfo);
		return response ? true : false;
	}

	async revertElements(schemas: Array<BPMSoft.WorkSpaceItem>): Promise<BPMSoft.Response | null> {
		let response = await this.enqueueCommand<BPMSoft.GetPackagesResponse>(ReqestType.RevertElements, schemas);
		return response;
	}

	async getPackages(): Promise<Array<BPMSoft.PackageMetaInfo>> {
		let response = await this.enqueueCommand<BPMSoft.GetPackagesResponse>(ReqestType.GetPackages);
		return response ? response.packages : [];
	}

	async unlockSchema(items: BPMSoft.WorkSpaceItem[]): Promise<BPMSoft.Response | null> {
		let response = await this.enqueueCommand<BPMSoft.GetPackagesResponse>(ReqestType.UnlockPackageElements, items);
		return response;
	}

	async lockSchema(items: BPMSoft.WorkSpaceItem[]): Promise<BPMSoft.Response | null> {
		let response = await this.enqueueCommand<BPMSoft.GetPackagesResponse>(ReqestType.LockPackageElements, items);
		return response;
	}

	async generateChanges(packageName: string): Promise<BPMSoft.PackageChangeEntry[] | null> {
		const payload = {
			"packageName": packageName
		};
		let response = await this.enqueueCommand<BPMSoft.GenerateChangesResponse>(ReqestType.GenerateChanges, payload);
		return response ? response.changes : null;
	}

	async getWorkspaceItems(): Promise<Array<BPMSoft.WorkSpaceItem>> {
		let response = await this.enqueueCommand<BPMSoft.GetWorkspaceItemsResponse>(ReqestType.GetWorkspaceItems);
		return response ? response.items : [];
	}

	private getDesignerServicePath(type: BPMSoft.SchemaType, methodType: DesignerReqestType): string {
		return `${DesignerServiceEndpoints[type]}${DesignerServiceMethods[methodType]}`;
	}

	async getSchema(schemaUId: string, type: BPMSoft.SchemaType): Promise<BPMSoft.Schema | null> {
		const payload = {
			"schemaUId": schemaUId
		};

		let svcPath = this.getDesignerServicePath(type, DesignerReqestType.GetSchema);

		let response = await this.enqueueRequest<BPMSoft.GetSchemaResponse>(svcPath, payload);
		return response ? response.schema : null;
	}

	async saveSchema(schema: BPMSoft.Schema, type: BPMSoft.SchemaType): Promise<BPMSoft.SaveSchemaResponse | null> {
		let svcPath = this.getDesignerServicePath(type, DesignerReqestType.SaveSchema);
		return await this.enqueueRequest<BPMSoft.SaveSchemaResponse>(svcPath, schema);
	}

	async build(): Promise<BPMSoft.BuildResponse | null> {
		let response = await this.enqueueCommand<BPMSoft.BuildResponse>(ReqestType.Build);
		return response;
	}

	async rebuild(): Promise<BPMSoft.BuildResponse | null> {
		let response = await this.enqueueCommand<BPMSoft.BuildResponse>(ReqestType.Rebuild);
		return response;
	}

	async commit(packageName: string, logMessage: string) {
		const payload = {
			"packageName": packageName,
			"logMessage": logMessage
		};
		let response = await this.enqueueCommand<BPMSoft.CommitResponse>(ReqestType.Commit, payload);
		return response;
	}

	async getPackageState(packageName: string) {
		const payload = {
			"packageName": packageName,
		};
		let response = await this.enqueueCommand<BPMSoft.GetPackageStateResponse>(ReqestType.GetPackageState, payload);
		return response;
	}

	async exportSchema(workspaceItems: BPMSoft.WorkSpaceItem[]): Promise<BPMSoft.ExportSchema> {
		let response = await this.sendApiRequest(Endpoints[ReqestType.ExportSchema], workspaceItems);
		var json = JSON.parse(response.body.replace(/(\r\n|\n|\r)/gm, ""));
		return json;
	}

	async sourceControlUpdate(packageName: string) {
		const payload = {
			"packageName": packageName,
		};
		let response = await this.enqueueCommand<BPMSoft.GenerateChangesResponse>(ReqestType.Update, payload);
		return response;
	}

	/**
	 * UNUSED. METHODS IN DEVELOPMENT
	 */
	private async getZipPackages(packageNames: string[]) {
		let response = await this.enqueueCommand<BPMSoft.Response>(ReqestType.GetZipPackages, packageNames);
		return response;
	}

	private async selectQuery(sql: string): Promise<any> {
		const payload = {
			"script": sql
		};
		let response = await this.retrySendApiRequest<BPMSoft.Response>('/0/DataService/json/SyncReply/SelectQuery', payload);
		return response?.body;
	}

	private async getCurrentUserInfo() {
		try {
			return await this.sendApiRequest(Endpoints[ReqestType.GetCurrentUserInfo]);
		} catch (err: any) {
			vscode.window.showErrorMessage(err.message);
			return err;
		}
	}

	private async getApplicationInfo() {
		try {
			return await this.sendApiRequest(Endpoints[ReqestType.GetApplicationInfo]);
		} catch (err: any) {
			vscode.window.showErrorMessage(err.message);
			return err;
		}
	}

	/**
	  * 
	* @param {String} packageName 
	* @returns 
	*/
	private async updatePackage(packageName: string) {
		const postData = {
			"packageName": packageName,
		};
		try {
			return await this.sendApiRequest('/0/ServiceModel/SourceControlService.svc/Update', postData);
		} catch (err: any) {
			vscode.window.showErrorMessage(err.message);
			return err;
		}
	}

	/**
	 * 
	 * @returns Repository data array
	 */
	private async getRepositories() {
		try {
			return await this.sendApiRequest('/0/ServiceModel/SourceControlService.svc/GetRepositories');
		} catch (err: any) {
			vscode.window.showErrorMessage(err.message);
			return err;
		}
	}

	private async querySysSettings(settingNames: Array<String>): Promise<any> {
		const postData = {
			"sysSettingsNameCollection": settingNames
		};
		try {
			return await this.sendApiRequest('/0/DataService/json/SyncReply/QuerySysSettings', postData);
		} catch (err: any) {
			vscode.window.showErrorMessage(err.message);
			return err;
		}
	}

	private async getSchemaMetaData(schemaUId: String, packageUId: String, schemaType: Number = 4) {
		const postData = {
			schemaUId: schemaUId,
			packageUId: packageUId,
			schemaType: schemaType
		};
		try {
			return await this.sendApiRequest('/0/ServiceModel/SchemaMetaDataService.svc/GetSchemaMetaData', postData);
		} catch (err: any) {
			vscode.window.showErrorMessage(err.message);
			return err;
		}
	}

	private async getAvailableParentSchemas(packageUId: String, schemaType: Number = 2, allowExtended = false) {
		const postData = {
			"packageUId": packageUId,
			"allowExtended": allowExtended,
			"schemaType": schemaType
		};

		try {
			return await this.sendApiRequest('/0/DataService/json/SyncReply/QuerySysSettings', postData);
		} catch (err: any) {
			vscode.window.showErrorMessage(err.message);
			return err;
		}
	}

	private async deleteSchema(schemaDatas: Array<any>) {
		throw new Error('Not implemented');
	}

	private async getAvailableReferenceSchemas(id: string) {
		try {
			return await this.sendApiRequest('/0/ServiceModel/EntitySchemaDesignerService.svc/GetAvailableReferenceSchemas', id);
		} catch (err: any) {
			vscode.window.showErrorMessage(err.message);
			return err;
		}
	}

	private async getPackageProperties(id: string) {
		try {
			return await this.sendApiRequest('/0/ServiceModel/PackageService.svc/GetPackageProperties', id);
		} catch (err: any) {
			vscode.window.showErrorMessage(err.message);
			return err;
		}
	}

	private async getSchemaNamePrefix() {
		return (await this.querySysSettings(["SchemaNamePrefix"])).body.values.SchemaNamePrefix;
	}
}