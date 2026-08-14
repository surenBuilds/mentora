import { loadState } from "./state";
import { sendDigest } from "./digest";

async function main() {
  console.log("Cron job մեկնարկեց՝ digest-ի պատրաստում...");
  const state = await loadState();
  await sendDigest(state);
  console.log("Digest-ը ուղարկվեց (կամ սխալ գրանցվեց վերևում)։");
  process.exit(0);
}

main().catch((err) => {
  console.error("Cron job-ի սխալ:", err);
  process.exit(1);
});
