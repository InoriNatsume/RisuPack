import { ensureBuilt, resetWorkRoot } from "./support/common.mjs";
import { runManifestRoundtripSuite } from "./suites/manifest-roundtrip.mjs";
import { runPolicySuite } from "./suites/policy-suite.mjs";
import { runSourcePrioritySuite } from "./suites/source-priority-suite.mjs";

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

async function main() {
  const syntheticOnly = process.argv.includes("--synthetic-only");
  const requireManifest = process.argv.includes("--require-manifest");
  ensureBuilt();
  resetWorkRoot();

  await runPolicySuite();
  await runSourcePrioritySuite();
  if (!syntheticOnly) {
    runManifestRoundtripSuite({ requireManifest });
  }
}
