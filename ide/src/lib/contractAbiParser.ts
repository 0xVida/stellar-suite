import { Buffer } from "buffer";
import { contract, type xdr } from "@stellar/stellar-sdk";
import type { JSONSchema7 } from "json-schema";

import type { FileNode } from "@/lib/sample-contracts";

export interface FunctionInputSpec {
  name: string;
  type: string;
  required: boolean;
}

export interface FunctionOutputSpec {
  type: string;
}

export interface FunctionSpec {
  name: string;
  doc?: string;
  inputs: FunctionInputSpec[];
  outputs: FunctionOutputSpec[];
  mutability?: 'readonly' | 'write';
}

export interface ParsedContractSchema {
  source: "contract-id" | "local-spec-xdr" | "local-spec-json" | "local-wasm";
  contractId?: string;
  rpcUrl?: string;
  functions: FunctionSpec[];
  schema: JSONSchema7;
  preview: string;
}

export interface ResolveContractSchemaOptions {
  contractId?: string | null;
  files: FileNode[];
  activeTabPath: string[];
  rpcUrl: string;
  networkPassphrase: string;
}

const SPEC_JSON_FILE_PATTERN = /(abi|bindings|contractspec|spec).*\.json$/i;
const SPEC_XDR_FILE_PATTERN = /((abi|bindings|contractspec|spec).*\.(txt|xdr))|(\.spec)$/i;
const WASM_FILE_PATTERN = /\.wasm$/i;
const BASE64_PATTERN = /^[A-Za-z0-9+/=\s]+$/;

const flattenFiles = (nodes: FileNode[], parentPath: string[] = []) =>
  nodes.flatMap((node) => {
    const nextPath = [...parentPath, node.name];

    if (node.type === "folder") {
      return flattenFiles(node.children ?? [], nextPath);
    }

    return [{ path: nextPath, node }];
  });

const findContractNode = (nodes: FileNode[], contractFolderName: string | undefined): FileNode | null => {
  if (!contractFolderName) return nodes[0] ?? null;
  return nodes.find((node) => node.type === "folder" && node.name === contractFolderName) ?? null;
};

const stringifyUnknownType = (value: unknown): string => {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;

    if (typeof record.type === "string") return record.type;
    if (record.option) return `${stringifyUnknownType(record.option)} | undefined`;
    if (record.vec) return `${stringifyUnknownType(record.vec)}[]`;
    if (record.map && typeof record.map === "object") {
      const mapRecord = record.map as Record<string, unknown>;
      return `Map<${stringifyUnknownType(mapRecord.key)}, ${stringifyUnknownType(mapRecord.value)}>`;
    }
    if (Array.isArray(record.tuple)) {
      return `[${record.tuple.map((entry) => stringifyUnknownType(entry)).join(", ")}]`;
    }
  }

  return "unknown";
};

const jsonSchemaFromFunctions = (functions: FunctionSpec[]): JSONSchema7 => ({
  $schema: "http://json-schema.org/draft-07/schema#",
  definitions: Object.fromEntries(
    functions.map((fn) => [
      fn.name,
      {
        type: "object",
        additionalProperties: false,
        properties: Object.fromEntries(
          fn.inputs.map((input) => [
            input.name,
            {
              type: input.type.includes("[]") ? "array" : "string",
              description: input.type,
            },
          ])
        ),
        required: fn.inputs.filter((input) => input.required).map((input) => input.name),
      },
    ])
  ),
});

