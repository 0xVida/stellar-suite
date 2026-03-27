"use strict";
var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};

// out/utils/errorFormatter.js
var require_errorFormatter = __commonJS({
  "out/utils/errorFormatter.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.formatCliError = exports2.formatError = void 0;
    function formatError(error, context) {
      let title = "Error";
      let message = "An unexpected error occurred";
      let details;
      if (error instanceof Error) {
        message = error.message;
        details = error.stack;
        if (error.message.includes("ENOENT") || error.message.includes("not found")) {
          title = "Command Not Found";
          message = "Soroban CLI not found. Make sure it is installed and in your PATH, or configure the cliPath setting.";
        } else if (error.message.includes("ECONNREFUSED") || error.message.includes("network")) {
          title = "Connection Error";
          message = "Unable to connect to RPC endpoint. Check your network connection and rpcUrl setting.";
        } else if (error.message.includes("timeout")) {
          title = "Timeout";
          message = "Request timed out. The RPC endpoint may be slow or unreachable.";
        } else if (error.message.includes("invalid") || error.message.includes("Invalid")) {
          title = "Invalid Input";
        }
      } else if (typeof error === "string") {
        message = error;
      }
      if (context) {
        title = `${title} (${context})`;
      }
      return {
        title,
        message,
        details
      };
    }
    exports2.formatError = formatError;
    function formatCliError(stderr) {
      const lines = stderr.split("\n").filter((line) => line.trim().length > 0);
      for (const line of lines) {
        if (line.toLowerCase().includes("error") || line.toLowerCase().includes("failed")) {
          return line.trim();
        }
      }
      return lines[0] || stderr.trim() || "Unknown CLI error";
    }
    exports2.formatCliError = formatCliError;
  }
});

// out/services/sorobanCliService.js
var require_sorobanCliService = __commonJS({
  "out/services/sorobanCliService.js"(exports2) {
    "use strict";
    var __createBinding2 = exports2 && exports2.__createBinding || (Object.create ? function(o, m, k, k2) {
      if (k2 === void 0)
        k2 = k;
      var desc = Object.getOwnPropertyDescriptor(m, k);
      if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
        desc = { enumerable: true, get: function() {
          return m[k];
        } };
      }
      Object.defineProperty(o, k2, desc);
    } : function(o, m, k, k2) {
      if (k2 === void 0)
        k2 = k;
      o[k2] = m[k];
    });
    var __setModuleDefault2 = exports2 && exports2.__setModuleDefault || (Object.create ? function(o, v) {
      Object.defineProperty(o, "default", { enumerable: true, value: v });
    } : function(o, v) {
      o["default"] = v;
    });
    var __importStar2 = exports2 && exports2.__importStar || function(mod) {
      if (mod && mod.__esModule)
        return mod;
      var result = {};
      if (mod != null) {
        for (var k in mod)
          if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k))
            __createBinding2(result, mod, k);
      }
      __setModuleDefault2(result, mod);
      return result;
    };
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.SorobanCliService = exports2.execAsync = void 0;
    var child_process_1 = require("child_process");
    var util_1 = require("util");
    var errorFormatter_1 = require_errorFormatter();
    var os = __importStar2(require("os"));
    var path = __importStar2(require("path"));
    var execFileAsync = (0, util_1.promisify)(child_process_1.execFile);
    var rawExecAsync = (0, util_1.promisify)(child_process_1.exec);
    async function execAsync(command, options = {}) {
      const env = getEnvironmentWithPath();
      const result = await rawExecAsync(command, { encoding: "utf8", env, maxBuffer: 10 * 1024 * 1024, ...options });
      return {
        stdout: typeof result.stdout === "string" ? result.stdout : result.stdout.toString(),
        stderr: typeof result.stderr === "string" ? result.stderr : result.stderr.toString()
      };
    }
    exports2.execAsync = execAsync;
    function getEnvironmentWithPath() {
      const env = { ...process.env };
      const homeDir = os.homedir();
      const cargoBin = path.join(homeDir, ".cargo", "bin");
      const additionalPaths = [
        cargoBin,
        path.join(homeDir, ".local", "bin"),
        "/usr/local/bin",
        "/opt/homebrew/bin",
        "/opt/homebrew/sbin"
      ];
      const currentPath = env.PATH || env.Path || "";
      env.PATH = [...additionalPaths, currentPath].filter(Boolean).join(path.delimiter);
      env.Path = env.PATH;
      return env;
    }
    var SorobanCliService = class {
      constructor(cliPath, source = "dev", rpcUrl = "https://soroban-testnet.stellar.org:443", networkPassphrase = "Test SDF Network ; September 2015") {
        this.cliPath = cliPath;
        this.source = source;
        this.rpcUrl = rpcUrl;
        this.networkPassphrase = networkPassphrase;
      }
      async simulateTransaction(contractId, functionName, args, network = "testnet", send = false) {
        try {
          const commandParts = [
            this.cliPath,
            "contract",
            "invoke",
            "--id",
            contractId,
            "--source",
            this.source,
            "--rpc-url",
            this.rpcUrl,
            "--network-passphrase",
            this.networkPassphrase
          ];
          if (send) {
            commandParts.push("--send", "yes");
          }
          commandParts.push("--");
          commandParts.push(functionName);
          if (args.length > 0 && typeof args[0] === "object" && !Array.isArray(args[0])) {
            const argObj = args[0];
            for (const [key, value] of Object.entries(argObj)) {
              commandParts.push(`--${key}`);
              if (typeof value === "object") {
                commandParts.push(JSON.stringify(value));
              } else {
                commandParts.push(String(value));
              }
            }
          } else {
            for (const arg of args) {
              if (typeof arg === "object") {
                commandParts.push(JSON.stringify(arg));
              } else {
                commandParts.push(String(arg));
              }
            }
          }
          const env = getEnvironmentWithPath();
          const { stdout, stderr } = await execFileAsync(commandParts[0], commandParts.slice(1), {
            env,
            maxBuffer: 10 * 1024 * 1024,
            timeout: 3e4
          });
          if (stderr && stderr.trim().length > 0) {
            if (stderr.toLowerCase().includes("error") || stderr.toLowerCase().includes("failed")) {
              return {
                success: false,
                error: (0, errorFormatter_1.formatCliError)(stderr)
              };
            }
          }
          try {
            const output = stdout.trim();
            const combinedOutput = stdout + "\n" + stderr;
            let transactionHash;
            const hashMatch = combinedOutput.match(/transaction:?\s*([a-f0-9]{64})/i);
            if (hashMatch) {
              transactionHash = hashMatch[1];
            }
            try {
              const parsed = JSON.parse(output);
              return {
                success: true,
                type: send ? "invocation" : "simulation",
                transactionHash,
                network,
                result: parsed.result || parsed.returnValue || parsed,
                resourceUsage: parsed.resource_usage || parsed.resourceUsage || parsed.cpu_instructions ? {
                  cpuInstructions: parsed.cpu_instructions,
                  memoryBytes: parsed.memory_bytes
                } : void 0
              };
            } catch {
              const jsonMatch = output.match(/\{[\s\S]*\}/);
              if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                return {
                  success: true,
                  type: send ? "invocation" : "simulation",
                  transactionHash,
                  network,
                  result: parsed.result || parsed.returnValue || parsed,
                  resourceUsage: parsed.resource_usage || parsed.resourceUsage || parsed.cpu_instructions ? {
                    cpuInstructions: parsed.cpu_instructions,
                    memoryBytes: parsed.memory_bytes
                  } : void 0
                };
              }
              return {
                success: true,
                type: send ? "invocation" : "simulation",
                transactionHash,
                network,
                result: output
              };
            }
          } catch (parseError) {
            return {
              success: true,
              result: stdout.trim()
            };
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : "Unknown error";
          if (errorMessage.includes("ENOENT") || errorMessage.includes("not found")) {
            return {
              success: false,
              error: `Stellar CLI not found at "${this.cliPath}". Make sure it is installed and in your PATH, or configure the Stellar Kit CLI path (stellarSuite.cliPath) setting.`
            };
          }
          return {
            success: false,
            error: `CLI execution failed: ${errorMessage}`
          };
        }
      }
      async buildTransaction(contractId, functionName, args, network = "testnet") {
        try {
          const commandParts = [
            this.cliPath,
            "contract",
            "invoke",
            "--id",
            contractId,
            "--source",
            this.source,
            "--rpc-url",
            this.rpcUrl,
            "--network-passphrase",
            this.networkPassphrase,
            "--build-only",
            "--"
          ];
          commandParts.push(functionName);
          if (args.length > 0 && typeof args[0] === "object" && !Array.isArray(args[0])) {
            const argObj = args[0];
            for (const [key, value] of Object.entries(argObj)) {
              commandParts.push(`--${key}`);
              if (typeof value === "object") {
                commandParts.push(JSON.stringify(value));
              } else {
                commandParts.push(String(value));
              }
            }
          } else {
            for (const arg of args) {
              if (typeof arg === "object") {
                commandParts.push(JSON.stringify(arg));
              } else {
                commandParts.push(String(arg));
              }
            }
          }
          const env = getEnvironmentWithPath();
          const { stdout, stderr } = await execFileAsync(commandParts[0], commandParts.slice(1), {
            env,
            maxBuffer: 10 * 1024 * 1024,
            timeout: 3e4
          });
          if (stderr && stderr.trim().length > 0) {
            if (stderr.toLowerCase().includes("error") || stderr.toLowerCase().includes("failed")) {
              throw new Error((0, errorFormatter_1.formatCliError)(stderr));
            }
          }
          return stdout.trim();
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : "Unknown error";
          throw new Error(`Failed to build transaction XDR: ${errorMessage}`);
        }
      }
      async isAvailable() {
        try {
          const env = getEnvironmentWithPath();
          await execFileAsync(this.cliPath, ["--version"], { env, timeout: 5e3 });
          return true;
        } catch {
          return false;
        }
      }
      static async findCliPath() {
        const commonPaths = [
          "stellar",
          path.join(os.homedir(), ".cargo", "bin", "stellar"),
          "/usr/local/bin/stellar",
          "/opt/homebrew/bin/stellar",
          "/usr/bin/stellar"
        ];
        const env = getEnvironmentWithPath();
        for (const cliPath of commonPaths) {
          try {
            if (cliPath === "stellar") {
              await execAsync("stellar --version", { env, timeout: 5e3 });
              return "stellar";
            } else {
              await execFileAsync(cliPath, ["--version"], { env, timeout: 5e3 });
              return cliPath;
            }
          } catch {
          }
        }
        return null;
      }
    };
    exports2.SorobanCliService = SorobanCliService;
  }
});

// out/services/rpcService.js
var require_rpcService = __commonJS({
  "out/services/rpcService.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.RpcService = void 0;
    var errorFormatter_1 = require_errorFormatter();
    var RpcService = class {
      constructor(rpcUrl) {
        this.rpcUrl = rpcUrl.endsWith("/") ? rpcUrl.slice(0, -1) : rpcUrl;
      }
      async simulateTransaction(contractId, functionName, args) {
        try {
          const requestBody = {
            jsonrpc: "2.0",
            id: 1,
            method: "simulateTransaction",
            params: {
              transaction: {
                contractId,
                functionName,
                args: args.map((arg) => ({
                  value: arg
                }))
              }
            }
          };
          const response = await fetch(`${this.rpcUrl}/rpc`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify(requestBody),
            signal: AbortSignal.timeout(3e4)
          });
          if (!response.ok) {
            return {
              success: false,
              error: `RPC request failed with status ${response.status}: ${response.statusText}`
            };
          }
          const data = await response.json();
          if (data.error) {
            return {
              success: false,
              error: data.error.message || "RPC error occurred"
            };
          }
          const result = data.result || data;
          return {
            success: true,
            result: result.returnValue || result.result || result,
            resourceUsage: result.resourceUsage || result.resource_usage
          };
        } catch (error) {
          const formatted = (0, errorFormatter_1.formatError)(error, "RPC");
          if (error instanceof TypeError && error.message.includes("fetch")) {
            return {
              success: false,
              error: `Network error: Unable to reach RPC endpoint at ${this.rpcUrl}. Check your connection and rpcUrl setting.`
            };
          }
          if (error instanceof Error && error.name === "AbortError") {
            return {
              success: false,
              error: "Request timed out. The RPC endpoint may be slow or unreachable."
            };
          }
          return {
            success: false,
            error: formatted.message
          };
        }
      }
      async simulateTransactionFromXdr(txXdr) {
        try {
          const requestBody = {
            jsonrpc: "2.0",
            id: 1,
            method: "simulateTransaction",
            params: {
              transaction: txXdr
            }
          };
          const response = await fetch(`${this.rpcUrl}/rpc`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify(requestBody),
            signal: AbortSignal.timeout(3e4)
          });
          if (!response.ok) {
            return {
              success: false,
              error: `RPC request failed with status ${response.status}: ${response.statusText}`
            };
          }
          const data = await response.json();
          if (data.error) {
            return {
              success: false,
              error: data.error.message || "RPC error occurred"
            };
          }
          const result = data.result || data;
          return {
            success: true,
            result: result.returnValue || result.result || result,
            resourceUsage: {
              cpuInstructions: result.cost?.cpuInsns || result.cpuInstructions,
              memoryBytes: result.cost?.memBytes || result.memoryBytes,
              minResourceFee: result.minResourceFee
            },
            events: result.events,
            auth: result.results?.[0]?.auth
          };
        } catch (error) {
          const formatted = (0, errorFormatter_1.formatError)(error, "RPC");
          if (error instanceof TypeError && error.message.includes("fetch")) {
            return {
              success: false,
              error: `Network error: Unable to reach RPC endpoint at ${this.rpcUrl}. Check your connection and rpcUrl setting.`
            };
          }
          if (error instanceof Error && error.name === "AbortError") {
            return {
              success: false,
              error: "Request timed out. The RPC endpoint may be slow or unreachable."
            };
          }
          return {
            success: false,
            error: formatted.message
          };
        }
      }
      async isAvailable() {
        try {
          const response = await fetch(`${this.rpcUrl}/health`, {
            method: "GET",
            signal: AbortSignal.timeout(5e3)
          });
          return response.ok;
        } catch {
          try {
            const response = await fetch(`${this.rpcUrl}/rpc`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getHealth" }),
              signal: AbortSignal.timeout(5e3)
            });
            return response.ok;
          } catch {
            return false;
          }
        }
      }
    };
    exports2.RpcService = RpcService;
  }
});

// out/services/contractInspector.js
var require_contractInspector = __commonJS({
  "out/services/contractInspector.js"(exports2) {
    "use strict";
    var __createBinding2 = exports2 && exports2.__createBinding || (Object.create ? function(o, m, k, k2) {
      if (k2 === void 0)
        k2 = k;
      var desc = Object.getOwnPropertyDescriptor(m, k);
      if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
        desc = { enumerable: true, get: function() {
          return m[k];
        } };
      }
      Object.defineProperty(o, k2, desc);
    } : function(o, m, k, k2) {
      if (k2 === void 0)
        k2 = k;
      o[k2] = m[k];
    });
    var __setModuleDefault2 = exports2 && exports2.__setModuleDefault || (Object.create ? function(o, v) {
      Object.defineProperty(o, "default", { enumerable: true, value: v });
    } : function(o, v) {
      o["default"] = v;
    });
    var __importStar2 = exports2 && exports2.__importStar || function(mod) {
      if (mod && mod.__esModule)
        return mod;
      var result = {};
      if (mod != null) {
        for (var k in mod)
          if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k))
            __createBinding2(result, mod, k);
      }
      __setModuleDefault2(result, mod);
      return result;
    };
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.ContractInspector = void 0;
    var child_process_1 = require("child_process");
    var util_1 = require("util");
    var os = __importStar2(require("os"));
    var path = __importStar2(require("path"));
    var execFileAsync = (0, util_1.promisify)(child_process_1.execFile);
    function getEnvironmentWithPath() {
      const env = { ...process.env };
      const homeDir = os.homedir();
      const cargoBin = path.join(homeDir, ".cargo", "bin");
      const additionalPaths = [
        cargoBin,
        path.join(homeDir, ".local", "bin"),
        "/usr/local/bin",
        "/opt/homebrew/bin",
        "/opt/homebrew/sbin"
      ];
      const currentPath = env.PATH || env.Path || "";
      env.PATH = [...additionalPaths, currentPath].filter(Boolean).join(path.delimiter);
      env.Path = env.PATH;
      return env;
    }
    var ContractInspector = class {
      constructor(cliPath, source = "dev", network = "testnet", rpcUrl = "https://soroban-testnet.stellar.org:443", networkPassphrase = "Test SDF Network ; September 2015") {
        this.cliPath = cliPath;
        this.source = source;
        this.network = network;
        this.rpcUrl = rpcUrl;
        this.networkPassphrase = networkPassphrase;
      }
      async getContractFunctions(contractId) {
        try {
          const env = getEnvironmentWithPath();
          const { stdout } = await execFileAsync(this.cliPath, [
            "contract",
            "info",
            "interface",
            "--id",
            contractId,
            "--rpc-url",
            this.rpcUrl,
            "--network-passphrase",
            this.networkPassphrase,
            "--output",
            "json-formatted"
          ], {
            env,
            maxBuffer: 10 * 1024 * 1024,
            timeout: 3e4
          });
          return this.parseInterfaceJson(stdout);
        } catch (error) {
          console.error("Failed to get contract functions via JSON interface:", error);
          return this.getContractFunctionsLegacy(contractId);
        }
      }
      async getFunctionHelp(contractId, functionName) {
        const functions = await this.getContractFunctions(contractId);
        return functions.find((f) => f.name === functionName) || null;
      }
      parseInterfaceJson(jsonOutput) {
        try {
          const entries = JSON.parse(jsonOutput);
          if (!Array.isArray(entries))
            return [];
          const functions = [];
          for (const entry of entries) {
            if (entry.function_v0) {
              const fn = entry.function_v0;
              functions.push({
                name: fn.name,
                description: fn.doc || "",
                parameters: (fn.inputs || []).map((input) => ({
                  name: input.name,
                  type: this.formatType(input.type_),
                  required: true,
                  description: input.doc || ""
                }))
              });
            }
          }
          return functions;
        } catch (e) {
          console.error("Error parsing interface JSON:", e);
          return [];
        }
      }
      formatType(typeObj) {
        if (typeof typeObj === "string")
          return typeObj;
        if (typeObj.udt)
          return typeObj.udt.name;
        if (typeObj.vec)
          return `Vec<${this.formatType(typeObj.vec.element_type)}>`;
        if (typeObj.map)
          return `Map<${this.formatType(typeObj.map.key_type)}, ${this.formatType(typeObj.map.value_type)}>`;
        if (typeObj.optional)
          return `${this.formatType(typeObj.optional.value_type)} (optional)`;
        if (typeObj.tuple)
          return `Tuple(${typeObj.tuple.value_types.map((t) => this.formatType(t)).join(", ")})`;
        return JSON.stringify(typeObj);
      }
      async getContractFunctionsLegacy(contractId) {
        try {
          const env = getEnvironmentWithPath();
          const { stdout } = await execFileAsync(this.cliPath, [
            "contract",
            "invoke",
            "--id",
            contractId,
            "--source",
            this.source,
            "--rpc-url",
            this.rpcUrl,
            "--network-passphrase",
            this.networkPassphrase,
            "--",
            "--help"
          ], { env, timeout: 3e4 });
          return this.parseHelpOutput(stdout);
        } catch {
          return [];
        }
      }
      parseHelpOutput(helpOutput) {
        const functions = [];
        const lines = helpOutput.split("\n");
        let inCommandsSection = false;
        const seenFunctions = /* @__PURE__ */ new Set();
        for (let i = 0; i < lines.length; i++) {
          let line = lines[i].trim();
          if (line.length === 0) {
            continue;
          }
          if (line.toLowerCase().includes("commands:") || line.toLowerCase().includes("subcommands:")) {
            inCommandsSection = true;
            continue;
          }
          if ((line.toLowerCase().includes("options:") || line.toLowerCase().includes("global options:")) && inCommandsSection) {
            inCommandsSection = false;
            break;
          }
          if (inCommandsSection) {
            const functionMatch = line.match(/^(\w+)(?:\s{2,}|\s+)(.+)?$/);
            if (functionMatch) {
              const funcName = functionMatch[1];
              if (!seenFunctions.has(funcName)) {
                seenFunctions.add(funcName);
                functions.push({
                  name: funcName,
                  description: functionMatch[2]?.trim() || "",
                  parameters: []
                });
              }
            }
          }
        }
        return functions;
      }
    };
    exports2.ContractInspector = ContractInspector;
  }
});

