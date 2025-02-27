import * as vscode from 'vscode';
import { StructureViewProvider } from './modules/StructureView/StructureViewProvider';
import { AppContext } from './globalContext';
import { ExplorerItem } from './modules/FileSystem/ExplorerItem';
// import { FileCountDecorationProvider } from './modules/FileSystem/FileDecorationProvider';

function registerFileSystem(context: vscode.ExtensionContext) {
	context.subscriptions.push(vscode.workspace.registerFileSystemProvider(
		AppContext.fileSystemName,
		AppContext.fsProvider,
		{ isCaseSensitive: true }
	));

	context.subscriptions.push(vscode.commands.registerCommand('bpmcode.createWorkspace', async () => {
		AppContext.createWorkspace(context);
	}));

	context.subscriptions.push(vscode.commands.registerCommand('bpmcode.reloadWorkspace', async () => {
		AppContext.reloadWorkspace();
	}));
}

function registerContextMenus(context: vscode.ExtensionContext) {
	context.subscriptions.push(vscode.commands.registerCommand('bpmcode.cacheFolder', function (folder: ExplorerItem) {
		AppContext.fsProvider.cacheFolder(folder.resourceUri);
	}));

	context.subscriptions.push(vscode.commands.registerCommand('bpmcode.revertSchema', async function (file: ExplorerItem) {
		await AppContext.fsProvider.restoreSchema(file.resourceUri);
	}));

	context.subscriptions.push(vscode.commands.registerCommand('bpmcode.clearCache', async function () {
		await AppContext.fsProvider.clearCache();
	}));

	context.subscriptions.push(vscode.commands.registerCommand('bpmcode.reloadSchema', async (file: ExplorerItem) => {
		await AppContext.fsProvider.reloadFile(file.resourceUri);
	}));
}

function registerIntellisense(context: vscode.ExtensionContext) {
	context.subscriptions.push(
		vscode.languages.registerDefinitionProvider('javascript', AppContext.schemaStructureDefinitionProvider)
	);

	context.subscriptions.push(
		vscode.languages.registerCompletionItemProvider('javascript', AppContext.objectCompletionItemProvider, '.')
	);

	context.subscriptions.push(
		vscode.languages.registerDefinitionProvider('javascript', AppContext.definitionProvider)
	);

	context.subscriptions.push(
		vscode.languages.registerHoverProvider('javascript', AppContext.hoverProvider)
	);

	context.subscriptions.push(
		vscode.languages.registerDocumentLinkProvider('javascript', AppContext.commentDefinitionProvider)
	);
}

export function activate(context: vscode.ExtensionContext) {
	AppContext.init(context);
	registerFileSystem(context);
	registerContextMenus(context);

	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider("bpmsoftFileInfo", AppContext.metadataProvider)
	);

	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider("bpmsoftInheritance", AppContext.inheritanceProvider)
	);

	context.subscriptions.push(
		vscode.window.registerTreeDataProvider("bpmcode.Explorer", AppContext.explorer)
	);

	context.subscriptions.push(
		vscode.window.registerTreeDataProvider("bpmcode.view.schemaTreeViewer", new StructureViewProvider())
	);

	context.subscriptions.push(
		vscode.window.registerFileDecorationProvider(AppContext.decorationProvider)
	);

	context.subscriptions.push(
		vscode.commands.registerCommand("bpmcode.schemaTreeViewer.reveal", (location) => {
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
		vscode.commands.registerCommand("bpmcode.loadFile", async (uri) => {
			await vscode.commands.executeCommand("vscode.open", uri);
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand("bpmcode.build", async () => {
			await AppContext.fsProvider.build();
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand("bpmcode.clearRedis", async () => {
			vscode.window.showInformationMessage('Clearing Redis...');
			try {
				await AppContext.client.reloadRedis();
				vscode.window.showInformationMessage('Redis cache cleared successfully.');
			} catch (error) {
				vscode.window.showErrorMessage(`Error. ${error}`);
			}
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('bpmcode.showLess', async (uri: vscode.Uri) => {
			await AppContext.fsProvider.openLess(uri);
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand("bpmcode.rebuild", async () => {
			await AppContext.fsProvider.rebuild();
		})
	);

	context.subscriptions.push(
		vscode.workspace.registerTextDocumentContentProvider("bpmsoft-completion", AppContext.intellisenseFsProv)
	);

	//const fileCountDecorationProvider = new FileCountDecorationProvider();
    //context.subscriptions.push(vscode.window.registerFileDecorationProvider(fileCountDecorationProvider));

	registerIntellisense(context);
}

// This method is called when your extension is deactivated
export function deactivate() { }