import type { FileNode } from "@/lib/sample-contracts";

export type CiProvider = "github" | "gitlab" | "circleci";

export interface CiProjectInfo {
  projectName: string;
  contractNames: string[];
  contractManifests: string[];
}

export interface CiTemplateResult {
  provider: CiProvider;
  path: string;
  filename: string;
  content: string;
}

interface FlatWorkspaceFile {
  path: string;
  name: string;
  content: string;
}

const CARGO_TOML_NAME = "Cargo.toml";

const toPosixPath = (pathParts: string[]) => pathParts.join("/");

const flattenFiles = (nodes: FileNode[], parentPath: string[] = []): FlatWorkspaceFile[] => {
  return nodes.flatMap((node) => {
    const nextPath = [...parentPath, node.name];
    if (node.type === "folder") return flattenFiles(node.children ?? [], nextPath);
    return [{ path: toPosixPath(nextPath), name: node.name, content: node.content ?? "" }];
  });
};

const parsePackageName = (cargoToml: string): string | null => {
  const sectionMatch = cargoToml.match(/\[package\][\s\S]*?(?=\n\[|$)/);
  const source = sectionMatch?.[0] ?? cargoToml;
  const nameMatch = source.match(/^\s*name\s*=\s*"(.*?)"\s*$/m);
  return nameMatch?.[1]?.trim() || null;
};

const sanitizeName = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9_\-/]+/g, "-")
    .replace(/^-+|-+$/g, "") || "soroban-project";

export const inferCiProjectInfo = (files: FileNode[]): CiProjectInfo => {
  const flatFiles = flattenFiles(files);
  const manifests = flatFiles.filter((file) => file.name === CARGO_TOML_NAME);

  const contracts = manifests.map((manifest) => {
    const parsedName = parsePackageName(manifest.content);
    const fallbackFromFolder = manifest.path.split("/").slice(-2, -1)[0];
    const contractName = parsedName ?? fallbackFromFolder ?? "contract";
    return {
      name: sanitizeName(contractName),
      manifestPath: manifest.path,
    };
  });

  const uniqueNames = Array.from(new Set(contracts.map((contract) => contract.name))).filter(Boolean);
  const uniqueManifests = Array.from(new Set(contracts.map((contract) => contract.manifestPath))).filter(Boolean);
  const inferredProject = uniqueNames[0] ?? "soroban-project";

  return {
    projectName: inferredProject,
    contractNames: uniqueNames.length > 0 ? uniqueNames : ["contract"],
    contractManifests: uniqueManifests.length > 0 ? uniqueManifests : [CARGO_TOML_NAME],
  };
};

const toManifestArrayLiteral = (manifests: string[]) =>
  manifests.map((manifest) => `"${manifest}"`).join(" ");

const buildCommandScript = (manifests: string[], innerCommand: string) => `set -euo pipefail
MANIFESTS=(${toManifestArrayLiteral(manifests)})
found=0
for manifest in "\${MANIFESTS[@]}"; do
  if [ -f "$manifest" ]; then
    found=1
    ${innerCommand}
  fi
done
if [ "$found" -eq 0 ]; then
  echo "No Cargo.toml manifest found. Expected one of: \${MANIFESTS[*]}"
  exit 1
fi`;

const formatContractList = (contractNames: string[]) => contractNames.join(", ");

const githubTemplate = (info: CiProjectInfo): CiTemplateResult => {
  const manifests = info.contractManifests;
  const contractList = formatContractList(info.contractNames);

  const content = `name: Soroban CI

on:
  push:
    branches: [main, develop]
  pull_request:

jobs:
  build-test-lint:
    runs-on: ubuntu-latest
    timeout-minutes: 25

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Rust Toolchain
        uses: dtolnay/rust-toolchain@stable
        with:
          components: clippy,rustfmt
          targets: wasm32v1-none

      - name: Setup Stellar CLI
        uses: stellar/stellar-cli@v23.0.1

      - name: Cache Cargo + Target
        uses: actions/cache@v4
        with:
          path: |
            ~/.cargo/registry
            ~/.cargo/git
            target
          key: \${{ runner.os }}-cargo-\${{ hashFiles('**/Cargo.lock') }}
          restore-keys: |
            \${{ runner.os }}-cargo-

      - name: Project Context
        run: |
          echo "Project: ${info.projectName}"
          echo "Detected contracts: ${contractList}"

      - name: Install Dependencies
        run: rustup target add wasm32v1-none

      - name: Build
        shell: bash
        run: |
          ${buildCommandScript(manifests, 'cargo build --locked --all-targets --manifest-path "$manifest"')}

      - name: Unit Tests
        shell: bash
        run: |
          ${buildCommandScript(manifests, 'cargo test --locked --all-targets --manifest-path "$manifest"')}

      - name: Clippy
        shell: bash
        run: |
          ${buildCommandScript(manifests, 'cargo clippy --locked --all-targets --all-features --manifest-path "$manifest" -- -D warnings')}

      - name: Rustfmt Check
        shell: bash
        run: |
          ${buildCommandScript(manifests, 'cargo fmt --all --manifest-path "$manifest" -- --check')}
`;

  return {
    provider: "github",
    path: ".github/workflows/ci.yml",
    filename: "ci.yml",
    content,
  };
};

