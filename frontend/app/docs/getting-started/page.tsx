import CodeBlock from "../components/CodeBlock";

export default function GettingStartedPage() {
  return (
    <div className="animate-fade-in">
      <h1 id="introduction" className="text-3xl font-bold tracking-tight mb-4">
        Getting Started
      </h1>
      <p className="text-lg text-muted-fg mb-8 max-w-2xl">
        Stellar Suite improves the developer experience when building smart contracts on
        Stellar. Build, deploy, and manage contracts directly from VS Code.
      </p>

      <section className="mb-12">
        <h2 id="installation" className="text-2xl font-semibold mb-4">Installation</h2>
        <p className="text-muted-fg mb-4">
          Install the extension from the VS Code Marketplace, or install via the command line:
        </p>
        <CodeBlock
          code="ext install stellar-suite.stellar-suite"
          language="bash"
          title="VS Code Command Palette"
        />
        <p className="text-muted-fg mb-4">
          You will also need the Stellar CLI installed. If you use Rust, install it via cargo:
        </p>
        <CodeBlock
          code={`cargo install --locked stellar-cli\n\n# Verify installation\nstellar version`}
          language="bash"
          title="Terminal"
        />
      </section>

      <section className="mb-12">
        <h2 id="quick-start" className="text-2xl font-semibold mb-4">Quick Start</h2>
        <p className="text-muted-fg mb-4">
          Once installed, follow these steps to deploy your first contract:
        </p>
        <ol className="list-decimal list-inside space-y-3 text-muted-fg mb-6">
          <li>Open a Soroban project in VS Code</li>
          <li>Open the Stellar Suite sidebar from the Activity Bar</li>
          <li>Click <strong className="text-foreground">Build Contract</strong> or press <kbd className="px-1.5 py-0.5 text-xs font-mono bg-muted rounded border border-border">Ctrl+Alt+B</kbd></li>
          <li>Click <strong className="text-foreground">Deploy Contract</strong> or press <kbd className="px-1.5 py-0.5 text-xs font-mono bg-muted rounded border border-border">Ctrl+Alt+D</kbd></li>
          <li>Simulate transactions with <kbd className="px-1.5 py-0.5 text-xs font-mono bg-muted rounded border border-border">Ctrl+Alt+S</kbd></li>
        </ol>
        <CodeBlock
          code={`// Example: Building and deploying a contract\n// 1. Build\nawait stellarSuite.buildContract({ release: true });\n\n// 2. Deploy to testnet\nconst deploy = await stellarSuite.deployContract({\n  network: 'testnet',\n  source: 'dev'\n});\nconsole.log('Contract ID:', deploy.contractId);\n\n// 3. Simulate a call\nconst sim = await stellarSuite.simulateTransaction({\n  contractId: deploy.contractId,\n  function: 'hello',\n  args: ['world']\n});\nconsole.log('Result:', sim.result);`}
          language="typescript"
          title="Quick Start Example"
          showLineNumbers
        />
      </section>

      <section className="mb-12">
        <h2 id="configuration" className="text-2xl font-semibold mb-4">Configuration</h2>
        <p className="text-muted-fg mb-4">
          Stellar Suite is configured through VS Code settings. Here are the key options:
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-3 px-4 font-semibold">Setting</th>
                <th className="text-left py-3 px-4 font-semibold">Default</th>
                <th className="text-left py-3 px-4 font-semibold">Description</th>
              </tr>
            </thead>
            <tbody className="text-muted-fg">
              <tr className="border-b border-border">
                <td className="py-3 px-4 font-mono text-xs">stellarSuite.rpcUrl</td>
                <td className="py-3 px-4 text-xs">soroban-testnet.stellar.org</td>
                <td className="py-3 px-4">RPC endpoint URL</td>
              </tr>
              <tr className="border-b border-border">
                <td className="py-3 px-4 font-mono text-xs">stellarSuite.network</td>
                <td className="py-3 px-4 text-xs">testnet</td>
                <td className="py-3 px-4">Target network</td>
              </tr>
              <tr className="border-b border-border">
                <td className="py-3 px-4 font-mono text-xs">stellarSuite.source</td>
                <td className="py-3 px-4 text-xs">dev</td>
                <td className="py-3 px-4">Source identity for invocations</td>
              </tr>
              <tr className="border-b border-border">
                <td className="py-3 px-4 font-mono text-xs">stellarSuite.cliPath</td>
                <td className="py-3 px-4 text-xs">stellar</td>
                <td className="py-3 px-4">Path to Stellar CLI executable</td>
              </tr>
              <tr className="border-b border-border">
                <td className="py-3 px-4 font-mono text-xs">stellarSuite.useLocalCli</td>
                <td className="py-3 px-4 text-xs">true</td>
                <td className="py-3 px-4">Use local CLI instead of RPC</td>
              </tr>
            </tbody>
          </table>
        </div>
        <CodeBlock
          code={`// .vscode/settings.json\n{\n  "stellarSuite.rpcUrl": "https://soroban-testnet.stellar.org:443",\n  "stellarSuite.network": "testnet",\n  "stellarSuite.source": "dev",\n  "stellarSuite.cliPath": "stellar",\n  "stellarSuite.useLocalCli": true,\n  "stellarSuite.simulationCacheEnabled": true,\n  "stellarSuite.simulationCacheTtlSeconds": 60\n}`}
          language="json"
          title=".vscode/settings.json"
          showLineNumbers
        />
      </section>
    </div>
  );
}
