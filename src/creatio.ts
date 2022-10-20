/* eslint-disable @typescript-eslint/naming-convention */
import * as vscode from 'vscode';
import * as http from 'http';

export class SchemaMetaInfo {
	constructor(data: Partial<SchemaMetaInfo>) {
        Object.assign(this, data);
    }

	id: string = "";
	uId: string = "";
	isChanged: boolean = false;
	isLocked: boolean = false;
	isReadOnly: boolean = false;
	modifiedOn: string = "";
	name: string = "";
	packageName: string = "";
	packageRepository: any;
	packageUId: string = "";
	title: string = "";
	type: number = 4;
	
	getFile(): string {
		switch (this.type) {
            case 4:
                return this.name + ".js";
            default:
                return this.name;
                break;
        } 
	}
}

export class ClientPostResponse {
	body: any;
	response: http.IncomingMessage;
	constructor(body: any, response: http.IncomingMessage) {
		this.body = body;
		this.response = response;
	}
}

//Used in some functions. Usage undetetmined
const SchemaType =
{
	OBJECT: 0,
	GREEN: 'green',
	BLUE: 'blue'
};

export class CreatioClient {
	cookies: any;
	userAgent: string = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/80.0.3987.132 Safari/537.36";
	credentials: any;

	constructor(credentials: any) {
		this.credentials = credentials;
	}

	sendPost(path: string, postData: any = null): any {
		return new Promise((resolve, reject) => {
			if (postData) { postData = JSON.stringify(postData); }

			var options = {
				host: this.credentials.url,
				path: path,
				method: 'POST',
				headers: {
					'Accept': 'application/json',
					'Content-Type': 'application/json',
					'Content-Length': postData ? Buffer.byteLength(postData) : 0,
				}
			};

			const req = http.request(options, (response) => {
				var str = '';
				response.on('data', function (chunk) {
					str += chunk;
				});

				response.on('end', function () {
					resolve({
						response: response,
						body: JSON.parse(str)
					});
				});
			});

			req.on('error', reject);

			if (postData) { req.write(postData); }
			req.end();
		});
	}

	getBPMCSRF() {
		return this.cookies.find( (x: any) => x.startsWith('BPMCSRF')).split(';')[0].split('=')[1];
	}

	sendClientPost(path: string, postData: any = null, contentType = 'application/json'): Promise<any> {
		return new Promise((resolve, reject) => {
			if (postData) { postData = JSON.stringify(postData); }

			var options = {
				host: this.credentials.url,
				path: path,
				method: 'POST',
				headers: {
					'Accept': 'application/json, text/plain, */*',
					'Content-Length': postData ? Buffer.byteLength(postData) : 0,
					'BPMCSRF': this.getBPMCSRF(),
					"User-Agent": this.userAgent,
					"Cookie": this.cookies.join(';'),
					"Content-Type": contentType
				},
				mode: "cors",
				credentials: "include"
			};

			const req = http.request(options, (response) => {
				var str = '';
				response.on('data', function (chunk) {
					str += chunk;
				});

				response.on('end', function () {
					try {
						resolve({
							response: response,
							body: str
						});
					} catch (err) {
						reject(err);
					}

				});

			});

			req.on('error', x => reject(x));

			if (postData) { req.write(postData); }
			req.end();
		});
	}

	/**
	 * 
	 * @returns {Promise<boolean>}
	 */
	async connect() {
		const postData = {
			"UserName": this.credentials.login,
			"UserPassword": this.credentials.password
		};
		let response = await this.sendPost('/ServiceModel/AuthService.svc/Login', postData);
		this.cookies = response.response.headers['set-cookie'];
		let flag = response.body.Message === "";
		if (flag) {
			vscode.window.showInformationMessage('Connected to Creatio');
		} else {
			vscode.window.showErrorMessage('Invalid login or password');
		}
		return flag;
	}

	async getCurrentUserInfo() {
		try {
			return await this.sendClientPost('/0/ServiceModel/UserInfoService.svc/GetCurrentUserInfo');
		} catch (err: any) {
			vscode.window.showErrorMessage(err.message);
			return err;
		}
	}

	async getApplicationInfo() {
		try {
			return await this.sendClientPost('/0/ServiceModel/ApplicationInfoService.svc/GetApplicationInfo');
		} catch (err: any) {
			vscode.window.showErrorMessage(err.message);
			return err;
		}
	}

	async getPackages() {
		try {
			return await this.sendClientPost('/0/ServiceModel/PackageService.svc/GetPackages');
		} catch (err: any) {
			vscode.window.showErrorMessage(err.message);
			return err;
		}
	}
	
	isJSON(text: string): any {
		try {
			JSON.parse(text);
		} catch (e) {
			return false;
		}
		return true;
	}

