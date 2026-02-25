import CodePlayground from "../components/CodePlayground";

export default function PlaygroundPage() {
  return (
    <div className="animate-fade-in">
      <h1 className="text-3xl font-bold tracking-tight mb-4">Interactive Playground</h1>
      <p className="text-lg text-muted-fg mb-8 max-w-2xl">
        Experiment with Stellar Suite APIs in this interactive editor. Select a template or
        write your own code, then click Run to see simulated output.
      </p>

      <CodePlayground />

      <div className="mt-8 p-4 rounded-lg bg-muted border border-border">
        <p className="text-sm font-medium mb-2">About the Playground</p>
        <p className="text-sm text-muted-fg">
          This playground simulates API calls for demonstration purposes. In a real
          environment, these commands run inside VS Code and interact with the Stellar
          network through the configured RPC endpoints. Install the extension to try them
          for real.
        </p>
      </div>

      <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="p-4 rounded-lg border border-border">
          <p className="text-sm font-medium mb-1">Edit Freely</p>
          <p className="text-xs text-muted-fg">
            Modify any code in the editor. Use the template buttons to switch between
            common patterns.
          </p>
        </div>
        <div className="p-4 rounded-lg border border-border">
          <p className="text-sm font-medium mb-1">Copy &amp; Use</p>
          <p className="text-xs text-muted-fg">
            Copy snippets directly into your VS Code workspace. All examples use real
            Stellar Suite API signatures.
          </p>
        </div>
      </div>
    </div>
  );
}
