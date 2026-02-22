// ============================================================
// package.json — ADDITIONS ONLY
//
// Merge the following into your existing package.json.
// These additions register the new context menu commands so they
// appear in the Command Palette and can receive keyboard shortcuts.
// ============================================================

// ── Add to "contributes.commands" array: ─────────────────────
//
// {
//     "command": "stellarSuite.copyContractId",
//     "title": "Stellar Suite: Copy Contract ID"
// },
// {
//     "command": "stellarSuite.renameContract",
//     "title": "Stellar Suite: Rename Contract"
// },
// {
//     "command": "stellarSuite.duplicateContract",
//     "title": "Stellar Suite: Duplicate Contract"
// },
// {
//     "command": "stellarSuite.deleteContract",
//     "title": "Stellar Suite: Remove Contract from Sidebar"
// },
// {
//     "command": "stellarSuite.viewDeploymentHistory",
//     "title": "Stellar Suite: View Deployment History"
// }

// ── Add to "contributes.keybindings" (new top-level key): ────
//
// "keybindings": [
//     {
//         "command": "stellarSuite.copyContractId",
//         "key":     "ctrl+shift+c",
//         "mac":     "cmd+shift+c",
//         "when":    "view == stellarSuite.contractsView && focus"
//     },
//     {
//         "command": "stellarSuite.renameContract",
//         "key":     "f2",
//         "when":    "view == stellarSuite.contractsView && focus"
//     },
//     {
//         "command": "stellarSuite.refreshContracts",
//         "key":     "ctrl+shift+r",
//         "mac":     "cmd+shift+r",
//         "when":    "view == stellarSuite.contractsView"
//     }
// ]

// ── Full updated package.json for reference: ─────────────────
const packageJsonAdditions = {
    contributes: {
        commands: [
            // … existing commands …
            { command: 'stellarSuite.copyContractId',       title: 'Stellar Suite: Copy Contract ID' },
            { command: 'stellarSuite.renameContract',       title: 'Stellar Suite: Rename Contract' },
            { command: 'stellarSuite.duplicateContract',    title: 'Stellar Suite: Duplicate Contract' },
            { command: 'stellarSuite.deleteContract',       title: 'Stellar Suite: Remove Contract from Sidebar' },
            { command: 'stellarSuite.viewDeploymentHistory',title: 'Stellar Suite: View Deployment History' },
        ],
        keybindings: [
            {
                command: 'stellarSuite.copyContractId',
                key:     'ctrl+shift+c',
                mac:     'cmd+shift+c',
                when:    'view == stellarSuite.contractsView',
            },
            {
                command: 'stellarSuite.renameContract',
                key:     'f2',
                when:    'view == stellarSuite.contractsView',
            },
            {
                command: 'stellarSuite.refreshContracts',
                key:     'ctrl+shift+r',
                mac:     'cmd+shift+r',
                when:    'view == stellarSuite.contractsView',
            },
        ],
    },
};

module.exports = packageJsonAdditions;