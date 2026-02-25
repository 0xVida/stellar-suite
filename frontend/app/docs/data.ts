export interface NavItem {
  title: string;
  href: string;
  icon?: string;
  children?: NavItem[];
}

export interface SearchResult {
  title: string;
  href: string;
  section: string;
  excerpt: string;
}

export interface ApiMethod {
  name: string;
  description: string;
  signature: string;
  parameters: { name: string; type: string; description: string; required: boolean }[];
  returnType: string;
  example: string;
}

export interface ApiSection {
  title: string;
  slug: string;
  description: string;
  methods: ApiMethod[];
}

export const navigation: NavItem[] = [
  {
    title: "Getting Started",
    href: "/docs/getting-started",
    children: [
      { title: "Introduction", href: "/docs/getting-started#introduction" },
      { title: "Installation", href: "/docs/getting-started#installation" },
      { title: "Quick Start", href: "/docs/getting-started#quick-start" },
      { title: "Configuration", href: "/docs/getting-started#configuration" },
    ],
  },
  {
    title: "Guides",
    href: "/docs/guides",
    children: [
      { title: "Building Contracts", href: "/docs/guides#building-contracts" },
      { title: "Deploying Contracts", href: "/docs/guides#deploying-contracts" },
      { title: "Simulating Transactions", href: "/docs/guides#simulating-transactions" },
      { title: "Managing State", href: "/docs/guides#managing-state" },
    ],
  },
  {
    title: "API Reference",
    href: "/docs/api-reference",
    children: [
      { title: "Contract Management", href: "/docs/api-reference#contract-management" },
      { title: "Deployment", href: "/docs/api-reference#deployment" },
      { title: "Simulation", href: "/docs/api-reference#simulation" },
      { title: "RPC Client", href: "/docs/api-reference#rpc-client" },
    ],
  },
  {
    title: "Playground",
    href: "/docs/playground",
  },
];

export const apiSections: ApiSection[] = [
  {
    title: "Contract Management",
    slug: "contract-management",
    description: "APIs for managing smart contracts within your workspace.",
    methods: [
      {
        name: "buildContract",
        description: "Compiles a Soroban smart contract from the current workspace.",
        signature: "stellarSuite.buildContract(options?: BuildOptions): Promise<BuildResult>",
        parameters: [
          { name: "options", type: "BuildOptions", description: "Optional build configuration overrides.", required: false },
        ],
        returnType: "Promise<BuildResult>",
        example: `// Build the current contract\nawait stellarSuite.buildContract();\n\n// Build with custom options\nawait stellarSuite.buildContract({\n  release: true,\n  target: 'wasm32-unknown-unknown'\n});`,
      },
      {
        name: "parseContractSource",
        description: "Parses contract source code to extract ABI, functions, and type information.",
        signature: "stellarSuite.parseContractSource(filePath: string): Promise<ContractInfo>",
        parameters: [
          { name: "filePath", type: "string", description: "Path to the contract source file.", required: true },
        ],
        returnType: "Promise<ContractInfo>",
        example: `const info = await stellarSuite.parseContractSource('./contracts/token.rs');\nconsole.log(info.functions); // List of contract functions\nconsole.log(info.types);     // Contract type definitions`,
      },
    ],
  },
  {
    title: "Deployment",
    slug: "deployment",
    description: "APIs for deploying contracts to Stellar networks.",
    methods: [
      {
        name: "deployContract",
        description: "Deploys a compiled contract to the configured Stellar network.",
        signature: "stellarSuite.deployContract(options?: DeployOptions): Promise<DeployResult>",
        parameters: [
          { name: "options", type: "DeployOptions", description: "Deployment configuration including network and signing method.", required: false },
        ],
        returnType: "Promise<DeployResult>",
        example: `// Deploy to testnet\nconst result = await stellarSuite.deployContract({\n  network: 'testnet',\n  source: 'dev'\n});\nconsole.log(result.contractId);`,
      },
      {
        name: "deployBatch",
        description: "Deploys multiple contracts in sequence with shared configuration.",
        signature: "stellarSuite.deployBatch(contracts: string[], options?: DeployOptions): Promise<DeployResult[]>",
        parameters: [
          { name: "contracts", type: "string[]", description: "Array of contract WASM file paths.", required: true },
          { name: "options", type: "DeployOptions", description: "Shared deployment configuration.", required: false },
        ],
        returnType: "Promise<DeployResult[]>",
        example: `const results = await stellarSuite.deployBatch(\n  ['./target/token.wasm', './target/vault.wasm'],\n  { network: 'testnet' }\n);`,
      },
    ],
  },
  {
    title: "Simulation",
    slug: "simulation",
    description: "APIs for simulating Soroban transactions before submission.",
    methods: [
      {
        name: "simulateTransaction",
        description: "Simulates a contract invocation without submitting it to the network.",
        signature: "stellarSuite.simulateTransaction(params: SimulationParams): Promise<SimulationResult>",
        parameters: [
          { name: "params", type: "SimulationParams", description: "Simulation parameters including contract ID, function, and arguments.", required: true },
        ],
        returnType: "Promise<SimulationResult>",
        example: `const result = await stellarSuite.simulateTransaction({\n  contractId: 'CABC...XYZ',\n  function: 'transfer',\n  args: [addressA, addressB, amount]\n});\nconsole.log(result.cost);    // Resource costs\nconsole.log(result.result);  // Return value`,
      },
      {
        name: "replaySimulation",
        description: "Replays a previously recorded simulation with optional modifications.",
        signature: "stellarSuite.replaySimulation(id: string, mods?: Modifications): Promise<SimulationResult>",
        parameters: [
          { name: "id", type: "string", description: "Simulation history entry ID.", required: true },
          { name: "mods", type: "Modifications", description: "Optional parameter modifications.", required: false },
        ],
        returnType: "Promise<SimulationResult>",
        example: `// Replay exact simulation\nawait stellarSuite.replaySimulation('sim-abc-123');\n\n// Replay with modified args\nawait stellarSuite.replaySimulation('sim-abc-123', {\n  args: [addressA, addressC, newAmount]\n});`,
      },
    ],
  },
  {
    title: "RPC Client",
    slug: "rpc-client",
    description: "APIs for managing RPC endpoint connections and health monitoring.",
    methods: [
      {
        name: "checkRpcHealth",
        description: "Checks the health status of configured RPC endpoints.",
        signature: "stellarSuite.checkRpcHealth(): Promise<HealthStatus[]>",
        parameters: [],
        returnType: "Promise<HealthStatus[]>",
        example: `const statuses = await stellarSuite.checkRpcHealth();\nstatuses.forEach(s => {\n  console.log(\`\${s.name}: \${s.healthy ? 'OK' : 'DOWN'} (\${s.latencyMs}ms)\`);\n});`,
      },
      {
        name: "switchRpcEndpoint",
        description: "Switches the active RPC endpoint to a specified one.",
        signature: "stellarSuite.switchRpcEndpoint(name: string): Promise<void>",
        parameters: [
          { name: "name", type: "string", description: "Name of the RPC endpoint to switch to.", required: true },
        ],
        returnType: "Promise<void>",
        example: `await stellarSuite.switchRpcEndpoint('Default Testnet');`,
      },
    ],
  },
];

