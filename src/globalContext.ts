import * as vscode from 'vscode';
import { ConfigurationHelper } from './common/ConfigurationHelper';
import { Utils } from './common/Utils';
import { ConnectionInfo } from './api/ConnectionInfo';
import { ApiClient } from './api/Client';
import { CommentDefinitionProvider } from './modules/CommentIntellisense/CommentDefinitionProvider';
import { LoginPanel } from './modules/ConnectionPanel/LoginPanel';
import { Explorer } from './modules/FileSystem/Explorer';
import { FileSystemProvider } from './modules/FileSystem/FileSystemProvider';
import { ExplorerDecorationProvider } from './modules/FileSystem/ExplorerDecorationProvider';
import { FileSystemHelper } from './modules/FileSystem/FileSystemHelper';
import { IntellisenseVirtualFileSystemProvider } from './modules/Intellisense/IntellisenseVirtualFileSystemProvider';
import { ObjectCompletionItemProvider } from './modules/Intellisense/ObjectCompletionItemProvider';
import { ObjectDefinitionProvider } from './modules/Intellisense/ObjectDefinitionProvider';
import { ObjectHoverProvider } from './modules/Intellisense/ObjectHoverProvider';
import { SchemaMetaDataViewProvider } from "./modules/Legacy/SchemaMetaDataViewProvider";
import { FileRelationProvider } from './modules/RelatedFiles/FileRealtionProvider';
import { InheritanceViewProvider } from './modules/RelatedFiles/InheritanceViewProvider';
import { SchemaStructureDefinitionProvider } from './modules/StructureView/StructureViewProvider';

export enum ReloadStatus {
    error,
    success,
    progress
};

/**
 * Used to access and register global extension objects.
 */
export class AppContext {
    static init(context: vscode.ExtensionContext) {
	    this.extensionContext = context;
        this.fsProvider = new FileSystemProvider();
        this.client = new ApiClient();
        this.fsHelper = new FileSystemHelper();
        this.explorer = new Explorer();
        this.decorationProvider = new ExplorerDecorationProvider();

        this.definitionProvider = new ObjectDefinitionProvider();
        this.hoverProvider = new ObjectHoverProvider();
        this.commentDefinitionProvider = new CommentDefinitionProvider();
        this.intellisenseFsProv = new IntellisenseVirtualFileSystemProvider();
        this.schemaStructureDefinitionProvider = new SchemaStructureDefinitionProvider();
        this.objectCompletionItemProvider = new ObjectCompletionItemProvider();

        this.metadataProvider = new SchemaMetaDataViewProvider();
        this.inheritanceProvider = new InheritanceViewProvider();

        this.fileRelationProvider = new FileRelationProvider();
    }

    static fileSystemName: string = "bpmsoft";
    static extensionContext: vscode.ExtensionContext;
    
    static fsProvider: FileSystemProvider;
    static client: ApiClient;
    static fsHelper: FileSystemHelper;
    static explorer: Explorer;
    static decorationProvider: ExplorerDecorationProvider;

    static definitionProvider: ObjectDefinitionProvider;
    static hoverProvider: ObjectHoverProvider;
    static commentDefinitionProvider: CommentDefinitionProvider;
	static intellisenseFsProv: IntellisenseVirtualFileSystemProvider;
	static schemaStructureDefinitionProvider : SchemaStructureDefinitionProvider;
	static objectCompletionItemProvider: ObjectCompletionItemProvider;

    static metadataProvider: SchemaMetaDataViewProvider;
    static inheritanceProvider: InheritanceViewProvider;

    static fileRelationProvider: FileRelationProvider;

    static async getInput(oldInput: any): Promise<ConnectionInfo | undefined> {
        const url = await vscode.window.showInputBox({
            title: 'Url',
            value: oldInput?.url || "baseurl"
        });
        if (!url) {
            return undefined;
        }
    
        const login = await vscode.window.showInputBox({
            title: 'Login',
            value: oldInput?.login || "Supervisor"
        });
        if (!login) {
            return undefined;
        }
    
        const password = await vscode.window.showInputBox({
            title: 'Password',
            value: oldInput?.password || "Supervisor"
        });
        if (!password) {
            return undefined;
        }
    
        return new ConnectionInfo(url, login, password);
    }
    
    static async tryCreateConnection(): Promise<ApiClient | null> {
        let connectionInfo: ConnectionInfo | undefined = ConfigurationHelper.getLoginData();
        if (connectionInfo) {
            // Deserializing
            connectionInfo = new ConnectionInfo(connectionInfo.url, connectionInfo.login, connectionInfo.password);
            return await AppContext.client.login(connectionInfo) ? AppContext.client : null;
        }
        return null;
    }
    
    static async createWorkspace(context: vscode.ExtensionContext) {
        let panelProvider = new LoginPanel(context);
        panelProvider.createPanel();
    }
    
    static async reloadWorkspace(): Promise<ReloadStatus> {
        vscode.commands.executeCommand('setContext', 'bpmcode.workspaceLoaded', false);
        let connectionInfo = ConfigurationHelper.getLoginData();
        if (!connectionInfo) {
            return ReloadStatus.error;
        }
        
        AppContext.fsHelper.root = connectionInfo.getHostName();

        var client = await this.tryCreateConnection();
        if (client) {
            let reloaded = await AppContext.fsProvider.reload();
            if (reloaded) {
                AppContext.explorer.refresh();
                vscode.commands.executeCommand('setContext', 'bpmcode.workspaceLoaded', true);
            } else {
                return ReloadStatus.progress;
            }
        } else {
            return ReloadStatus.error;
        }

        let targetUri = vscode.Uri.file(AppContext.fsHelper.getDataFolder());
        let currentUri = vscode.workspace.workspaceFolders?.[0].uri;
    
        if (currentUri?.fsPath !== targetUri.fsPath) {
            Utils.createYesNoDialouge(
                "Because of VSCode's limitations, you need to reload the workspace to use file search and then login again. Do you want to reload the workspace now?", async () => {
                await vscode.commands.executeCommand("vscode.openFolder", targetUri , false);
            });
        }

        // if (ConfigurationHelper.useAdvancedIntellisense()) {
        //     IntellisenseHelper.init();
        // }

        return ReloadStatus.success;
    }
}