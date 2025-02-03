import * as vscode from 'vscode';
import { ConfigurationHelper } from "../../common/ConfigurationHelper";
import { ConnectionInfo } from "../../api/ConnectionInfo";
import { GenericWebViewPanel } from "../../common/WebView/GenericWebViewPanel";
import { AppContext } from "../../globalContext";

export class LoginPanel extends GenericWebViewPanel {
    protected webViewId = "bpmcode.LoginPanel";
    protected title = "Login";
    
    protected onDidReceiveMessage = async (message: any) => {
        switch (message.command) {
            case 'login':
                try {
                    let connectionInfo = new ConnectionInfo(message.connectionInfo.url, message.connectionInfo.login, message.connectionInfo.password);
                    if (connectionInfo.getHostName() === '') {
                        throw new Error("Unable to parse url. Example: http://localhost:5000");
                    } else if (connectionInfo.getProtocol() !== 'http:' && connectionInfo.getProtocol() !== 'https:') {
                        throw new Error("Unsupported protocol");
                    }

                    ConfigurationHelper.setLoginData(connectionInfo);

                    if (await AppContext.tryCreateConnection()) {
                        AppContext.reloadWorkspace();
                        this.dispose();
                    }
                } catch (error: any) {
                    if (error.code === 'ECONNREFUSED') {
                        vscode.window.showErrorMessage(`Couldn't connect to ${error.address}:${error.port}`);
                    }
                    else {
                        vscode.window.showErrorMessage(error.message);
                    }

                    return error;
                }
                break;

            case 'getLoginData':
                this.postMessage(ConfigurationHelper.getLoginData() ? ConfigurationHelper.getLoginData() : {});
                break;
        }
    };

    protected getWebviewContent(): string {
        return `
        <!DOCTYPE html>
        <html lang="en">
            <head>
                <script src = '${this.getResourcePath("js", "homeView.js")}'></script>
                <link rel="stylesheet" href="${this.getResourcePath("css", "homeView.css")}">
                <title>Connection page</title>
            </head>
            <body>
                <label for="url">Url:</label>
                <input type="text" id="url" name="url" value="">
                <label for="login">Login:</label>
                <input type="text" id="login" name="login" value="">
                <label for="password">Password:</label>
                <input type="text" id="password" name="password" value="">
                <input type="button" id = "connect" value="Connect">
            </body>
        </html>
        `;
    }
}