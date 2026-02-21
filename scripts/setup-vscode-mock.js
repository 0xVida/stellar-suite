const fs = require('fs');
fs.mkdirSync('out-test/node_modules/vscode', { recursive: true });

// Enhanced VS Code mock for testing
const vscodeMock = `
class EventEmitter {
    constructor() {
        this.listeners = [];
    }
    get event() {
        return (listener) => {
            this.listeners.push(listener);
            return { dispose: () => {} };
        };
    }
    fire(event) {
        this.listeners.forEach(listener => listener(event));
    }
    dispose() {
        this.listeners = [];
    }
}

class OutputChannel {
    appendLine(message) {}
    append(message) {}
    clear() {}
    show() {}
    hide() {}
    dispose() {}
}

module.exports = {
    workspace: {
        createFileSystemWatcher: () => ({
            onDidCreate: function(){},
            onDidChange: function(){},
            onDidDelete: function(){},
            dispose: function(){}
        }),
        onDidChangeWorkspaceFolders: () => ({ dispose: () => {} }),
        getConfiguration: () => ({
            get: (key, defaultValue) => defaultValue
        })
    },
    window: {
        createOutputChannel: (name) => new OutputChannel(),
        showInformationMessage: async (message, ...items) => {
            // Mock always returns undefined (no button clicked)
            return undefined;
        },
        showWarningMessage: async (message, ...items) => {
            // Mock always returns undefined (no button clicked)
            return undefined;
        },
        showErrorMessage: async (message, ...items) => {
            // Mock always returns undefined (no button clicked)
            return undefined;
        },
        createStatusBarItem: () => ({
            text: '',
            tooltip: '',
            command: '',
            show: () => {},
            hide: () => {},
            dispose: () => {}
        })
    },
    EventEmitter: EventEmitter,
    Disposable: class Disposable {
        constructor(callback) {
            this.callback = callback;
        }
        dispose() {
            if (this.callback) {
                this.callback();
            }
        }
    },
    StatusBarAlignment: {
        Left: 1,
        Right: 2
    },
    ThemeColor: class ThemeColor {
        constructor(id) {
            this.id = id;
        }
    }
};
`;

fs.writeFileSync('out-test/node_modules/vscode/index.js', vscodeMock);