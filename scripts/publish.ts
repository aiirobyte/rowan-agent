#!/usr/bin/env bun
import { readFileSync, writeFileSync } from "fs";
import { execSync } from "child_process";
import { resolve } from "path";

interface PackageJson {
  name: string;
  version: string;
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

function replaceWorkspaceProtocol(
  deps: Record<string, string>,
  packages: Map<string, string>
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [name, version] of Object.entries(deps)) {
    if (version === "workspace:*") {
      const actualVersion = packages.get(name);
      if (!actualVersion) {
        throw new Error(`Package ${name} not found in workspace`);
      }
      result[name] = actualVersion;
    } else {
      result[name] = version;
    }
  }
  return result;
}

function getNpmLatestVersion(packageName: string): string | null {
  try {
    const result = execSync(`npm view ${packageName} version`, {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
    return result || null;
  } catch {
    return null;
  }
}

function compareVersions(v1: string, v2: string): number {
  const parts1 = v1.split(".").map(Number);
  const parts2 = v2.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if (parts1[i] > parts2[i]) return 1;
    if (parts1[i] < parts2[i]) return -1;
  }
  return 0;
}

async function ensureNpmAuth() {
  // Trusted Publishing uses OIDC — no interactive login needed
  // npm will authenticate automatically via id-token in CI
}

async function publishPackage(packageDir: string, packages: Map<string, string>) {
  const pkgPath = resolve(packageDir, "package.json");
  const original = readFileSync(pkgPath, "utf-8");
  const pkg: PackageJson = JSON.parse(original);

  console.log(`📦 ${pkg.name}@${pkg.version}`);

  // 检查 npm 上的最新版本
  const latestVersion = getNpmLatestVersion(pkg.name);
  if (latestVersion) {
    console.log(`   npm latest: ${latestVersion}`);
    if (compareVersions(pkg.version, latestVersion) <= 0) {
      console.log(`   ⚠️  Skipped: current version (${pkg.version}) <= npm latest (${latestVersion})`);
      console.log(`   Run 'npm version patch/minor/major' to bump version\n`);
      return false;
    }
  } else {
    console.log(`   npm latest: not published yet`);
  }

  let modified = false;
  try {
    // Replace workspace:* with actual versions
    const updated = { ...pkg };

    if (updated.dependencies) {
      const replaced = replaceWorkspaceProtocol(updated.dependencies, packages);
      if (JSON.stringify(replaced) !== JSON.stringify(updated.dependencies)) {
        updated.dependencies = replaced;
        modified = true;
      }
    }

    if (updated.peerDependencies) {
      const replaced = replaceWorkspaceProtocol(updated.peerDependencies, packages);
      if (JSON.stringify(replaced) !== JSON.stringify(updated.peerDependencies)) {
        updated.peerDependencies = replaced;
        modified = true;
      }
    }

    if (modified) {
      writeFileSync(pkgPath, JSON.stringify(updated, null, 2) + "\n");
      console.log("   ✓ Replaced workspace:* references");
    }

    // Publish with provenance (Trusted Publishing via OIDC)
    execSync("npx npm publish --access public --provenance", {
      cwd: packageDir,
      stdio: "inherit",
    });

    console.log(`   ✅ Published\n`);
    return true;
  } finally {
    // Restore original package.json
    writeFileSync(pkgPath, original);
    if (modified) {
      console.log("   ✓ Restored package.json");
    }
  }
}

async function main() {
  // Collect all workspace package versions
  const packages = new Map<string, string>();
  const packageDirs = ["packages/models", "packages/agent"];

  for (const dir of packageDirs) {
    const pkgPath = resolve(dir, "package.json");
    const pkg: PackageJson = JSON.parse(readFileSync(pkgPath, "utf-8"));
    packages.set(pkg.name, pkg.version);
  }

  console.log("🚀 Rowan Agent Publish\n");
  console.log("Workspace packages:");
  for (const [name, version] of packages) {
    console.log(`  ${name}@${version}`);
  }
  console.log("");

  // 确保已登录 npm
  await ensureNpmAuth();

  // Publish in dependency order: models first, then agent
  let publishedCount = 0;
  const modelsPublished = await publishPackage("packages/models", packages);
  if (modelsPublished) publishedCount++;
  const agentPublished = await publishPackage("packages/agent", packages);
  if (agentPublished) publishedCount++;

  if (publishedCount > 0) {
    console.log(`✅ Done! Published ${publishedCount} package(s)`);
  } else {
    console.log("ℹ️  No packages were published (all up to date)");
  }
}

main().catch((err) => {
  console.error("❌ Publish failed:", err.message);
  process.exit(1);
});
