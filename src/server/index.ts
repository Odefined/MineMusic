export {
  createServerHost,
} from "./host.js";
export type {
  CreateServerHostInput,
  ServerHost,
} from "./host.js";

if (import.meta.url === `file://${process.argv[1]}`) {
  const { createServerHost } = await import("./host.js");
  const host = createServerHost();
  const started = await host.start();

  console.log(JSON.stringify(host.snapshot(), null, 2));

  if (!started.ok) {
    process.exitCode = 1;
  }
}