export const searchableContent: SearchResult[] = [
  { title: "Introduction", href: "/docs/getting-started#introduction", section: "Getting Started", excerpt: "Stellar Suite is a VS Code extension that enhances the developer experience for building smart contracts on the Stellar network." },
  { title: "Installation", href: "/docs/getting-started#installation", section: "Getting Started", excerpt: "Install Stellar Suite from the VS Code Marketplace or build from source using npm." },
  { title: "Quick Start", href: "/docs/getting-started#quick-start", section: "Getting Started", excerpt: "Create your first Soroban smart contract, build, deploy, and simulate in minutes." },
  { title: "Configuration", href: "/docs/getting-started#configuration", section: "Getting Started", excerpt: "Configure RPC endpoints, CLI path, network settings, and notification preferences." },
  { title: "Building Contracts", href: "/docs/guides#building-contracts", section: "Guides", excerpt: "Compile Soroban smart contracts using the Stellar CLI with customizable build options." },
  { title: "Deploying Contracts", href: "/docs/guides#deploying-contracts", section: "Guides", excerpt: "Deploy compiled contracts to testnet or mainnet with retry logic and transaction signing." },
  { title: "Simulating Transactions", href: "/docs/guides#simulating-transactions", section: "Guides", excerpt: "Preview transaction results and resource costs before submitting to the network." },
  { title: "Managing State", href: "/docs/guides#managing-state", section: "Guides", excerpt: "Create backups, restore state, and manage simulation history and cache." },
  { title: "Contract Management API", href: "/docs/api-reference#contract-management", section: "API Reference", excerpt: "buildContract, parseContractSource — manage and compile smart contracts." },
  { title: "Deployment API", href: "/docs/api-reference#deployment", section: "API Reference", excerpt: "deployContract, deployBatch — deploy contracts to Stellar networks." },
  { title: "Simulation API", href: "/docs/api-reference#simulation", section: "API Reference", excerpt: "simulateTransaction, replaySimulation — simulate and replay Soroban transactions." },
  { title: "RPC Client API", href: "/docs/api-reference#rpc-client", section: "API Reference", excerpt: "checkRpcHealth, switchRpcEndpoint — manage RPC connections and health." },
  { title: "Interactive Playground", href: "/docs/playground", section: "Playground", excerpt: "Write, edit, and preview code examples in a live interactive editor." },
];
