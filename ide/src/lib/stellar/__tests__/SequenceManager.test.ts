/**
 * src/lib/stellar/__tests__/SequenceManager.test.ts
 * ============================================================
 * Unit tests for the Advanced Sequence Number Manager — Issue #832
 * ============================================================
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  SequenceManager,
  type TransactionBuilder,
  type SequenceManagerConfig,
  type SubmissionResult,
} from "../SequenceManager";

// ── Mock stellar-sdk/rpc Server ──────────────────────────────────────────────

vi.mock("@stellar/stellar-sdk/rpc", () => {
  return {
    Server: vi.fn().mockImplementation(() => mockServer),
  };
});

const mockServer = {
  getAccount: vi.fn(),
  sendTransaction: vi.fn(),
};

const BASE_CONFIG: SequenceManagerConfig = {
  rpcUrl: "http://localhost:8000",
  accountId: "GABC1234",
  allowHttp: true,
};

function makeAccount(seq: string | number) {
  return { sequenceNumber: () => String(seq) };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Factory ──────────────────────────────────────────────────────────────────

describe("SequenceManager.create", () => {
  it("fetches the initial sequence from the network", async () => {
    mockServer.getAccount.mockResolvedValue(makeAccount(100));

    const mgr = await SequenceManager.create(BASE_CONFIG);
    expect(mockServer.getAccount).toHaveBeenCalledWith("GABC1234");
    expect(mgr.peekNextSequence()).toBe(100n);
  });
});

// ── enqueue — success path ───────────────────────────────────────────────────

describe("SequenceManager.enqueue — success", () => {
  it("resolves with success=true and the tx hash on first attempt", async () => {
    mockServer.getAccount.mockResolvedValue(makeAccount(10));
    mockServer.sendTransaction.mockResolvedValue({ status: "PENDING", hash: "abc123" });

    const mgr = await SequenceManager.create(BASE_CONFIG);
    const builder: TransactionBuilder = vi.fn().mockResolvedValue("signed-xdr");

    const result = await mgr.enqueue(builder, { maxRetries: 0 });

    expect(result.success).toBe(true);
    expect(result.hash).toBe("abc123");
    expect(result.attempts).toBe(1);
    expect(builder).toHaveBeenCalledWith(11n); // seq bumped by 1
  });

  it("bumps nextSequence after a successful submission", async () => {
    mockServer.getAccount.mockResolvedValue(makeAccount(5));
    mockServer.sendTransaction.mockResolvedValue({ status: "PENDING", hash: "h1" });

    const mgr = await SequenceManager.create(BASE_CONFIG);
    await mgr.enqueue(vi.fn().mockResolvedValue("xdr"), { maxRetries: 0 });

    expect(mgr.peekNextSequence()).toBe(6n);
  });
});

// ── enqueue — build error ────────────────────────────────────────────────────

describe("SequenceManager.enqueue — builder failure", () => {
  it("resolves with success=false when the builder throws", async () => {
    mockServer.getAccount.mockResolvedValue(makeAccount(20));
    const builder: TransactionBuilder = vi.fn().mockRejectedValue(new Error("sign failed"));

    const mgr = await SequenceManager.create(BASE_CONFIG);
    const result = await mgr.enqueue(builder, { maxRetries: 0 });

    expect(result.success).toBe(false);
    expect(result.error).toContain("sign failed");
  });
});

// ── enqueue — sequence recovery ──────────────────────────────────────────────

describe("SequenceManager.enqueue — sequence recovery", () => {
  it("retries after a BAD_SEQ error and re-fetches sequence", async () => {
    mockServer.getAccount
      .mockResolvedValueOnce(makeAccount(50))  // initial create
      .mockResolvedValueOnce(makeAccount(55)); // recovery fetch

    mockServer.sendTransaction
      .mockRejectedValueOnce(new Error("tx_bad_seq"))
      .mockResolvedValueOnce({ status: "PENDING", hash: "recovered" });

    const mgr = await SequenceManager.create(BASE_CONFIG, {
      onRecovery: vi.fn(),
    });

    const result = await mgr.enqueue(
      vi.fn().mockResolvedValue("xdr"),
      { maxRetries: 2, retryBaseMs: 1 } // 1ms back-off so test is fast
    );

    expect(result.success).toBe(true);
    expect(result.hash).toBe("recovered");
    expect(result.attempts).toBe(2);
    expect(mockServer.getAccount).toHaveBeenCalledTimes(2);
  });

  it("fires onRecovery event with old and new sequence", async () => {
    const onRecovery = vi.fn();
    mockServer.getAccount
      .mockResolvedValueOnce(makeAccount(30))
      .mockResolvedValueOnce(makeAccount(35));

    mockServer.sendTransaction
      .mockRejectedValueOnce(new Error("sequence too low"))
      .mockResolvedValueOnce({ status: "PENDING", hash: "h" });

    const mgr = await SequenceManager.create(BASE_CONFIG, { onRecovery });
    await mgr.enqueue(vi.fn().mockResolvedValue("xdr"), {
      maxRetries: 2,
      retryBaseMs: 1,
    });

    expect(onRecovery).toHaveBeenCalled();
    const [oldSeq, newSeq] = onRecovery.mock.calls[0];
    expect(typeof oldSeq).toBe("bigint");
    expect(typeof newSeq).toBe("bigint");
    expect(newSeq).toBeGreaterThan(oldSeq);
  });

  it("fails after exhausting max retries on repeated sequence errors", async () => {
    mockServer.getAccount.mockResolvedValue(makeAccount(10));
    mockServer.sendTransaction.mockRejectedValue(new Error("bad_seq"));

    const mgr = await SequenceManager.create(BASE_CONFIG);
    const result = await mgr.enqueue(
      vi.fn().mockResolvedValue("xdr"),
      { maxRetries: 1, retryBaseMs: 1 }
    );

    expect(result.success).toBe(false);
  });
});

// ── Event hooks ──────────────────────────────────────────────────────────────

describe("SequenceManager — event hooks", () => {
  it("fires onEnqueue when a tx is added", async () => {
    mockServer.getAccount.mockResolvedValue(makeAccount(1));
    mockServer.sendTransaction.mockResolvedValue({ status: "PENDING", hash: "h" });

    const onEnqueue = vi.fn();
    const mgr = await SequenceManager.create(BASE_CONFIG, { onEnqueue });

    await mgr.enqueue(vi.fn().mockResolvedValue("xdr"), { maxRetries: 0 });
    expect(onEnqueue).toHaveBeenCalledOnce();
    expect(typeof onEnqueue.mock.calls[0][0]).toBe("string"); // id string
  });

  it("fires onComplete with the submission result", async () => {
    mockServer.getAccount.mockResolvedValue(makeAccount(1));
    mockServer.sendTransaction.mockResolvedValue({ status: "PENDING", hash: "done" });

    const onComplete = vi.fn();
    const mgr = await SequenceManager.create(BASE_CONFIG, { onComplete });

    await mgr.enqueue(vi.fn().mockResolvedValue("xdr"), { maxRetries: 0 });
    expect(onComplete).toHaveBeenCalledOnce();

    const result: SubmissionResult = onComplete.mock.calls[0][0];
    expect(result.success).toBe(true);
    expect(result.hash).toBe("done");
  });

  it("fires onStatusChange during the lifecycle", async () => {
    mockServer.getAccount.mockResolvedValue(makeAccount(1));
    mockServer.sendTransaction.mockResolvedValue({ status: "PENDING", hash: "h2" });

    const onStatusChange = vi.fn();
    const mgr = await SequenceManager.create(BASE_CONFIG, { onStatusChange });

    await mgr.enqueue(vi.fn().mockResolvedValue("xdr"), { maxRetries: 0 });
    expect(onStatusChange).toHaveBeenCalled();
  });
});

// ── getQueueSnapshot ─────────────────────────────────────────────────────────

describe("SequenceManager.getQueueSnapshot", () => {
  it("returns an empty array when queue is empty", async () => {
    mockServer.getAccount.mockResolvedValue(makeAccount(1));
    const mgr = await SequenceManager.create(BASE_CONFIG);
    expect(mgr.getQueueSnapshot()).toEqual([]);
  });
});

// ── syncSequence ─────────────────────────────────────────────────────────────

describe("SequenceManager.syncSequence", () => {
  it("refreshes the local counter from the network", async () => {
    mockServer.getAccount
      .mockResolvedValueOnce(makeAccount(1))
      .mockResolvedValueOnce(makeAccount(99));

    const mgr = await SequenceManager.create(BASE_CONFIG);
    const newSeq = await mgr.syncSequence();

    expect(newSeq).toBe(99n);
    expect(mgr.peekNextSequence()).toBe(99n);
  });

  it("fires onRecovery when sequence changes on sync", async () => {
    const onRecovery = vi.fn();
    mockServer.getAccount
      .mockResolvedValueOnce(makeAccount(5))
      .mockResolvedValueOnce(makeAccount(10));

    const mgr = await SequenceManager.create(BASE_CONFIG, { onRecovery });
    await mgr.syncSequence();

    expect(onRecovery).toHaveBeenCalledWith(5n, 10n);
  });

  it("does not fire onRecovery when sequence is unchanged", async () => {
    const onRecovery = vi.fn();
    mockServer.getAccount
      .mockResolvedValueOnce(makeAccount(7))
      .mockResolvedValueOnce(makeAccount(7));

    const mgr = await SequenceManager.create(BASE_CONFIG, { onRecovery });
    await mgr.syncSequence();

    expect(onRecovery).not.toHaveBeenCalled();
  });
});
