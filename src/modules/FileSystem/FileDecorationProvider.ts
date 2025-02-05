import * as vscode from 'vscode';
import  { Directory } from './ExplorerItem';
import { AppContext } from "../../globalContext";

export class FileCountDecorationProvider implements vscode.FileDecorationProvider {
    private _onDidChangeFileDecorations: vscode.EventEmitter<vscode.Uri | vscode.Uri[]> = new vscode.EventEmitter<vscode.Uri | vscode.Uri[]>();
    readonly onDidChangeFileDecorations: vscode.Event<vscode.Uri | vscode.Uri[]> = this._onDidChangeFileDecorations.event;

    provideFileDecoration(uri: vscode.Uri): vscode.ProviderResult<vscode.FileDecoration> {
        if (uri.scheme !== AppContext.fileSystemName) {
            return;
        }
        const folder = AppContext.fsProvider.getFolder(uri);
        // const resource = AppContext.fsHelper.getDataFolder
        if (folder instanceof Directory) {
            const fileCount = AppContext.fsProvider.files.filter(file => file.workSpaceItem.packageUId === folder.package?.uId).length;
            return {
                badge: fileCount.toString(),
                tooltip: `${fileCount} files`,
                color: new vscode.ThemeColor("badge.background")
            };
        }
        return;
    }
}