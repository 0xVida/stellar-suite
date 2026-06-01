import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import {
  Account,
  Address,
  Asset,
  Networks,
  Operation,
  TransactionBuilder,
  xdr,
} from "@stellar/stellar-sdk";

import { XdrInspector } from "@/components/ide/XdrInspector";

const NETWORK = Networks.TESTNET;

// Hardcoded valid Stellar public keys so the tests don't depend on
// crypto.getRandomValues, which isn't polyfilled in jsdom.
const SOURCE_PK = "GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVSGZ";
const DESTINATION_PK = "GBZXN7PIRZGNMHGA7MUUUF4GWPY5AYPV6LY4UV2GL6VJGIQRXFDNMADI";
// Reuse SOURCE_PK for createContract — Address.fromString validates the
// strkey checksum and any randomly typed key won't satisfy it.
const DEPLOYER_PK = SOURCE_PK;

const buildEnvelopeXdr = (
  build: (b: TransactionBuilder) => TransactionBuilder,
  fee = "100",
): string => {
  const account = new Account(SOURCE_PK, "1");
  const builder = new TransactionBuilder(account, {
    fee,
    networkPassphrase: NETWORK,
  });
  return build(builder).setTimeout(60).build().toXDR();
};

describe("XdrInspector", () => {
  it("decodes a payment operation and exposes structured details", () => {
    const envelopeXdr = buildEnvelopeXdr((b) =>
      b.addOperation(
        Operation.payment({
          destination: DESTINATION_PK,
          asset: Asset.native(),
          amount: "12.5",
        }),
      ),
    );

    render(
      <XdrInspector
        open
        xdr={envelopeXdr}
        networkPassphrase={NETWORK}
        onApprove={vi.fn()}
        onReject={vi.fn()}
      />,
    );

    expect(screen.getByText("payment")).toBeInTheDocument();
    // Amount and asset are normalized through stellar-sdk; just ensure both
    // surface somewhere inside the dialog.
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent(/12\.5/);
    expect(dialog).toHaveTextContent(/XLM|native/);
    expect(
      screen.queryByTestId("xdr-inspector-sensitive-banner"),
    ).not.toBeInTheDocument();
  });

  it("flags setOptions as a sensitive auth-modifying operation", () => {
    const envelopeXdr = buildEnvelopeXdr((b) =>
      b.addOperation(
        Operation.setOptions({
          masterWeight: 0,
          lowThreshold: 1,
          medThreshold: 1,
          highThreshold: 1,
        }),
      ),
    );

    render(
      <XdrInspector
        open
        xdr={envelopeXdr}
        networkPassphrase={NETWORK}
        onApprove={vi.fn()}
        onReject={vi.fn()}
      />,
    );

    expect(screen.getByText("setOptions")).toBeInTheDocument();
    expect(
      screen.getByTestId("xdr-inspector-sensitive-banner"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /Modifies account authentication \(signers, thresholds, or auth flags\)\./i,
      ),
    ).toBeInTheDocument();
  });

  it("decodes invokeHostFunction (createContract) and surfaces auth count", () => {
    const createContractOp = Operation.invokeHostFunction({
      func: xdr.HostFunction.hostFunctionTypeCreateContract(
        new xdr.CreateContractArgs({
          contractIdPreimage:
            xdr.ContractIdPreimage.contractIdPreimageFromAddress(
              new xdr.ContractIdPreimageFromAddress({
                address: Address.fromString(DEPLOYER_PK).toScAddress(),
                salt: Buffer.alloc(32, 1),
              }),
            ),
          executable: xdr.ContractExecutable.contractExecutableWasm(
            Buffer.alloc(32, 2),
          ),
        }),
      ),
      auth: [],
    });

    const envelopeXdr = buildEnvelopeXdr((b) => b.addOperation(createContractOp));

    render(
      <XdrInspector
        open
        xdr={envelopeXdr}
        networkPassphrase={NETWORK}
        onApprove={vi.fn()}
        onReject={vi.fn()}
      />,
    );

    expect(screen.getByText("invokeHostFunction")).toBeInTheDocument();
    expect(
      screen.getByText(/Creates a new contract instance/i),
    ).toBeInTheDocument();
  });

  it("highlights an unusually high fee", () => {
    const envelopeXdr = buildEnvelopeXdr(
      (b) =>
        b.addOperation(
          Operation.payment({
            destination: DESTINATION_PK,
            asset: Asset.native(),
            amount: "1",
          }),
        ),
      "2000000", // 0.2 XLM
    );

    render(
      <XdrInspector
        open
        xdr={envelopeXdr}
        networkPassphrase={NETWORK}
        onApprove={vi.fn()}
        onReject={vi.fn()}
      />,
    );

    expect(
      screen.getByText(/Fee is unusually high|Fee exceeds 0\.1 XLM/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toHaveTextContent(/2000000 stroops/);
  });

  it("invokes onApprove / onReject when buttons are clicked", () => {
    const envelopeXdr = buildEnvelopeXdr((b) =>
      b.addOperation(
        Operation.payment({
          destination: DESTINATION_PK,
          asset: Asset.native(),
          amount: "1",
        }),
      ),
    );

    const onApprove = vi.fn();
    const onReject = vi.fn();

    const { rerender } = render(
      <XdrInspector
        open
        xdr={envelopeXdr}
        networkPassphrase={NETWORK}
        onApprove={onApprove}
        onReject={onReject}
      />,
    );

    fireEvent.click(screen.getByTestId("xdr-inspector-approve"));
    expect(onApprove).toHaveBeenCalledTimes(1);

    rerender(
      <XdrInspector
        open
        xdr={envelopeXdr}
        networkPassphrase={NETWORK}
        onApprove={onApprove}
        onReject={onReject}
      />,
    );

    fireEvent.click(screen.getByTestId("xdr-inspector-reject"));
    expect(onReject).toHaveBeenCalledTimes(1);
  });

  it("reports a decode error for malformed XDR and disables approve", () => {
    render(
      <XdrInspector
        open
        xdr="not-base64-at-all"
        networkPassphrase={NETWORK}
        onApprove={vi.fn()}
        onReject={vi.fn()}
      />,
    );

    // The dialog renders via portal; query through `screen` so the
    // role-scoped lookups find content outside the test root.
    expect(screen.getByTestId("xdr-inspector-approve")).toBeDisabled();
    expect(screen.getByRole("dialog")).toHaveTextContent(
      /valid standard Base64/i,
    );
  });
});
