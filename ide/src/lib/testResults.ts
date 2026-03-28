import { FileNode } from "@/lib/sample-contracts";

export interface TestTraceLocation {
  file: string;
  line: number;
  column: number;
  label?: string;
}

const TRACE_LOCATION_PATTERN = /([A-Za-z0-9_./\\-]+\.[A-Za-z0-9_]+):(\d+)(?::(\d+))?/g;

export interface TestCaseDiff {
  expected: string;
  actual: string;
}

export interface TestCaseResult {
  id: string;
  name: string;
  suite: string;
  testType: "unit" | "integration";
  status: "passed" | "failed";
  durationMs: number;
  stdout: string;
  failureMessage?: string;
  diff?: TestCaseDiff;
  trace: TestTraceLocation[];
  rerunCommand: string;
}

export interface TestRunSummary {
  total: number;
  passed: number;
  failed: number;
  filtered: number;
}

export interface TestRunResult {
  command: string;
  startedAt: string;
  mode: "full" | "failed-only";
  summary: TestRunSummary;
  cases: TestCaseResult[];
  rawOutput: string;
}

interface SuiteStartEvent {
  type: "suite";
  event: "started";
  startedAt: string;
  command: string;
  mode: "full" | "failed-only";
  total: number;
  filtered: number;
}

interface SuiteFinishEvent {
  type: "suite";
  event: "ok" | "failed";
  passed: number;
  failed: number;
  total: number;
  filtered: number;
}

interface TestEvent {
  type: "test";
  id: string;
  suite: string;
  name: string;
  testType?: "unit" | "integration";
  event: "ok" | "failed";
  durationMs: number;
  stdout: string;
  rerunCommand: string;
  failureMessage?: string;
  diff?: TestCaseDiff;
  trace?: TestTraceLocation[];
}

type SimulatedEvent = SuiteStartEvent | SuiteFinishEvent | TestEvent;

const ANSI = {
  reset: "\u001b[0m",
  bold: "\u001b[1m",
  dim: "\u001b[2m",
  green: "\u001b[32m",
  red: "\u001b[31m",
  yellow: "\u001b[33m",
  cyan: "\u001b[36m",
  gray: "\u001b[90m",
};

const DEFAULT_TRACE_LINE = 1;
const DEFAULT_TRACE_COLUMN = 1;

const findNode = (nodes: FileNode[], pathParts: string[]): FileNode | null => {
  for (const node of nodes) {
    if (node.name !== pathParts[0]) {
      continue;
    }

    if (pathParts.length === 1) {
      return node;
    }

    if (node.children) {
      return findNode(node.children, pathParts.slice(1));
    }
  }

  return null;
};

const findFirstContractName = (files: FileNode[]): string => {
  const firstFolder = files.find((node) => node.type === "folder");
  return firstFolder?.name ?? "hello_world";
};