// out/utils/workspaceDetector.js
var require_workspaceDetector = __commonJS({
  "out/utils/workspaceDetector.js"(exports2) {
    "use strict";
    var __createBinding2 = exports2 && exports2.__createBinding || (Object.create ? function(o, m, k, k2) {
      if (k2 === void 0)
        k2 = k;
      var desc = Object.getOwnPropertyDescriptor(m, k);
      if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
        desc = { enumerable: true, get: function() {
          return m[k];
        } };
      }
      Object.defineProperty(o, k2, desc);
    } : function(o, m, k, k2) {
      if (k2 === void 0)
        k2 = k;
      o[k2] = m[k];
    });
    var __setModuleDefault2 = exports2 && exports2.__setModuleDefault || (Object.create ? function(o, v) {
      Object.defineProperty(o, "default", { enumerable: true, value: v });
    } : function(o, v) {
      o["default"] = v;
    });
    var __importStar2 = exports2 && exports2.__importStar || function(mod) {
      if (mod && mod.__esModule)
        return mod;
      var result = {};
      if (mod != null) {
        for (var k in mod)
          if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k))
            __createBinding2(result, mod, k);
      }
      __setModuleDefault2(result, mod);
      return result;
    };
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.WorkspaceDetector = void 0;
    var vscode2 = __importStar2(require("vscode"));
    var fs = __importStar2(require("fs"));
    var path = __importStar2(require("path"));
    var WorkspaceDetector = class {
      /**
       * Find contract files in the workspace.
       * Looks for common contract file patterns.
       *
       * @returns Array of contract file paths
       */
      static async findContractFiles() {
        const contractFiles = [];
        if (!vscode2.workspace.workspaceFolders) {
          return contractFiles;
        }
        const patterns = [
          "**/src/lib.rs",
          "**/Cargo.toml",
          "**/*.wasm",
          "**/contracts/**/*.rs",
          "**/soroban/**/*.rs"
        ];
        for (const folder of vscode2.workspace.workspaceFolders) {
          for (const pattern of patterns) {
            const files = await vscode2.workspace.findFiles(new vscode2.RelativePattern(folder, pattern), "**/node_modules/**", 10);
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
        if (!vscode2.workspace.workspaceFolders) {
          return null;
        }
        const searchPatterns = [
          "**/.env",
          "**/.env.local",
          "**/stellar.toml",
          "**/soroban.toml",
          "**/README.md",
          "**/*.toml",
          "**/*.json"
        ];
        for (const folder of vscode2.workspace.workspaceFolders) {
          for (const pattern of searchPatterns) {
            try {
              const files = await vscode2.workspace.findFiles(new vscode2.RelativePattern(folder, pattern), "**/node_modules/**", 20);
              for (const file of files) {
                const content = fs.readFileSync(file.fsPath, "utf-8");
                const contractIdMatch = content.match(/C[A-Z0-9]{55}/);
                if (contractIdMatch) {
                  return contractIdMatch[0];
                }
                const envMatch = content.match(/(?:CONTRACT_ID|contract_id)\s*[=:]\s*([CA-Z0-9]{56})/i);
                if (envMatch) {
                  return envMatch[1];
                }
              }
            } catch (error) {
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
        const editor = vscode2.window.activeTextEditor;
        if (!editor) {
          return null;
        }
        const filePath = editor.document.fileName;
        const ext = path.extname(filePath);
        if (ext === ".rs" || filePath.includes("contract") || filePath.includes("soroban")) {
          return filePath;
        }
        return null;
      }
    };
    exports2.WorkspaceDetector = WorkspaceDetector;
  }
});

// out/ui/simulationPanel.js
var require_simulationPanel = __commonJS({
  "out/ui/simulationPanel.js"(exports2) {
    "use strict";
    var __createBinding2 = exports2 && exports2.__createBinding || (Object.create ? function(o, m, k, k2) {
      if (k2 === void 0)
        k2 = k;
      var desc = Object.getOwnPropertyDescriptor(m, k);
      if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
        desc = { enumerable: true, get: function() {
          return m[k];
        } };
      }
      Object.defineProperty(o, k2, desc);
    } : function(o, m, k, k2) {
      if (k2 === void 0)
        k2 = k;
      o[k2] = m[k];
    });
    var __setModuleDefault2 = exports2 && exports2.__setModuleDefault || (Object.create ? function(o, v) {
      Object.defineProperty(o, "default", { enumerable: true, value: v });
    } : function(o, v) {
      o["default"] = v;
    });
    var __importStar2 = exports2 && exports2.__importStar || function(mod) {
      if (mod && mod.__esModule)
        return mod;
      var result = {};
      if (mod != null) {
        for (var k in mod)
          if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k))
            __createBinding2(result, mod, k);
      }
      __setModuleDefault2(result, mod);
      return result;
    };
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.SimulationPanel = void 0;
    var vscode2 = __importStar2(require("vscode"));
    var SimulationPanel = class _SimulationPanel {
      constructor(panel, context) {
        this._disposables = [];
        this._panel = panel;
        this._update();
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
        this._panel.webview.onDidReceiveMessage((message) => {
          switch (message.command) {
            case "refresh":
              this._update();
              return;
          }
        }, null, this._disposables);
      }
      static createOrShow(context) {
        const column = vscode2.window.activeTextEditor ? vscode2.window.activeTextEditor.viewColumn : void 0;
        if (_SimulationPanel.currentPanel) {
          _SimulationPanel.currentPanel._panel.reveal(column);
          return _SimulationPanel.currentPanel;
        }
        const panel = vscode2.window.createWebviewPanel("simulationPanel", "Soroban Simulation Result", column || vscode2.ViewColumn.One, {
          enableScripts: true,
          retainContextWhenHidden: true
        });
        _SimulationPanel.currentPanel = new _SimulationPanel(panel, context);
        return _SimulationPanel.currentPanel;
      }
      updateResults(result, contractId, functionName, args) {
        const typeLabel = result.type === "invocation" ? "Invocation" : "Simulation";
        this._panel.title = `Soroban ${typeLabel} Result`;
        this._panel.webview.html = this._getHtmlForResults(result, contractId, functionName, args);
      }
      dispose() {
        _SimulationPanel.currentPanel = void 0;
        this._panel.dispose();
        while (this._disposables.length) {
          const x = this._disposables.pop();
          if (x) {
            x.dispose();
          }
        }
      }
      _update() {
        this._panel.webview.html = this._getHtmlForLoading();
      }
      _getHtmlForLoading() {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Simulation Result</title>
    <style>
        :root {
            --brand-bg: hsl(222, 47%, 6%);
            --brand-primary: hsl(228, 76%, 60%);
            --brand-secondary: hsl(217.2, 32.6%, 17.5%);
            --brand-foreground: hsl(210, 40%, 96%);
            --brand-border: hsl(217.2, 32.6%, 17.5%);
        }
        body {
            font-family: var(--vscode-font-family);
            padding: 24px;
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            line-height: 1.6;
        }
        .loading {
            text-align: center;
            padding: 60px;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 16px;
        }
        .spinner {
            width: 32px;
            height: 32px;
            border: 3px solid var(--brand-secondary);
            border-top: 3px solid var(--brand-primary);
            border-radius: 50%;
            animation: spin 1s linear infinite;
        }
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
    </style>
</head>
<body>
    <div class="loading">
        <div class="spinner"></div>
        <p style="font-weight: 600; color: var(--brand-primary);">Processing Soroban Transaction...</p>
    </div>
</body>
</html>`;
      }
      _getHtmlForResults(result, contractId, functionName, args) {
        const escapeHtml = (text) => {
          return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
        };
        const formatValue = (value) => {
          if (value === null || value === void 0) {
            return "<em>null</em>";
          }
          if (typeof value === "object") {
            return `<pre>${escapeHtml(JSON.stringify(value, null, 2))}</pre>`;
          }
          return escapeHtml(String(value));
        };
        let statusClass = result.success ? "success" : "error";
        let statusIcon = result.success ? "[OK]" : "[FAIL]";
        let statusText = result.success ? "Success" : "Failed";
        const typeLabel = result.type === "invocation" ? "Invocation" : "Simulation";
        if (!result.success && result.error === "Running simulation...") {
          statusClass = "pending";
          statusIcon = "[...]";
          statusText = result.type === "invocation" ? "Invoking..." : "Simulating...";
        }
        const resourceUsageHtml = result.resourceUsage ? `
            <div class="section">
                <h3>Resource Usage</h3>
                <table>
                    ${result.resourceUsage.cpuInstructions ? `<tr><td>CPU Instructions:</td><td>${result.resourceUsage.cpuInstructions.toLocaleString()}</td></tr>` : ""}
                    ${result.resourceUsage.memoryBytes ? `<tr><td>Memory:</td><td>${(result.resourceUsage.memoryBytes / 1024).toFixed(2)} KB</td></tr>` : ""}
                    ${result.resourceUsage.minResourceFee ? `<tr><td>Min Resource Fee:</td><td>${Number(result.resourceUsage.minResourceFee).toLocaleString()} stroops</td></tr>` : ""}
                </table>
            </div>
            ` : "";
        const explorerBaseUrl = result.network === "mainnet" ? "https://stellar.expert/explorer/public/tx/" : result.network === "futurenet" ? "https://stellar.expert/explorer/futurenet/tx/" : "https://stellar.expert/explorer/testnet/tx/";
        const transactionHtml = result.transactionHash ? `
            <div class="section">
                <h3>Blockchain Transaction</h3>
                <table>
                    <tr>
                        <td>Transaction ID:</td>
                        <td>
                            <code style="word-break: break-all;">${escapeHtml(result.transactionHash)}</code>
                            <div style="margin-top: 8px;">
                                <a href="${explorerBaseUrl}${result.transactionHash}" target="_blank" class="btn-link">View on Stellar Expert \u2197</a>
                            </div>
                        </td>
                    </tr>
                </table>
            </div>
            ` : "";
        const eventsHtml = result.events && result.events.length > 0 ? `
            <div class="section">
                <h3>Emitted Events</h3>
                ${result.events.map((e, i) => `
                    <div class="event-item" style="margin-bottom: 8px; padding: 12px; background: var(--vscode-textCodeBlock-background); border: 1px solid var(--vscode-panel-border); border-radius: 4px;">
                        <div style="font-weight: 600; margin-bottom: 4px; color: var(--vscode-textLink-foreground);">Event #${i + 1}</div>
                        <pre style="margin: 0; padding: 0; background: transparent; border: none; overflow-x: auto;">${escapeHtml(typeof e === "string" ? e : JSON.stringify(e, null, 2))}</pre>
                    </div>
                `).join("")}
            </div>
            ` : "";
        const authHtml = result.auth && result.auth.length > 0 ? `
            <div class="section">
                <h3>Authorization Requirements</h3>
                ${result.auth.map((a, i) => `
                    <div class="auth-item" style="margin-bottom: 8px; padding: 12px; background: var(--vscode-textCodeBlock-background); border: 1px solid var(--vscode-panel-border); border-radius: 4px;">
                        <div style="font-weight: 600; margin-bottom: 4px; color: var(--vscode-textLink-foreground);">Auth #${i + 1}</div>
                        <pre style="margin: 0; padding: 0; background: transparent; border: none; overflow-x: auto;">${escapeHtml(JSON.stringify(a, null, 2))}</pre>
                    </div>
                `).join("")}
            </div>
            ` : "";
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${typeLabel} Result</title>
    <style>
        :root {
            --brand-bg: hsl(222, 47%, 6%);
            --brand-primary: hsl(228, 76%, 60%);
            --brand-secondary: hsl(217.2, 32.6%, 17.5%);
            --brand-foreground: hsl(210, 40%, 96%);
            --brand-border: hsl(217.2, 32.6%, 17.5%);
        }
        body {
            font-family: var(--vscode-font-family);
            padding: 24px;
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            line-height: 1.6;
        }
        .status {
            padding: 16px 20px;
            border-radius: 8px;
            margin-bottom: 24px;
            font-weight: 700;
            display: flex;
            align-items: center;
            gap: 12px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
        }
        .status.success {
            background-color: rgba(34, 197, 94, 0.2);
            color: #22c55e;
            border: 1px solid rgba(34, 197, 94, 0.3);
        }
        .status.error {
            background-color: rgba(239, 68, 68, 0.2);
            color: #ef4444;
            border: 1px solid rgba(239, 68, 68, 0.3);
        }
        .status.pending {
            background-color: var(--brand-bg);
            color: var(--brand-primary);
            border: 1px solid var(--brand-border);
        }
        .section {
            margin-bottom: 32px;
            background: var(--vscode-sideBar-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 12px;
            padding: 20px;
        }
        .section h3 {
            margin-top: 0;
            margin-bottom: 16px;
            color: var(--brand-primary);
            font-size: 14px;
            text-transform: uppercase;
            letter-spacing: 1px;
            border-bottom: 1px solid var(--vscode-panel-border);
            padding-bottom: 10px;
        }
        table {
            width: 100%;
            border-collapse: collapse;
        }
        table td {
            padding: 10px 12px;
            border-bottom: 1px solid var(--vscode-panel-border);
            font-size: 13px;
        }
        table tr:last-child td {
            border-bottom: none;
        }
        table td:first-child {
            font-weight: 700;
            width: 200px;
            color: var(--vscode-descriptionForeground);
        }
        pre {
            background-color: var(--brand-bg);
            color: var(--brand-primary);
            padding: 16px;
            border-radius: 8px;
            overflow-x: auto;
            margin: 8px 0;
            border: 1px solid var(--brand-border);
            font-family: 'JetBrains Mono', var(--vscode-editor-font-family);
            font-size: 12px;
        }
        .error-message {
            background-color: rgba(239, 68, 68, 0.1);
            color: #ef4444;
            padding: 16px;
            border-radius: 8px;
            border-left: 4px solid #ef4444;
            font-family: 'JetBrains Mono', var(--vscode-editor-font-family);
        }
        .result-value {
            background-color: var(--brand-bg);
            padding: 16px;
            border-radius: 8px;
            border: 1px solid var(--brand-border);
        }
        .btn-link {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            padding: 10px 20px;
            background-color: var(--brand-primary);
            color: white !important;
            text-decoration: none;
            border-radius: 8px;
            font-size: 12px;
            font-weight: 700;
            transition: all 0.2s;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        }
        .btn-link:hover {
            opacity: 0.9;
            transform: translateY(-1px);
            box-shadow: 0 6px 12px rgba(0, 0, 0, 0.2);
        }
    </style>
</head>
<body>
    <div class="status ${statusClass}">
        ${statusIcon} ${statusText}
    </div>

    <div class="section">
        <h3>Transaction Details</h3>
        <table>
            <tr><td>Contract ID:</td><td><code>${escapeHtml(contractId)}</code></td></tr>
            <tr><td>Function:</td><td><code>${escapeHtml(functionName)}</code></td></tr>
            <tr><td>Arguments:</td><td><pre>${escapeHtml(JSON.stringify(args, null, 2))}</pre></td></tr>
        </table>
    </div>

    ${result.success ? `
        <div class="section">
            <h3>Return Value</h3>
            <div class="result-value">
                ${formatValue(result.result)}
            </div>
        </div>
        ${transactionHtml}
        ${resourceUsageHtml}
        ${eventsHtml}
        ${authHtml}
        ` : `
        <div class="section">
            <h3>Error</h3>
            <div class="error-message">
                ${escapeHtml(result.error || "Unknown error occurred")}
            </div>
        </div>
        `}
</body>
</html>`;
      }
    };
    exports2.SimulationPanel = SimulationPanel;
  }
});

