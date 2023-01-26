import * as vscode from 'vscode';
import { CreatioClient } from './creatio-api/CreatioClient';
import { CreatioFileSystemProvider } from './modules/FileSystem/CreatioFileSystemProvider';
import { CreatioStatusBar } from './common/CreatioStatusBar';
import { SchemaMetaDataViewProvider } from './modules/Legacy/SchemaMetaDataViewProvider';
import { InheritanceViewProvider } from './modules/RelatedFiles/InheritanceViewProvider';
import { SchemaStructureDefinitionProvider, StructureViewProvider } from './modules/StructureView/StructureViewProvider';
import { CreatioLoginPanel } from './modules/ConnectionPanel/CreatioLoginPanel';
import { ConfigurationHelper } from './common/ConfigurationHelper';
import { HomeViewProvider } from './modules/ConnectionPanel/HomeViewProvider';
import { CreatioExplorer, CreatioExplorerDecorationProvider, CreatioExplorerItem } from './modules/FileSystem/CreatioExplorer';
import { FileSystemHelper } from './modules/FileSystem/FileSystemHelper';
import { CreatioCompletionItemProvider } from './modules/Intellisense/CreatioCompletionItemProvider';
import { ConnectionInfo } from './creatio-api/ConnectionInfo';

async function getInput(oldInput: any): Promise<ConnectionInfo | undefined> {
	const url = await vscode.window.showInputBox({
		title: 'Creatio url',
		value: oldInput?.url || "baseurl"
	});
	if (!url) {
		return undefined;
	}

	const login = await vscode.window.showInputBox({
		title: 'Creatio login',
		value: oldInput?.login || "Supervisor"
	});
	if (!login) {
		return undefined;
	}

	const password = await vscode.window.showInputBox({
		title: 'Creatio password',
		value: oldInput?.password || "Supervisor"
	});
	if (!password) {
		return undefined;
	}

	return new ConnectionInfo(url, login, password);
}

async function tryCreateConnection(): Promise<CreatioClient | null> {
	let loginData: ConnectionInfo | undefined = ConfigurationHelper.getLoginData();
	if (loginData) {
		loginData = new ConnectionInfo(loginData.url, loginData.login, loginData.password);
		let client = new CreatioClient(loginData);
		return await client.login() ? client : null;
	}
	return null;
}

async function reloadWorkSpace() {
	let connectionInfo = ConfigurationHelper.getLoginData();
	if (!connectionInfo) {
		return false;
	}
	
	let fs = CreatioFileSystemProvider.getInstance();
	let client = await tryCreateConnection();
	if (client) {
		fs.client = client;
		await fs.reload();
		CreatioExplorer.getInstance().refresh();
		await CreatioCompletionItemProvider.getInstance().init();
		// vscode.workspace.updateWorkspaceFolders(0, 0,
		// 	{
		// 		uri: vscode.Uri.file(FileSystemHelper.getDataFolder())
		// 	}
		// );
	}

	return client !== null;
}

async function createWorkspace(context: vscode.ExtensionContext) {
	let panelProvider = new CreatioLoginPanel(context);
	panelProvider.createPanel();
}

function registerFileSystem(context: vscode.ExtensionContext) {
	context.subscriptions.push(vscode.commands.registerCommand('creatiocode.createCreatioWorkspace', async () => {
		createWorkspace(context);
	}));

	context.subscriptions.push(vscode.commands.registerCommand('creatiocode.reloadCreatioWorkspace', async () => {
		reloadWorkSpace();
	}));

	// context.subscriptions.push(vscode.workspace.registerFileSystemProvider(
	// 	'creatio',
	// 	CreatioFS.getInstance(),
	// 	{ isCaseSensitive: true }
	// ));
}

