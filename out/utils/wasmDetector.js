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
exports.WasmDetector = void 0;
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
class WasmDetector {
    static async findWasmFiles() {
        const wasmFiles = [];
        if (!vscode.workspace.workspaceFolders) {
            return wasmFiles;
        }
        const patterns = [
            '**/*.wasm',
            '**/target/**/*.wasm'
        ];
        for (const folder of vscode.workspace.workspaceFolders) {
            for (const pattern of patterns) {
                const files = await vscode.workspace.findFiles(new vscode.RelativePattern(folder, pattern), '**/node_modules/**', 50);
                wasmFiles.push(...files.map((f) => f.fsPath));
            }
        }
        return wasmFiles.filter(file => {
            const dir = path.dirname(file);
            return dir.includes('target') || dir.includes('wasm32');
        });
    }
    static async findLatestWasm() {
        const wasmFiles = await this.findWasmFiles();
        if (wasmFiles.length === 0) {
            return null;
        }
        const withStats = wasmFiles.map(file => ({
            path: file,
            mtime: fs.statSync(file).mtime.getTime()
        })).sort((a, b) => b.mtime - a.mtime);
        return withStats[0].path;
    }
    static async findContractDirectories() {
        const contractDirs = [];
        if (!vscode.workspace.workspaceFolders) {
            return contractDirs;
        }
        const patterns = [
            '**/Cargo.toml'
        ];
        for (const folder of vscode.workspace.workspaceFolders) {
            for (const pattern of patterns) {
                const files = await vscode.workspace.findFiles(new vscode.RelativePattern(folder, pattern), '**/node_modules/**', 20);
                for (const file of files) {
                    const dir = path.dirname(file.fsPath);
                    const libRs = path.join(dir, 'src', 'lib.rs');
                    if (fs.existsSync(libRs)) {
                        contractDirs.push(dir);
                    }
                }
            }
        }
        return contractDirs;
    }
    static getActiveContractDirectory() {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return null;
        }
        const filePath = editor.document.fileName;
        let currentDir = path.dirname(filePath);
        for (let i = 0; i < 10; i++) {
            const cargoToml = path.join(currentDir, 'Cargo.toml');
            if (fs.existsSync(cargoToml)) {
                return currentDir;
            }
            const parent = path.dirname(currentDir);
            if (parent === currentDir) {
                break;
            }
            currentDir = parent;
        }
        return null;
    }
    static getExpectedWasmPath(contractDir) {
        const commonPaths = [
            path.join(contractDir, 'target', 'wasm32v1-none', 'release', '*.wasm'),
            path.join(contractDir, 'target', 'wasm32-unknown-unknown', 'release', '*.wasm')
        ];
        for (const pattern of commonPaths) {
            const dir = path.dirname(pattern);
            if (fs.existsSync(dir)) {
                const files = fs.readdirSync(dir).filter((f) => f.endsWith('.wasm'));
                if (files.length > 0) {
                    const contractName = path.basename(contractDir).replace(/-/g, '_');
                    const wasmFile = files.find((f) => f.includes(contractName)) || files[0];
                    return path.join(dir, wasmFile);
                }
            }
        }
        return null;
    }
}
exports.WasmDetector = WasmDetector;
//# sourceMappingURL=wasmDetector.js.map