// out/commands/simulateTransaction.js
var require_simulateTransaction = __commonJS({
  "out/commands/simulateTransaction.js"(exports2) {
    "use strict";
    var __createBinding2 = exports2 && exports2.__createBinding || (Object.create ? function(o, m, k, k2) {
      if (k2 === void 0)
        k2 = k;
      var desc = Object.getOwnPropertyDescriptor(m, k);
      if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
        desc = { enumerable: true, get: function() {
          return m[k];
        } };
      }
      Object.defineProperty(o, k2, desc);
    } : function(o, m, k, k2) {
      if (k2 === void 0)
        k2 = k;
      o[k2] = m[k];
    });
    var __setModuleDefault2 = exports2 && exports2.__setModuleDefault || (Object.create ? function(o, v) {
      Object.defineProperty(o, "default", { enumerable: true, value: v });
    } : function(o, v) {
      o["default"] = v;
    });
    var __importStar2 = exports2 && exports2.__importStar || function(mod) {
      if (mod && mod.__esModule)
        return mod;
      var result = {};
      if (mod != null) {
        for (var k in mod)
          if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k))
            __createBinding2(result, mod, k);
      }
      __setModuleDefault2(result, mod);
      return result;
    };
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.simulateTransaction = void 0;
    var vscode2 = __importStar2(require("vscode"));
    var sorobanCliService_12 = require_sorobanCliService();
    var rpcService_1 = require_rpcService();
    var contractInspector_1 = require_contractInspector();
    var workspaceDetector_1 = require_workspaceDetector();
    var simulationPanel_1 = require_simulationPanel();
    var errorFormatter_1 = require_errorFormatter();
    async function simulateTransaction(context, sidebarProvider2, args) {
      try {
        const config = vscode2.workspace.getConfiguration("stellarSuite");
        const useLocalCli = config.get("useLocalCli", true);
        const cliPath = config.get("cliPath", "stellar");
        const source = config.get("source", "dev");
        const network = config.get("network", "testnet") || "testnet";
        const rpcUrl = config.get("rpcUrl", "https://soroban-testnet.stellar.org:443");
        const networkPassphrase = config.get("networkPassphrase", "Test SDF Network ; September 2015");
        const selectedContractId = args?.contractId || context.workspaceState.get("selectedContractId");
        const lastContractId = context.workspaceState.get("lastContractId");
        let contractId = selectedContractId;
        const passedFunctionName = args?.functionName;
        if (args?.contractId) {
        } else if (selectedContractId) {
          await context.workspaceState.update("selectedContractId", void 0);
        } else {
          let defaultContractId = lastContractId || "";
          try {
            if (!defaultContractId) {
              const detectedId = await workspaceDetector_1.WorkspaceDetector.findContractId();
              if (detectedId) {
                defaultContractId = detectedId;
              }
            }
          } catch (error) {
          }
          contractId = await vscode2.window.showInputBox({
            prompt: "Enter the contract ID (address)",
            placeHolder: defaultContractId || "e.g., C...",
            value: defaultContractId,
            validateInput: (value) => {
              if (!value || value.trim().length === 0) {
                return "Contract ID is required";
              }
              if (!value.match(/^C[A-Z0-9]{55}$/)) {
                return "Invalid contract ID format (should start with C and be 56 characters)";
              }
              return null;
            }
          });
        }
        if (!contractId) {
          return;
        }
        let contractFunctions = [];
        let selectedFunction = null;
        let functionName = passedFunctionName || "";
        if (!functionName) {
          if (useLocalCli) {
            const inspector = new contractInspector_1.ContractInspector(cliPath, source, network, rpcUrl, networkPassphrase);
            try {
              contractFunctions = await inspector.getContractFunctions(contractId);
            } catch (error) {
            }
          }
          if (contractFunctions.length > 0) {
            const functionItems = contractFunctions.map((fn) => ({
              label: fn.name,
              description: fn.description || "",
              detail: fn.parameters.length > 0 ? `Parameters: ${fn.parameters.map((p) => p.name).join(", ")}` : "No parameters"
            }));
            const selected = await vscode2.window.showQuickPick(functionItems, {
              placeHolder: "Select a function to invoke"
            });
            if (!selected) {
              return;
            }
            selectedFunction = contractFunctions.find((f) => f.name === selected.label) || null;
            functionName = selected.label;
          } else {
            const input = await vscode2.window.showInputBox({
              prompt: "Enter the function name to call",
              placeHolder: "e.g., hello",
              validateInput: (value) => {
                if (!value || value.trim().length === 0) {
                  return "Function name is required";
                }
                return null;
              }
            });
            if (!input) {
              return;
            }
            functionName = input;
            if (useLocalCli) {
              const inspector = new contractInspector_1.ContractInspector(cliPath, source, network, rpcUrl, networkPassphrase);
              selectedFunction = await inspector.getFunctionHelp(contractId, functionName);
            }
          }
        } else if (useLocalCli) {
          const inspector = new contractInspector_1.ContractInspector(cliPath, source, network, rpcUrl, networkPassphrase);
          selectedFunction = await inspector.getFunctionHelp(contractId, functionName);
        }
        let txArgs = [];
        if (selectedFunction && selectedFunction.parameters.length > 0) {
          const argsObj = {};
          for (const param of selectedFunction.parameters) {
            const paramValue = await vscode2.window.showInputBox({
              prompt: `Enter value for parameter: ${param.name}${param.type ? ` (${param.type})` : ""}${param.required ? "" : " (optional)"}`,
              placeHolder: param.description || `Value for ${param.name}`,
              ignoreFocusOut: !param.required,
              validateInput: (value) => {
                if (param.required && (!value || value.trim().length === 0)) {
                  return `${param.name} is required`;
                }
                return null;
              }
            });
            if (param.required && paramValue === void 0) {
              return;
            }
            if (paramValue !== void 0 && paramValue.trim().length > 0) {
              try {
                argsObj[param.name] = JSON.parse(paramValue);
              } catch {
                argsObj[param.name] = paramValue;
              }
            }
          }
          txArgs = [argsObj];
        } else {
          const argsInput = await vscode2.window.showInputBox({
            prompt: `Enter arguments for "${functionName}" as JSON object (e.g., {"name": "value"})`,
            placeHolder: 'e.g., {"name": "world"}',
            value: "{}"
          });
          if (argsInput === void 0) {
            return;
          }
          try {
            const parsed = JSON.parse(argsInput || "{}");
            if (typeof parsed === "object" && !Array.isArray(parsed) && parsed !== null) {
              txArgs = [parsed];
            } else {
              vscode2.window.showErrorMessage("Arguments must be a JSON object");
              return;
            }
          } catch (error) {
            vscode2.window.showErrorMessage(`Invalid JSON: ${error instanceof Error ? error.message : "Unknown error"}. Using empty arguments.`);
            txArgs = [{}];
          }
        }
        const panel = simulationPanel_1.SimulationPanel.createOrShow(context);
        panel.updateResults({ success: false, error: "Running simulation...", type: "simulation" }, contractId, functionName, txArgs);
        await vscode2.window.withProgress({
          location: vscode2.ProgressLocation.Notification,
          title: "Simulating Soroban Transaction",
          cancellable: false
        }, async (progress) => {
          progress.report({ increment: 0, message: "Initializing..." });
          let result;
          if (useLocalCli) {
            progress.report({ increment: 30, message: "Using Stellar CLI..." });
            let actualCliPath = cliPath;
            let cliService = new sorobanCliService_12.SorobanCliService(actualCliPath, source, rpcUrl, networkPassphrase);
            let cliAvailable = await cliService.isAvailable();
            if (!cliAvailable && cliPath === "stellar") {
              progress.report({ increment: 35, message: "Auto-detecting Stellar CLI..." });
              const foundPath = await sorobanCliService_12.SorobanCliService.findCliPath();
              if (foundPath) {
                actualCliPath = foundPath;
                cliService = new sorobanCliService_12.SorobanCliService(actualCliPath, source, rpcUrl, networkPassphrase);
                cliAvailable = await cliService.isAvailable();
              }
            }
            if (!cliAvailable) {
              const foundPath = await sorobanCliService_12.SorobanCliService.findCliPath();
              const suggestion = foundPath ? `

Found Stellar CLI at: ${foundPath}
Update your stellarSuite.cliPath setting to: "${foundPath}"` : "\n\nCommon locations:\n- ~/.cargo/bin/stellar\n- /usr/local/bin/stellar\n\nOr install Stellar CLI: https://developers.stellar.org/docs/tools/cli";
              result = {
                success: false,
                error: `Stellar CLI not found at "${cliPath}".${suggestion}`
              };
            } else {
              progress.report({ increment: 40, message: "Building transaction XDR..." });
              try {
                const txXdr = await cliService.buildTransaction(contractId, functionName, txArgs, network);
                progress.report({ increment: 60, message: "Fetching rich simulation data from RPC..." });
                const rpcService = new rpcService_1.RpcService(rpcUrl);
                const rpcResult = await rpcService.simulateTransactionFromXdr(txXdr);
                progress.report({ increment: 80, message: "Executing local simulation for return value..." });
                const cliResult = await cliService.simulateTransaction(contractId, functionName, txArgs, network);
                if (cliResult.success) {
                  result = {
                    ...rpcResult,
                    success: true,
                    result: cliResult.result
                  };
                } else {
                  result = cliResult;
                }
              } catch (e) {
                result = {
                  success: false,
                  error: e.message || String(e)
                };
              }
              if (sidebarProvider2) {
                const argsStr = txArgs.length > 0 ? JSON.stringify(txArgs) : "";
                sidebarProvider2.addCliHistoryEntry("stellar contract invoke", ["--id", contractId, "--source", source, "--network", network, "--", functionName, argsStr].filter(Boolean));
              }
            }
          } else {
            result = {
              success: false,
              error: "Simulation without Stellar CLI is not supported. Please enable useLocalCli in settings."
            };
          }
          progress.report({ increment: 100, message: "Complete" });
          panel.updateResults(result, contractId, functionName, txArgs);
          if (sidebarProvider2) {
            sidebarProvider2.showSimulationResult(contractId, result);
          }
          if (result.success) {
            vscode2.window.showInformationMessage("Simulation completed successfully");
          } else {
            vscode2.window.showErrorMessage(`Simulation failed: ${result.error}`);
          }
        });
      } catch (error) {
        const formatted = (0, errorFormatter_1.formatError)(error, "Simulation");
        vscode2.window.showErrorMessage(`${formatted.title}: ${formatted.message}`);
      }
    }
    exports2.simulateTransaction = simulateTransaction;
  }
});

// out/services/contractDeployer.js
var require_contractDeployer = __commonJS({
  "out/services/contractDeployer.js"(exports2) {
    "use strict";
    var __createBinding2 = exports2 && exports2.__createBinding || (Object.create ? function(o, m, k, k2) {
      if (k2 === void 0)
        k2 = k;
      var desc = Object.getOwnPropertyDescriptor(m, k);
      if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
        desc = { enumerable: true, get: function() {
          return m[k];
        } };
      }
      Object.defineProperty(o, k2, desc);
    } : function(o, m, k, k2) {
      if (k2 === void 0)
        k2 = k;
      o[k2] = m[k];
    });
    var __setModuleDefault2 = exports2 && exports2.__setModuleDefault || (Object.create ? function(o, v) {
      Object.defineProperty(o, "default", { enumerable: true, value: v });
    } : function(o, v) {
      o["default"] = v;
    });
    var __importStar2 = exports2 && exports2.__importStar || function(mod) {
      if (mod && mod.__esModule)
        return mod;
      var result = {};
      if (mod != null) {
        for (var k in mod)
          if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k))
            __createBinding2(result, mod, k);
      }
      __setModuleDefault2(result, mod);
      return result;
    };
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.ContractDeployer = void 0;
    var child_process_1 = require("child_process");
    var util_1 = require("util");
    var path = __importStar2(require("path"));
    var fs = __importStar2(require("fs"));
    var os = __importStar2(require("os"));
    var execFileAsync = (0, util_1.promisify)(child_process_1.execFile);
    function getEnvironmentWithPath() {
      const env = { ...process.env };
      const homeDir = os.homedir();
      const cargoBin = path.join(homeDir, ".cargo", "bin");
      const additionalPaths = [
        cargoBin,
        path.join(homeDir, ".local", "bin"),
        "/usr/local/bin",
        "/opt/homebrew/bin",
        "/opt/homebrew/sbin"
      ];
      const currentPath = env.PATH || env.Path || "";
      env.PATH = [...additionalPaths, currentPath].filter(Boolean).join(path.delimiter);
      env.Path = env.PATH;
      return env;
    }
    var ContractDeployer = class {
      constructor(cliPath, source = "dev", network = "testnet") {
        this.cliPath = cliPath;
        this.source = source;
        this.network = network;
      }
      async buildContract(contractPath, optimize = false) {
        try {
          const env = getEnvironmentWithPath();
          const buildArgs = ["contract", "build"];
          if (optimize) {
            buildArgs.push("--optimize");
          }
          const { stdout, stderr } = await execFileAsync(this.cliPath, buildArgs, {
            cwd: contractPath,
            env,
            maxBuffer: 10 * 1024 * 1024,
            timeout: 12e4
          });
          const output = stdout + stderr;
          const wasmMatch = output.match(/target\/wasm32[^\/]*\/release\/[^\s]+\.wasm/);
          let wasmPath;
          let wasmSize;
          let wasmSizeFormatted;
          if (wasmMatch) {
            wasmPath = path.join(contractPath, wasmMatch[0]);
          } else {
            const commonPaths = [
              path.join(contractPath, "target", "wasm32v1-none", "release", "*.wasm"),
              path.join(contractPath, "target", "wasm32-unknown-unknown", "release", "*.wasm")
            ];
            for (const pattern of commonPaths) {
              const dir = path.dirname(pattern);
              if (fs.existsSync(dir)) {
                const files = fs.readdirSync(dir).filter((f) => f.endsWith(".wasm"));
                if (files.length > 0) {
                  wasmPath = path.join(dir, files[0]);
                  break;
                }
              }
            }
          }
          if (wasmPath && fs.existsSync(wasmPath)) {
            const stats = fs.statSync(wasmPath);
            wasmSize = stats.size;
            wasmSizeFormatted = this.formatFileSize(wasmSize);
          }
          return {
            success: true,
            output,
            wasmPath,
            wasmSize,
            wasmSizeFormatted
          };
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : "Unknown error";
          return {
            success: false,
            output: errorMessage
          };
        }
      }
      async deployContract(wasmPath) {
        try {
          if (!fs.existsSync(wasmPath)) {
            return {
              success: false,
              error: `WASM file not found: ${wasmPath}`
            };
          }
          const env = getEnvironmentWithPath();
          const { stdout, stderr } = await execFileAsync(this.cliPath, [
            "contract",
            "deploy",
            "--wasm",
            wasmPath,
            "--source",
            this.source,
            "--network",
            this.network
          ], {
            env,
            maxBuffer: 10 * 1024 * 1024,
            timeout: 6e4
          });
          const output = stdout + stderr;
          const contractIdMatch = output.match(/Contract\s+ID[:\s]+(C[A-Z0-9]{55})/i);
          const txHashMatch = output.match(/Transaction\s+hash[:\s]+([a-f0-9]{64})/i);
          const contractId = contractIdMatch ? contractIdMatch[1] : void 0;
          const transactionHash = txHashMatch ? txHashMatch[1] : void 0;
          if (!contractId) {
            const altMatch = output.match(/(C[A-Z0-9]{55})/);
            if (altMatch) {
              return {
                success: true,
                contractId: altMatch[0],
                transactionHash,
                deployOutput: output
              };
            }
            return {
              success: false,
              error: "Could not extract Contract ID from deployment output",
              deployOutput: output
            };
          }
          return {
            success: true,
            contractId,
            transactionHash,
            deployOutput: output
          };
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : "Unknown error";
          let errorOutput = errorMessage;
          let fullOutput = errorMessage;
          if (error instanceof Error && "stderr" in error) {
            const stderr = error.stderr || "";
            const stdout = error.stdout || "";
            fullOutput = stdout + stderr;
            errorOutput = stderr || errorMessage;
          }
          return {
            success: false,
            error: errorOutput,
            deployOutput: fullOutput
          };
        }
      }
      async buildAndDeploy(contractPath, optimize = false) {
        const buildResult = await this.buildContract(contractPath, optimize);
        if (!buildResult.success) {
          return {
            success: false,
            error: `Build failed: ${buildResult.output}`,
            buildOutput: buildResult.output
          };
        }
        if (!buildResult.wasmPath) {
          return {
            success: false,
            error: "Build succeeded but could not locate WASM file",
            buildOutput: buildResult.output
          };
        }
        const deployResult = await this.deployContract(buildResult.wasmPath);
        deployResult.buildOutput = buildResult.output;
        return deployResult;
      }
      async deployFromWasm(wasmPath) {
        return this.deployContract(wasmPath);
      }
      formatFileSize(bytes) {
        if (bytes === 0)
          return "0 B";
        const k = 1024;
        const sizes = ["B", "KB", "MB"];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
      }
      checkWasmSize(wasmSize) {
        const SIZE_WARNING_THRESHOLD = 500 * 1024;
        const SIZE_LARGE_THRESHOLD = 1024 * 1024;
        if (wasmSize > SIZE_LARGE_THRESHOLD) {
          return {
            warning: `WASM binary is very large (${this.formatFileSize(wasmSize)}). Consider optimizing to reduce deployment costs.`,
            isLarge: true
          };
        } else if (wasmSize > SIZE_WARNING_THRESHOLD) {
          return {
            warning: `WASM binary is large (${this.formatFileSize(wasmSize)}). Consider using optimized builds.`,
            isLarge: false
          };
        }
        return { isLarge: false };
      }
    };
    exports2.ContractDeployer = ContractDeployer;
  }
});

