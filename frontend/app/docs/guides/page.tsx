import CodeBlock from "../components/CodeBlock";

export default function GuidesPage() {
  return (
    <div className="animate-fade-in">
      <h1 className="text-3xl font-bold tracking-tight mb-4">Guides</h1>
      <p className="text-lg text-muted-fg mb-8 max-w-2xl">
        Step-by-step tutorials covering the core workflows of Stellar Suite.
      </p>

      <section className="mb-12">
        <h2 id="building-contracts" className="text-2xl font-semibold mb-4">
          Building Contracts
        </h2>
        <p className="text-muted-fg mb-4">
          Stellar Suite compiles Soroban smart contracts using the Stellar CLI under the hood.
          You can trigger a build from the command palette, sidebar, or keyboard shortcut.
        </p>
        <div className="p-4 rounded-lg bg-muted border border-border mb-4">
          <p className="text-sm font-medium mb-2">Prerequisites</p>
          <ul className="list-disc list-inside text-sm text-muted-fg space-y-1">
            <li>Rust toolchain installed (rustup)</li>
            <li>Stellar CLI v21.0.0 or newer</li>
            <li>wasm32-unknown-unknown target: <code className="px-1 py-0.5 bg-background rounded text-xs font-mono">rustup target add wasm32-unknown-unknown</code></li>
          </ul>
        </div>
        <CodeBlock
          code={`// Build with default options (debug mode)\nawait stellarSuite.buildContract();\n\n// Build in release mode for deployment\nawait stellarSuite.buildContract({\n  release: true,\n  target: 'wasm32-unknown-unknown'\n});`}
          language="typescript"
          title="Building Contracts"
          showLineNumbers
        />
        <p className="text-muted-fg mt-4">
          The compiled WASM file will be output to <code className="px-1 py-0.5 bg-muted rounded text-xs font-mono">target/wasm32-unknown-unknown/release/</code>.
          You can view compilation status via the <strong>Show Compilation Status</strong> command.
        </p>
      </section>

      <section className="mb-12">
        <h2 id="deploying-contracts" className="text-2xl font-semibold mb-4">
          Deploying Contracts
        </h2>
        <p className="text-muted-fg mb-4">
          Deploy compiled contracts to testnet or mainnet. Stellar Suite supports multiple
          signing methods and includes automatic retry logic with exponential backoff.
        </p>
        <CodeBlock
          code={`// Deploy a single contract\nconst result = await stellarSuite.deployContract({\n  network: 'testnet',\n  source: 'dev'\n});\n\nconsole.log('Contract ID:', result.contractId);\nconsole.log('TX Hash:', result.txHash);\n\n// Batch deploy multiple contracts\nconst results = await stellarSuite.deployBatch(\n  ['./target/token.wasm', './target/vault.wasm'],\n  { network: 'testnet' }\n);`}
          language="typescript"
          title="Deploying Contracts"
          showLineNumbers
        />
        <div className="p-4 rounded-lg border border-warning/30 bg-warning/5 mt-4">
          <p className="text-sm font-medium text-warning mb-1">Important</p>
          <p className="text-sm text-muted-fg">
            Always deploy to testnet first. Mainnet deployments require validated signatures
            and sufficient XLM balance for transaction fees.
          </p>
        </div>
      </section>

      <section className="mb-12">
        <h2 id="simulating-transactions" className="text-2xl font-semibold mb-4">
          Simulating Transactions
        </h2>
        <p className="text-muted-fg mb-4">
          Preview transaction results and resource costs before submitting to the network.
          Simulations are cached for performance and can be replayed with modifications.
        </p>
        <CodeBlock
          code={`// Simulate a contract call\nconst result = await stellarSuite.simulateTransaction({\n  contractId: 'CABC...XYZ',\n  function: 'transfer',\n  args: [senderAddress, receiverAddress, amount]\n});\n\nconsole.log('Result:', result.result);\nconsole.log('CPU:', result.cost.cpuInsns);\nconsole.log('Memory:', result.cost.memBytes);\n\n// Replay a previous simulation with modified args\nawait stellarSuite.replaySimulation('sim-abc-123', {\n  args: [senderAddress, newReceiver, newAmount]\n});`}
          language="typescript"
          title="Simulating Transactions"
          showLineNumbers
        />
        <p className="text-muted-fg mt-4">
          Use the <strong>Compare Simulations</strong> command to diff resource usage across
          multiple simulation runs. Export results for further analysis.
        </p>
      </section>

      <section className="mb-12">
        <h2 id="managing-state" className="text-2xl font-semibold mb-4">
          Managing State
        </h2>
        <p className="text-muted-fg mb-4">
          Stellar Suite provides backup and restore functionality for simulation history,
          cache, and resource profiles. This is useful for sharing state across team members
          or restoring a known-good configuration.
        </p>
        <CodeBlock
          code={`// Create a state backup\nawait stellarSuite.createBackup();\n\n// View backup history\nawait stellarSuite.showBackupHistory();\n\n// Restore from a specific backup\nawait stellarSuite.restoreBackup();\n\n// Export/Import for team sharing\nawait stellarSuite.exportBackups();\nawait stellarSuite.importBackups();`}
          language="typescript"
          title="State Management"
          showLineNumbers
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-6">
          <div className="p-4 rounded-lg bg-muted border border-border">
            <p className="text-sm font-medium mb-1">Cache Management</p>
            <p className="text-xs text-muted-fg">
              Clear simulation cache, view cache stats, and configure TTL and max entries through settings.
            </p>
          </div>
          <div className="p-4 rounded-lg bg-muted border border-border">
            <p className="text-sm font-medium mb-1">History & Profiles</p>
            <p className="text-xs text-muted-fg">
              Export simulation history, resource profiles, and replay results for documentation and auditing.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
