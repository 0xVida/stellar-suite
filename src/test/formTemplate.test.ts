import * as assert from "assert";
import * as vscode from "vscode";
import { FormTemplateService } from "../services/formTemplateService";

declare const process: { exitCode?: number };

// ── Mock helpers ──────────────────────────────────────────────
function createMockContext() {
  const store: Record<string, any> = {};
  return {
    workspaceState: {
      get<T>(key: string, defaultValue?: T): T {
        return (store[key] !== undefined ? store[key] : defaultValue) as T;
      },
      update(key: string, value: any): Thenable<void> {
        store[key] = value;
        return Promise.resolve();
      },
      keys() {
        return Object.keys(store);
      },
    } as vscode.Memento,
  } as vscode.ExtensionContext;
}

function createService() {
  const ctx = createMockContext();
  const svc = new FormTemplateService(ctx);
  svc.clearTemplates();
  return svc;
}

// ── Tests ─────────────────────────────────────────────────────

async function testInitEmpty() {
  const svc = createService();
  const templates = svc.getTemplates();
  assert.strictEqual(templates.length, 0);
  console.log("  [ok] Initializes with empty templates");
}

async function testSaveTemplate() {
  const svc = createService();
  const saved = svc.saveTemplate({
    name: "Test Template",
    contractId: "C_MOCK",
    functionName: "mock_func",
    parameters: { arg1: "123" },
    category: "default",
  });

  assert.ok(saved.id);
  assert.ok(saved.createdAt);
  assert.ok(saved.updatedAt);
  assert.strictEqual(saved.name, "Test Template");
  assert.strictEqual(saved.contractId, "C_MOCK");
  assert.strictEqual(saved.parameters.arg1, "123");

  const templates = svc.getTemplates();
  assert.strictEqual(templates.length, 1);
  assert.strictEqual(templates[0].id, saved.id);
  console.log("  [ok] testSaveTemplate correctly saves and assigns IDs");
}

async function testFilterTemplates() {
  const svc = createService();
  svc.saveTemplate({
    name: "A",
    contractId: "C1",
    functionName: "F1",
    parameters: {},
  });
  svc.saveTemplate({
    name: "B",
    contractId: "C1",
    functionName: "F2",
    parameters: {},
  });
  svc.saveTemplate({
    name: "C",
    contractId: "C2",
    functionName: "F1",
    parameters: {},
  });

  let results = svc.getTemplates({ contractId: "C1" });
  assert.strictEqual(results.length, 2);

  results = svc.getTemplates({ contractId: "C1", functionName: "F2" });
  assert.strictEqual(results.length, 1);
  assert.strictEqual(results[0].name, "B");
  console.log(
    "  [ok] testFilterTemplates correctly filters by contract/function",
  );
}

async function testUpdateTemplate() {
  const svc = createService();
  const t1 = svc.saveTemplate({
    name: "Old Name",
    contractId: "C",
    functionName: "F",
    parameters: {},
  });

  // slight delay
  await new Promise((r) => setTimeout(r, 10));

  const updated = svc.updateTemplate(t1.id, {
    name: "New Name",
    parameters: { p: "1" },
  });
  assert.ok(updated);
  assert.strictEqual(updated?.name, "New Name");
  assert.strictEqual(updated?.parameters.p, "1");
  assert.ok(updated!.updatedAt > t1.updatedAt, "UpdatedAt should be newer");

  const fetched = svc.getTemplates()[0];
  assert.strictEqual(fetched.name, "New Name");
  console.log(
    "  [ok] testUpdateTemplate applies partial updates and refreshes timestamp",
  );
}

async function testDeleteTemplate() {
  const svc = createService();
  const t1 = svc.saveTemplate({
    name: "T1",
    contractId: "C",
    functionName: "F",
    parameters: {},
  });
  const t2 = svc.saveTemplate({
    name: "T2",
    contractId: "C",
    functionName: "F",
    parameters: {},
  });

  assert.strictEqual(svc.getTemplates().length, 2);

  svc.deleteTemplate(t1.id);

  const remaining = svc.getTemplates();
  assert.strictEqual(remaining.length, 1);
  assert.strictEqual(remaining[0].name, "T2");
  console.log("  [ok] testDeleteTemplate successfully removes targets");
}

// ── Runner ────────────────────────────────────────────────────

async function runAll() {
  try {
    console.log("Running FormTemplateService tests...");
    await testInitEmpty();
    await testSaveTemplate();
    await testFilterTemplates();
    await testUpdateTemplate();
    await testDeleteTemplate();
    console.log("[SUCCESS] All FormTemplateService tests passed!");
  } catch (err) {
    console.error("[ERROR] FormTemplateService tests failed");
    console.error(err);
    process.exitCode = 1;
  }
}

runAll();
