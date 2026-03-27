import type { FileNode } from "@/lib/sample-contracts";

export interface SymbolInfo {
  name: string;
  kind: 'function' | 'struct' | 'enum' | 'trait' | 'impl' | 'const' | 'static' | 'type' | 'mod';
  filePath: string[];
  line: number;
  column: number;
  range: {
    start: { line: number; column: number };
    end: { line: number; column: number };
  };
  signature?: string;
  visibility: 'pub' | 'pub(crate)' | 'private';
}

export interface SymbolIndex {
  symbols: Map<string, SymbolInfo[]>;
  files: Map<string, SymbolInfo[]>;
  lastUpdated: number;
}

class SymbolIndexer {
  private index: SymbolIndex = {
    symbols: new Map(),
    files: new Map(),
    lastUpdated: Date.now(),
  };

  private worker: Worker | null = null;
  private indexingPromise: Promise<void> | null = null;

  constructor() {
    this.initializeWorker();
  }

  private initializeWorker() {
    if (typeof Worker !== 'undefined') {
      const workerCode = `
        self.onmessage = function(e) {
          const { type, data } = e.data;
          
          if (type === 'INDEX_FILES') {
            const { files } = data;
            const symbols = [];
            const fileSymbols = new Map();
            
            files.forEach(file => {
              if (file.type === 'file' && file.content) {
                const fileKey = file.path.join('/');
                const extractedSymbols = extractSymbols(file.content, file.path);
                fileSymbols.set(fileKey, extractedSymbols);
                symbols.push(...extractedSymbols);
              }
            });
            
            self.postMessage({
              type: 'INDEX_COMPLETE',
              data: { symbols, fileSymbols }
            });
          }
        };
        
        function extractSymbols(content: string, filePath: string[]): any[] {
          const symbols = [];
          const lines = content.split('\\n');
          
          // Regex patterns for Rust symbols
          const patterns = {
            pubFunction: /^\\s*pub\\s+fn\\s+([a-zA-Z_][a-zA-Z0-9_]*)\\s*\\(/,
            privateFunction: /^\\s*fn\\s+([a-zA-Z_][a-zA-Z0-9_]*)\\s*\\(/,
            pubStruct: /^\\s*pub\\s+struct\\s+([a-zA-Z_][a-zA-Z0-9_]*)\\s*(<[^>]*>)?\\s*\\{/,
            privateStruct: /^\\s*struct\\s+([a-zA-Z_][a-zA-Z0-9_]*)\\s*(<[^>]*>)?\\s*\\{/,
            pubEnum: /^\\s*pub\\s+enum\\s+([a-zA-Z_][a-zA-Z0-9_]*)\\s*\\{/,
            privateEnum: /^\\s*enum\\s+([a-zA-Z_][a-zA-Z0-9_]*)\\s*\\{/,
            pubTrait: /^\\s*pub\\s+trait\\s+([a-zA-Z_][a-zA-Z0-9_]*)\\s*\\{/,
            privateTrait: /^\\s*trait\\s+([a-zA-Z_][a-zA-Z0-9_]*)\\s*\\{/,
            pubImpl: /^\\s*impl\\s+([a-zA-Z_][a-zA-Z0-9_]*)\\s*(<[^>]*>)?\\s*\\{/,
            implFor: /^\\s*impl\\s+([a-zA-Z_][a-zA-Z0-9_]*)\\s+for\\s+([a-zA-Z_][a-zA-Z0-9_]*)\\s*(<[^>]*>)?\\s*\\{/,
            pubConst: /^\\s*pub\\s+const\\s+([a-zA-Z_][a-zA-Z0-9_]*)\\s*:/,
            privateConst: /^\\s*const\\s+([a-zA-Z_][a-zA-Z0-9_]*)\\s*:/,
            pubStatic: /^\\s*pub\\s+static\\s+([a-zA-Z_][a-zA-Z0-9_]*)\\s*:/,
            privateStatic: /^\\s*static\\s+([a-zA-Z_][a-zA-Z0-9_]*)\\s*:/,
            pubType: /^\\s*pub\\s+type\\s+([a-zA-Z_][a-zA-Z0-9_]*)\\s*=/,
            privateType: /^\\s*type\\s+([a-zA-Z_][a-zA-Z0-9_]*)\\s*=/,
            pubMod: /^\\s*pub\\s+mod\\s+([a-zA-Z_][a-zA-Z0-9_]*)\\s*;/,
            privateMod: /^\\s*mod\\s+([a-zA-Z_][a-zA-Z0-9_]*)\\s*;/
          };
          
          lines.forEach((line, index) => {
            const lineNum = index + 1;
            
            // Check each pattern
            Object.entries(patterns).forEach(([patternType, regex]) => {
              const match = line.match(regex);
              if (match) {
                const symbolName = match[1] || match[2]; // For impl_for, use the second match
                const visibility = patternType.startsWith('pub') ? 'pub' : 
                                  patternType.includes('pub(crate)') ? 'pub(crate)' : 'private';
                
                let kind = 'function';
                let signature = line.trim();
                
                switch (patternType) {
                  case 'pubFunction':
                  case 'privateFunction':
                    kind = 'function';
                    break;
                  case 'pubStruct':
                  case 'privateStruct':
                    kind = 'struct';
                    break;
                  case 'pubEnum':
                  case 'privateEnum':
                    kind = 'enum';
                    break;
                  case 'pubTrait':
                  case 'privateTrait':
                    kind = 'trait';
                    break;
                  case 'pubImpl':
                  case 'implFor':
                    kind = 'impl';
                    break;
                  case 'pubConst':
                  case 'privateConst':
                    kind = 'const';
                    break;
                  case 'pubStatic':
                  case 'privateStatic':
                    kind = 'static';
                    break;
                  case 'pubType':
                  case 'privateType':
                    kind = 'type';
                    break;
                  case 'pubMod':
                  case 'privateMod':
                    kind = 'mod';
                    break;
                }
                
                symbols.push({
                  name: symbolName,
                  kind,
                  filePath,
                  line: lineNum,
                  column: line.indexOf(symbolName) + 1,
                  range: {
                    start: { line: lineNum, column: line.indexOf(symbolName) + 1 },
                    end: { line: lineNum, column: line.indexOf(symbolName) + 1 + symbolName.length }
                  },
                  signature,
                  visibility
                });
              }
            });
          });
          
          return symbols;
        }
      `;
      
      const blob = new Blob([workerCode], { type: 'application/javascript' });
      this.worker = new Worker(URL.createObjectURL(blob));
      
      this.worker.onmessage = (e) => {
        const { type, data } = e.data;
        
        if (type === 'INDEX_COMPLETE') {
          this.updateIndex(data.symbols, data.fileSymbols);
          this.indexingPromise = null;
        }
      };
    }
  }

