import * as vscode from "vscode";
import * as path from 'path';
import { PackageMetaInfo, Schema, WorkSpaceItem, SchemaType } from "../../api/TypeDefinitions";
import { AppContext } from "../../globalContext";
import { ConfigurationHelper } from "../../common/ConfigurationHelper";

export class File implements vscode.FileStat {

    type: vscode.FileType;
    ctime: number;
    mtime: number;
    size: number;
    name: string;
    isError: boolean = false;
    workSpaceItem: WorkSpaceItem;
    schema?: Schema;

    permissions?: vscode.FilePermission;
    lastSynced: number = Date.UTC(0,0);

    isLoaded(): boolean {
        return this.schema !== undefined && this.schema.body !== undefined && this.schema.body !== "";
    }

    constructor(name: string, schema: WorkSpaceItem, ctime: number = Date.now(), mtime: number = Date.now(), size: number = 0) {
        this.type = vscode.FileType.File;
        this.ctime = ctime;
        this.mtime = mtime;
        this.size = size;
        this.name = name;
        this.workSpaceItem = schema;
        this.permissions = schema?.isReadOnly ? vscode.FilePermission.Readonly : undefined;
    }

    clone(overrides: Partial<File> = {}): File {
        return Object.assign(new File(this.name, this.workSpaceItem, this.ctime, this.mtime, this.size), overrides);
    }
}

export class InnerFolder implements vscode.FileStat {

    type: vscode.FileType;
    ctime: number;
    mtime: number;
    size: number;
    package: PackageMetaInfo | null;
    name: string;
    folderType: SchemaType;

    constructor(name: string, directory: Directory, folderType: SchemaType) {
        this.type = vscode.FileType.Directory;
        this.ctime = Date.now();
        this.mtime = Date.now();
        this.name = name;
        this.size = 0;
        this.package = directory.package;
        this.folderType = folderType;
    }
}

export class Directory implements vscode.FileStat {

    type: vscode.FileType;
    ctime: number;
    mtime: number;
    size: number;
    name: string;
    permissions?: vscode.FilePermission;
    package: PackageMetaInfo | null;

    constructor(name: string, pack: PackageMetaInfo | null = null) {
        this.type = vscode.FileType.Directory;
        this.ctime = Date.now();
        this.mtime = Date.now();
        this.size = 0;
        this.name = name;
        this.package = pack;
        this.permissions = pack?.isReadOnly ? vscode.FilePermission.Readonly : undefined;
    }
}

export type Entry = File | Directory | InnerFolder;

export class ExplorerItem extends vscode.TreeItem {
    children: Entry[] = [];
    resourceUri: vscode.Uri;

    constructor(resource: Entry) {
        super(
            resource.name,
            resource instanceof Directory || resource instanceof InnerFolder
                ? vscode.TreeItemCollapsibleState.Collapsed
                : vscode.TreeItemCollapsibleState.None
        );
        this.resourceUri = AppContext.fsHelper.getPath(resource);

        if (resource instanceof Directory) {
            this.contextValue = "BPMSoftPackage";
            this.iconPath = resource.package?.isReadOnly
                ? vscode.Uri.file(path.resolve(__dirname, "../../../resources/media/folder_icons/close-folder.svg"))
                : vscode.Uri.file(path.resolve(__dirname, "../../../resources/media/folder_icons/open-folder.svg"));
            this.children = AppContext.fsProvider.getInnerFoldersByFolder(resource);
            this.description = `${resource.package?.maintainer} ${resource.package?.version} [${AppContext.fsProvider.files.filter(file => file.workSpaceItem.packageUId === resource.package?.uId).length} files]`;
            this.tooltip = `Maintainer: ${resource.package?.maintainer}\nDescription: ${resource.package?.description}`;
        }

        if (resource instanceof InnerFolder) { 
            this.contextValue = "BPMSoftInnerFolder";
            const iconFileName = ConfigurationHelper.getInnerFolderIcon(resource.folderType);
            this.iconPath = iconFileName 
                ? vscode.Uri.file(path.resolve(__dirname, "../../../resources/media/folder_icons", iconFileName))
                : vscode.Uri.file(path.resolve(__dirname, "../../../resources/media/folder_icons/open-folder.svg"));
            this.description = ConfigurationHelper.getInnerFolderDescription(resource.folderType);
            this.children = AppContext.fsProvider.getFilesByInnerFolder(resource);
            this.tooltip = `${this.description} ${this.children.length}`;
            
        }
        
        if (resource instanceof File) {
            this.contextValue = "BPMSoftSchema";
            this.command = {
                command: "bpmcode.loadFile",
                title: "Open file",
                arguments: [this.resourceUri],
            };
            this.description =
                resource.workSpaceItem.title &&
                    resource.name.includes(resource.workSpaceItem.title)
                    ? undefined
                    : resource.workSpaceItem.title;
            this.tooltip = this.description;
        }
    }

    private sortEntries(entries: Entry[]): Entry[] {
        return entries.sort((a, b) => {
            if (a instanceof Directory && b instanceof File) {
                return -1; // Директории идут перед файлами
            }
            if (a instanceof File && b instanceof Directory) {
                return 1;
            }
            if (a instanceof File && b instanceof File) {
                let fileA = a as File;
                let fileB = b as File;
                if (fileA.workSpaceItem.isLocked && !fileB.workSpaceItem.isLocked) {
                    return -1;
                }
                if (!fileA.workSpaceItem.isLocked && fileB.workSpaceItem.isLocked) {
                    return 1;
                }
    
                if (fileA.workSpaceItem.isChanged && !fileB.workSpaceItem.isChanged) {
                    return -1;
                }
                if (!fileA.workSpaceItem.isChanged && fileB.workSpaceItem.isChanged) {
                    return 1;
                }
                return fileA.name.localeCompare(fileB.name); 
            }
            return a.name.localeCompare(b.name);
        });
    }

    getChildren(): vscode.ProviderResult<ExplorerItem[]> {
        // let entries = AppContext.fsProvider.getDirectoryContents(
        //     this.resourceUri!
        // );
        return this.sortEntries(this.children).map(
            (entry) => new ExplorerItem(entry)
        );
    }
}