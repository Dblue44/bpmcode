import * as vscode from 'vscode';
import { Schema, WorkSpaceItem, SchemaType, BuildResponse } from '../../api/TypeDefinitions';
import { ConfigurationHelper } from '../../common/ConfigurationHelper';
import { Utils } from '../../common/Utils';
import { PushToSVNPanel } from '../SVN/PushSVNPanel';
import { SimplePanel } from '../SimplePanel/simplepanel';
import { WebviewHelper } from '../../common/WebView/WebViewHelper';
import { AppContext } from '../../globalContext';
import { wait } from 'ts-retry';
import { Entry, File, Directory } from './ExplorerItem';

export class FileSystemProvider implements vscode.FileSystemProvider {

    folders: Directory[] = [];
    files: File[] = [];
    root = new Directory('/');

    private _emitter = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
    private _bufferedEvents: vscode.FileChangeEvent[] = [];
    private _fireSoonHandle?: NodeJS.Timer;

    //#region FileSystemProvider
    writeFile(uri: vscode.Uri, content: Uint8Array, options: { create: boolean, overwrite: boolean }): void | Thenable<void> {
        let file: any = AppContext.fsHelper.read(uri);
        // Local save
        if (file && file.schema) {
            file.schema.body = content.toString();
            AppContext.fsHelper.write(file);
        }

        if (!file && options.create) {
            if (ConfigurationHelper.isFileTypeEnabled(this.getFileType(uri))) {
                // Create file
                // this._fireSoon({ type: vscode.FileChangeType.Created, uri });
                throw new Error("Not implemented");
            }
        }

        if (options.overwrite) {
            file.schema.body = content.toString();
            return this.saveFile(uri, file);
        }

        throw vscode.FileSystemError.FileNotFound();
    }

    async stat(uri: vscode.Uri): Promise<vscode.FileStat> {
        if (uri.path === "/") {
            return this.root;
        }

        let folder = this.folders.find(x => AppContext.fsHelper.getPath(x).path === uri.path);
        if (folder) {
            return folder;
        }

        let file = this.getMemFile(uri);
        if (file) {
            return file;
        } else {
            let file = await this.getFile(uri);
            await wait(50);
            return file;
        }
    }