// out/utils/wasmDetector.js
var require_wasmDetector = __commonJS({
  "out/utils/wasmDetector.js"(exports2) {
    "use strict";
    var __createBinding2 = exports2 && exports2.__createBinding || (Object.create ? function(o, m, k, k2) {
      if (k2 === void 0)
        k2 = k;
      var desc = Object.getOwnPropertyDescriptor(m, k);
      if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
        desc = { enumerable: true, get: function() {
          return m[k];
        } };
      }
      Object.defineProperty(o, k2, desc);
    } : function(o, m, k, k2) {
      if (k2 === void 0)
        k2 = k;
      o[k2] = m[k];
    });
    var __setModuleDefault2 = exports2 && exports2.__setModuleDefault || (Object.create ? function(o, v) {
      Object.defineProperty(o, "default", { enumerable: true, value: v });
    } : function(o, v) {
      o["default"] = v;
    });
    var __importStar2 = exports2 && exports2.__importStar || function(mod) {
      if (mod && mod.__esModule)
        return mod;
      var result = {};
      if (mod != null) {
        for (var k in mod)
          if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k))
            __createBinding2(result, mod, k);
      }
      __setModuleDefault2(result, mod);
      return result;
    };
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.WasmDetector = void 0;
    var vscode2 = __importStar2(require("vscode"));
    var fs = __importStar2(require("fs"));
    var path = __importStar2(require("path"));
    var WasmDetector = class {
      static async findWasmFiles() {
        const wasmFiles = [];
        if (!vscode2.workspace.workspaceFolders) {
          return wasmFiles;
        }
        const patterns = [
          "**/*.wasm",
          "**/target/**/*.wasm"
        ];
        for (const folder of vscode2.workspace.workspaceFolders) {
          for (const pattern of patterns) {
            const files = await vscode2.workspace.findFiles(new vscode2.RelativePattern(folder, pattern), "**/node_modules/**", 50);
            wasmFiles.push(...files.map((f) => f.fsPath));
          }
        }
        return wasmFiles.filter((file) => {
          const dir = path.dirname(file);
          return dir.includes("target") || dir.includes("wasm32");
        });
      }
      static async findLatestWasm() {
        const wasmFiles = await this.findWasmFiles();
        if (wasmFiles.length === 0) {
          return null;
        }
        const withStats = wasmFiles.map((file) => ({
          path: file,
          mtime: fs.statSync(file).mtime.getTime()
        })).sort((a, b) => b.mtime - a.mtime);
        return withStats[0].path;
      }
      static async findContractDirectories() {
        const contractDirs = [];
        if (!vscode2.workspace.workspaceFolders) {
          return contractDirs;
        }
        const patterns = [
          "**/Cargo.toml"
        ];
        for (const folder of vscode2.workspace.workspaceFolders) {
          for (const pattern of patterns) {
            const files = await vscode2.workspace.findFiles(new vscode2.RelativePattern(folder, pattern), "**/node_modules/**", 20);
            for (const file of files) {
              const dir = path.dirname(file.fsPath);
              const libRs = path.join(dir, "src", "lib.rs");
              if (fs.existsSync(libRs)) {
                contractDirs.push(dir);
              }
            }
          }
        }
        return contractDirs;
      }
      static getActiveContractDirectory() {
        const editor = vscode2.window.activeTextEditor;
        if (!editor) {
          return null;
        }
        const filePath = editor.document.fileName;
        let currentDir = path.dirname(filePath);
        for (let i = 0; i < 10; i++) {
          const cargoToml = path.join(currentDir, "Cargo.toml");
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
          path.join(contractDir, "target", "wasm32v1-none", "release", "*.wasm"),
          path.join(contractDir, "target", "wasm32-unknown-unknown", "release", "*.wasm")
        ];
        for (const pattern of commonPaths) {
          const dir = path.dirname(pattern);
          if (fs.existsSync(dir)) {
            const files = fs.readdirSync(dir).filter((f) => f.endsWith(".wasm"));
            if (files.length > 0) {
              const contractName = path.basename(contractDir).replace(/-/g, "_");
              const wasmFile = files.find((f) => f.includes(contractName)) || files[0];
              return path.join(dir, wasmFile);
            }
          }
        }
        return null;
      }
    };
    exports2.WasmDetector = WasmDetector;
  }
});

// out/utils/outputChannel.js
var require_outputChannel = __commonJS({
  "out/utils/outputChannel.js"(exports2) {
    "use strict";
    var __createBinding2 = exports2 && exports2.__createBinding || (Object.create ? function(o, m, k, k2) {
      if (k2 === void 0)
        k2 = k;
      var desc = Object.getOwnPropertyDescriptor(m, k);
      if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
        desc = { enumerable: true, get: function() {
          return m[k];
        } };
      }
      Object.defineProperty(o, k2, desc);
    } : function(o, m, k, k2) {
      if (k2 === void 0)
        k2 = k;
      o[k2] = m[k];
    });
    var __setModuleDefault2 = exports2 && exports2.__setModuleDefault || (Object.create ? function(o, v) {
      Object.defineProperty(o, "default", { enumerable: true, value: v });
    } : function(o, v) {
      o["default"] = v;
    });
    var __importStar2 = exports2 && exports2.__importStar || function(mod) {
      if (mod && mod.__esModule)
        return mod;
      var result = {};
      if (mod != null) {
        for (var k in mod)
          if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k))
            __createBinding2(result, mod, k);
      }
      __setModuleDefault2(result, mod);
      return result;
    };
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.showSharedOutputChannel = exports2.getSharedOutputChannel = void 0;
    var vscode2 = __importStar2(require("vscode"));
    var sharedOutputChannel;
    function getSharedOutputChannel() {
      if (!sharedOutputChannel) {
        sharedOutputChannel = vscode2.window.createOutputChannel("Stellar Kit");
      }
      return sharedOutputChannel;
    }
    exports2.getSharedOutputChannel = getSharedOutputChannel;
    function showSharedOutputChannel() {
      const channel = getSharedOutputChannel();
      channel.show(true);
    }
    exports2.showSharedOutputChannel = showSharedOutputChannel;
  }
});

// out/commands/deployContract.js
var require_deployContract = __commonJS({
  "out/commands/deployContract.js"(exports2) {
    "use strict";
    var __createBinding2 = exports2 && exports2.__createBinding || (Object.create ? function(o, m, k, k2) {
      if (k2 === void 0)
        k2 = k;
      var desc = Object.getOwnPropertyDescriptor(m, k);
      if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
        desc = { enumerable: true, get: function() {
          return m[k];
        } };
      }
      Object.defineProperty(o, k2, desc);
    } : function(o, m, k, k2) {
      if (k2 === void 0)
        k2 = k;
      o[k2] = m[k];
    });
    var __setModuleDefault2 = exports2 && exports2.__setModuleDefault || (Object.create ? function(o, v) {
      Object.defineProperty(o, "default", { enumerable: true, value: v });
    } : function(o, v) {
      o["default"] = v;
    });
    var __importStar2 = exports2 && exports2.__importStar || function(mod) {
      if (mod && mod.__esModule)
        return mod;
      var result = {};
      if (mod != null) {
        for (var k in mod)
          if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k))
            __createBinding2(result, mod, k);
      }
      __setModuleDefault2(result, mod);
      return result;
    };
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.deployContract = void 0;
    var vscode2 = __importStar2(require("vscode"));
    var contractDeployer_1 = require_contractDeployer();
    var wasmDetector_1 = require_wasmDetector();
    var errorFormatter_1 = require_errorFormatter();
    var path = __importStar2(require("path"));
    var outputChannel_12 = require_outputChannel();
    async function deployContract(context, sidebarProvider2) {
      try {
        const config = vscode2.workspace.getConfiguration("stellarSuite");
        const cliPath = config.get("cliPath", "stellar");
        const source = config.get("source", "dev");
        const network = config.get("network", "testnet") || "testnet";
        const outputChannel = (0, outputChannel_12.getSharedOutputChannel)();
        (0, outputChannel_12.showSharedOutputChannel)();
        outputChannel.appendLine("=== Stellar Contract Deployment ===\n");
        const selectedContractPath = context.workspaceState.get("selectedContractPath");
        if (selectedContractPath) {
          outputChannel.appendLine(`[Deploy] Using selected contract path: ${selectedContractPath}`);
          context.workspaceState.update("selectedContractPath", void 0);
        }
        await vscode2.window.withProgress({
          location: vscode2.ProgressLocation.Notification,
          title: "Deploying Contract",
          cancellable: false
        }, async (progress) => {
          progress.report({ increment: 0, message: "Detecting contract..." });
          let contractDir = null;
          let wasmPath = null;
          let deployFromWasm = false;
          progress.report({ increment: 10, message: "Searching workspace..." });
          if (selectedContractPath) {
            const fs = require("fs");
            if (fs.existsSync(selectedContractPath)) {
              const stats = fs.statSync(selectedContractPath);
              if (stats.isFile() && selectedContractPath.endsWith(".wasm")) {
                wasmPath = selectedContractPath;
                deployFromWasm = true;
                outputChannel.appendLine(`Using selected WASM file: ${wasmPath}`);
              } else if (stats.isDirectory()) {
                const cargoToml = path.join(selectedContractPath, "Cargo.toml");
                if (fs.existsSync(cargoToml)) {
                  contractDir = selectedContractPath;
                  outputChannel.appendLine(`Using selected contract directory: ${contractDir}`);
                } else {
                  const parentDir = path.dirname(selectedContractPath);
                  const parentCargoToml = path.join(parentDir, "Cargo.toml");
                  if (fs.existsSync(parentCargoToml)) {
                    contractDir = parentDir;
                    outputChannel.appendLine(`Using parent contract directory: ${contractDir}`);
                  } else {
                    const wasmFiles = fs.readdirSync(selectedContractPath).filter((f) => f.endsWith(".wasm"));
                    if (wasmFiles.length > 0) {
                      wasmPath = path.join(selectedContractPath, wasmFiles[0]);
                      deployFromWasm = true;
                      outputChannel.appendLine(`Found WASM file in directory: ${wasmPath}`);
                    } else {
                      contractDir = selectedContractPath;
                      outputChannel.appendLine(`Using selected directory as contract: ${contractDir}`);
                    }
                  }
                }
              }
            }
          }
          if (!contractDir && !wasmPath) {
            const contractDirs = await wasmDetector_1.WasmDetector.findContractDirectories();
            outputChannel.appendLine(`Found ${contractDirs.length} contract directory(ies) in workspace`);
            const wasmFiles = await wasmDetector_1.WasmDetector.findWasmFiles();
            outputChannel.appendLine(`Found ${wasmFiles.length} WASM file(s) in workspace`);
            if (contractDirs.length > 0) {
              if (contractDirs.length === 1) {
                contractDir = contractDirs[0];
                outputChannel.appendLine(`Using contract directory: ${contractDir}`);
              } else {
                const fs = require("fs");
                const selected = await vscode2.window.showQuickPick(contractDirs.map((dir) => {
                  const wasm = wasmDetector_1.WasmDetector.getExpectedWasmPath(dir);
                  const hasWasm = wasm && fs.existsSync(wasm);
                  return {
                    label: path.basename(dir),
                    description: dir,
                    detail: hasWasm ? "WASM found" : "Needs build",
                    value: dir
                  };
                }), {
                  placeHolder: "Multiple contracts found. Select one to deploy:"
                });
                if (!selected) {
                  return;
                }
                contractDir = selected.value;
                outputChannel.appendLine(`Selected contract directory: ${contractDir}`);
              }
              if (contractDir) {
                const expectedWasm = wasmDetector_1.WasmDetector.getExpectedWasmPath(contractDir);
                const fs = require("fs");
                if (expectedWasm && fs.existsSync(expectedWasm)) {
                  const useExisting = await vscode2.window.showQuickPick([
                    { label: "Deploy existing WASM", value: "wasm", detail: expectedWasm },
                    { label: "Build and deploy", value: "build" }
                  ], {
                    placeHolder: "WASM file found. Deploy existing or build first?"
                  });
                  if (!useExisting) {
                    return;
                  }
                  if (useExisting.value === "wasm") {
                    wasmPath = expectedWasm;
                    deployFromWasm = true;
                  }
                }
              }
            } else if (wasmFiles.length > 0) {
              if (wasmFiles.length === 1) {
                wasmPath = wasmFiles[0];
                deployFromWasm = true;
                outputChannel.appendLine(`Using WASM file: ${wasmPath}`);
              } else {
                const fs = require("fs");
                const wasmWithStats = wasmFiles.map((file) => ({
                  path: file,
                  mtime: fs.statSync(file).mtime.getTime()
                })).sort((a, b) => b.mtime - a.mtime);
                const selected = await vscode2.window.showQuickPick(wasmWithStats.map(({ path: filePath }) => ({
                  label: path.basename(filePath),
                  description: path.dirname(filePath),
                  value: filePath
                })), {
                  placeHolder: "Multiple WASM files found. Select one to deploy:"
                });
                if (!selected) {
                  return;
                }
                wasmPath = selected.value;
                deployFromWasm = true;
                outputChannel.appendLine(`Selected WASM file: ${wasmPath}`);
              }
            } else {
              contractDir = wasmDetector_1.WasmDetector.getActiveContractDirectory();
              if (contractDir) {
                outputChannel.appendLine(`Found contract from active file: ${contractDir}`);
              }
            }
          }
          if (!contractDir && !wasmPath) {
            const action = await vscode2.window.showQuickPick([
              { label: "Select WASM file...", value: "wasm" },
              { label: "Select contract directory...", value: "dir" }
            ], {
              placeHolder: "No contract detected in workspace. How would you like to proceed?"
            });
            if (!action) {
              return;
            }
            if (action.value === "wasm") {
              const fileUri = await vscode2.window.showOpenDialog({
                canSelectFiles: true,
                canSelectFolders: false,
                canSelectMany: false,
                filters: {
                  "WASM files": ["wasm"]
                },
                title: "Select WASM file to deploy"
              });
              if (!fileUri || fileUri.length === 0) {
                return;
              }
              wasmPath = fileUri[0].fsPath;
              deployFromWasm = true;
            } else {
              const folderUri = await vscode2.window.showOpenDialog({
                canSelectFiles: false,
                canSelectFolders: true,
                canSelectMany: false,
                title: "Select contract directory"
              });
              if (!folderUri || folderUri.length === 0) {
                return;
              }
              contractDir = folderUri[0].fsPath;
            }
          }
          if (!contractDir && !wasmPath) {
            vscode2.window.showErrorMessage("No contract or WASM file selected");
            return;
          }
          const deployer = new contractDeployer_1.ContractDeployer(cliPath, source, network);
          let result;
          if (deployFromWasm && wasmPath) {
            progress.report({ increment: 30, message: "Deploying from WASM..." });
            outputChannel.appendLine(`
Deploying contract from: ${wasmPath}`);
            outputChannel.appendLine("Running: stellar contract deploy\n");
            result = await deployer.deployFromWasm(wasmPath);
            if (sidebarProvider2) {
              sidebarProvider2.addCliHistoryEntry("stellar contract deploy", ["--wasm", wasmPath, "--source", source, "--network", network]);
            }
            if (result.deployOutput) {
              outputChannel.appendLine("=== Deployment Output ===");
              outputChannel.appendLine(result.deployOutput);
              outputChannel.appendLine("");
            }
          } else if (contractDir) {
            const deployType = await vscode2.window.showQuickPick([
              { label: "Standard Build & Deploy", description: "Faster build, larger WASM", value: false },
              { label: "Optimized Build & Deploy", description: "Production-ready, smaller WASM", value: true }
            ], { placeHolder: "Select deployment build type" });
            if (deployType === void 0)
              return;
            const optimize = deployType.value;
            progress.report({ increment: 10, message: "Building contract..." });
            outputChannel.appendLine(`
Building contract (optimize: ${optimize}) in: ${contractDir}`);
            outputChannel.appendLine("Running: stellar contract build\n");
            result = await deployer.buildAndDeploy(contractDir, optimize);
            if (sidebarProvider2) {
              sidebarProvider2.addCliHistoryEntry("stellar contract build", [contractDir]);
              if (result.success && result.contractId) {
                const wasmPath2 = wasmDetector_1.WasmDetector.getExpectedWasmPath(contractDir);
                const fs = require("fs");
                const actualWasmPath = wasmPath2 && fs.existsSync(wasmPath2) ? wasmPath2 : "unknown";
                sidebarProvider2.addCliHistoryEntry("stellar contract deploy", ["--wasm", actualWasmPath, "--source", source, "--network", network]);
              }
            }
            if (result.buildOutput) {
              outputChannel.appendLine("=== Build Output ===");
              outputChannel.appendLine(result.buildOutput);
              outputChannel.appendLine("");
            }
            if (result.deployOutput) {
              outputChannel.appendLine("=== Deployment Output ===");
              outputChannel.appendLine(result.deployOutput);
              outputChannel.appendLine("");
            }
          } else {
            vscode2.window.showErrorMessage("Invalid deployment configuration");
            return;
          }
          progress.report({ increment: 90, message: "Finalizing..." });
          outputChannel.appendLine("=== Deployment Result ===");
          if (result.success) {
            outputChannel.appendLine("Deployment successful!");
            if (result.contractId) {
              outputChannel.appendLine(`Contract ID: ${result.contractId}`);
            }
            if (result.transactionHash) {
              outputChannel.appendLine(`Transaction Hash: ${result.transactionHash}`);
            }
            if (result.contractId) {
              const contractName = contractDir ? path.basename(contractDir) : path.basename(wasmPath || "unknown");
              const deploymentRecord = {
                contractId: result.contractId,
                contractName,
                contractPath: contractDir || void 0,
                deployedAt: (/* @__PURE__ */ new Date()).toISOString(),
                network,
                source
              };
              context.workspaceState.update("lastContractId", result.contractId);
              if (sidebarProvider2) {
                sidebarProvider2.showDeploymentResult(deploymentRecord);
              }
              vscode2.window.showInformationMessage(`Contract deployed successfully! Contract ID: ${result.contractId}`);
              await vscode2.env.clipboard.writeText(result.contractId);
            }
          } else {
            outputChannel.appendLine("Deployment failed!");
            outputChannel.appendLine(`Error: ${result.error || "Unknown error"}`);
            if (result.buildOutput) {
              outputChannel.appendLine("\n=== Build Output ===");
              outputChannel.appendLine(result.buildOutput);
            }
            if (result.deployOutput) {
              outputChannel.appendLine("\n=== Deployment Output ===");
              outputChannel.appendLine(result.deployOutput);
            }
            vscode2.window.showErrorMessage(`Deployment failed: ${result.error}`);
          }
          progress.report({ increment: 100, message: "Complete" });
        });
      } catch (error) {
        const formatted = (0, errorFormatter_1.formatError)(error, "Deployment");
        vscode2.window.showErrorMessage(`${formatted.title}: ${formatted.message}`);
      }
    }
    exports2.deployContract = deployContract;
  }
});