  private updateIndex(symbols: SymbolInfo[], fileSymbols: Map<string, SymbolInfo[]>) {
    // Clear existing index
    this.index.symbols.clear();
    this.index.files.clear();
    
    // Build symbol lookup map
    symbols.forEach(symbol => {
      const key = symbol.name.toLowerCase();
      if (!this.index.symbols.has(key)) {
        this.index.symbols.set(key, []);
      }
      this.index.symbols.get(key)!.push(symbol);
    });
    
    // Build file map
    fileSymbols.forEach((symbols, filePath) => {
      this.index.files.set(filePath, symbols);
    });
    
    this.index.lastUpdated = Date.now();
  }

  public async indexFiles(files: FileNode[]): Promise<void> {
    if (this.indexingPromise) {
      return this.indexingPromise;
    }

    this.indexingPromise = new Promise((resolve) => {
      if (!this.worker) {
        // Fallback to synchronous indexing
        this.indexFilesSync(files);
        resolve();
        return;
      }

      this.worker!.postMessage({
        type: 'INDEX_FILES',
        data: { files }
      });

      // Wait for indexing to complete
      const checkComplete = () => {
        if (!this.indexingPromise) {
          resolve();
        } else {
          setTimeout(checkComplete, 10);
        }
      };
      checkComplete();
    });

    return this.indexingPromise;
  }

  private indexFilesSync(files: FileNode[]) {
    const symbols: SymbolInfo[] = [];
    const fileSymbols = new Map<string, SymbolInfo[]>();

    const processFile = (file: FileNode, path: string[] = []) => {
      if (file.type === 'file' && file.content) {
        const fileKey = [...path, file.name].join('/');
        const extractedSymbols = this.extractSymbols(file.content, [...path, file.name]);
        fileSymbols.set(fileKey, extractedSymbols);
        symbols.push(...extractedSymbols);
      } else if (file.type === 'folder' && file.children) {
        file.children.forEach(child => processFile(child, [...path, file.name]));
      }
    };

    files.forEach(file => processFile(file));
    this.updateIndex(symbols, fileSymbols);
  }

