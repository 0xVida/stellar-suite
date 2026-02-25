"use client";

import { useState } from "react";
import { Play, RotateCcw, Copy, Check } from "lucide-react";

const EXAMPLE_TEMPLATES: Record<string, string> = {
  "Deploy Contract": `// Deploy a contract to testnet
const result = await stellarSuite.deployContract({
  network: 'testnet',
  source: 'dev',
});

console.log('Contract ID:', result.contractId);
console.log('TX Hash:', result.txHash);`,

  "Simulate Transaction": `// Simulate a token transfer
const result = await stellarSuite.simulateTransaction({
  contractId: 'CABC...XYZ',
  function: 'transfer',
  args: [
    'GABC...sender',
    'GXYZ...receiver',
    BigInt(1000000)
  ]
});

console.log('Cost:', result.cost);
console.log('Return:', result.result);`,

  "Check RPC Health": `// Check health of all configured endpoints
const statuses = await stellarSuite.checkRpcHealth();

statuses.forEach(status => {
  console.log(
    status.name + ':',
    status.healthy ? 'OK' : 'DOWN',
    '(' + status.latencyMs + 'ms)'
  );
});`,

  "Build Contract": `// Build the current contract with release mode
await stellarSuite.buildContract({
  release: true,
  target: 'wasm32-unknown-unknown'
});

console.log('Build completed successfully!');`,
};

export default function CodePlayground() {
  const [code, setCode] = useState(EXAMPLE_TEMPLATES["Deploy Contract"]);
  const [output, setOutput] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [copied, setCopied] = useState(false);
  const [activeTemplate, setActiveTemplate] = useState("Deploy Contract");

  const handleRun = () => {
    setIsRunning(true);
    setOutput("");

    setTimeout(() => {
      const lines: string[] = [];
      const codeLines = code.split("\n");
      codeLines.forEach((line) => {
        const logMatch = line.match(/console\.log\((.+)\)/);
        if (logMatch) {
          const content = logMatch[1]
            .replace(/['"`]/g, "")
            .replace(/,\s*/g, " ")
            .replace(/result\.\w+/g, "<simulated_value>")
            .replace(/status\.\w+/g, "<simulated_value>");
          lines.push("> " + content);
        }
      });

      if (lines.length === 0) {
        lines.push("> Execution completed successfully.");
      }

      lines.push("");
      lines.push("--- Simulation complete (not a real execution) ---");

      setOutput(lines.join("\n"));
      setIsRunning(false);
    }, 1200);
  };

  const handleReset = () => {
    setCode(EXAMPLE_TEMPLATES[activeTemplate]);
    setOutput("");
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleTemplateChange = (name: string) => {
    setActiveTemplate(name);
    setCode(EXAMPLE_TEMPLATES[name]);
    setOutput("");
  };

  return (
    <div className="rounded-xl border border-border overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 bg-muted border-b border-border">
        <div className="flex items-center gap-2 overflow-x-auto">
          {Object.keys(EXAMPLE_TEMPLATES).map((name) => (
            <button
              key={name}
              onClick={() => handleTemplateChange(name)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap transition-colors ${
                activeTemplate === name
                  ? "bg-accent text-white"
                  : "text-muted-fg hover:text-foreground hover:bg-background"
              }`}
            >
              {name}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2">
        <div className="relative border-b lg:border-b-0 lg:border-r border-border">
          <div className="flex items-center justify-between px-4 py-2 bg-code-bg border-b border-border">
            <span className="text-xs text-code-text/60 font-mono">editor.ts</span>
            <div className="flex items-center gap-1">
              <button
                onClick={handleCopy}
                className="p-1.5 rounded-md text-code-text/60 hover:text-code-text transition-colors"
                aria-label={copied ? "Copied" : "Copy code"}
              >
                {copied ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
              </button>
              <button
                onClick={handleReset}
                className="p-1.5 rounded-md text-code-text/60 hover:text-code-text transition-colors"
                aria-label="Reset code"
              >
                <RotateCcw size={14} />
              </button>
            </div>
          </div>
          <textarea
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="w-full h-64 p-4 bg-code-bg text-code-text text-sm font-mono leading-relaxed resize-none outline-none"
            spellCheck={false}
            aria-label="Code editor"
          />
        </div>

        <div className="flex flex-col">
          <div className="flex items-center justify-between px-4 py-2 bg-code-bg border-b border-border">
            <span className="text-xs text-code-text/60 font-mono">output</span>
            <button
              onClick={handleRun}
              disabled={isRunning}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                isRunning
                  ? "bg-accent/50 text-white/70 cursor-not-allowed"
                  : "bg-accent text-white hover:bg-accent-dark"
              }`}
              aria-label="Run code"
            >
              <Play size={12} />
              {isRunning ? "Running..." : "Run"}
            </button>
          </div>
          <div className="h-64 p-4 bg-code-bg overflow-auto">
            {isRunning ? (
              <div className="flex items-center gap-2 text-code-text/60 text-sm font-mono">
                <div className="w-2 h-2 bg-accent rounded-full animate-pulse" />
                Executing...
              </div>
            ) : output ? (
              <pre className="text-sm font-mono text-code-text leading-relaxed whitespace-pre-wrap">{output}</pre>
            ) : (
              <div className="text-sm font-mono text-code-text/40">
                Click &quot;Run&quot; to execute the code...
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