// out/commands/buildContract.js
var require_buildContract = __commonJS({
  "out/commands/buildContract.js"(exports2) {
    "use strict";
    var __createBinding2 = exports2 && exports2.__createBinding || (Object.create ? function(o, m, k, k2) {
      if (k2 === void 0)
        k2 = k;
      var desc = Object.getOwnPropertyDescriptor(m, k);
      if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
        desc = { enumerable: true, get: function() {
          return m[k];
        } };
      }
      Object.defineProperty(o, k2, desc);
    } : function(o, m, k, k2) {
      if (k2 === void 0)
        k2 = k;
      o[k2] = m[k];
    });
    var __setModuleDefault2 = exports2 && exports2.__setModuleDefault || (Object.create ? function(o, v) {
      Object.defineProperty(o, "default", { enumerable: true, value: v });
    } : function(o, v) {
      o["default"] = v;
    });
    var __importStar2 = exports2 && exports2.__importStar || function(mod) {
      if (mod && mod.__esModule)
        return mod;
      var result = {};
      if (mod != null) {
        for (var k in mod)
          if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k))
            __createBinding2(result, mod, k);
      }
      __setModuleDefault2(result, mod);
      return result;
    };
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.buildContract = void 0;
    var vscode2 = __importStar2(require("vscode"));
    var contractDeployer_1 = require_contractDeployer();
    var wasmDetector_1 = require_wasmDetector();
    var errorFormatter_1 = require_errorFormatter();
    var outputChannel_12 = require_outputChannel();
    async function buildContract(context, sidebarProvider2, args) {
      try {
        const config = vscode2.workspace.getConfiguration("stellarSuite");
        const cliPath = config.get("cliPath", "stellar");
        let optimize = args?.optimize;
        if (optimize === void 0) {
          const buildType = await vscode2.window.showQuickPick([
            { label: "Standard Build", description: "Faster, larger WASM", value: false },
            { label: "Optimized Build", description: "Production-ready, smaller WASM", value: true }
          ], { placeHolder: "Select build type" });
          if (!buildType)
            return;
          optimize = buildType.value;
        }
        const outputChannel = (0, outputChannel_12.getSharedOutputChannel)();
        (0, outputChannel_12.showSharedOutputChannel)();
        outputChannel.appendLine("=== Stellar Contract Build ===\n");
        const selectedContractPath = context.workspaceState.get("selectedContractPath");
        await vscode2.window.withProgress({
          location: vscode2.ProgressLocation.Notification,
          title: "Building Contract",
          cancellable: false
        }, async (progress) => {
          progress.report({ increment: 0, message: "Detecting contract..." });
          let contractDir = null;
          const pathArg = args?.contractPath;
          if (pathArg) {
            contractDir = pathArg;
            outputChannel.appendLine(`Using provided contract directory: ${contractDir}`);
          } else if (selectedContractPath) {
            const fs = require("fs");
            if (fs.existsSync(selectedContractPath)) {
              const stats = fs.statSync(selectedContractPath);
              if (stats.isDirectory()) {
                contractDir = selectedContractPath;
                outputChannel.appendLine(`Using selected contract directory: ${contractDir}`);
                context.workspaceState.update("selectedContractPath", void 0);
              }
            }
          }
          if (!contractDir) {
            progress.report({ increment: 10, message: "Searching workspace..." });
            const contractDirs = await wasmDetector_1.WasmDetector.findContractDirectories();
            outputChannel.appendLine(`Found ${contractDirs.length} contract directory(ies) in workspace`);
            if (contractDirs.length === 0) {
              vscode2.window.showErrorMessage("No contract directories found in workspace");
              return;
            } else if (contractDirs.length === 1) {
              contractDir = contractDirs[0];
            } else {
              const selected = await vscode2.window.showQuickPick(contractDirs.map((dir) => ({
                label: require("path").basename(dir),
                description: dir,
                value: dir
              })), {
                placeHolder: "Select contract to build"
              });
              if (!selected) {
                return;
              }
              contractDir = selected.value;
            }
          }
          if (!contractDir) {
            vscode2.window.showErrorMessage("No contract directory selected");
            return;
          }
          progress.report({ increment: 30, message: "Building contract..." });
          outputChannel.appendLine(`
Building contract in: ${contractDir}`);
          outputChannel.appendLine("Running: stellar contract build\n");
          const deployer = new contractDeployer_1.ContractDeployer(cliPath, "dev", "testnet");
          const buildResult = await deployer.buildContract(contractDir, optimize);
          if (sidebarProvider2) {
            sidebarProvider2.addCliHistoryEntry("stellar contract build", [contractDir]);
          }
          progress.report({ increment: 90, message: "Finalizing..." });
          outputChannel.appendLine("=== Build Result ===");
          if (buildResult.success) {
            outputChannel.appendLine("Build successful!");
            if (buildResult.wasmPath) {
              outputChannel.appendLine(`WASM file: ${buildResult.wasmPath}`);
              if (buildResult.wasmSizeFormatted) {
                outputChannel.appendLine(`WASM size: ${buildResult.wasmSizeFormatted}`);
                const sizeCheck = deployer.checkWasmSize(buildResult.wasmSize);
                if (sizeCheck.warning) {
                  outputChannel.appendLine(`\u26A0\uFE0F  ${sizeCheck.warning}`);
                }
              }
            }
            if (buildResult.output) {
              outputChannel.appendLine("\n=== Full Build Output ===");
              outputChannel.appendLine(buildResult.output);
            }
            vscode2.window.showInformationMessage("Contract built successfully!");
            if (sidebarProvider2) {
              await sidebarProvider2.refresh();
            }
          } else {
            outputChannel.appendLine("Build failed!");
            outputChannel.appendLine(`Error: ${buildResult.output}`);
            if (buildResult.output) {
              outputChannel.appendLine("\n=== Full Build Output ===");
              outputChannel.appendLine(buildResult.output);
            }
            vscode2.window.showErrorMessage(`Build failed: ${buildResult.output}`);
          }
          progress.report({ increment: 100, message: "Complete" });
        });
      } catch (error) {
        const formatted = (0, errorFormatter_1.formatError)(error, "Build");
        vscode2.window.showErrorMessage(`${formatted.title}: ${formatted.message}`);
      }
    }
    exports2.buildContract = buildContract;
  }
});

// out/commands/installCli.js
var require_installCli = __commonJS({
  "out/commands/installCli.js"(exports2) {
    "use strict";
    var __createBinding2 = exports2 && exports2.__createBinding || (Object.create ? function(o, m, k, k2) {
      if (k2 === void 0)
        k2 = k;
      var desc = Object.getOwnPropertyDescriptor(m, k);
      if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
        desc = { enumerable: true, get: function() {
          return m[k];
        } };
      }
      Object.defineProperty(o, k2, desc);
    } : function(o, m, k, k2) {
      if (k2 === void 0)
        k2 = k;
      o[k2] = m[k];
    });
    var __setModuleDefault2 = exports2 && exports2.__setModuleDefault || (Object.create ? function(o, v) {
      Object.defineProperty(o, "default", { enumerable: true, value: v });
    } : function(o, v) {
      o["default"] = v;
    });
    var __importStar2 = exports2 && exports2.__importStar || function(mod) {
      if (mod && mod.__esModule)
        return mod;
      var result = {};
      if (mod != null) {
        for (var k in mod)
          if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k))
            __createBinding2(result, mod, k);
      }
      __setModuleDefault2(result, mod);
      return result;
    };
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.installCli = void 0;
    var vscode2 = __importStar2(require("vscode"));
    var os = __importStar2(require("os"));
    async function installCli(context) {
      const platform = os.platform();
      const terminal = vscode2.window.createTerminal("Stellar CLI Installer");
      terminal.show();
      if (platform === "win32") {
        terminal.sendText("winget install --id Stellar.StellarCLI");
      } else {
        terminal.sendText("curl -fsSL https://github.com/stellar/stellar-cli/raw/main/install.sh | sh");
      }
      vscode2.window.showInformationMessage("Stellar CLI installation started in the terminal. Once it completes, you may need to restart VS Code or your terminal to pick it up in your PATH.");
    }
    exports2.installCli = installCli;
  }
});

// out/ui/networkStatusBar.js
var require_networkStatusBar = __commonJS({
  "out/ui/networkStatusBar.js"(exports2) {
    "use strict";
    var __createBinding2 = exports2 && exports2.__createBinding || (Object.create ? function(o, m, k, k2) {
      if (k2 === void 0)
        k2 = k;
      var desc = Object.getOwnPropertyDescriptor(m, k);
      if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
        desc = { enumerable: true, get: function() {
          return m[k];
        } };
      }
      Object.defineProperty(o, k2, desc);
    } : function(o, m, k, k2) {
      if (k2 === void 0)
        k2 = k;
      o[k2] = m[k];
    });
    var __setModuleDefault2 = exports2 && exports2.__setModuleDefault || (Object.create ? function(o, v) {
      Object.defineProperty(o, "default", { enumerable: true, value: v });
    } : function(o, v) {
      o["default"] = v;
    });
    var __importStar2 = exports2 && exports2.__importStar || function(mod) {
      if (mod && mod.__esModule)
        return mod;
      var result = {};
      if (mod != null) {
        for (var k in mod)
          if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k))
            __createBinding2(result, mod, k);
      }
      __setModuleDefault2(result, mod);
      return result;
    };
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.updateNetworkStatusBar = exports2.initNetworkStatusBar = void 0;
    var vscode2 = __importStar2(require("vscode"));
    var statusBarItem;
    async function initNetworkStatusBar(context) {
      statusBarItem = vscode2.window.createStatusBarItem(vscode2.StatusBarAlignment.Left, 100);
      statusBarItem.command = "stellarSuite.switchNetwork";
      context.subscriptions.push(statusBarItem);
      await updateNetworkStatusBar();
      statusBarItem.show();
    }
    exports2.initNetworkStatusBar = initNetworkStatusBar;
    async function updateNetworkStatusBar() {
      try {
        const config = vscode2.workspace.getConfiguration("stellarSuite");
        const currentNetwork = config.get("network") || "testnet";
        statusBarItem.text = `$(globe) Stellar: ${currentNetwork}`;
        statusBarItem.tooltip = "Click to switch Stellar Network";
      } catch (e) {
        statusBarItem.text = `$(globe) Stellar: testnet`;
      }
    }
    exports2.updateNetworkStatusBar = updateNetworkStatusBar;
  }
});

// out/commands/switchNetwork.js
var require_switchNetwork = __commonJS({
  "out/commands/switchNetwork.js"(exports2) {
    "use strict";
    var __createBinding2 = exports2 && exports2.__createBinding || (Object.create ? function(o, m, k, k2) {
      if (k2 === void 0)
        k2 = k;
      var desc = Object.getOwnPropertyDescriptor(m, k);
      if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
        desc = { enumerable: true, get: function() {
          return m[k];
        } };
      }
      Object.defineProperty(o, k2, desc);
    } : function(o, m, k, k2) {
      if (k2 === void 0)
        k2 = k;
      o[k2] = m[k];
    });
    var __setModuleDefault2 = exports2 && exports2.__setModuleDefault || (Object.create ? function(o, v) {
      Object.defineProperty(o, "default", { enumerable: true, value: v });
    } : function(o, v) {
      o["default"] = v;
    });
    var __importStar2 = exports2 && exports2.__importStar || function(mod) {
      if (mod && mod.__esModule)
        return mod;
      var result = {};
      if (mod != null) {
        for (var k in mod)
          if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k))
            __createBinding2(result, mod, k);
      }
      __setModuleDefault2(result, mod);
      return result;
    };
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.switchNetwork = void 0;
    var vscode2 = __importStar2(require("vscode"));
    var sorobanCliService_12 = require_sorobanCliService();
    var networkStatusBar_12 = require_networkStatusBar();
    async function switchNetwork() {
      try {
        let networks = [];
        try {
          const { stdout } = await (0, sorobanCliService_12.execAsync)("stellar network ls");
          const lines = stdout.split("\n").filter((line) => line.trim().length > 0);
          networks = lines.map((line) => line.trim()).filter((line) => !line.startsWith("\u2139\uFE0F"));
        } catch (e) {
          console.warn("Failed to fetch networks from CLI. Using fallbacks.", e.message);
        }
        if (networks.length === 0) {
          networks.push("testnet", "mainnet", "local");
        }
        const selected = await vscode2.window.showQuickPick(networks, {
          placeHolder: "Select a Stellar Network"
        });
        if (selected) {
          await (0, sorobanCliService_12.execAsync)(`stellar network use ${selected}`);
          const config = vscode2.workspace.getConfiguration("stellarSuite");
          await config.update("network", selected, vscode2.ConfigurationTarget.Global);
          vscode2.window.showInformationMessage(`Switched to Stellar network: ${selected}`);
          await (0, networkStatusBar_12.updateNetworkStatusBar)();
        }
      } catch (e) {
        vscode2.window.showErrorMessage(`Failed to switch network: ${e.message}`);
      }
    }
    exports2.switchNetwork = switchNetwork;
  }
});

// out/commands/keyManager.js
var require_keyManager = __commonJS({
  "out/commands/keyManager.js"(exports2) {
    "use strict";
    var __createBinding2 = exports2 && exports2.__createBinding || (Object.create ? function(o, m, k, k2) {
      if (k2 === void 0)
        k2 = k;
      var desc = Object.getOwnPropertyDescriptor(m, k);
      if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
        desc = { enumerable: true, get: function() {
          return m[k];
        } };
      }
      Object.defineProperty(o, k2, desc);
    } : function(o, m, k, k2) {
      if (k2 === void 0)
        k2 = k;
      o[k2] = m[k];
    });
    var __setModuleDefault2 = exports2 && exports2.__setModuleDefault || (Object.create ? function(o, v) {
      Object.defineProperty(o, "default", { enumerable: true, value: v });
    } : function(o, v) {
      o["default"] = v;
    });
    var __importStar2 = exports2 && exports2.__importStar || function(mod) {
      if (mod && mod.__esModule)
        return mod;
      var result = {};
      if (mod != null) {
        for (var k in mod)
          if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k))
            __createBinding2(result, mod, k);
      }
      __setModuleDefault2(result, mod);
      return result;
    };
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.keysList = exports2.fundIdentity = exports2.keysFund = exports2.keysGenerate = void 0;
    var vscode2 = __importStar2(require("vscode"));
    var sorobanCliService_12 = require_sorobanCliService();
    async function keysGenerate() {
      const name = await vscode2.window.showInputBox({
        prompt: "Enter a name for the new identity",
        placeHolder: "e.g., alice, bob, dev"
      });
      if (!name)
        return;
      try {
        await vscode2.window.withProgress({
          location: vscode2.ProgressLocation.Notification,
          title: `Generating Stellar key: ${name}...`,
          cancellable: false
        }, async () => {
          await (0, sorobanCliService_12.execAsync)(`stellar keys generate ${name}`);
        });
        vscode2.window.showInformationMessage(`Successfully generated identity: ${name}`);
      } catch (e) {
        vscode2.window.showErrorMessage(`Failed to generate identity: ${e.message}`);
      }
    }
    exports2.keysGenerate = keysGenerate;
    async function keysFund() {
      try {
        const { stdout } = await (0, sorobanCliService_12.execAsync)("stellar keys ls");
        const lines = stdout.split("\n").map((l) => l.trim()).filter(Boolean);
        const identities = lines.filter((line) => !line.startsWith("\u2139\uFE0F"));
        if (identities.length === 0) {
          vscode2.window.showErrorMessage("No identities found. Generate one first!");
          return;
        }
        const selected = await vscode2.window.showQuickPick(identities, {
          placeHolder: "Select identity to fund on Testnet"
        });
        if (!selected)
          return;
        await fundIdentity(selected);
      } catch (e) {
        vscode2.window.showErrorMessage(`Failed to fund identity: ${e.message}`);
      }
    }
    exports2.keysFund = keysFund;
    async function fundIdentity(name) {
      try {
        await vscode2.window.withProgress({
          location: vscode2.ProgressLocation.Notification,
          title: `Funding ${name} on Testnet... (This may take a few seconds)`,
          cancellable: false
        }, async () => {
          await (0, sorobanCliService_12.execAsync)(`stellar keys fund ${name} --network testnet`);
        });
        vscode2.window.showInformationMessage(`Successfully funded identity: ${name}`);
      } catch (e) {
        vscode2.window.showErrorMessage(`Failed to fund identity: ${e.message}`);
      }
    }
    exports2.fundIdentity = fundIdentity;
    async function keysList() {
      try {
        const { stdout } = await (0, sorobanCliService_12.execAsync)("stellar keys ls");
        const lines = stdout.split("\n").map((l) => l.trim()).filter(Boolean);
        const identities = lines.filter((line) => !line.startsWith("\u2139\uFE0F"));
        if (identities.length === 0) {
          vscode2.window.showInformationMessage("No identities found.");
          return;
        }
        const items = [];
        await vscode2.window.withProgress({
          location: vscode2.ProgressLocation.Notification,
          title: "Loading identities...",
          cancellable: false
        }, async () => {
          for (const line of identities) {
            const rawName = line.replace(/^\*\s*/, "").trim();
            const isSelected = line.startsWith("*");
            try {
              const addrOutput = await (0, sorobanCliService_12.execAsync)(`stellar keys address ${rawName}`);
              const pubKey = addrOutput.stdout.trim();
              items.push({
                label: `${isSelected ? "$(check) " : ""}${rawName}`,
                description: pubKey,
                rawName,
                rawPubKey: pubKey
              });
            } catch (e) {
            }
          }
        });
        const selected = await vscode2.window.showQuickPick(items, {
          placeHolder: "Select an identity to view options"
        });
        if (selected) {
          const action = await vscode2.window.showQuickPick([
            { label: "$(copy) Copy Public Key", id: "copy_pub" },
            { label: "$(star-empty) Use as Default Source", id: "use_default" },
            { label: "$(rocket) Fund Account (Airdrop)", id: "fund_account" }
          ], { placeHolder: `Actions for ${selected.rawName}` });
          if (action?.id === "copy_pub") {
            await vscode2.env.clipboard.writeText(selected.rawPubKey);
            vscode2.window.showInformationMessage(`Copied public key for ${selected.rawName}`);
          } else if (action?.id === "use_default") {
            const config = vscode2.workspace.getConfiguration("stellarSuite");
            await config.update("source", selected.rawName, vscode2.ConfigurationTarget.Workspace);
            vscode2.window.showInformationMessage(`Set default source account to: ${selected.rawName}`);
          } else if (action?.id === "fund_account") {
            await fundIdentity(selected.rawName);
          }
        }
      } catch (e) {
        vscode2.window.showErrorMessage(`Failed to list keys: ${e.message}`);
      }
    }
    exports2.keysList = keysList;
  }
});