  private extractSymbols(content: string, filePath: string[]): SymbolInfo[] {
    const symbols: SymbolInfo[] = [];
    const lines = content.split('\n');
    
    // Regex patterns for Rust symbols
    const patterns = {
      pubFunction: /^\s*pub\s+fn\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/,
      privateFunction: /^\s*fn\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/,
      pubStruct: /^\s*pub\s+struct\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*(<[^>]*>)?\s*\{/,
      privateStruct: /^\s*struct\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*(<[^>]*>)?\s*\{/,
      pubEnum: /^\s*pub\s+enum\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\{/,
      privateEnum: /^\s*enum\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\{/,
      pubTrait: /^\s*pub\s+trait\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\{/,
      privateTrait: /^\s*trait\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\{/,
      pubImpl: /^\s*impl\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*(<[^>]*>)?\s*\{/,
      implFor: /^\s*impl\s+([a-zA-Z_][a-zA-Z0-9_]*)\s+for\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*(<[^>]*>)?\s*\{/,
      pubConst: /^\s*pub\s+const\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*:/,
      privateConst: /^\s*const\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*:/,
      pubStatic: /^\s*pub\s+static\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*:/,
      privateStatic: /^\s*static\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*:/,
      pubType: /^\s*pub\s+type\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*=/,
      privateType: /^\s*type\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*=/,
      pubMod: /^\s*pub\s+mod\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*;/,
      privateMod: /^\s*mod\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*;/
    };
    
    lines.forEach((line, index) => {
      const lineNum = index + 1;
      
      // Check each pattern
      Object.entries(patterns).forEach(([patternType, regex]) => {
        const match = line.match(regex);
        if (match) {
          const symbolName = match[1] || match[2]; // For impl_for, use the second match
          const visibility = patternType.startsWith('pub') ? 'pub' : 
                            patternType.includes('pub(crate)') ? 'pub(crate)' : 'private';
          
          let kind: SymbolInfo['kind'] = 'function';
          let signature = line.trim();
          
          switch (patternType) {
            case 'pubFunction':
            case 'privateFunction':
              kind = 'function';
              break;
            case 'pubStruct':
            case 'privateStruct':
              kind = 'struct';
              break;
            case 'pubEnum':
            case 'privateEnum':
              kind = 'enum';
              break;
            case 'pubTrait':
            case 'privateTrait':
              kind = 'trait';
              break;
            case 'pubImpl':
            case 'implFor':
              kind = 'impl';
              break;
            case 'pubConst':
            case 'privateConst':
              kind = 'const';
              break;
            case 'pubStatic':
            case 'privateStatic':
              kind = 'static';
              break;
            case 'pubType':
            case 'privateType':
              kind = 'type';
              break;
            case 'pubMod':
            case 'privateMod':
              kind = 'mod';
              break;
          }
          
          symbols.push({
            name: symbolName,
            kind,
            filePath,
            line: lineNum,
            column: line.indexOf(symbolName) + 1,
            range: {
              start: { line: lineNum, column: line.indexOf(symbolName) + 1 },
              end: { line: lineNum, column: line.indexOf(symbolName) + 1 + symbolName.length }
            },
            signature,
            visibility
          });
        }
      });
    });
    
    return symbols;
  }

  public findDefinition(symbolName: string): SymbolInfo[] {
    const key = symbolName.toLowerCase();
    return this.index.symbols.get(key) || [];
  }

  public findSymbolsInFile(filePath: string[]): SymbolInfo[] {
    const fileKey = filePath.join('/');
    return this.index.files.get(fileKey) || [];
  }

  public getAllSymbols(): SymbolInfo[] {
    const allSymbols: SymbolInfo[] = [];
    this.index.symbols.forEach(symbols => {
      allSymbols.push(...symbols);
    });
    return allSymbols;
  }

  public getLastUpdated(): number {
    return this.index.lastUpdated;
  }

  public dispose() {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
  }
}

// Singleton instance
export const symbolIndexer = new SymbolIndexer();