const parseJsonFunctionSpecs = (rawValue: unknown): FunctionSpec[] => {
  const root = Array.isArray(rawValue)
    ? rawValue
    : typeof rawValue === "object" && rawValue !== null
      ? ((rawValue as Record<string, unknown>).functions ??
          (rawValue as Record<string, unknown>).methods ??
          (rawValue as Record<string, unknown>).entries ??
          (rawValue as Record<string, unknown>).spec ??
          [])
      : [];

  if (!Array.isArray(root)) return [];

  return root
    .map((entry): FunctionSpec | null => {
      if (!entry || typeof entry !== "object") return null;
      const record = entry as Record<string, unknown>;
      const name =
        typeof record.name === "string"
          ? record.name
          : typeof record.function === "string"
            ? record.function
            : null;

      if (!name) return null;

      const inputEntries = Array.isArray(record.inputs)
        ? record.inputs
        : Array.isArray(record.args)
          ? record.args
          : Array.isArray(record.params)
            ? record.params
            : [];

      const outputEntries = Array.isArray(record.outputs)
        ? record.outputs
        : Array.isArray(record.returns)
          ? record.returns
          : record.output != null
            ? [record.output]
            : [];

      return {
        name,
        doc: typeof record.doc === "string" ? record.doc : undefined,
        inputs: inputEntries.map((input, index) => {
          const inputRecord = typeof input === "object" && input !== null ? (input as Record<string, unknown>) : {};
          const inputName =
            typeof inputRecord.name === "string"
              ? inputRecord.name
              : typeof inputRecord.arg === "string"
                ? inputRecord.arg
                : `arg${index + 1}`;

          return {
            name: inputName,
            type: stringifyUnknownType(inputRecord.type ?? inputRecord.value ?? input),
            required: !(typeof inputRecord.type === "object" && inputRecord.type && "option" in (inputRecord.type as Record<string, unknown>)),
          };
        }),
        outputs: outputEntries.map((output) => ({
          type: stringifyUnknownType(
            typeof output === "object" && output !== null
              ? ((output as Record<string, unknown>).type ?? output)
              : output
          ),
        })),
        mutability: typeof record.readonly === "boolean" && record.readonly ? 'readonly' : 'write',
      } satisfies FunctionSpec;
    })
    .filter((entry): entry is FunctionSpec => entry !== null);
};

const describeSpecType = (typeDef: xdr.ScSpecTypeDef): string => {
  const typeSwitch = typeDef.switch();

  switch (typeSwitch.name) {
    case "scSpecTypeVal":
      return "ScVal";
    case "scSpecTypeBool":
      return "bool";
    case "scSpecTypeVoid":
      return "void";
    case "scSpecTypeError":
      return "Error";
    case "scSpecTypeU32":
      return "u32";
    case "scSpecTypeI32":
      return "i32";
    case "scSpecTypeU64":
      return "u64";
    case "scSpecTypeI64":
      return "i64";
    case "scSpecTypeTimepoint":
      return "Timepoint";
    case "scSpecTypeDuration":
      return "Duration";
    case "scSpecTypeU128":
      return "u128";
    case "scSpecTypeI128":
      return "i128";
    case "scSpecTypeU256":
      return "u256";
    case "scSpecTypeI256":
      return "i256";
    case "scSpecTypeBytes":
      return "bytes";
    case "scSpecTypeString":
      return "string";
    case "scSpecTypeSymbol":
      return "symbol";
    case "scSpecTypeAddress":
      return "Address";
    case "scSpecTypeMuxedAddress":
      return "MuxedAddress";
    case "scSpecTypeOption":
      return `${describeSpecType(typeDef.option().valueType())} | undefined`;
    case "scSpecTypeResult":
      return `Result<${describeSpecType(typeDef.result().okType())}, ${describeSpecType(typeDef.result().errorType())}>`;
    case "scSpecTypeVec":
      return `${describeSpecType(typeDef.vec().elementType())}[]`;
    case "scSpecTypeMap":
      return `Map<${describeSpecType(typeDef.map().keyType())}, ${describeSpecType(typeDef.map().valueType())}>`;
    case "scSpecTypeTuple":
      return `[${typeDef.tuple().valueTypes().map((valueType) => describeSpecType(valueType)).join(", ")}]`;
    case "scSpecTypeBytesN":
      return `bytes${typeDef.bytesN().n()}`;
    case "scSpecTypeUdt":
      return typeDef.udt().name().toString();
    default:
      return typeSwitch.name;
  }
};

const createFunctionSpecsFromContractSpec = (spec: contract.Spec): FunctionSpec[] =>
  spec.funcs().map((fn) => ({
    name: fn.name().toString(),
    doc: fn.doc().toString() || undefined,
    inputs: fn.inputs().map((input) => ({
      name: input.name().toString(),
      type: describeSpecType(input.type()),
      required: !describeSpecType(input.type()).includes("| undefined"),
    })),
    outputs: fn.outputs().map((output) => ({
      type: describeSpecType(output),
    })),
    mutability: 'write', // TODO: detect from spec if possible
  }));

const createPreview = (result: Omit<ParsedContractSchema, "preview">) =>
  JSON.stringify(result, null, 2);

