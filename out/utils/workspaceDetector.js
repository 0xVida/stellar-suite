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
exports.WorkspaceDetector = void 0;
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
/**
 * Utility functions for detecting contracts in the workspace.
 */
class WorkspaceDetector {
    /**
     * Find contract files in the workspace.
     * Looks for common contract file patterns.
     *
     * @returns Array of contract file paths
     */
    static async findContractFiles() {
        const contractFiles = [];
        if (!vscode.workspace.workspaceFolders) {
            return contractFiles;
        }
        const patterns = [
            '**/src/lib.rs',
            '**/Cargo.toml',
            '**/*.wasm',
            '**/contracts/**/*.rs',
            '**/soroban/**/*.rs'
        ];
        for (const folder of vscode.workspace.workspaceFolders) {
            for (const pattern of patterns) {
                const files = await vscode.workspace.findFiles(new vscode.RelativePattern(folder, pattern), '**/node_modules/**', 10);
                contractFiles.push(...files.map((f) => f.fsPath));
            }
        }
        return contractFiles;
    }
    /**
     * Try to extract contract ID from workspace files.
     * Looks in common configuration files and contract files.
     *
     * @returns Contract ID if found, or null
     */
    static async findContractId() {
        if (!vscode.workspace.workspaceFolders) {
            return null;
        }
        // Look for contract ID in common locations
        const searchPatterns = [
            '**/.env',
            '**/.env.local',
            '**/stellar.toml',
            '**/soroban.toml',
            '**/README.md',
            '**/*.toml',
            '**/*.json'
        ];
        for (const folder of vscode.workspace.workspaceFolders) {
            for (const pattern of searchPatterns) {
                try {
                    const files = await vscode.workspace.findFiles(new vscode.RelativePattern(folder, pattern), '**/node_modules/**', 20);
                    for (const file of files) {
                        const content = fs.readFileSync(file.fsPath, 'utf-8');
                        // Look for contract ID pattern (starts with C and is 56 chars)
                        const contractIdMatch = content.match(/C[A-Z0-9]{55}/);
                        if (contractIdMatch) {
                            return contractIdMatch[0];
                        }
                        // Look for CONTRACT_ID= or contract_id = patterns
                        const envMatch = content.match(/(?:CONTRACT_ID|contract_id)\s*[=:]\s*([CA-Z0-9]{56})/i);
                        if (envMatch) {
                            return envMatch[1];
                        }
                    }
                }
                catch (error) {
                    // Continue searching
                }
            }
        }
        return null;
    }
    /**
     * Get the active editor's file if it looks like a contract file.
     *
     * @returns Contract file path or null
     */
    static getActiveContractFile() {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return null;
        }
        const filePath = editor.document.fileName;
        const ext = path.extname(filePath);
        // Check if it's a Rust file (common for Soroban contracts)
        if (ext === '.rs' || filePath.includes('contract') || filePath.includes('soroban')) {
            return filePath;
        }
        return null;
    }
}
exports.WorkspaceDetector = WorkspaceDetector;
//# sourceMappingURL=workspaceDetector.js.map