import * as vscode from 'vscode';
import { GenericWebViewProvider } from './GenericWebViewProvider';
import { AppContext } from '../../globalContext';
import { File } from '../../modules/FileSystem/ExplorerItem';

export abstract class WorkspaceItemViewProvider extends GenericWebViewProvider {
  currentFile?: File;
  constructor() {
    super();
    vscode.window.onDidChangeActiveTextEditor(x => {
      if (x?.document.uri.scheme === 'bpmsoft') {
        let file = AppContext.fsProvider.getMemFile(x.document.uri);
        if (file) {
          this.setItem(file);
        }
      }
    });

    vscode.workspace.onDidOpenTextDocument(x => {
      if (x.uri.scheme === 'bpmsoft') {
        let file = AppContext.fsProvider.getMemFile(x.uri);
        if (file) {
          this.setItem(file);
        }
      }
    });
  }

  setItem(file: File): void {
    this.currentFile = file;
    this.reloadWebview();
  }
}