function registerContextMenus(context: vscode.ExtensionContext) {
	context.subscriptions.push(vscode.commands.registerCommand('creatiocode.cacheFolder', function (folder: CreatioExplorerItem) {
		let fs = CreatioFileSystemProvider.getInstance();
		fs.cacheFolder(folder.resourceUri);
	}));

	context.subscriptions.push(vscode.commands.registerCommand('creatiocode.revertSchema', async function (file: CreatioExplorerItem) {
		let fs = CreatioFileSystemProvider.getInstance();
		await fs.restoreSchema(file.resourceUri);
	}));

	context.subscriptions.push(vscode.commands.registerCommand('creatiocode.clearCache', async function () {
		let fs = CreatioFileSystemProvider.getInstance();
		await fs.clearCache();
	}));

	context.subscriptions.push(vscode.commands.registerCommand('creatiocode.lockSchema', async (file: CreatioExplorerItem) => {
		const fs = CreatioFileSystemProvider.getInstance();
		fs.lockSchema(file.resourceUri);
	}));

	context.subscriptions.push(vscode.commands.registerCommand('creatiocode.unlockSchema', async (file: CreatioExplorerItem) => {
		const fs = CreatioFileSystemProvider.getInstance();
		fs.unlockSchema(file.resourceUri);
	}));

	context.subscriptions.push(vscode.commands.registerCommand('creatiocode.reloadSchema', async (file: CreatioExplorerItem) => {
		const fs = CreatioFileSystemProvider.getInstance();
		await fs.reloadFile(file.resourceUri);
	}));
}

export function activate(context: vscode.ExtensionContext) {
	ConfigurationHelper.init(context);
	registerFileSystem(context);
	registerContextMenus(context);

	// context.subscriptions.push(vscode.commands.registerCommand('creatiocode.executeSQL', async () => {
	// 	const client = CreatioFS.getInstance().client;
	// 	if (client) {
	// 		let sql = await vscode.window.showInputBox({
	// 			title: 'Creatio sql',
	// 			value: "select * from SysUser"
	// 		});
	// 		if (sql) {
	// 			let result = await client.selectQuery(sql);
	// 			vscode.window.showInformationMessage(result);
	// 		}
	// 	}
	// }));

	context.subscriptions.push(vscode.workspace.registerFileSystemProvider(
		'creatio',
		CreatioFileSystemProvider.getInstance(),
		{ isCaseSensitive: true }
	));
	
	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider("creatioFileInfo", new SchemaMetaDataViewProvider(context))
	);

	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider("creatioInheritance", new InheritanceViewProvider(context))
	);
	
	context.subscriptions.push(
		vscode.window.registerTreeDataProvider("creatiocode.Explorer", CreatioExplorer.getInstance())
	);

	context.subscriptions.push(
		vscode.window.registerTreeDataProvider("creatiocode.view.schemaTreeViewer", new StructureViewProvider())
	);

	context.subscriptions.push(
		vscode.window.registerFileDecorationProvider(CreatioExplorerDecorationProvider.getInstance())
	);

	context.subscriptions.push(
		vscode.commands.registerCommand("creatiocode.schemaTreeViewer.reveal", (location) => {
			const editor = vscode.window.activeTextEditor;
			if (!editor || !location) {
				return;
			}

			var start = new vscode.Position(
				location.start.line - 1,
				location.start.column,
			);
			var end = new vscode.Position(
				location.end.line - 1,
				location.end.column,
			);

			editor.selection = new vscode.Selection(start, end);
			editor.revealRange(editor.selection, vscode.TextEditorRevealType.InCenter);
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand("creatiocode.loadFile", async (uri) => {
			await vscode.commands.executeCommand("vscode.open", uri);
		})
	);

	context.subscriptions.push(
		vscode.languages.registerDefinitionProvider('javascript', SchemaStructureDefinitionProvider.getInstance())
	);

	context.subscriptions.push(
		vscode.languages.registerCompletionItemProvider('javascript', CreatioCompletionItemProvider.getInstance(), '.')
	);

	CreatioStatusBar.show('Creatio not initialized');
}

// This method is called when your extension is deactivated
export function deactivate() { }
