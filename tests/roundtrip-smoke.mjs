import { ensureBuilt, resetWorkRoot } from "./support/common.mjs";
import { runManifestRoundtripSuite } from "./suites/manifest-roundtrip.mjs";
import { runPolicySuite } from "./suites/policy-suite.mjs";
import { runSourcePrioritySuite } from "./suites/source-priority-suite.mjs";

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

async function main() {
  ensureBuilt();
  resetWorkRoot();

  await runPolicySuite();
  await runSourcePrioritySuite();
  runManifestRoundtripSuite();
}
