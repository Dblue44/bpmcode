import * as vscode from 'vscode';
import { GenericWebViewPanel } from "../../common/WebView/GenericWebViewPanel";
import { PackageChangeEntry } from "../../api/TypeDefinitions";
import { AppContext } from "../../globalContext";

export class PushToSVNPanel extends GenericWebViewPanel {
    changes: PackageChangeEntry;
    packageName: string;

    constructor(context: vscode.ExtensionContext, packageName: string, changes: PackageChangeEntry) {
        super(context);
        this.changes = changes;
        this.packageName = packageName;
    }

    protected webViewId = "bpmcode.pushToSVNPanel";
    protected title = "Push to SVN";

    protected onDidReceiveMessage = async (message: any) => {
        switch (message.command) {
            case 'commit':
                AppContext.fsProvider.commit(this.packageName, message.message);
                this.dispose();
                break;
            case 'getChanges':
                this.postMessage(this.changes);
                break;

        }
    };

    protected getWebviewContent(): string {
        return `
        <!DOCTYPE html>
        <html lang="en">
            <head>
                <script src = '${this.getResourcePath("js", "PushToSVNPanel.js")}'></script>
                <link rel="stylesheet" href="${this.getResourcePath("css", "PushToSVNPanel.css")}">
            </head>
            <body>
            </body>
        </html>
        `;
    }
}