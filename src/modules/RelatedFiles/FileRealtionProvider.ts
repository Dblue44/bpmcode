import * as vscode from 'vscode';
import { AppContext } from '../../globalContext';
import { MethodsEntry, ShemaAstStructure } from '../StructureView/StructureAst';

export class SchemaRelation {
    constructor(path: vscode.Uri, ast: ShemaAstStructure) {
        this.mouduleUri = path;
        this.ast = ast;
    }

    mouduleUri: vscode.Uri;
    parents?: vscode.Uri[];
    ast: ShemaAstStructure;
}

export class UriDictionary<T> {
    protected loaded: { [uri: string]: T } = {};
    set(uri: vscode.Uri, val: T) {
        this.loaded[uri.path] = val;
    }
    
    get(uri: vscode.Uri) {
        try {
            let val = this.loaded[uri.path];
            if (val) {
                return val;
            } else {
                return null;
            }
        } catch (e: any) {
            throw e;
        }
    }
}

export class FileRelationProvider {
    constructor() {
        vscode.workspace.onDidOpenTextDocument((doc) => {
            if (doc.uri.authority === AppContext.fileSystemName) {
                vscode.window.withProgress({
                    "location": vscode.ProgressLocation.Window,
                    "title": `Loading ast`
                }, async (progress, token) => {
                    await this.loadAst(doc.uri);
                    progress.report({ 
                        increment: 100,
                        message: "loaded"
                    });
                });
            }
        });
    }

    protected schemaRelationCache: UriDictionary<SchemaRelation> = new UriDictionary<SchemaRelation>();

    setAst(uri: vscode.Uri, ast: ShemaAstStructure) {
        this.schemaRelationCache.set(uri, new SchemaRelation(ast.moduleUri, ast));
    }

    async loadAst(moduleUri: vscode.Uri) {
        let contents = (await AppContext.fsProvider.getFile(moduleUri, true)).schema?.body!;
        let ast = new ShemaAstStructure(contents);
        this.setAst(moduleUri, ast);

        ast.dependencies.forEach(async dependency => {
            const name = dependency.value;
            await this.conditionalLoadAst(name);
        });

        ast.mixins.forEach(async mixin => {
            const name = mixin.name;
            await this.conditionalLoadAst(name);
        });

        return ast;
    }

    private async conditionalLoadAst(schemaName: string) {
        let uris = AppContext.fsProvider.getUriByName(schemaName);
        if (uris.length > 0) {
            if (!this.schemaRelationCache.get(uris[0])) {
                await this.loadAst(uris[0]);
            }
        } else {
            console.warn(`Uri ${schemaName} not found by name. It might lead to error.`);
        }
    }

    async getMethodsInheritanceChain(moduleUri: vscode.Uri, cToken: vscode.CancellationToken) {
        const moduleName = moduleUri.path.split('/').pop()!.split('.')[0];
        const targetModule = this.schemaRelationCache.get(moduleUri);
        if (!targetModule) {
            throw new Error(`Module by name ${moduleName} not found`);
        }

        let methodDictionary: { [moduleName: string]: MethodsEntry[] } = {};
        if (!targetModule.parents) {
            const file = AppContext.fsProvider.getMemFile(moduleUri);
            if (!file) {
                throw new Error();
            }

            methodDictionary[moduleUri.toString()] = targetModule.ast.methods;

            let parentFilesRequest = await AppContext.fsProvider.getParentFiles(file, cToken);
            if (parentFilesRequest.cancelled) {
                return null;
            }

            let parentFiles = parentFilesRequest.files;
            targetModule.parents = parentFiles.map(file => AppContext.fsHelper.getPath(file));

            parentFiles.forEach(async file => {
                const uri = AppContext.fsHelper.getPath(file);
                const content = file.schema?.body;
                if (uri !== moduleUri && content) {
                    let ast = new ShemaAstStructure(content);
                    this.setAst(uri, ast);
                    methodDictionary[uri.toString()] = ast.methods;
                }
            });
        } else {
            targetModule.parents.forEach(async parentUri => {
                let parent = this.schemaRelationCache.get(parentUri);
                if (parent) {
                    methodDictionary[parentUri.toString()] = parent.ast.methods;
                } else {
                    await this.loadAst(parentUri);
                    parent = this.schemaRelationCache.get(parentUri);
                    if (parent) {
                        methodDictionary[parentUri.toString()] = parent.ast.methods;
                    } 
                }
            });
        }

        return methodDictionary;
    }
}