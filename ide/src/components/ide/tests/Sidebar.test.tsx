import React from "react";
import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock("@/components/ide/CopyToClipboard", () => ({
  CopyToClipboard: ({ label }: { label: string }) => (
    <button type="button" aria-label={label}>
      Copy
    </button>
  ),
}));

vi.mock("@/store/workspaceStore", () => ({
  useWorkspaceStore: vi.fn(),
}));

vi.mock("@/store/useDeployedContractsStore", () => ({
  useDeployedContractsStore: vi.fn(),
}));

const { environmentSlotsStore } = vi.hoisted(() => ({
  environmentSlotsStore: Object.assign(
    vi.fn(() => ({
      selectedSlotId: null,
      slots: [],
    })),
    {
      getState: vi.fn(() => ({
        selectedSlotId: null,
        slots: [],
        pinContract: vi.fn(),
      })),
    },
  ),
}));

vi.mock("@/store/useEnvironmentSlotsStore", () => ({
  default: environmentSlotsStore,
}));

import { TestingView } from "@/components/ide/TestingView";
import { DeploymentsView } from "@/components/ide/DeploymentsView";
import { useWorkspaceStore } from "@/store/workspaceStore";
import { useDeployedContractsStore } from "@/store/useDeployedContractsStore";

const rustWorkspace = {
  activeTabPath: ["src", "lib.rs"],
  files: [
    {
      name: "src",
      type: "folder",
      children: [
        {
          name: "lib.rs",
          type: "file",
          content: "pub struct Contract;",
        },
      ],
    },
  ],
  updateFileContent: vi.fn(),
};

const emptyDeploymentStore = {
  deployedContracts: [],
  addContract: vi.fn(),
  removeContract: vi.fn(),
};

function summarizeDom(root: Element | null): string {
  if (!root) return "";

  const walk = (node: Element, depth = 0): string[] => {
    const indent = "  ".repeat(depth);
    const id = node.id ? `#${node.id}` : "";
    const role = node.getAttribute("role");
    const aria = node.getAttribute("aria-label");
    const expanded = node.getAttribute("aria-expanded");
    const attrs = [
      role ? `role=${role}` : "",
      aria ? `aria=${aria}` : "",
      expanded ? `expanded=${expanded}` : "",
    ].filter(Boolean);
    const text = Array.from(node.childNodes)
      .filter((child) => child.nodeType === Node.TEXT_NODE)
      .map((child) => child.textContent?.replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .join(" ");
    const line = `${indent}<${node.tagName.toLowerCase()}${id}${attrs.length ? ` ${attrs.join(" ")}` : ""}>${text ? ` ${text}` : ""}`;
    if (node.tagName.toLowerCase() === "svg") {
      return [line];
    }
    return [
      line,
      ...Array.from(node.children).flatMap((child) => walk(child, depth + 1)),
    ];
  };

  return walk(root).join("\n");
}

describe("IDE sidebar structural snapshots", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(Date.prototype, "toLocaleDateString").mockReturnValue("May 31, 09:00 AM");
    (useWorkspaceStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue(rustWorkspace);
    (useDeployedContractsStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue(emptyDeploymentStore);
  });

  it("keeps the Testing panel structure stable", () => {
    const { container } = render(<TestingView />);

    expect(summarizeDom(container.firstElementChild)).toMatchInlineSnapshot(`
"<div>
  <div>
    <svg>
    <span> Proptest Snippets
    <span> 15
  <div>
    <span> Inserting into
      <span> src/lib.rs
  <div>
    <section>
      <button expanded=true>
        <svg>
        <span> Test Harness
        <span> 2
      <div>
        <p> Module scaffold and Cargo.toml setup
        <div>
          <button expanded=false>
            <svg>
            <span> proptest: full test module scaffold
        <div>
          <button expanded=false>
            <svg>
            <span> Cargo.toml: add proptest dev-dependency
    <section>
      <button expanded=false>
        <svg>
        <span> Integer Ranges
        <span> 4
    <section>
      <button expanded=false>
        <svg>
        <span> Address Generation
        <span> 3
    <section>
      <button expanded=false>
        <svg>
        <span> Contract State
        <span> 4
    <section>
      <button expanded=false>
        <svg>
        <span> Composite Scenarios
        <span> 2"
`);
  });

  it("keeps the Deployments panel empty state stable", () => {
    const { container } = render(
      <DeploymentsView activeContractId={null} onSelectContract={vi.fn()} />,
    );

    expect(summarizeDom(container.firstElementChild)).toMatchInlineSnapshot(`
"<div#tour-deploy-sidebar>
  <div>
    <div>
      <svg>
      <span> Recent Deployments
    <button>
      <svg>
  <div>
    <div>
      <svg>
      <input>
  <div>
    <div>
      <svg>
      <p> No deployments found"
`);
  });

  it("keeps the Deployments panel populated structure stable", () => {
    (useDeployedContractsStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      ...emptyDeploymentStore,
      deployedContracts: [
        {
          id: "C".padEnd(56, "A"),
          network: "testnet",
          name: "Escrow Contract",
          deployedAt: "2026-05-31T08:00:00.000Z",
        },
        {
          id: "C".padEnd(56, "B"),
          network: "mainnet",
          name: "Token Contract",
          deployedAt: "2026-05-31T09:00:00.000Z",
        },
      ],
    });

    const { container } = render(
      <DeploymentsView activeContractId={"C".padEnd(56, "B")} onSelectContract={vi.fn()} />,
    );

    expect(summarizeDom(container.firstElementChild)).toMatchInlineSnapshot(`
"<div#tour-deploy-sidebar>
  <div>
    <div>
      <svg>
      <span> Recent Deployments
    <button>
      <svg>
  <div>
    <div>
      <svg>
      <input>
  <div>
    <div>
      <div role=button>
        <div>
          <div>
            <div>
              <span> Token Contract
              <svg>
            <div>
              <span> CBBBBB...BBBBBB
              <button aria=Copy contract ID> Copy
          <div>
            <div> mainnet
            <button>
              <svg>
        <div>
          <svg>
          <span> May 31, 09:00 AM
      <div role=button>
        <div>
          <div>
            <div>
              <span> Escrow Contract
            <div>
              <span> CAAAAA...AAAAAA
              <button aria=Copy contract ID> Copy
          <div>
            <div> testnet
            <button>
              <svg>
        <div>
          <svg>
          <span> May 31, 09:00 AM"
`);
  });
});