const buildExactPathCandidates = (tracePath: string): string[][] => {
  const normalized = tracePath.replace(/\\/g, "/").replace(/^\.\//, "");
  const pathParts = normalized.split("/").filter(Boolean);

  if (pathParts.length === 0) {
    return [];
  }

  const candidates = [pathParts];

  if (pathParts.length > 2 && pathParts[1] === "src") {
    candidates.push([pathParts[0], ...pathParts.slice(2)]);
  }

  return candidates;
};

const findPathByFilename = (
  nodes: FileNode[],
  fileName: string,
  prefix: string[] = []
): string[] | null => {
  for (const node of nodes) {
    const nextPath = [...prefix, node.name];

    if (node.type === "file" && node.name === fileName) {
      return nextPath;
    }

    if (node.children) {
      const nested = findPathByFilename(node.children, fileName, nextPath);
      if (nested) {
        return nested;
      }
    }
  }

  return null;
};

const findContractFilePath = (
  files: FileNode[],
  contractName: string,
  fileName: string
): string[] | null => {
  const contract = files.find(
    (node) => node.type === "folder" && node.name === contractName
  );

  if (!contract?.children) {
    return null;
  }

  const nestedPath = findPathByFilename(contract.children, fileName, [contractName]);
  if (nestedPath) {
    return nestedPath;
  }

  return null;
};

const countLineMatches = (content: string | undefined, matcher: RegExp): number => {
  if (!content) {
    return DEFAULT_TRACE_LINE;
  }

  const lines = content.split(/\r?\n/);
  const lineNumber = lines.findIndex((line) => matcher.test(line));
  return lineNumber >= 0 ? lineNumber + 1 : DEFAULT_TRACE_LINE;
};

const createPassingCase = (contractName: string, rerunCommand: string): TestCaseResult => ({
  id: `${contractName}::test_hello`,
  suite: contractName,
  name: "test_hello",
  testType: "unit",
  status: "passed",
  durationMs: 12,
  rerunCommand,
  stdout: [
    `${ANSI.green}${ANSI.bold}PASS${ANSI.reset} ${contractName}::test_hello`,
    `${ANSI.gray}Verified the primary greeting contract path.${ANSI.reset}`,
  ].join("\n"),
  trace: [],
});

const createFailingCase = (
  contractName: string,
  traceFile: string,
  traceLine: number,
  rerunCommand: string
): TestCaseResult => ({
  id: `${contractName}::test_greets_contract_owner`,
  suite: contractName,
  name: "test_greets_contract_owner",
  testType: "unit",
  status: "failed",
  durationMs: 19,
  rerunCommand,
  failureMessage: "assertion `left == right` failed: greeting output drifted from snapshot",
  diff: {
    expected: `[Symbol("Hello"), Symbol("Owner")]`,
    actual: `[Symbol("Hello"), Symbol("Dev")]`,
  },
  stdout: [
    `${ANSI.red}${ANSI.bold}FAIL${ANSI.reset} ${contractName}::test_greets_contract_owner`,
    `${ANSI.yellow}assertion failed${ANSI.reset}: greeting output drifted from snapshot`,
    `${ANSI.red}- expected${ANSI.reset} [Symbol("Hello"), Symbol("Owner")]`,
    `${ANSI.green}+ actual${ANSI.reset} [Symbol("Hello"), Symbol("Dev")]`,
    `${ANSI.gray}stack backtrace:${ANSI.reset}`,
    `${ANSI.cyan}  --> ${traceFile}:${traceLine}:5${ANSI.reset}`,
    `${ANSI.cyan}  --> ${contractName}/src/lib.rs:11:9${ANSI.reset}`,
  ].join("\n"),
  trace: [
    {
      file: traceFile,
      line: traceLine,
      column: 5,
      label: "Assertion site",
    },
    {
      file: `${contractName}/src/lib.rs`,
      line: 11,
      column: 9,
      label: "hello contract implementation",
    },
  ],
});

const chooseTraceFile = (files: FileNode[], contractName: string): { path: string; line: number } => {
  const exactPath = findContractFilePath(files, contractName, "test.rs");
  const resolvedPath = exactPath ?? [contractName, "test.rs"];
  const node = findNode(files, resolvedPath);
  const traceLine = countLineMatches(node?.content, /assert_eq!/);

  return {
    path: `${contractName}/src/${resolvedPath[resolvedPath.length - 1]}`,
    line: traceLine,
  };
};

export function createSimulatedCargoTestOutput({
  files,
  activeTabPath,
  previousRun,
  rerunFailedOnly = false,
}: {
  files: FileNode[];
  activeTabPath: string[];
  previousRun?: TestRunResult | null;
  rerunFailedOnly?: boolean;
}): string {
  const contractName = activeTabPath[0] ?? findFirstContractName(files);
  const trace = chooseTraceFile(files, contractName);
  const allCases = [
    createPassingCase(contractName, `cargo test ${contractName}::test_hello -- --exact`),
    createFailingCase(
      contractName,
      trace.path,
      trace.line,
      `cargo test ${contractName}::test_greets_contract_owner -- --exact`
    ),
  ];

  const failedNames = new Set(
    previousRun?.cases.filter((testCase) => testCase.status === "failed").map((testCase) => testCase.name) ??
      allCases.filter((testCase) => testCase.status === "failed").map((testCase) => testCase.name)
  );

  const cases = rerunFailedOnly
    ? allCases.filter((testCase) => failedNames.has(testCase.name))
    : allCases;

  const passed = cases.filter((testCase) => testCase.status === "passed").length;
  const failed = cases.length - passed;
  const command = rerunFailedOnly
    ? `cargo test ${Array.from(failedNames).join(" ")} -- --exact`
    : "cargo test --message-format json";

  const events: SimulatedEvent[] = [
    {
      type: "suite",
      event: "started",
      startedAt: new Date().toISOString(),
      command,
      mode: rerunFailedOnly ? "failed-only" : "full",
      total: cases.length,
      filtered: rerunFailedOnly ? cases.length : 0,
    },
    ...cases.map<SimulatedEvent>((testCase) => ({
      type: "test",
      id: testCase.id,
      suite: testCase.suite,
      name: testCase.name,
      testType: testCase.testType,
      event: testCase.status === "passed" ? "ok" : "failed",
      durationMs: testCase.durationMs,
      stdout: testCase.stdout,
      rerunCommand: testCase.rerunCommand,
      failureMessage: testCase.failureMessage,
      diff: testCase.diff,
      trace: testCase.trace,
    })),
    {
      type: "suite",
      event: failed > 0 ? "failed" : "ok",
      passed,
      failed,
      total: cases.length,
      filtered: rerunFailedOnly ? cases.length : 0,
    },
  ];

  return events.map((event) => JSON.stringify(event)).join("\n");
}

export function parseStructuredTestOutput(rawOutput: string): TestRunResult {
  const lines = rawOutput
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  let command = "cargo test";
  let startedAt = new Date().toISOString();
  let mode: TestRunResult["mode"] = "full";
  let summary: TestRunSummary = { total: 0, passed: 0, failed: 0, filtered: 0 };
  const cases: TestCaseResult[] = [];

  for (const line of lines) {
    const event = JSON.parse(line) as SimulatedEvent;

    if (event.type === "suite" && event.event === "started") {
      command = event.command;
      startedAt = event.startedAt;
      mode = event.mode;
      summary = {
        total: event.total,
        passed: 0,
        failed: 0,
        filtered: event.filtered,
      };
      continue;
    }

    if (event.type === "test") {
      cases.push({
        id: event.id,
        name: event.name,
        suite: event.suite,
        testType: event.testType ?? "unit",
        status: event.event === "ok" ? "passed" : "failed",
        durationMs: event.durationMs,
        stdout: event.stdout,
        failureMessage: event.failureMessage,
        diff: event.diff,
        trace: event.trace ?? [],
        rerunCommand: event.rerunCommand,
      });
      continue;
    }

    if (event.type === "suite") {
      summary = {
        total: event.total,
        passed: event.passed,
        failed: event.failed,
        filtered: event.filtered,
      };
    }
  }

  return {
    command,
    startedAt,
    mode,
    summary,
    cases,
    rawOutput,
  };
}

export function formatTestRunForTerminal(result: TestRunResult): string {
  const lines: string[] = [];
  lines.push(`${ANSI.cyan}$ ${result.command}${ANSI.reset}`);
  lines.push("");

  for (const testCase of result.cases) {
    lines.push(testCase.stdout);

    if (testCase.status === "failed" && testCase.trace.length > 0) {
      lines.push(
        ...testCase.trace.map(
          (trace) => `${ANSI.gray}open:${ANSI.reset} ${trace.file}:${trace.line}:${trace.column}`
        )
      );
    }

    lines.push("");
  }

  const summaryColor = result.summary.failed > 0 ? ANSI.red : ANSI.green;
  lines.push(
    `${summaryColor}${ANSI.bold}test result:${ANSI.reset} ${result.summary.passed} passed; ${result.summary.failed} failed; ${result.summary.total} total${
      result.summary.filtered > 0 ? `; ${result.summary.filtered} filtered` : ""
    }`
  );

  return lines.join("\r\n");
}

export function resolveWorkspacePathForTrace(
  tracePath: string,
  files: FileNode[]
): string[] | null {
  const pathCandidates = buildExactPathCandidates(tracePath);

  for (const candidate of pathCandidates) {
    if (findNode(files, candidate)) {
      return candidate;
    }
  }

  const normalized = tracePath.replace(/\\/g, "/").replace(/^\.\//, "");
  const parts = normalized.split("/").filter(Boolean);
  if (parts.length === 0) {
    return null;
  }

  const contractName = parts[0];
  const fileName = parts[parts.length - 1];
  return findContractFilePath(files, contractName, fileName) ?? findPathByFilename(files, fileName);
}

export function extractTraceLocationsFromText(text: string): TestTraceLocation[] {
  const matches = text.matchAll(TRACE_LOCATION_PATTERN);
  const seen = new Set<string>();
  const locations: TestTraceLocation[] = [];

  for (const match of matches) {
    const file = match[1]?.replace(/\\/g, "/");
    const line = Number(match[2]);
    const column = Number(match[3] ?? DEFAULT_TRACE_COLUMN);

    if (!file || !Number.isFinite(line) || line <= 0 || !Number.isFinite(column) || column <= 0) {
      continue;
    }

    const key = `${file}:${line}:${column}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    locations.push({
      file,
      line,
      column,
      label: "Detected in output",
    });
  }

  return locations;
}

export function toRevealRange(
  line: number,
  column = DEFAULT_TRACE_COLUMN
): {
  startLineNumber: number;
  startColumn: number;
  endLineNumber: number;
  endColumn: number;
} {
  return {
    startLineNumber: Math.max(DEFAULT_TRACE_LINE, line),
    startColumn: Math.max(DEFAULT_TRACE_COLUMN, column),
    endLineNumber: Math.max(DEFAULT_TRACE_LINE, line),
    endColumn: Math.max(DEFAULT_TRACE_COLUMN + 1, column + 1),
  };
}

export interface CargoRunTestResponse {
  success: boolean;
  mode?: "full" | "failed-only";
  command?: string;
  stdout?: string;
  stderr?: string;
  outcomes?: Record<string, "passed" | "failed">;
}

export interface DiscoveredTestForRun {
  id: string;
  suite: string;
  name: string;
  testType: "unit" | "integration";
  rerunCommand: string;
}

function findOutcome(
  outcomes: Record<string, "passed" | "failed">,
  test: DiscoveredTestForRun
): "passed" | "failed" {
  if (outcomes[test.name]) {
    return outcomes[test.name];
  }

  const suffixMatch = Object.entries(outcomes).find(([name]) => name.endsWith(test.name));
  if (suffixMatch) {
    return suffixMatch[1];
  }

  return "passed";
}

export function createStructuredTestOutputFromCargoRun(
  run: CargoRunTestResponse,
  discoveredTests: DiscoveredTestForRun[]
): string {
  const startedAt = new Date().toISOString();
  const outcomes = run.outcomes ?? {};
  const stderr = run.stderr?.trim() ?? "";

  const testEvents: SimulatedEvent[] = discoveredTests.map((test) => {
    const status = findOutcome(outcomes, test);
    const isFailed = status === "failed" || (!run.success && stderr.length > 0);

    return {
      type: "test",
      id: test.id,
      suite: test.suite,
      name: test.name,
      testType: test.testType,
      event: isFailed ? "failed" : "ok",
      durationMs: 0,
      stdout: [run.stdout ?? "", run.stderr ?? ""].filter(Boolean).join("\n"),
      rerunCommand: test.rerunCommand,
      failureMessage: isFailed ? stderr || "cargo test execution failed" : undefined,
      trace: [],
    };
  });

  const failed = testEvents.filter(
    (event) => event.type === "test" && event.event === "failed"
  ).length;
  const passed = testEvents.length - failed;

  const events: SimulatedEvent[] = [
    {
      type: "suite",
      event: "started",
      startedAt,
      command: run.command ?? "cargo test",
      mode: run.mode === "failed-only" ? "failed-only" : "full",
      total: testEvents.length,
      filtered: run.mode === "failed-only" ? testEvents.length : 0,
    },
    ...testEvents,
    {
      type: "suite",
      event: failed > 0 ? "failed" : "ok",
      passed,
      failed,
      total: testEvents.length,
      filtered: run.mode === "failed-only" ? testEvents.length : 0,
    },
  ];

  return events.map((event) => JSON.stringify(event)).join("\n");
}