// out/commands/generateBindings.js
var require_generateBindings = __commonJS({
  "out/commands/generateBindings.js"(exports2) {
    "use strict";
    var __createBinding2 = exports2 && exports2.__createBinding || (Object.create ? function(o, m, k, k2) {
      if (k2 === void 0)
        k2 = k;
      var desc = Object.getOwnPropertyDescriptor(m, k);
      if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
        desc = { enumerable: true, get: function() {
          return m[k];
        } };
      }
      Object.defineProperty(o, k2, desc);
    } : function(o, m, k, k2) {
      if (k2 === void 0)
        k2 = k;
      o[k2] = m[k];
    });
    var __setModuleDefault2 = exports2 && exports2.__setModuleDefault || (Object.create ? function(o, v) {
      Object.defineProperty(o, "default", { enumerable: true, value: v });
    } : function(o, v) {
      o["default"] = v;
    });
    var __importStar2 = exports2 && exports2.__importStar || function(mod) {
      if (mod && mod.__esModule)
        return mod;
      var result = {};
      if (mod != null) {
        for (var k in mod)
          if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k))
            __createBinding2(result, mod, k);
      }
      __setModuleDefault2(result, mod);
      return result;
    };
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.generateBindings = void 0;
    var vscode2 = __importStar2(require("vscode"));
    var sorobanCliService_12 = require_sorobanCliService();
    async function generateBindings(contractItem) {
      try {
        let contractId = "";
        if (contractItem && contractItem.contractId) {
          contractId = contractItem.contractId;
        } else {
          const input = await vscode2.window.showInputBox({
            prompt: "Enter the Contract ID to generate bindings for",
            placeHolder: "C..."
          });
          if (!input)
            return;
          contractId = input;
        }
        const languages = [
          { label: "TypeScript", value: "typescript" },
          { label: "Rust", value: "rust" }
        ];
        const selectedLang = await vscode2.window.showQuickPick(languages, {
          placeHolder: "Select target language for bindings"
        });
        if (!selectedLang)
          return;
        const workspaceFolders = vscode2.workspace.workspaceFolders;
        if (!workspaceFolders) {
          vscode2.window.showErrorMessage("Please open a workspace folder first.");
          return;
        }
        const defaultUri = vscode2.Uri.joinPath(workspaceFolders[0].uri, "src", "interactions", contractId.substring(0, 6));
        const outputUris = await vscode2.window.showOpenDialog({
          canSelectFiles: false,
          canSelectFolders: true,
          canSelectMany: false,
          openLabel: "Select Output Directory",
          defaultUri
        });
        if (!outputUris || outputUris.length === 0)
          return;
        const outputPath = outputUris[0].fsPath;
        await vscode2.window.withProgress({
          location: vscode2.ProgressLocation.Notification,
          title: `Generating ${selectedLang.label} bindings for ${contractId.substring(0, 8)}...`,
          cancellable: false
        }, async () => {
          const cmd = `stellar contract bindings ${selectedLang.value} --id ${contractId} --output-dir "${outputPath}"`;
          await (0, sorobanCliService_12.execAsync)(cmd);
        });
        vscode2.window.showInformationMessage(`Successfully generated ${selectedLang.label} bindings in ${outputPath}`);
      } catch (e) {
        vscode2.window.showErrorMessage(`Failed to generate bindings: ${e.message}`);
      }
    }
    exports2.generateBindings = generateBindings;
  }
});

// out/commands/runInvoke.js
var require_runInvoke = __commonJS({
  "out/commands/runInvoke.js"(exports2) {
    "use strict";
    var __createBinding2 = exports2 && exports2.__createBinding || (Object.create ? function(o, m, k, k2) {
      if (k2 === void 0)
        k2 = k;
      var desc = Object.getOwnPropertyDescriptor(m, k);
      if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
        desc = { enumerable: true, get: function() {
          return m[k];
        } };
      }
      Object.defineProperty(o, k2, desc);
    } : function(o, m, k, k2) {
      if (k2 === void 0)
        k2 = k;
      o[k2] = m[k];
    });
    var __setModuleDefault2 = exports2 && exports2.__setModuleDefault || (Object.create ? function(o, v) {
      Object.defineProperty(o, "default", { enumerable: true, value: v });
    } : function(o, v) {
      o["default"] = v;
    });
    var __importStar2 = exports2 && exports2.__importStar || function(mod) {
      if (mod && mod.__esModule)
        return mod;
      var result = {};
      if (mod != null) {
        for (var k in mod)
          if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k))
            __createBinding2(result, mod, k);
      }
      __setModuleDefault2(result, mod);
      return result;
    };
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.runInvoke = void 0;
    var vscode2 = __importStar2(require("vscode"));
    var sorobanCliService_12 = require_sorobanCliService();
    var contractInspector_1 = require_contractInspector();
    var workspaceDetector_1 = require_workspaceDetector();
    var simulationPanel_1 = require_simulationPanel();
    var errorFormatter_1 = require_errorFormatter();
    async function runInvoke(context, sidebarProvider2, args) {
      try {
        const config = vscode2.workspace.getConfiguration("stellarSuite");
        const cliPath = config.get("cliPath", "stellar");
        const source = config.get("source", "dev");
        const network = config.get("network", "testnet") || "testnet";
        const rpcUrl = config.get("rpcUrl", "https://soroban-testnet.stellar.org:443");
        const networkPassphrase = config.get("networkPassphrase", "Test SDF Network ; September 2015");
        const selectedContractId = args?.contractId || context.workspaceState.get("selectedContractId");
        const lastContractId = context.workspaceState.get("lastContractId");
        let contractId = selectedContractId;
        if (args?.contractId) {
        } else if (selectedContractId) {
          await context.workspaceState.update("selectedContractId", void 0);
        } else {
          let defaultContractId = lastContractId || "";
          try {
            if (!defaultContractId) {
              const detectedId = await workspaceDetector_1.WorkspaceDetector.findContractId();
              if (detectedId) {
                defaultContractId = detectedId;
              }
            }
          } catch (error) {
          }
          contractId = await vscode2.window.showInputBox({
            prompt: "Enter the contract ID (address) for LIVE INVOCATION",
            placeHolder: defaultContractId || "e.g., C...",
            value: defaultContractId,
            validateInput: (value) => {
              if (!value || value.trim().length === 0)
                return "Contract ID is required";
              if (!value.match(/^C[A-Z0-9]{55}$/))
                return "Invalid contract ID format";
              return null;
            }
          });
        }
        if (!contractId)
          return;
        const passedFunctionName = args?.functionName;
        let functionName = passedFunctionName || "";
        let selectedFunction = null;
        const inspector = new contractInspector_1.ContractInspector(cliPath, source, network, rpcUrl, networkPassphrase);
        if (!functionName) {
          const contractFunctions = await inspector.getContractFunctions(contractId);
          if (contractFunctions.length > 0) {
            const functionItems = contractFunctions.map((fn) => ({
              label: fn.name,
              description: fn.description || "",
              detail: fn.parameters.length > 0 ? `Parameters: ${fn.parameters.map((p) => p.name).join(", ")}` : "No parameters"
            }));
            const selected = await vscode2.window.showQuickPick(functionItems, {
              placeHolder: "Select a function to run"
            });
            if (!selected)
              return;
            selectedFunction = contractFunctions.find((f) => f.name === selected.label) || null;
            functionName = selected.label;
          } else {
            const input = await vscode2.window.showInputBox({
              prompt: "Enter the function name to call",
              placeHolder: "e.g., hello"
            });
            if (!input)
              return;
            functionName = input;
            selectedFunction = await inspector.getFunctionHelp(contractId, functionName);
          }
        } else {
          selectedFunction = await inspector.getFunctionHelp(contractId, functionName);
        }
        let invokeArgs = [];
        if (selectedFunction && selectedFunction.parameters.length > 0) {
          const argsObj = {};
          for (const param of selectedFunction.parameters) {
            const paramValue = await vscode2.window.showInputBox({
              prompt: `Enter value for ${param.name}${param.type ? ` (${param.type})` : ""}`,
              placeHolder: param.description || `Value for ${param.name}`,
              validateInput: (val) => param.required && !val ? `${param.name} is required` : null
            });
            if (param.required && paramValue === void 0)
              return;
            if (paramValue !== void 0 && paramValue.trim().length > 0) {
              try {
                argsObj[param.name] = JSON.parse(paramValue);
              } catch {
                argsObj[param.name] = paramValue;
              }
            }
          }
          invokeArgs = [argsObj];
        } else if (functionName) {
          const manualArgs = await vscode2.window.showInputBox({
            prompt: `Enter arguments for "${functionName}" as JSON object`,
            placeHolder: 'e.g., {"name": "world"}',
            value: "{}"
          });
          if (manualArgs === void 0)
            return;
          try {
            const parsed = JSON.parse(manualArgs || "{}");
            invokeArgs = [parsed];
          } catch (e) {
            vscode2.window.showErrorMessage("Invalid JSON arguments. Using empty arguments.");
            invokeArgs = [{}];
          }
        }
        const panel = simulationPanel_1.SimulationPanel.createOrShow(context);
        panel.updateResults({ success: false, error: "Running simulation...", type: "invocation" }, contractId, functionName, invokeArgs);
        await vscode2.window.withProgress({
          location: vscode2.ProgressLocation.Notification,
          title: "Executing Live Soroban Invocation",
          cancellable: false
        }, async (progress) => {
          progress.report({ message: "Submitting transaction..." });
          const cliService = new sorobanCliService_12.SorobanCliService(cliPath, source, rpcUrl, networkPassphrase);
          const result = await cliService.simulateTransaction(contractId || "", functionName, invokeArgs, network, true);
          panel.updateResults(result, contractId || "", functionName, invokeArgs);
          if (result.success) {
            vscode2.window.showInformationMessage("Live invocation completed successfully!");
          } else {
            vscode2.window.showErrorMessage(`Live invocation failed: ${result.error}`);
          }
        });
      } catch (error) {
        const formatted = (0, errorFormatter_1.formatError)(error, "Invocation");
        vscode2.window.showErrorMessage(`${formatted.title}: ${formatted.message}`);
      }
    }
    exports2.runInvoke = runInvoke;
  }
});

// out/commands/contractInfo.js
var require_contractInfo = __commonJS({
  "out/commands/contractInfo.js"(exports2) {
    "use strict";
    var __createBinding2 = exports2 && exports2.__createBinding || (Object.create ? function(o, m, k, k2) {
      if (k2 === void 0)
        k2 = k;
      var desc = Object.getOwnPropertyDescriptor(m, k);
      if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
        desc = { enumerable: true, get: function() {
          return m[k];
        } };
      }
      Object.defineProperty(o, k2, desc);
    } : function(o, m, k, k2) {
      if (k2 === void 0)
        k2 = k;
      o[k2] = m[k];
    });
    var __setModuleDefault2 = exports2 && exports2.__setModuleDefault || (Object.create ? function(o, v) {
      Object.defineProperty(o, "default", { enumerable: true, value: v });
    } : function(o, v) {
      o["default"] = v;
    });
    var __importStar2 = exports2 && exports2.__importStar || function(mod) {
      if (mod && mod.__esModule)
        return mod;
      var result = {};
      if (mod != null) {
        for (var k in mod)
          if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k))
            __createBinding2(result, mod, k);
      }
      __setModuleDefault2(result, mod);
      return result;
    };
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.contractInfo = void 0;
    var vscode2 = __importStar2(require("vscode"));
    var sorobanCliService_12 = require_sorobanCliService();
    var workspaceDetector_1 = require_workspaceDetector();
    var errorFormatter_1 = require_errorFormatter();
    async function contractInfo(context, args) {
      try {
        const config = vscode2.workspace.getConfiguration("stellarSuite");
        const cliPath = config.get("cliPath", "stellar");
        const source = config.get("source", "dev");
        const network = config.get("network", "testnet") || "testnet";
        const selectedContractId = args?.contractId || context.workspaceState.get("selectedContractId");
        const lastContractId = context.workspaceState.get("lastContractId");
        let contractId = selectedContractId;
        if (args?.contractId) {
        } else if (selectedContractId) {
          await context.workspaceState.update("selectedContractId", void 0);
        } else {
          let defaultContractId = lastContractId || "";
          try {
            if (!defaultContractId) {
              const detectedId = await workspaceDetector_1.WorkspaceDetector.findContractId();
              if (detectedId) {
                defaultContractId = detectedId;
              }
            }
          } catch (error) {
          }
          contractId = await vscode2.window.showInputBox({
            prompt: "Enter the contract ID to inspect",
            placeHolder: defaultContractId || "e.g., C...",
            value: defaultContractId
          });
        }
        if (!contractId)
          return;
        const rpcUrl = config.get("rpcUrl", "https://soroban-testnet.stellar.org:443");
        const networkPassphrase = config.get("networkPassphrase", "Test SDF Network ; September 2015");
        await vscode2.window.withProgress({
          location: vscode2.ProgressLocation.Notification,
          title: "Fetching Contract Metadata...",
          cancellable: false
        }, async (progress) => {
          const { stdout } = await (0, sorobanCliService_12.execAsync)(`${cliPath} contract info interface --id ${contractId} --rpc-url ${rpcUrl} --network-passphrase "${networkPassphrase}" --output json-formatted`);
          const panel = vscode2.window.createWebviewPanel("contractInfo", `Contract Info: ${contractId.substring(0, 8)}...`, vscode2.ViewColumn.Two, { enableScripts: true });
          panel.webview.html = `
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <style>
                            :root {
                                --brand-bg: hsl(222, 47%, 6%);
                                --brand-primary: hsl(228, 76%, 60%);
                                --brand-secondary: hsl(217.2, 32.6%, 17.5%);
                                --brand-foreground: hsl(210, 40%, 96%);
                                --brand-border: hsl(217.2, 32.6%, 17.5%);
                            }
                            body { 
                                font-family: var(--vscode-font-family); 
                                padding: 24px; 
                                line-height: 1.6; 
                                color: var(--vscode-foreground); 
                                background: var(--vscode-editor-background); 
                            }
                            .container {
                                background: var(--vscode-sideBar-background);
                                border: 1px solid var(--vscode-panel-border);
                                border-radius: 12px;
                                padding: 24px;
                                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
                            }
                            h2 { 
                                color: var(--brand-primary); 
                                font-size: 16px;
                                text-transform: uppercase;
                                letter-spacing: 1px;
                                border-bottom: 1px solid var(--vscode-panel-border); 
                                padding-bottom: 12px;
                                margin-top: 0;
                                margin-bottom: 20px;
                            }
                            pre { 
                                background: var(--brand-bg); 
                                color: var(--brand-primary);
                                padding: 20px; 
                                border-radius: 8px; 
                                overflow: auto; 
                                border: 1px solid var(--brand-border);
                                font-family: 'JetBrains Mono', var(--vscode-editor-font-family);
                                font-size: 12px;
                            }
                        </style>
                    </head>
                    <body>
                        <div class="container">
                            <h2>Metadata for ${contractId}</h2>
                            <pre>${stdout}</pre>
                        </div>
                    </body>
                    </html>
                `;
        });
      } catch (error) {
        const formatted = (0, errorFormatter_1.formatError)(error, "Contract Info");
        vscode2.window.showErrorMessage(`${formatted.title}: ${formatted.message}`);
      }
    }
    exports2.contractInfo = contractInfo;
  }
});