	async trySendClientPost(path: string, postData: any = null): Promise<ClientPostResponse | null>  {
		try {
			let response = await this.sendClientPost(path, postData);

			if (response.response.statusCode !== 200) {
				throw new Error("Bad request: " + response.response.statusCode);
			} 
			if (!this.isJSON(response.body)) {
				throw new Error("Invalid JSON string: \n" + response.body);
			}
			response.body = JSON.parse(response.body);
			if(!response.body.success) {
				throw new Error("Bad response: " + response.body.errorInfo.errorCode);
			}
			return response;
		} catch (err: any) {
			console.error(err);
			vscode.window.showErrorMessage("Error proccessing server response. See logs for details.");
			return null;
		}
	}

	async getWorkspaceItems(): Promise<Array<SchemaMetaInfo>> {
		let response = await this.trySendClientPost('/0/ServiceModel/WorkspaceExplorerService.svc/GetWorkspaceItems');
		return response ? response.body.items.map((x: any) => { return new SchemaMetaInfo(x) }) : [];
	}

	async getSchemaBuffer(schemaUId: string): Promise<Uint8Array> {
		return Buffer.from(await this.getSchema(schemaUId));
	}
	
	async getSchema(schemaUId: string): Promise<string> {
        const payload = {
            "schemaUId": schemaUId
        };
		let response = await this.trySendClientPost('/0/ServiceModel/ClientUnitSchemaDesignerService.svc/GetSchema', payload);
		return response ? response.body.schema.body : `Error loading document with uId = ${schemaUId}. Try reloading workplace.`;
	}

	async build() {
		try {
			return await this.sendClientPost('/0/ServiceModel/WorkspaceExplorerService.svc/Build');
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
	async getPackageState(packageName: string) {
		const postData = {
			"packageName": packageName,
		};
		try {
			return await this.sendClientPost('/0/ServiceModel/SourceControlService.svc/GetPackageState', postData);
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
	async updatePackage(packageName: string) {
		const postData = {
			"packageName": packageName,
		};
		try {
			return await this.sendClientPost('/0/ServiceModel/SourceControlService.svc/Update', postData);
		} catch (err: any) {
			vscode.window.showErrorMessage(err.message);
			return err;
		}
	}

	async exportSchema(schemaDatas: Array<any>) {
		try {
			return await this.sendClientPost('/0/ServiceModel/SourceControlService.svc/GetPackageState', schemaDatas);
		} catch (err: any) {
			vscode.window.showErrorMessage(err.message);
			return err;
		}
	}

	/**
	 * 
	 * @returns Repository data array
	 */
	async getRepositories() {
		try {
			return await this.sendClientPost('/0/ServiceModel/SourceControlService.svc/GetRepositories');
		} catch (err: any) {
			vscode.window.showErrorMessage(err.message);
			return err;
		}
	}

	async querySysSettings(settingNames: Array<String>): Promise<any> {
		const postData = {
			"sysSettingsNameCollection": settingNames
		};
		try {
			return await this.sendClientPost('/0/DataService/json/SyncReply/QuerySysSettings', postData);
		} catch (err: any) {
			vscode.window.showErrorMessage(err.message);
			return err;
		}
	}

	async getSchemaMetaData(schemaUId: String, packageUId: String, schemaType: Number = 4) {
		const postData = {
			schemaUId: schemaUId,
			packageUId: packageUId,
			schemaType: schemaType
		};
		try {
			return await this.sendClientPost('/0/ServiceModel/SchemaMetaDataService.svc/GetSchemaMetaData', postData);
		} catch (err: any) {
			vscode.window.showErrorMessage(err.message);
			return err;
		}
	}

	async getAvailableParentSchemas(packageUId: String, schemaType: Number = 2, allowExtended = false) {
		const postData = {
			"packageUId": packageUId,
			"allowExtended": allowExtended,
			"schemaType": schemaType
		};

		try {
			return await this.sendClientPost('/0/DataService/json/SyncReply/QuerySysSettings', postData);
		} catch (err: any) {
			vscode.window.showErrorMessage(err.message);
			return err;
		}
	}

	async deleteSchema(schemaDatas: Array<any>) {
		try {
			return await this.sendClientPost('/0/ServiceModel/ClientUnitSchemaDesignerService.svc/SaveSchema', schemaDatas);
		} catch (err: any) {
			vscode.window.showErrorMessage(err.message);
			return err;
		}
	}

	async saveSchema(schema: any) {
		try {
			return await this.sendClientPost('/0/ServiceModel/ClientUnitSchemaDesignerService.svc/SaveSchema', schema);
		} catch (err: any) {
			vscode.window.showErrorMessage(err.message);
			return err;
		}
	}

	async getAvailableReferenceSchemas(id: string) {
		try {
			return await this.sendClientPost('/0/ServiceModel/EntitySchemaDesignerService.svc/GetAvailableReferenceSchemas', id);
		} catch (err: any) {
			vscode.window.showErrorMessage(err.message);
			return err;
		}
	}

	async getPackageProperties(id: string) {
		try {
			return await this.sendClientPost('/0/ServiceModel/PackageService.svc/GetPackageProperties', id);
		} catch (err: any) {
			vscode.window.showErrorMessage(err.message);
			return err;
		}
	}

	async getSchemaNamePrefix() {
		return (await this.querySysSettings(["SchemaNamePrefix"])).body.values.SchemaNamePrefix;
	}
}