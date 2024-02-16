import * as vscode from "vscode";
import { AppContext } from "../../globalContext";
import { ExplorerItem as ExplorerItem, Directory } from "./ExplorerItem";

export class Explorer implements vscode.TreeDataProvider<ExplorerItem> {
    cache: ExplorerItem[] = [];

    reveal(uri: vscode.Uri) {
        const treeView = vscode.window.createTreeView("bpmcode.Explorer", {
            treeDataProvider: AppContext.explorer,
        });
        let file = AppContext.fsProvider.getMemFile(uri);
        if (file) {
            let item = new ExplorerItem(file);
            treeView.reveal(item, { select: true });
        }
    }

    getParent(
        element: ExplorerItem
    ): vscode.ProviderResult<ExplorerItem> {
        let packageUid = AppContext.fsProvider.getMemFile(
            element.resourceUri
        )?.workSpaceItem.packageUId;
        var dir = AppContext.fsProvider.folders.find((folder) => {
            folder.package?.uId === packageUid;
        });

        if (dir) {
            return new ExplorerItem(dir);
        } else {
            return null;
        }
    }

    getTreeItem(
        element: ExplorerItem
    ): vscode.TreeItem | Thenable<vscode.TreeItem> {
        return element;
    }

    sortFolders(folders: Directory[]) {
        return folders.sort((a, b) => {
            let readonlyA = a.package?.isReadOnly;
            let readonlyB = b.package?.isReadOnly;
            if (readonlyA === readonlyB) {
                return a.name.localeCompare(b.name);
            } else {
                return readonlyA ? 1 : -1;
            }
        });
    }

    getChildren(
        element?: ExplorerItem | undefined
    ): vscode.ProviderResult<ExplorerItem[]> {
        let fs = AppContext.fsProvider;
        if (!element) {
            return this.sortFolders(fs.folders).map(
                (folder) => new ExplorerItem(folder)
            );
        } else {
            return element.getChildren();
        }
    }

    public refresh(): void {
        this._onDidChangeTreeData?.fire();
    }

    private _onDidChangeTreeData: vscode.EventEmitter<
        ExplorerItem | undefined | void
    > = new vscode.EventEmitter<ExplorerItem | undefined | void>();
    readonly onDidChangeTreeData: vscode.Event<
        ExplorerItem | undefined | void
    > = this._onDidChangeTreeData.event;

    private _onDidStatusUpdate: vscode.EventEmitter<ExplorerItem> =
        new vscode.EventEmitter<ExplorerItem>();
    readonly onDidStatusUpdate: vscode.Event<ExplorerItem> =
        this._onDidStatusUpdate.event;
}
