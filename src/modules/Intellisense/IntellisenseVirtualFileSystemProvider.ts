import * as vscode from 'vscode';

export class IntellisenseVirtualFileSystemProvider implements vscode.TextDocumentContentProvider {
    onDidChange?: vscode.Event<vscode.Uri> | undefined;

    provideTextDocumentContent(uri: vscode.Uri, token: vscode.CancellationToken): vscode.ProviderResult<string> {
        return uri.path;
    }
}