    async readFile(uri: vscode.Uri): Promise<Uint8Array> {
        if (uri.path.includes(".vscode")) {
            return new Uint8Array(); // insert vscode settings here
        }

        let result = await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Loading file ${uri.path}`
        }, async (progress, token) => {
            let file = await this.getFile(uri);
            if (file && file.schema && file.schema.body) {
                progress.report({
                    increment: 100,
                    message: "File loaded"
                });
                return Buffer.from(file.schema.body);
            } else {
                throw vscode.FileSystemError.FileNotFound();
            }
        });
        
        // AppContext.explorer.reveal(uri);
        return result;
    }

    readDirectory(uri: vscode.Uri): [string, vscode.FileType][] {
        if (uri.path === "/") {
            return this.folders.map(x => [x.name, vscode.FileType.Directory]);
        }
        let content = this.getDirectoryContents(uri);
        return content.map(x => [x.name, x.type]);
    }

    createDirectory(uri: vscode.Uri): void {
        vscode.window.showInformationMessage("Package creation is not supported. Please use web interface.");
        throw new Error("Not implemented");
    }

    readonly onDidChangeFile: vscode.Event<vscode.FileChangeEvent[]> = this._emitter.event;

    watch(_resource: vscode.Uri): vscode.Disposable {
        // ignore, fires for all changes...
        return new vscode.Disposable(() => { });
    }

    rename(oldUri: vscode.Uri, newUri: vscode.Uri, options: { overwrite: boolean }): void {
        vscode.window.showInformationMessage("Renaming is not supported");
        throw new Error("Not implemented");
    }

    delete(uri: vscode.Uri): void {
        vscode.window.showInformationMessage("Package deletion is not supported. Please use web interface.");
        // let file = this.getMemFile(uri);
        // if (AppContext.client && AppContext.client.isConnected()) {
        //     if (file) {
        //         AppContext.client.deleteSchema([file.workSpaceItem.id]);
        //         this._fireSoon({ type: vscode.FileChangeType.Deleted, uri });
        //     } else {
        //         vscode.window.showInformationMessage("Package deletion is not supported. Please use web interface.");
        //     }
        // }
    }
    //#endregion

    commit(packageName: string, message: any) {
        vscode.window.withProgress({
            "location": vscode.ProgressLocation.Notification,
            "title": `Performing ${packageName} commit`
        }, async (progress, token) => {
            let response = await AppContext.client.commit(packageName, message);
            if (response?.success && response?.commitResult === 0) {
                vscode.window.showInformationMessage(`${packageName} commit - ${response.commitResultName}`);
            } else if (response?.commitResult !== 0) {
                vscode.window.showErrorMessage(`${packageName} commit - ${response!.commitResultName}`);
            }
        });
    }

    build() {
        vscode.window.withProgress({
            "location": vscode.ProgressLocation.Notification,
            "title": "Compiling"
        }, async (progress, token) => {
            let response = await AppContext.client?.build();
            this.processMessages(response);
        });
    }

    rebuild() {
        vscode.window.withProgress({
            "location": vscode.ProgressLocation.Notification,
            "title": "Compiling"
        }, async (progress, token) => {
            let response = await AppContext.client?.rebuild();
            this.processMessages(response);
        });
    }

    processMessages(response: BuildResponse | null) {
        if (!response?.success && response?.errors) {
            this.showErrors(response.errors);
        }
        else if (response?.message) {
            vscode.window.showInformationMessage(response?.message);
        } else {
            vscode.window.showInformationMessage("Build completed");
        }
    }

    showErrors(errors: any[]) {
        Utils.createYesNoDialouge(`Build failed with ${errors.length} errors. Show errors?`, () => {
            let tableArray = new Array<Array<string>>();
            tableArray.push(["File", "Line", "Column", "Code", "Error"]);
            errors!.forEach(error => {
                tableArray.push([error.fileName, error.line, error.column, error.errorNumber, error.errorText]);
            });

            let style = `
            <style>
                table {
                    width: 100%;
                }

                table, th, td {
                    border: 1px solid;
                    text-align: center;
                    border-collapse: collapse;
                }

                th, td {
                    padding: 5px;
                }
            </style>`;

            let panel = new SimplePanel(
                AppContext.extensionContext, 
                `Build errors ${new Date(Date.now()).toISOString()}`, 
                style + WebviewHelper.createTableString(tableArray)
            );
            panel.createPanel();
        });
    }

    generateChanges(resourceUri: vscode.Uri, context: vscode.ExtensionContext) {
        vscode.window.withProgress(
            {
                "location": vscode.ProgressLocation.Notification,
                "title": "Loading diff"
            }, async (progress, token) => {
                let memDir = this.getMemFolder(resourceUri);
                if (!memDir || !memDir.package) { return; }
                let changes = await AppContext.client?.generateChanges(memDir.package.name);
                return changes;
            }).then(changes => {
                if (changes) {
                    if (changes.length === 0) {
                        vscode.window.showInformationMessage("No changes found");
                        return;
                    }
                    // Open webview
                    let panel = new PushToSVNPanel(context, this.getMemFolder(resourceUri)!.package!.name, changes[0]);
                    panel.createPanel();
                } else {
                    vscode.window.showErrorMessage("Changes could not be generated");
                }
            });
    }

    pullChanges(resourceUri: vscode.Uri, context: vscode.ExtensionContext) {
        vscode.window.withProgress(
            {
                "location": vscode.ProgressLocation.Notification,
                "title": "Pulling from SVN"
            }, async (progress, token) => {
                let memDir = this.getMemFolder(resourceUri);
                if (!memDir || !memDir.package) { return; }
                let response = await AppContext.client?.sourceControlUpdate(memDir.package.name);
                return response;
            }).then(response => {
                if (response?.changes && response.success) {
                    if (response.changes.length === 0) {
                        vscode.window.showInformationMessage("No changes found");
                        return;
                    }
                    // Open webview
                    // let panel = new PushToSVNPanel(context, this.getMemFolder(resourceUri)!.package!.name, changes[0]);
                    // panel.createPanel();
                    // TODO: changes view
                } else {
                    vscode.window.showErrorMessage(`Changes could not be generated. ${response?.errorInfo?.message.toString() || ''}`);
                }
            });
    }

    reloadFile(resourceUri: vscode.Uri) {
        vscode.window.withProgress(
            {
                "location": vscode.ProgressLocation.Notification,
                "title": "Reloading schema"
            }, async (progress, token) => {
                const inMemFile = this.getMemFile(resourceUri);
                if (!inMemFile) { return; }
                let schema = await AppContext.client!.getSchema(inMemFile.workSpaceItem.uId, inMemFile.workSpaceItem.type);
                if (schema) {
                    inMemFile.schema = schema;
                    AppContext.fsHelper.write(inMemFile);
                    this.changeMemFile(resourceUri, inMemFile);
                } else {
                    throw vscode.FileSystemError.FileNotFound();
                }
            });
    }

    unlockSchema(resourceUri: vscode.Uri) {
        if (!AppContext.client.isConnected()) { 
            throw new Error("Client not connected"); 
        }

        const memFile = this.getMemFile(resourceUri);
        if (!memFile?.workSpaceItem) { return; }
        vscode.window.withProgress(
            {
                "location": vscode.ProgressLocation.Notification,
                "title": "Unlocking schema"
            },
            async (progress, token) => {
                let response = await AppContext.client.unlockSchema([memFile?.workSpaceItem]);
                if (response && response.success) {
                    memFile.workSpaceItem.isLocked = false;
                    await this.changeMemFile(resourceUri, memFile);
                    this._fireSoon({ type: vscode.FileChangeType.Changed, uri: resourceUri });
                    // vscode.window.showInformationMessage("Schema unlocked");
                }
            }
        );
    }

    lockSchema(resourceUri: vscode.Uri) {
        if (!AppContext.client) { return; }
        const memFile = this.getMemFile(resourceUri);
        if (!memFile?.workSpaceItem) { return; }
        vscode.window.withProgress(
            {
                "location": vscode.ProgressLocation.Notification,
                "title": "Locking schema"
            },
            async (progress, token) => {
                let response = await AppContext.client!.lockSchema([memFile?.workSpaceItem]);
                if (response && response.success) {
                    memFile.workSpaceItem.isLocked = true;
                    await this.changeMemFile(resourceUri, memFile);
                    this._fireSoon({ type: vscode.FileChangeType.Changed, uri: resourceUri });
                    // vscode.window.showInformationMessage("Schema locked");
                }
            }
        );
    }

    getUriByName(schemaName: string): vscode.Uri[] {
        let files = this.files.filter(x => x.name === `${schemaName}${ConfigurationHelper.getExtension(SchemaType.clientUnit)}`);
        return files.map(x => AppContext.fsHelper.getPath(x));
    }

    getSchemaUri(uId: string): vscode.Uri {
        let file = this.files.find(x => x.workSpaceItem.uId === uId);
        if (!file) {
            throw new Error("Schema not found");
        }
        return AppContext.fsHelper.getPath(file);
    }

    restoreSchema(uri: vscode.Uri) {
        let memFile = this.getMemFile(uri);
        if (memFile && memFile?.workSpaceItem) {
            if (memFile.workSpaceItem.isChanged) {
                vscode.window.withProgress({
                    location: vscode.ProgressLocation.Notification,
                    title: "Restoring schema"
                }, async (progress, token) => {
                    let response = await AppContext.client?.revertElements([memFile!.workSpaceItem]);
                    if (!response?.success) {
                        vscode.window.showErrorMessage(JSON.stringify(response?.errorInfo));
                        return;
                    }

                    let file = await this.getFile(uri, true);

                    if (file.schema) {
                        await this.changeMemFile(uri, file);

                        progress.report({
                            increment: 100,
                            message: "Schema restored"
                        });

                        memFile!.workSpaceItem.isChanged = false;
                        memFile!.workSpaceItem.isLocked = false;
                        this._fireSoon({ type: vscode.FileChangeType.Changed, uri });
                    }
                });
            } else {
                vscode.window.showErrorMessage("Schema is not changed!");
            }
        } else {
            vscode.window.showErrorMessage("Schema not found");
        }
    }

    clearCache() {
        Utils.createYesNoDialouge("Delete all downloaded files?", () => {
            AppContext.fsHelper.deleteDirectory(AppContext.fsHelper.cacheFolder);
            this.files = [];
            this.folders = [];
            // AppContext.explorer.refresh();
        });
    }

    cacheFolder(folder: vscode.Uri): Promise<void> {
        return new Promise((resolve, reject) => {
            Utils.createYesNoDialouge("Download package?", async () => {
                vscode.window.withProgress({
                    location: vscode.ProgressLocation.Notification,
                    cancellable: true,
                }, async (progress, token) => {
                    progress.report({
                        message: `Downloading package '${folder.path}'`,
                    });
                    let files = this.getDirectoryContents(folder);

                    for (const iterator of files) {
                        if (token.isCancellationRequested) {
                            break;
                        }
                        await this.getFile(AppContext.fsHelper.getPath(iterator), true);
                        progress.report({
                            message: `Downloading package: '${folder.path}' file: ${iterator.name}`,
                            increment: 100 / files.length
                        });
                        resolve();
                    }
                });
            });
        });
    }

    getDirectoryContents(uri: vscode.Uri): Entry[] {
        const pack = this.folders.find(x => AppContext.fsHelper.getPath(x).path === uri.path);
        if (pack?.package) {
            return this.files.filter(x => x?.workSpaceItem.packageUId === pack.package?.uId);
        } else {
            throw vscode.FileSystemError.FileNotFound();
        }
    }

    async getParentFiles(file: File, token: vscode.CancellationToken): Promise<{ files: Array<File>, cancelled: boolean }> {
        let items = [] as Array<File>;
        if (AppContext.client) {
            // Ensure loaded
            let first = await this.getFile(AppContext.fsHelper.getPath(file), true);
            if (first) {
                items.push(first);
                // @ts-ignore
                while (items[items.length - 1].schema?.parent && token.isCancellationRequested === false) {
                    // @ts-ignore
                    let newFile = await this.getFile(this.getSchemaUri(items[items.length - 1].schema?.parent.uId), true);
                    if (newFile) {
                        items.push(newFile);
                    } else {
                        break;
                    }
                }
            }
        }
        return {
            files: items,
            cancelled: token.isCancellationRequested
        };
    }

    async getRelatedFiles(workSpaceItem: WorkSpaceItem, token: vscode.CancellationToken): Promise<{ files: Array<File>, cancelled: boolean }> {
        let alikePaths = this.getUriByName(workSpaceItem.name);
        let files: File[] = alikePaths.map(uri => {
            if (!token.isCancellationRequested) {
                let file = this.getMemFile(uri);
                if (file !== undefined) {
                    return file;
                } else {
                    throw new Error("File not found");
                }
            } else {
                throw new Error("Operation cancelled");
            }
        });

        if (token.isCancellationRequested) {
            return {
                files: [] as File[],
                cancelled: true
            };
        }

        // Order files by parent-child relation
        let orderedFiles: File[] = [];
        // @ts-ignore
        let root = files.find(x => x.schema?.parent.uId === undefined);
        if (!root) {
            throw new Error("Root schema not found");
        }

        orderedFiles.push(root);

        for (let i = 0; i < files.length; i++) {
            // @ts-ignore
            let child = files.find(x => x.schema?.parent.uId === orderedFiles[i].schema?.uId);
            if (child) {
                orderedFiles.push(child);
            } else {
                break;
            }
        }

        return {
            files: files,
            cancelled: token.isCancellationRequested
        };
    }

    getMemFile(uri: vscode.Uri): File | undefined {
        return this.files.find(x => AppContext.fsHelper.getPath(x).path === uri.path);
    }

    getMemFolder(uri: vscode.Uri): Directory | undefined {
        return this.folders.find(x => AppContext.fsHelper.getPath(x).path === uri.path);
    }

    private async changeMemFile(uri: vscode.Uri, file: File) {
        const index = this.files.findIndex(x => AppContext.fsHelper.getPath(x).path === uri.path);
        this.files[index] = file;

        if (file.schema && file.schema.body) {
            vscode.window.visibleTextEditors.filter(x => x.document.uri.path === uri.path).forEach((editor) => {
                const document = vscode.window.activeTextEditor?.document;
                editor.edit(edit => {
                    edit.replace(new vscode.Range(
                        document!.lineAt(0).range.start,
                        document!.lineAt(document!.lineCount - 1).range.end
                        // @ts-ignore
                    ), file.schema!.body.toString());
                });
            });
        }

        this._fireSoon({
            type: vscode.FileChangeType.Changed,
            uri: uri
        });
    }

    private async loadFile(uri: vscode.Uri) {
        let inMemFile = this.files.find(file => AppContext.fsHelper.getPath(file).path === uri.path);
        if (!inMemFile) {
            throw vscode.FileSystemError.FileNotFound();
        }

        let schema: Schema | null;

        /* Experimental feature try at your own risk
        // Try experimental fast load
        try {
            let schemaNew = await AppContext.client!.exportSchema([inMemFile.workSpaceItem]);
            schema = CastSchemaFromExport(schemaNew);
        } catch (err) {
            // Fallback to normal slow loading method
            schema = await AppContext.client!.getSchema(inMemFile.workSpaceItem.uId, inMemFile.workSpaceItem.type);
        }
        */

        schema = await AppContext.client!.getSchema(inMemFile.workSpaceItem.uId, inMemFile.workSpaceItem.type);

        if (schema) {
            inMemFile.schema = schema;
            AppContext.fsHelper.write(inMemFile);
            return inMemFile;
        } else {
            throw vscode.FileSystemError.FileNotFound();
        }
    }

    private verificationList: vscode.Uri[] = [];
    
    private async verifyFile(uri: vscode.Uri) {
        if (this.verificationList.includes(uri)) {
            return;
        } else {
            this.verificationList.push(uri);
        }

        let localFile = AppContext.fsHelper.read(uri);
        vscode.window.withProgress({
            location: vscode.ProgressLocation.Window,
            title: `Comparing ${uri.path} to server version`,
        }, async (progress) => {
            await AppContext.client!.getSchema(localFile!.workSpaceItem.uId, localFile!.workSpaceItem.type).then(async (schema) => {
                if (schema) {
                    if (JSON.stringify(schema.body) !== JSON.stringify(localFile!.schema?.body)) {
                        Utils.createYesNoDialouge(`File on server is different from local. Pull ${schema.name} from server?`, () => {
                            localFile!.schema = schema;
                            this.changeMemFile(uri, localFile!);
                        });
                    }
                    this.verificationList.splice(this.verificationList.indexOf(uri), 1);
                } else {
                    this.verificationList.splice(this.verificationList.indexOf(uri), 1);
                    throw vscode.FileSystemError.FileNotFound();
                }
                
                this._fireSoon({
                    type: vscode.FileChangeType.Changed,
                    uri: uri
                });
            });
        });
    }



    private reconnects: string[] = [];
    /**
     * Reads file from disk or server.
     * Caches file on disk.
     * @param uri 
     * @param silent 
     * @returns 
     */
    async getFile(uri: vscode.Uri, silent: boolean = false): Promise<File> {
        if (!AppContext.client || !AppContext.client.isConnected()) {
            let connectionInfo = ConfigurationHelper.getLoginData();
            if (this.reconnects.includes(connectionInfo!.getHostName())) {
                // eslint-disable-next-line no-throw-literal
                throw "";
            }

            var isReconnect = await vscode.window.showInformationMessage(`Reconnect to ${connectionInfo?.getHostName()}`, "Reconnect", "No");
            this.reconnects.push(connectionInfo!.getHostName()); 
            if (isReconnect === "Reconnect") {
                this.reconnects.splice(this.reconnects.indexOf(connectionInfo!.getHostName()), 1);
                let success = await AppContext.reloadWorkSpace();
                if (success) {
                    return await this.getFile(uri, silent);
                } else {
                    throw new vscode.FileSystemError("Could not connect");
                }
            } else if (isReconnect === "No") {
                this.reconnects.splice(this.reconnects.indexOf(connectionInfo!.getHostName()), 1);
                Utils.closeFileIfOpen(uri);
                throw new vscode.FileSystemError("Unable to open file due to lack of connection");
            } else {
                await new Promise(resolve => setTimeout(resolve, 5000));
                return await this.getFile(uri, silent);
            }
        } else {
            let inMemFile = this.files.find(file => AppContext.fsHelper.getPath(file).path === uri.path);
            if (!inMemFile) {
                throw vscode.FileSystemError.FileNotFound();
            }

            // Try to read from disk
            let localFile = AppContext.fsHelper.read(uri);

            if (localFile && localFile.isLoaded()) {
                const minutes = 15;
                if (ConfigurationHelper.isCarefulMode() && !silent && Date.now() - inMemFile.lastSynced > minutes * 60 * 1000) {
                    this.verifyFile(uri); // File is fully loaded. Comparing to server version
                    inMemFile.lastSynced = Date.now();
                }
                return localFile;
            } else {
                // File is not loaded
                return await this.loadFile(uri);
            }
        }
    }

    private async innerReload(): Promise<boolean | undefined> {
        this.files = [];
        this.folders = [];
        AppContext.explorer.refresh();

        if (AppContext.client.isConnected()) {
            AppContext.fsHelper.root = AppContext.client.connectionInfo!.getHostName();

            let result = await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: `Loading ${AppContext.client.connectionInfo!.getHostName()}`,
                cancellable: true
            }, async (progress, token) => {

                progress.report({
                    increment: 25,
                    message: "Getting packages"
                });

                this.folders = (await AppContext.client!.getPackages()).map(x => new Directory(x.name, x));
                if (this.folders.length === 0) {
                    vscode.window.showErrorMessage("No available packages found");
                    return false;
                }

                if (token.isCancellationRequested) {
                    return undefined;
                }

                progress.report({
                    increment: 25,
                    message: "Getting workspace items"
                });

                this.files = (await AppContext.client!.getWorkspaceItems()).map(x => new File(AppContext.fsHelper.withExtension(x), x));
                if (this.files.length === 0) {
                    vscode.window.showErrorMessage("No available schemas found");
                    return false;
                }

                progress.report({
                    increment: 25,
                    message: "Forming workspace"
                });

                this.files = this.files.filter(x =>
                    ConfigurationHelper.isFileTypeEnabled(x.workSpaceItem.type)
                );

                this.folders.forEach(element => {
                    const uri = AppContext.fsHelper.getPath(element);
                    const baseDir = AppContext.fsHelper.getBaseDir(uri);

                    this._fireSoon(
                        { type: vscode.FileChangeType.Changed, uri: baseDir },
                        { type: vscode.FileChangeType.Created, uri: uri }
                    );
                });

                this.files.forEach(file => {
                    file.mtime = Date.now();
                    AppContext.fsHelper.update(file);
                    this._fireSoon({
                        type: vscode.FileChangeType.Created,
                        uri: AppContext.fsHelper.getPath(file)
                    });
                });

                // Fix to update opened files
                vscode.window.visibleTextEditors.forEach(editor => {
                    if (editor.document.uri.scheme === "bpmsoft") {
                        this._fireSoon({
                            type: vscode.FileChangeType.Changed,
                            uri: editor.document.uri
                        });
                    }
                });

                progress.report({
                    increment: 25,
                    message: "Filesystem loaded"
                });

                this.reloadPromise = undefined;
                return true;
            });

            return result;
        }
    }

    private reloadPromise?: Promise<boolean | undefined>;
    reload(): Promise<boolean | undefined> {
        if (!this.reloadPromise) {
            this.reloadPromise = this.innerReload();
        }
        return this.reloadPromise;
    }

    getFileType(uri: vscode.Uri): SchemaType;
    getFileType(fileName: String): SchemaType;
    getFileType(uri: any): SchemaType {
        if (uri instanceof vscode.Uri) {
            let fileName = uri.toString().split('/').pop();
            if (fileName) {
                return this.getFileType(fileName);
            } else {
                return SchemaType.unknown;
            }
        } else if (uri instanceof String) {
            ConfigurationHelper.getSchemaTypeByExtension(uri.toString());
        }
        return SchemaType.unknown;
    }

    async saveFile(uri: vscode.Uri, file: File): Promise<void> {
        if (!file.schema) {
            return;
        }

        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Saving file ${file.name}`
        }, async (progress, token) => {
            file.workSpaceItem.modifiedOn = Date.now().toString();
            const response = await AppContext.client?.saveSchema(file.schema!, file.workSpaceItem.type);
            if (!response || response.success === false) {
                vscode.window.showErrorMessage("Error saving file");
            } else {
                progress.report({
                    increment: 100,
                    message: `${file.name} saved`
                });
                vscode.window.showInformationMessage(`${file.name} saved`);

                let memFile = this.getMemFile(uri);
                memFile!.mtime = Date.now();
                memFile!.workSpaceItem.isChanged = true;
                memFile!.workSpaceItem.isLocked = true;
                this._fireSoon({ type: vscode.FileChangeType.Changed, uri });
            }
        });
    }

    private _fireSoon(...events: vscode.FileChangeEvent[]): void {
        this._bufferedEvents.push(...events);

        if (this._fireSoonHandle) {
            clearTimeout(this._fireSoonHandle);
        }

        this._fireSoonHandle = setTimeout(() => {
            this._emitter.fire(this._bufferedEvents);
            this._bufferedEvents.length = 0;
        }, 5);
    }
}