// out/ui/identityStatusBar.js
var require_identityStatusBar = __commonJS({
  "out/ui/identityStatusBar.js"(exports2) {
    "use strict";
    var __createBinding2 = exports2 && exports2.__createBinding || (Object.create ? function(o, m, k, k2) {
      if (k2 === void 0)
        k2 = k;
      var desc = Object.getOwnPropertyDescriptor(m, k);
      if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
        desc = { enumerable: true, get: function() {
          return m[k];
        } };
      }
      Object.defineProperty(o, k2, desc);
    } : function(o, m, k, k2) {
      if (k2 === void 0)
        k2 = k;
      o[k2] = m[k];
    });
    var __setModuleDefault2 = exports2 && exports2.__setModuleDefault || (Object.create ? function(o, v) {
      Object.defineProperty(o, "default", { enumerable: true, value: v });
    } : function(o, v) {
      o["default"] = v;
    });
    var __importStar2 = exports2 && exports2.__importStar || function(mod) {
      if (mod && mod.__esModule)
        return mod;
      var result = {};
      if (mod != null) {
        for (var k in mod)
          if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k))
            __createBinding2(result, mod, k);
      }
      __setModuleDefault2(result, mod);
      return result;
    };
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.switchIdentity = exports2.updateIdentityStatusBar = exports2.initIdentityStatusBar = void 0;
    var vscode2 = __importStar2(require("vscode"));
    var sorobanCliService_12 = require_sorobanCliService();
    var identityStatusBarItem;
    async function initIdentityStatusBar(context) {
      identityStatusBarItem = vscode2.window.createStatusBarItem(vscode2.StatusBarAlignment.Right, 99);
      identityStatusBarItem.command = "stellarSuite.switchIdentity";
      context.subscriptions.push(identityStatusBarItem);
      const configCommand = vscode2.commands.registerCommand("stellarSuite.switchIdentity", async () => {
        await switchIdentity();
      });
      context.subscriptions.push(configCommand);
      context.subscriptions.push(vscode2.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration("stellarSuite.source")) {
          updateIdentityStatusBar();
        }
      }));
      await updateIdentityStatusBar();
    }
    exports2.initIdentityStatusBar = initIdentityStatusBar;
    async function updateIdentityStatusBar() {
      try {
        const config = vscode2.workspace.getConfiguration("stellarSuite");
        const currentSource = config.get("source", "dev");
        identityStatusBarItem.text = `$(person) Stellar: ${currentSource}`;
        identityStatusBarItem.tooltip = "Click to switch Stellar Identity";
        identityStatusBarItem.show();
      } catch (error) {
        identityStatusBarItem.text = "$(error) Stellar Identity: Error";
        identityStatusBarItem.tooltip = "Failed to load Stellar Identity";
        identityStatusBarItem.show();
      }
    }
    exports2.updateIdentityStatusBar = updateIdentityStatusBar;
    async function switchIdentity() {
      try {
        const { stdout } = await (0, sorobanCliService_12.execAsync)("stellar keys ls");
        const lines = stdout.split("\n").filter((line) => line.trim().length > 0);
        const identities = lines.map((line) => line.trim()).filter((line) => !line.startsWith("\u2139\uFE0F"));
        if (identities.length === 0) {
          vscode2.window.showInformationMessage("No identities found. Create one first from the Stellar Kit sidebar.");
          return;
        }
        const selected = await vscode2.window.showQuickPick(identities, {
          placeHolder: "Select a Stellar Identity for invocations"
        });
        if (selected) {
          const config = vscode2.workspace.getConfiguration("stellarSuite");
          await config.update("source", selected, vscode2.ConfigurationTarget.Workspace);
          vscode2.window.showInformationMessage(`Active identity set to: ${selected}`);
        }
      } catch (error) {
        vscode2.window.showErrorMessage(`Failed to switch identity: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    }
    exports2.switchIdentity = switchIdentity;
  }
});

// out/ui/sidebarWebView.js
var require_sidebarWebView = __commonJS({
  "out/ui/sidebarWebView.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.SidebarWebView = void 0;
    var SidebarWebView = class {
      constructor(webview, extensionUri) {
        this.extensionUri = extensionUri;
        this.webview = webview;
      }
      updateContent(contracts, deployments, isCliInstalled = false) {
        const html = this.getHtml(contracts, deployments, isCliInstalled);
        this.webview.html = html;
      }
      getHtml(contracts, deployments, isCliInstalled) {
        const contractsHtml = this.renderContracts(contracts);
        const deploymentsHtml = this.renderDeployments(deployments);
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Stellar Kit</title>
    <style>
        :root {
            --brand-bg: hsl(222, 47%, 6%);
            --brand-primary: hsl(228, 76%, 60%);
            --brand-secondary: hsl(217.2, 32.6%, 17.5%);
            --brand-foreground: hsl(210, 40%, 96%);
            --brand-border: hsl(217.2, 32.6%, 17.5%);
        }

        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }
        body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            background-color: var(--vscode-sideBar-background);
            padding: 12px;
            line-height: 1.5;
        }
        .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 16px;
            padding-bottom: 8px;
            border-bottom: 1px solid var(--vscode-sideBar-border);
        }
        .header h2 {
            font-size: 14px;
            font-weight: 600;
            color: var(--brand-primary);
        }
        .refresh-btn {
            background: var(--brand-secondary);
            color: var(--brand-foreground);
            border: 1px solid var(--brand-border);
            padding: 6px 12px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 11px;
            transition: all 0.2s;
        }
        .refresh-btn:hover {
            background: var(--brand-primary);
            color: white;
            transform: translateY(-1px);
        }
        .section {
            margin-bottom: 24px;
        }
        .section-title {
            font-size: 11px;
            font-weight: 700;
            margin-bottom: 10px;
            color: var(--vscode-descriptionForeground);
            text-transform: uppercase;
            letter-spacing: 1px;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .section-title-text {
            flex: 1;
        }
        .clear-btn {
            background: transparent;
            color: var(--vscode-descriptionForeground);
            border: 1px solid var(--vscode-input-border);
            padding: 4px 8px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 10px;
            transition: all 0.2s;
        }
        .clear-btn:hover {
            border-color: var(--brand-primary);
            color: var(--brand-primary);
        }
        .filter-bar {
            display: flex;
            gap: 8px;
            margin-bottom: 12px;
            flex-wrap: wrap;
        }
        .filter-input {
            flex: 1;
            min-width: 120px;
            padding: 7px 10px;
            border: 1px solid var(--vscode-input-border);
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border-radius: 6px;
            font-size: 11px;
        }
        .filter-input:focus {
            outline: none;
            border-color: var(--brand-primary);
        }
        .filter-select {
            padding: 6px 8px;
            border: 1px solid var(--vscode-input-border);
            background: var(--vscode-dropdown-background);
            color: var(--vscode-dropdown-foreground);
            border-radius: 6px;
            font-size: 11px;
        }
        .wasm-size {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            margin: 2px 0;
            font-family: var(--vscode-editor-font-family);
        }
        .contract-item, .deployment-item {
            background: var(--vscode-sideBar-background);
            border: 1px solid var(--vscode-sideBar-border);
            border-radius: 8px;
            padding: 12px;
            margin-bottom: 10px;
            transition: all 0.2s;
            overflow: hidden;
            word-wrap: break-word;
        }
        .contract-item:hover, .deployment-item:hover {
            border-color: var(--brand-primary);
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        }
        .contract-name {
            font-weight: 700;
            font-size: 13px;
            margin-bottom: 6px;
            color: var(--brand-primary);
            word-break: break-all;
            overflow-wrap: break-word;
            display: flex;
            align-items: center;
            justify-content: space-between;
        }
        .contract-path {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            margin-bottom: 10px;
            word-break: break-all;
            opacity: 0.8;
        }
        .contract-id {
            font-size: 10px;
            font-family: 'JetBrains Mono', var(--vscode-editor-font-family);
            background: var(--brand-bg);
            color: var(--brand-primary);
            padding: 4px 8px;
            border-radius: 4px;
            margin-bottom: 10px;
            word-break: break-all;
            border: 1px solid var(--brand-border);
        }
        .contract-actions {
            display: flex;
            gap: 6px;
            margin-top: 10px;
            flex-wrap: wrap;
        }
        .btn {
            padding: 8px 14px;
            border: 1px solid var(--brand-primary);
            border-radius: 8px;
            cursor: pointer;
            font-size: 11px;
            font-weight: 600;
            background: var(--brand-primary);
            color: white;
            transition: all 0.2s;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
        }
        .btn:hover {
            opacity: 0.9;
            transform: translateY(-1px);
            box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
        }
        .btn-secondary {
            background: var(--brand-bg);
            color: var(--brand-primary);
            border: 1px solid var(--brand-primary);
        }
        .btn-secondary:hover {
            background: var(--brand-primary);
            color: white;
        }
        .status-badge-success {
            display: inline-block;
            padding: 2px 8px;
            border-radius: 12px;
            font-size: 9px;
            font-weight: 700;
            text-transform: uppercase;
            background: rgba(34, 197, 94, 0.2);
            color: #22c55e;
            border: 1px solid rgba(34, 197, 94, 0.2);
        }
        .empty-state {
            text-align: center;
            padding: 32px 16px;
            color: var(--vscode-descriptionForeground);
            font-size: 12px;
            font-style: italic;
        }
        .timestamp {
            font-size: 10px;
            color: var(--vscode-descriptionForeground);
            margin-top: 6px;
            display: flex;
            align-items: center;
            gap: 4px;
        }
        #cli-history {
            max-height: 250px;
            overflow-y: auto;
            border-radius: 8px;
            background: var(--brand-bg);
            border: 1px solid var(--brand-border);
            padding: 8px;
        }
        .cli-entry {
            padding: 8px;
            border-bottom: 1px solid var(--brand-border);
            font-size: 11px;
        }
        .cli-entry:last-child {
            border-bottom: none;
        }
        .cli-command {
            font-family: 'JetBrains Mono', var(--vscode-editor-font-family);
            color: var(--brand-primary);
            word-break: break-all;
        }
        .cli-timestamp {
            font-size: 9px;
            color: var(--vscode-descriptionForeground);
            margin-top: 4px;
            opacity: 0.7;
        }
        .clipboard-copy {
            cursor: pointer;
            transition: all 0.2s;
        }
        .clipboard-copy:hover {
            background: var(--brand-secondary);
            border-color: var(--brand-primary);
        }
        .icon-btn:hover {
            background: var(--brand-secondary);
            transform: translateY(-1px);
        }
    </style>
</head>
<body>
    <div class="header" style="flex-direction: column; align-items: stretch; gap: 8px;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
            <h2>Kit Studio</h2>
            <button class="refresh-btn" onclick="refresh()">Refresh</button>
        </div>
        <div style="font-size: 11px; padding: 6px 8px; border-radius: 4px; background: ${isCliInstalled ? "var(--vscode-testing-iconPassed)" : "var(--vscode-errorForeground)"}; color: var(--vscode-editor-background); display: flex; justify-content: space-between; align-items: center; font-weight: 600;">
            <span style="display: flex; align-items: center; gap: 6px;">
                Stellar CLI: ${isCliInstalled ? "Installed" : "Not Found"}
            </span>
            ${!isCliInstalled ? `<button onclick="installCli()" style="background: transparent; border: 1px solid currentColor; color: inherit; padding: 2px 6px; border-radius: 3px; cursor: pointer; font-size: 10px;">Install</button>` : ""}
        </div>
    </div>

    <div class="section">
        <div class="section-title">Quick Actions</div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
            <button class="btn btn-secondary" style="width: 100%; text-align: left; display: flex; align-items: center; gap: 6px;" onclick="executeCommand('stellarSuite.switchNetwork')">Switch Network</button>
            <button class="btn btn-secondary" style="width: 100%; text-align: left; display: flex; align-items: center; gap: 6px;" onclick="executeCommand('stellarSuite.keysGenerate')">Create Identity</button>
            <button class="btn btn-secondary" style="width: 100%; text-align: left; display: flex; align-items: center; gap: 6px;" onclick="executeCommand('stellarSuite.keysList')">Identities</button>
            <button class="btn btn-secondary" style="width: 100%; text-align: left; display: flex; align-items: center; gap: 6px;" onclick="executeCommand('stellarSuite.keysFund')">Fund Account</button>
            <button class="btn btn-secondary" style="width: 100%; text-align: left; display: flex; align-items: center; gap: 6px;" onclick="executeCommand('stellarSuite.simulateFromSidebar')">Simulate Tx</button>
            <button class="btn btn-secondary" style="width: 100%; text-align: left; display: flex; align-items: center; gap: 6px;" onclick="executeCommand('stellarSuite.runInvoke')">Run Tx</button>
        </div>
    </div>

    <div class="section">
        <div class="section-title">Filters</div>
        <div class="filter-bar">
            <input type="text" id="search-filter" placeholder="Search contracts..." class="filter-input" oninput="applyFilters()">
            <select id="build-filter" class="filter-select" onchange="applyFilters()">
                <option value="">All Build Status</option>
                <option value="built">Built</option>
                <option value="not-built">Not Built</option>
            </select>
            <select id="deploy-filter" class="filter-select" onchange="applyFilters()">
                <option value="">All Deploy Status</option>
                <option value="deployed">Deployed</option>
                <option value="not-deployed">Not Deployed</option>
            </select>
        </div>
    </div>

    <div class="section">
        <div class="section-title">Contracts</div>
        <div id="contracts-list">
            ${contractsHtml}
        </div>
    </div>

    <div class="section">
        <div class="section-title">
            <span class="section-title-text">Deployments</span>
            <button class="clear-btn" onclick="clearDeployments()">Clear</button>
        </div>
        ${deploymentsHtml}
    </div>

    <div class="section">
        <div class="section-title">CLI History</div>
        <div id="cli-history" class="empty-state">No CLI history yet</div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        
        function refresh() {
            vscode.postMessage({ command: 'refresh' });
        }
        
        function installCli() {
            vscode.postMessage({ command: 'installCli' });
        }
        
        function deploy(contractPath) {
            vscode.postMessage({ command: 'deploy', contractPath: contractPath });
        }
        
        function build(contractPath) {
            vscode.postMessage({ command: 'build', contractPath: contractPath });
        }
        
        function buildOptimized(contractPath) {
            vscode.postMessage({ command: 'execute', executeCommand: 'stellarSuite.buildContract', args: { contractPath: contractPath, optimize: true } });
        }
        
        function copyToClipboard(text) {
            vscode.postMessage({ command: 'copyToClipboard', text: text });
        }
        
        function simulate(contractId, functionName) {
            vscode.postMessage({ command: 'simulate', contractId: contractId, functionName: functionName });
        }
        
        function inspectContract(contractId) {
            vscode.postMessage({ command: 'inspectContract', contractId: contractId });
        }
        
        function runInvoke(contractId, functionName) {
            vscode.postMessage({ command: 'runInvoke', contractId: contractId, functionName: functionName });
        }

        function contractInfo(contractId) {
            vscode.postMessage({ command: 'contractInfo', contractId: contractId });
        }
        
        function copyId(id) {
            copyToClipboard(id);
        }
        
        function executeCommand(cmd, args) {
            vscode.postMessage({ command: 'execute', executeCommand: cmd, args: args });
        }
        
        function clearDeployments() {
            vscode.postMessage({ command: 'clearDeployments' });
        }

        function applyFilters() {
            const search = document.getElementById('search-filter').value.toLowerCase();
            const buildFilter = document.getElementById('build-filter').value;
            const deployFilter = document.getElementById('deploy-filter').value;
            
            const contracts = document.querySelectorAll('.contract-item');
            contracts.forEach(contract => {
                const name = contract.querySelector('.contract-name')?.textContent?.toLowerCase() || '';
                const path = contract.querySelector('.contract-path')?.textContent?.toLowerCase() || '';
                const matchesSearch = !search || name.includes(search) || path.includes(search);
                
                const actionsEl = contract.querySelector('.contract-actions');
                const isBuilt = actionsEl?.getAttribute('data-is-built') === 'true' || 
                               contract.querySelector('.status-badge-success') !== null;
                
                const matchesBuild = !buildFilter || 
                    (buildFilter === 'built' && isBuilt) || 
                    (buildFilter === 'not-built' && !isBuilt);
                
                const hasContractId = contract.querySelector('.contract-id') !== null;
                const matchesDeploy = !deployFilter || 
                    (deployFilter === 'deployed' && hasContractId) || 
                    (deployFilter === 'not-deployed' && !hasContractId);
                
                if (matchesSearch && matchesBuild && matchesDeploy) {
                    contract.style.display = '';
                } else {
                    contract.style.display = 'none';
                }
            });
        }

        function loadCliHistory() {
            vscode.postMessage({ command: 'getCliHistory' });
        }

        window.addEventListener('message', event => {
            const message = event.data;
            if (message.type === 'cliHistory:data') {
                const historyEl = document.getElementById('cli-history');
                if (message.history && message.history.length > 0) {
                    historyEl.innerHTML = message.history.map(function(entry) {
                        const cmd = escapeHtml(entry.command || entry);
                        const ts = entry.timestamp ? '<div class="cli-timestamp">' + new Date(entry.timestamp).toLocaleString() + '</div>' : '';
                        return '<div class="cli-entry"><div class="cli-command">' + cmd + '</div>' + ts + '</div>';
                    }).join('');
                } else {
                    historyEl.innerHTML = '<div class="empty-state">No CLI history yet</div>';
                }
            }
        });

        function escapeHtml(text) {
            if (!text) return '';
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }

        loadCliHistory();
    </script>
</body>
</html>`;
      }
      renderContracts(contracts) {
        if (contracts.length === 0) {
          return '<div class="empty-state">No contracts detected in workspace</div>';
        }
        return contracts.map((contract) => {
          const buildStatusBadge = contract.hasWasm ? '<span class="status-badge-success">Built</span>' : "";
          const functionsHtml = "";
          const sizeInfo = contract.wasmSizeFormatted ? `<div class="wasm-size">Size: ${this.escapeHtml(contract.wasmSizeFormatted)}</div>` : "";
          return `
                <div class="contract-item">
                    <div class="contract-name">
                        ${this.escapeHtml(contract.name)}
                        ${buildStatusBadge}
                    </div>
                    <div class="contract-path">${this.escapeHtml(contract.path)}</div>
                    ${sizeInfo}
                    ${contract.contractId ? `<div class="contract-id clipboard-copy" onclick="copyToClipboard('${this.escapeHtml(contract.contractId)}')" title="Click to copy Contract ID">ID: ${this.escapeHtml(contract.contractId)} <span style="font-size: 10px; opacity: 0.7;">[COPY]</span></div>` : ""}
                    ${contract.lastDeployed ? `<div class="timestamp">Deployed: ${new Date(contract.lastDeployed).toLocaleString()}</div>` : ""}
                    ${functionsHtml}
                    <div class="contract-actions" data-is-built="${contract.hasWasm}">
                        <button class="btn" onclick="build('${this.escapeHtml(contract.path)}')">Build</button>
                        ${contract.hasWasm ? `<button class="btn" onclick="deploy('${this.escapeHtml(contract.path)}')">Deploy</button>` : ""}
                        ${contract.contractId ? `<button class="btn btn-secondary" onclick="simulate('${this.escapeHtml(contract.contractId)}')">Simulate</button>` : ""}
                        ${contract.contractId ? `<button class="btn btn-secondary" onclick="runInvoke('${this.escapeHtml(contract.contractId)}')">Run</button>` : ""}
                        ${contract.contractId ? `<button class="btn btn-secondary" onclick="contractInfo('${this.escapeHtml(contract.contractId)}')">Info</button>` : ""}
                    </div>
                </div>
            `;
        }).join("");
      }
      renderDeployments(deployments) {
        if (deployments.length === 0) {
          return '<div class="empty-state">No deployments yet</div>';
        }
        return deployments.map((deployment) => {
          const date = new Date(deployment.deployedAt);
          return `
                <div class="deployment-item">
                    <div class="contract-id clipboard-copy" onclick="copyToClipboard('${this.escapeHtml(deployment.contractId)}')" title="Click to copy Contract ID">
                        Contract ID: ${this.escapeHtml(deployment.contractId)} <span style="font-size: 10px;">[COPY]</span>
                    </div>
                    <div class="timestamp">${date.toLocaleString()}</div>
                    <div class="timestamp">Network: ${this.escapeHtml(deployment.network)} | Source: ${this.escapeHtml(deployment.source)}</div>
                </div>
            `;
        }).join("");
      }
      escapeHtml(text) {
        return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
      }
    };
    exports2.SidebarWebView = SidebarWebView;
  }
});