const createResultFromContractSpec = (
  spec: contract.Spec,
  source: ParsedContractSchema["source"],
  meta: Pick<ParsedContractSchema, "contractId" | "rpcUrl">
): ParsedContractSchema => {
  const baseResult = {
    source,
    contractId: meta.contractId,
    rpcUrl: meta.rpcUrl,
    functions: createFunctionSpecsFromContractSpec(spec),
    schema: spec.jsonSchema(),
  } satisfies Omit<ParsedContractSchema, "preview">;

  return {
    ...baseResult,
    preview: createPreview(baseResult),
  };
};

const looksLikeBase64 = (value: string) => BASE64_PATTERN.test(value.trim()) && value.trim().length > 0;

const parseWorkspaceSpecCandidate = (
  files: FileNode[],
  activeTabPath: string[]
): ParsedContractSchema | null => {
  const contractNode = findContractNode(files, activeTabPath[0]);
  const scopedFiles = contractNode?.type === "folder"
    ? flattenFiles(contractNode.children ?? [], [contractNode.name])
    : flattenFiles(files);

  const jsonCandidate = scopedFiles.find(({ node }) => SPEC_JSON_FILE_PATTERN.test(node.name) && node.content);
  if (jsonCandidate?.node.content) {
    const parsed = JSON.parse(jsonCandidate.node.content);

    if (Array.isArray(parsed) && parsed.every((entry) => typeof entry === "string")) {
      const spec = new contract.Spec(parsed);
      return createResultFromContractSpec(spec, "local-spec-json", {});
    }

    if (typeof parsed === "object" && parsed !== null && Array.isArray((parsed as Record<string, unknown>).entries)) {
      const entries = (parsed as Record<string, unknown>).entries;
      if (Array.isArray(entries) && entries.every((entry) => typeof entry === "string")) {
        const spec = new contract.Spec(entries);
        return createResultFromContractSpec(spec, "local-spec-json", {});
      }
    }

    const functions = parseJsonFunctionSpecs(parsed);
    if (functions.length > 0) {
      const baseResult = {
        source: "local-spec-json" as const,
        functions,
        schema: jsonSchemaFromFunctions(functions),
      };

      return {
        ...baseResult,
        preview: createPreview(baseResult),
      };
    }
  }

  const xdrCandidate = scopedFiles.find(({ node }) => SPEC_XDR_FILE_PATTERN.test(node.name) && node.content);
  if (xdrCandidate?.node.content && looksLikeBase64(xdrCandidate.node.content)) {
    const spec = new contract.Spec(xdrCandidate.node.content.trim());
    return createResultFromContractSpec(spec, "local-spec-xdr", {});
  }

  const wasmCandidate = scopedFiles.find(({ node }) => WASM_FILE_PATTERN.test(node.name) && node.content);
  if (wasmCandidate?.node.content && looksLikeBase64(wasmCandidate.node.content)) {
    const spec = contract.Spec.fromWasm(Buffer.from(wasmCandidate.node.content.trim(), "base64"));
    return createResultFromContractSpec(spec, "local-wasm", {});
  }

  return null;
};

export const resolveContractSchema = async ({
  contractId,
  files,
  activeTabPath,
  rpcUrl,
  networkPassphrase,
}: ResolveContractSchemaOptions): Promise<ParsedContractSchema> => {
  const trimmedContractId = contractId?.trim();

  if (trimmedContractId) {
    try {
      const client = await contract.Client.from({
        contractId: trimmedContractId,
        rpcUrl,
        networkPassphrase,
        allowHttp: rpcUrl.startsWith("http://"),
      });

      return createResultFromContractSpec(client.spec, "contract-id", {
        contractId: trimmedContractId,
        rpcUrl,
      });
    } catch (remoteError) {
      const localResult = parseWorkspaceSpecCandidate(files, activeTabPath);
      if (localResult) return localResult;

      const message = remoteError instanceof Error ? remoteError.message : "Unknown RPC error";
      throw new Error(`Unable to resolve contract schema from RPC or local workspace: ${message}`);
    }
  }

  const localResult = parseWorkspaceSpecCandidate(files, activeTabPath);
  if (localResult) return localResult;

  throw new Error("No contract ABI/spec was found. Keep using manual invocation until a contract ID or local spec is available.");
};