const gitlabTemplate = (info: CiProjectInfo): CiTemplateResult => {
  const manifests = info.contractManifests;
  const contractList = formatContractList(info.contractNames);

  const content = `image: rust:1.77

stages:
  - validate

variables:
  CARGO_HOME: "$CI_PROJECT_DIR/.cargo"

cache:
  key: "$CI_COMMIT_REF_SLUG"
  paths:
    - .cargo/registry
    - .cargo/git
    - target
  policy: pull-push

before_script:
  - rustup component add clippy rustfmt
  - rustup target add wasm32v1-none
  - cargo install --locked stellar-cli --no-default-features || true
  - echo "Project: ${info.projectName}"
  - echo "Detected contracts: ${contractList}"

ci:validate:
  stage: validate
  script:
    - |
      ${buildCommandScript(manifests, 'cargo build --locked --all-targets --manifest-path "$manifest"')}
    - |
      ${buildCommandScript(manifests, 'cargo test --locked --all-targets --manifest-path "$manifest"')}
    - |
      ${buildCommandScript(manifests, 'cargo clippy --locked --all-targets --all-features --manifest-path "$manifest" -- -D warnings')}
    - |
      ${buildCommandScript(manifests, 'cargo fmt --all --manifest-path "$manifest" -- --check')}
`;

  return {
    provider: "gitlab",
    path: ".gitlab-ci.yml",
    filename: ".gitlab-ci.yml",
    content,
  };
};

const circleCiTemplate = (info: CiProjectInfo): CiTemplateResult => {
  const manifests = info.contractManifests;
  const contractList = formatContractList(info.contractNames);

  const content = `version: 2.1

jobs:
  build_test_lint:
    docker:
      - image: cimg/rust:1.77
    resource_class: medium
    steps:
      - checkout

      - restore_cache:
          keys:
            - cargo-cache-v1-{{ .Branch }}
            - cargo-cache-v1-

      - run:
          name: Setup Toolchain
          command: |
            rustup component add clippy rustfmt
            rustup target add wasm32v1-none
            cargo install --locked stellar-cli --no-default-features || true

      - run:
          name: Project Context
          command: |
            echo "Project: ${info.projectName}"
            echo "Detected contracts: ${contractList}"

      - run:
          name: Build
          command: |
            ${buildCommandScript(manifests, 'cargo build --locked --all-targets --manifest-path "$manifest"')}

      - run:
          name: Unit Tests
          command: |
            ${buildCommandScript(manifests, 'cargo test --locked --all-targets --manifest-path "$manifest"')}

      - run:
          name: Clippy
          command: |
            ${buildCommandScript(manifests, 'cargo clippy --locked --all-targets --all-features --manifest-path "$manifest" -- -D warnings')}

      - run:
          name: Rustfmt Check
          command: |
            ${buildCommandScript(manifests, 'cargo fmt --all --manifest-path "$manifest" -- --check')}

      - save_cache:
          key: cargo-cache-v1-{{ .Branch }}
          paths:
            - ~/.cargo/registry
            - ~/.cargo/git
            - target

workflows:
  version: 2
  ci:
    jobs:
      - build_test_lint
`;

  return {
    provider: "circleci",
    path: ".circleci/config.yml",
    filename: "config.yml",
    content,
  };
};

export const CI_TEMPLATES: Record<CiProvider, (info: CiProjectInfo) => CiTemplateResult> = {
  github: githubTemplate,
  gitlab: gitlabTemplate,
  circleci: circleCiTemplate,
};

export const generateCiTemplate = (provider: CiProvider, info: CiProjectInfo): CiTemplateResult =>
  CI_TEMPLATES[provider](info);