// out/ui/sidebarView.js
var require_sidebarView = __commonJS({
  "out/ui/sidebarView.js"(exports2) {
    "use strict";
    var __createBinding2 = exports2 && exports2.__createBinding || (Object.create ? function(o, m, k, k2) {
      if (k2 === void 0)
        k2 = k;
      var desc = Object.getOwnPropertyDescriptor(m, k);
      if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
        desc = { enumerable: true, get: function() {
          return m[k];
        } };
      }
      Object.defineProperty(o, k2, desc);
    } : function(o, m, k, k2) {
      if (k2 === void 0)
        k2 = k;
      o[k2] = m[k];
    });
    var __setModuleDefault2 = exports2 && exports2.__setModuleDefault || (Object.create ? function(o, v) {
      Object.defineProperty(o, "default", { enumerable: true, value: v });
    } : function(o, v) {
      o["default"] = v;
    });
    var __importStar2 = exports2 && exports2.__importStar || function(mod) {
      if (mod && mod.__esModule)
        return mod;
      var result = {};
      if (mod != null) {
        for (var k in mod)
          if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k))
            __createBinding2(result, mod, k);
      }
      __setModuleDefault2(result, mod);
      return result;
    };
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.SidebarViewProvider = void 0;
    var vscode2 = __importStar2(require("vscode"));
    var sidebarWebView_1 = require_sidebarWebView();
    var wasmDetector_1 = require_wasmDetector();
    var sorobanCliService_12 = require_sorobanCliService();
    var SidebarViewProvider = class {
      constructor(_extensionUri, context) {
        this._extensionUri = _extensionUri;
        this._context = context;
      }
      resolveWebviewView(webviewView, context, _token) {
        this._view = webviewView;
        webviewView.webview.options = {
          enableScripts: true,
          localResourceRoots: [
            this._extensionUri
          ]
        };
        this._webView = new sidebarWebView_1.SidebarWebView(webviewView.webview, this._extensionUri);
        this._webView.updateContent([], []);
        this.refresh();
        webviewView.webview.onDidReceiveMessage(async (message) => {
          try {
            switch (message.command) {
              case "refresh":
                await this.refresh();
                break;
              case "deploy":
                if (message.contractPath) {
                  this._context.workspaceState.update("selectedContractPath", message.contractPath);
                }
                await vscode2.commands.executeCommand("stellarSuite.deployContract");
                break;
              case "build":
                if (message.contractPath) {
                  this._context.workspaceState.update("selectedContractPath", message.contractPath);
                  await vscode2.commands.executeCommand("stellarSuite.buildContract");
                }
                break;
              case "simulate":
                if (message.contractId) {
                  this._context.workspaceState.update("selectedContractId", message.contractId);
                }
                await vscode2.commands.executeCommand("stellarSuite.simulateTransaction", {
                  contractId: message.contractId,
                  functionName: message.functionName
                });
                break;
              case "runInvoke":
                if (message.contractId) {
                  this._context.workspaceState.update("selectedContractId", message.contractId);
                }
                await vscode2.commands.executeCommand("stellarSuite.runInvoke", {
                  contractId: message.contractId,
                  functionName: message.functionName
                });
                break;
              case "copyToClipboard":
                if (message.text) {
                  await vscode2.env.clipboard.writeText(message.text);
                  vscode2.window.showInformationMessage(`Copied to clipboard: ${message.text.substring(0, 12)}...`);
                }
                break;
              case "contractInfo":
                if (message.contractId) {
                  this._context.workspaceState.update("selectedContractId", message.contractId);
                }
                await vscode2.commands.executeCommand("stellarSuite.contractInfo", {
                  contractId: message.contractId
                });
                break;
              case "getCliHistory":
                const history = this.getCliHistory();
                webviewView.webview.postMessage({
                  type: "cliHistory:data",
                  history
                });
                break;
              case "clearDeployments":
                await this.clearDeployments();
                break;
              case "installCli":
                await vscode2.commands.executeCommand("stellarSuite.installCli");
                break;
              case "execute":
                if (message.executeCommand) {
                  if (message.args) {
                    await vscode2.commands.executeCommand(message.executeCommand, message.args);
                  } else {
                    await vscode2.commands.executeCommand(message.executeCommand);
                  }
                }
                break;
            }
          } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            vscode2.window.showErrorMessage(`Stellar Kit: ${errorMsg}`);
          }
        }, null, this._context.subscriptions);
      }
      async refresh() {
        if (!this._view || !this._webView) {
          return;
        }
        const contracts = await this.getContracts();
        const deployments = this.getDeployments();
        const isCliInstalled = !!await sorobanCliService_12.SorobanCliService.findCliPath();
        this._webView.updateContent(contracts, deployments, isCliInstalled);
      }
      async getContracts() {
        const contracts = [];
        const contractDirs = await wasmDetector_1.WasmDetector.findContractDirectories();
        for (const dir of contractDirs) {
          const contractName = require("path").basename(dir);
          const wasmPath = wasmDetector_1.WasmDetector.getExpectedWasmPath(dir);
          const fs = require("fs");
          const hasWasm = wasmPath && fs.existsSync(wasmPath);
          let contractId;
          let functions;
          let wasmSize;
          let wasmSizeFormatted;
          if (hasWasm && wasmPath) {
            const stats = fs.statSync(wasmPath);
            wasmSize = stats.size;
            if (wasmSize) {
              wasmSizeFormatted = this.formatFileSize(wasmSize);
            }
          }
          const deploymentHistory = this._context.workspaceState.get("stellarSuite.deploymentHistory", []);
          const lastDeployment = deploymentHistory.find((d) => {
            const deployedContracts = this._context.workspaceState.get("stellarSuite.deployedContracts", {});
            return deployedContracts[dir] === d.contractId || d.contractPath === dir;
          });
          if (lastDeployment) {
            contractId = lastDeployment.contractId;
          }
          contracts.push({
            name: contractName,
            path: dir,
            contractId,
            hasWasm,
            lastDeployed: lastDeployment?.deployedAt,
            wasmSize,
            wasmSizeFormatted
          });
        }
        return contracts;
      }
      getDeployments() {
        return this._context.workspaceState.get("stellarSuite.deploymentHistory", []);
      }
      getCliHistory() {
        const history = this._context.workspaceState.get("stellarSuite.cliHistory", []);
        return history.slice(-10);
      }
      formatFileSize(bytes) {
        if (bytes === 0)
          return "0 B";
        const k = 1024;
        const sizes = ["B", "KB", "MB"];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
      }
      showDeploymentResult(deployment) {
        const deploymentHistory = this._context.workspaceState.get("stellarSuite.deploymentHistory", []);
        const exists = deploymentHistory.some((d) => d.contractId === deployment.contractId && d.deployedAt === deployment.deployedAt);
        if (!exists) {
          deploymentHistory.push(deployment);
          this._context.workspaceState.update("stellarSuite.deploymentHistory", deploymentHistory);
        }
        const deployedContracts = this._context.workspaceState.get("stellarSuite.deployedContracts", {});
        const key = deployment.contractPath || deployment.contractName;
        deployedContracts[key] = deployment.contractId;
        this._context.workspaceState.update("stellarSuite.deployedContracts", deployedContracts);
        this.refresh();
      }
      showSimulationResult(contractId, result) {
        this.refresh();
      }
      async clearDeployments() {
        const confirm = await vscode2.window.showWarningMessage("Are you sure you want to clear all deployment history? This cannot be undone.", { modal: true }, "Clear All");
        if (confirm !== "Clear All") {
          return;
        }
        await this._context.workspaceState.update("stellarSuite.deploymentHistory", []);
        await this._context.workspaceState.update("stellarSuite.deployedContracts", {});
        await this._context.workspaceState.update("lastContractId", void 0);
        await this._context.workspaceState.update("selectedContractPath", void 0);
        await this._context.workspaceState.update("selectedContractId", void 0);
        await this.refresh();
        vscode2.window.showInformationMessage("Deployment history cleared.");
      }
      addCliHistoryEntry(command, args) {
        const history = this._context.workspaceState.get("stellarSuite.cliHistory", []);
        const entry = {
          command,
          args: args || [],
          timestamp: (/* @__PURE__ */ new Date()).toISOString()
        };
        history.push(entry);
        if (history.length > 50) {
          history.shift();
        }
        this._context.workspaceState.update("stellarSuite.cliHistory", history);
        if (this._view && this._webView) {
          const currentHistory = this.getCliHistory();
          this._view.webview.postMessage({
            type: "cliHistory:data",
            history: currentHistory
          });
        }
      }
    };
    exports2.SidebarViewProvider = SidebarViewProvider;
    SidebarViewProvider.viewType = "stellarSuite.contractsView";
  }
});

// out/extension.js
var __createBinding = exports && exports.__createBinding || (Object.create ? function(o, m, k, k2) {
  if (k2 === void 0)
    k2 = k;
  var desc = Object.getOwnPropertyDescriptor(m, k);
  if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
    desc = { enumerable: true, get: function() {
      return m[k];
    } };
  }
  Object.defineProperty(o, k2, desc);
} : function(o, m, k, k2) {
  if (k2 === void 0)
    k2 = k;
  o[k2] = m[k];
});
var __setModuleDefault = exports && exports.__setModuleDefault || (Object.create ? function(o, v) {
  Object.defineProperty(o, "default", { enumerable: true, value: v });
} : function(o, v) {
  o["default"] = v;
});
var __importStar = exports && exports.__importStar || function(mod) {
  if (mod && mod.__esModule)
    return mod;
  var result = {};
  if (mod != null) {
    for (var k in mod)
      if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k))
        __createBinding(result, mod, k);
  }
  __setModuleDefault(result, mod);
  return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deactivate = exports.activate = void 0;
var vscode = __importStar(require("vscode"));
var simulateTransaction_1 = require_simulateTransaction();
var deployContract_1 = require_deployContract();
var buildContract_1 = require_buildContract();
var installCli_1 = require_installCli();
var switchNetwork_1 = require_switchNetwork();
var keyManager_1 = require_keyManager();
var generateBindings_1 = require_generateBindings();
var runInvoke_1 = require_runInvoke();
var contractInfo_1 = require_contractInfo();
var networkStatusBar_1 = require_networkStatusBar();
var identityStatusBar_1 = require_identityStatusBar();
var sidebarView_1 = require_sidebarView();
var outputChannel_1 = require_outputChannel();
var sorobanCliService_1 = require_sorobanCliService();
var sidebarProvider;
async function activate(context) {
  const outputChannel = (0, outputChannel_1.getSharedOutputChannel)();
  try {
    sidebarProvider = new sidebarView_1.SidebarViewProvider(context.extensionUri, context);
    context.subscriptions.push(vscode.window.registerWebviewViewProvider(sidebarView_1.SidebarViewProvider.viewType, sidebarProvider));
    outputChannel.appendLine("[Extension] Checking for Stellar CLI in PATH...");
    const cliPath = await sorobanCliService_1.SorobanCliService.findCliPath();
    if (!cliPath) {
      outputChannel.appendLine("[Extension] WARNING: Stellar CLI is not installed or not found in PATH.");
      vscode.window.showInformationMessage("Stellar CLI is not installed or not found in PATH.", "Install Stellar CLI").then((selection) => {
        if (selection === "Install Stellar CLI") {
          vscode.commands.executeCommand("stellarSuite.installCli");
        }
      });
    } else {
      outputChannel.appendLine(`[Extension] SUCCESS: Found Stellar CLI at: ${cliPath}`);
      await (0, networkStatusBar_1.initNetworkStatusBar)(context);
      await (0, identityStatusBar_1.initIdentityStatusBar)(context);
    }
    const simulateCommand = vscode.commands.registerCommand("stellarSuite.simulateTransaction", () => {
      return (0, simulateTransaction_1.simulateTransaction)(context, sidebarProvider);
    });
    const deployCommand = vscode.commands.registerCommand("stellarSuite.deployContract", () => {
      return (0, deployContract_1.deployContract)(context, sidebarProvider);
    });
    const refreshCommand = vscode.commands.registerCommand("stellarSuite.refreshContracts", () => {
      if (sidebarProvider) {
        sidebarProvider.refresh();
      }
    });
    const deployFromSidebarCommand = vscode.commands.registerCommand("stellarSuite.deployFromSidebar", () => {
      return (0, deployContract_1.deployContract)(context, sidebarProvider);
    });
    const simulateFromSidebarCommand = vscode.commands.registerCommand("stellarSuite.simulateFromSidebar", () => {
      return (0, simulateTransaction_1.simulateTransaction)(context, sidebarProvider);
    });
    const buildCommand = vscode.commands.registerCommand("stellarSuite.buildContract", (args) => {
      return (0, buildContract_1.buildContract)(context, sidebarProvider, args);
    });
    const installCliCommand = vscode.commands.registerCommand("stellarSuite.installCli", () => {
      return (0, installCli_1.installCli)(context);
    });
    const switchNetworkCommand = vscode.commands.registerCommand("stellarSuite.switchNetwork", () => {
      return (0, switchNetwork_1.switchNetwork)();
    });
    const keysGenerateCommand = vscode.commands.registerCommand("stellarSuite.keysGenerate", () => (0, keyManager_1.keysGenerate)());
    const keysFundCommand = vscode.commands.registerCommand("stellarSuite.keysFund", () => (0, keyManager_1.keysFund)());
    const keysListCommand = vscode.commands.registerCommand("stellarSuite.keysList", () => (0, keyManager_1.keysList)());
    const generateBindingsCommand = vscode.commands.registerCommand("stellarSuite.generateBindings", (item) => {
      return (0, generateBindings_1.generateBindings)(item);
    });
    const runInvokeCommand = vscode.commands.registerCommand("stellarSuite.runInvoke", (args) => {
      return (0, runInvoke_1.runInvoke)(context, sidebarProvider, args);
    });
    const contractInfoCommand = vscode.commands.registerCommand("stellarSuite.contractInfo", (args) => {
      return (0, contractInfo_1.contractInfo)(context, args);
    });
    const watcher = vscode.workspace.createFileSystemWatcher("**/{Cargo.toml,*.wasm}");
    watcher.onDidChange(() => {
      if (sidebarProvider) {
        sidebarProvider.refresh();
      }
    });
    watcher.onDidCreate(() => {
      if (sidebarProvider) {
        sidebarProvider.refresh();
      }
    });
    watcher.onDidDelete(() => {
      if (sidebarProvider) {
        sidebarProvider.refresh();
      }
    });
    context.subscriptions.push(simulateCommand, deployCommand, refreshCommand, deployFromSidebarCommand, simulateFromSidebarCommand, buildCommand, installCliCommand, switchNetworkCommand, keysGenerateCommand, keysFundCommand, keysListCommand, generateBindingsCommand, runInvokeCommand, contractInfoCommand, watcher);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(`Stellar Kit activation failed: ${errorMsg}`);
  }
}
exports.activate = activate;
function deactivate() {
}
exports.deactivate = deactivate;
