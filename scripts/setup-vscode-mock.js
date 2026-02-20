const fs = require('fs');
fs.mkdirSync('out-test/node_modules/vscode', { recursive: true });
fs.writeFileSync(
    'out-test/node_modules/vscode/index.js',
    'module.exports={workspace:{createFileSystemWatcher:()=>({onDidCreate:function(){},onDidChange:function(){},onDidDelete:function(){},dispose:function(){}})}};'
);