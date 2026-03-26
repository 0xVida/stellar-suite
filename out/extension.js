"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const simulateTransaction_1 = require("./commands/simulateTransaction");
const deployContract_1 = require("./commands/deployContract");
const buildContract_1 = require("./commands/buildContract");
const sidebarView_1 = require("./ui/sidebarView");
const outputChannel_1 = require("./utils/outputChannel");
let sidebarProvider;
function activate(context) {
    const outputChannel = (0, outputChannel_1.getSharedOutputChannel)();
    try {
        sidebarProvider = new sidebarView_1.SidebarViewProvider(context.extensionUri, context);
        context.subscriptions.push(vscode.window.registerWebviewViewProvider(sidebarView_1.SidebarViewProvider.viewType, sidebarProvider));
        const simulateCommand = vscode.commands.registerCommand('stellarSuite.simulateTransaction', () => {
            return (0, simulateTransaction_1.simulateTransaction)(context, sidebarProvider);
        });
        const deployCommand = vscode.commands.registerCommand('stellarSuite.deployContract', () => {
            return (0, deployContract_1.deployContract)(context, sidebarProvider);
        });
        const refreshCommand = vscode.commands.registerCommand('stellarSuite.refreshContracts', () => {
            if (sidebarProvider) {
                sidebarProvider.refresh();
            }
        });
        const deployFromSidebarCommand = vscode.commands.registerCommand('stellarSuite.deployFromSidebar', () => {
            return (0, deployContract_1.deployContract)(context, sidebarProvider);
        });
        const simulateFromSidebarCommand = vscode.commands.registerCommand('stellarSuite.simulateFromSidebar', () => {
            return (0, simulateTransaction_1.simulateTransaction)(context, sidebarProvider);
        });
        const buildCommand = vscode.commands.registerCommand('stellarSuite.buildContract', () => {
            return (0, buildContract_1.buildContract)(context, sidebarProvider);
        });
        const watcher = vscode.workspace.createFileSystemWatcher('**/{Cargo.toml,*.wasm}');
        watcher.onDidChange(() => {
            if (sidebarProvider) {
                sidebarProvider.refresh();
            }
        });
        watcher.onDidCreate(() => {
            if (sidebarProvider) {
                sidebarProvider.refresh();
            }
        });
        watcher.onDidDelete(() => {
            if (sidebarProvider) {
                sidebarProvider.refresh();
            }
        });
        context.subscriptions.push(simulateCommand, deployCommand, refreshCommand, deployFromSidebarCommand, simulateFromSidebarCommand, buildCommand, watcher);
    }
    catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Stellar Suite activation failed: ${errorMsg}`);
    }
}
function deactivate() {
}
//# sourceMappingURL=extension.js.map