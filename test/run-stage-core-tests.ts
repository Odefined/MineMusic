import { inspect } from "node:util";
import { performance } from "node:perf_hooks";

const testModules = [
    "./formal/formal-contracts.test.js",
    "./formal/stage-interface-tool-frame.test.js",
    "./formal/music-experience-present.test.js",
    "./formal/library-import-list-sources.test.js",
    "./formal/library-import-control.test.js",
    "./formal/library-import-agent-path.test.js",
    "./formal/library-relation-control.test.js",
    "./formal/library-relation-agent-path.test.js",
    "./formal/library-catalog-tools.test.js",
    "./formal/music-discovery-list-scopes.test.js",
    "./formal/music-discovery-lookup.test.js",
    "./formal/active-tree.test.js",
    "./formal/mcp-stdio-transport.test.js",
    "./formal/extension-capability-slot.test.js",
    "./formal/ncm-plugin.test.js",
    "./formal/qq-qrc-decrypt.test.js",
    "./formal/qq-plugin.test.js",
    "./formal/background-work-backend.test.js",
    "./formal/postgres-music-database.test.js",
    "./formal/music-data-platform-identity.test.js",
    "./formal/music-data-platform-source-library.test.js",
    "./formal/music-data-platform-owner-relations.test.js",
    "./formal/music-data-platform-collection.test.js",
    "./formal/projection-maintenance-collection.test.js",
    "./formal/library-catalog-collection-scope.test.js",
    "./formal/library-collection-control.test.js",
    "./formal/music-data-platform-owner-catalog.test.js",
    "./formal/music-data-platform-material-projection.test.js",
    "./formal/music-data-platform-search-metadata-projection.test.js",
    "./formal/music-data-platform-ref-validation.test.js",
    "./formal/music-data-platform-projection-maintenance.test.js",
    "./formal/music-data-platform-retrieval-result-set.test.js",
    "./formal/music-data-platform-metadata-lookup-search.test.js",
    "./formal/music-data-platform-metadata-lookup-normalization.test.js",
    "./formal/music-intelligence-metadata-lookup-search.test.js",
    "./formal/music-data-platform-candidate-commit.test.js",
    "./formal/music-data-platform-localize-provider-source.test.js",
    "./formal/projection-maintenance-job.test.js",
    "./formal/server-music-data-platform-runtime-module.test.js",
    "./formal/server-local-source-scan-adapter.test.js",
    "./formal/server-entrypoint.test.js",
    "./formal/stage-runtime.test.js",
    "./formal/server-host.test.js",
    "./formal/stage-tool-context-factory.test.js",
];
type ModuleResult = { module: string; ok: boolean; durationMs: number };

const filters = process.argv.slice(2).map((filter) => filter.trim()).filter((filter) => filter.length > 0);
const selectedTestModules = filters.length === 0
    ? testModules
    : testModules.filter((testModule) => filters.some((filter) => moduleMatchesFilter(testModule, filter)));
const unmatchedFilters = filters.filter((filter) => !testModules.some((testModule) => moduleMatchesFilter(testModule, filter)));

if (selectedTestModules.length === 0 || unmatchedFilters.length > 0) {
    if (selectedTestModules.length === 0) {
        process.stdout.write(`No stage-core test modules matched filter(s): ${filters.join(", ")}\n`);
    } else {
        process.stdout.write(`Unmatched stage-core filter(s): ${unmatchedFilters.join(", ")}\n`);
    }
    process.stdout.write("Available modules:\n");
    for (const testModule of testModules) {
        process.stdout.write(`- ${moduleLabel(testModule)}\n`);
    }
    process.exit(1);
}

if (filters.length > 0) {
    process.stdout.write(`Stage-core filters: ${filters.join(", ")} (${selectedTestModules.length}/${testModules.length} modules)\n`);
}

const results: ModuleResult[] = [];
let index = 0;
const total = selectedTestModules.length;
const suiteStartMs = performance.now();

// A test module may start fire-and-forget work (e.g. a transport run loop, a
// timer) that rejects AFTER its `await import()` has resolved. The try/catch
// below only covers the synchronous import; a late unhandled rejection would
// otherwise abort the whole process (Node's default) and skip the remaining
// modules plus the summary. Attribute it to the module currently in flight and
// record it as a late failure so the aggregate exit code still reflects it,
// but do not abort the run.
let currentModule: string | undefined;
let lastImported: string | undefined;
type LateFailure = { module: string; kind: string; text: string };
const lateFailures: LateFailure[] = [];
const reportLate = (kind: string, reason: unknown): void => {
    // A late rejection fires on a later tick than the import that spawned it,
    // so attribute to the most recently imported module (the usual source),
    // falling back to the one in flight or <startup>.
    const where = lastImported ?? currentModule ?? "<startup>";
    lateFailures.push({ module: where, kind, text: formatFailure(reason).trim() });
    process.stdout.write(`\n[${kind} attributed to ${where}]\n${formatFailure(reason)}`);
};
process.on("unhandledRejection", (reason: unknown) => {
    reportLate("unhandled rejection", reason);
});
process.on("uncaughtException", (error: unknown) => {
    reportLate("uncaught exception", error);
});

for (const testModule of selectedTestModules) {
    index += 1;
    currentModule = testModule;
    const label = moduleLabel(testModule);
    const moduleStartMs = performance.now();
    process.stdout.write(`[${index}/${total}] ${label} ... `);
    try {
        await import(testModule);
        const durationMs = performance.now() - moduleStartMs;
        results.push({ module: testModule, ok: true, durationMs });
        process.stdout.write(`ok ${formatDuration(durationMs)}\n`);
    } catch (error) {
        const durationMs = performance.now() - moduleStartMs;
        results.push({ module: testModule, ok: false, durationMs });
        process.stdout.write(`FAIL ${formatDuration(durationMs)}\n${formatFailure(error)}`);
    }
    lastImported = testModule;
}
currentModule = undefined;

const failed = results.filter((result) => !result.ok);
const overallOk = failed.length === 0 && lateFailures.length === 0;
process.stdout.write(`\n${results.length - failed.length}/${results.length} modules imported cleanly in ${formatDuration(performance.now() - suiteStartMs)}.\n`);
if (failed.length > 0) {
    process.stdout.write(`Failed imports: ${failed.map((result) => result.module).join(", ")}\n`);
}
if (lateFailures.length > 0) {
    process.stdout.write(`Late failures: ${lateFailures.length}\n`);
    for (const failure of lateFailures) {
        process.stdout.write(`- ${failure.module} (${failure.kind}): ${failure.text}\n`);
    }
}
process.stdout.write(`Overall: ${overallOk ? "PASS" : "FAIL"}\n`);
process.exit(overallOk ? 0 : 1);

function moduleLabel(testModule: string): string {
    return testModule.replace(/^\.\//, "").replace(/\.test\.js$/, "");
}

function moduleMatchesFilter(testModule: string, filter: string): boolean {
    const normalizedFilter = normalizeFilter(filter);
    const normalizedModule = normalizeFilter(testModule);
    const normalizedLabel = normalizeFilter(moduleLabel(testModule));
    return normalizedModule.includes(normalizedFilter) || normalizedLabel.includes(normalizedFilter);
}

function normalizeFilter(value: string): string {
    return value
        .replace(/^\.\//, "")
        .replace(/\.test\.js$/, "")
        .replace(/\.js$/, "")
        .toLowerCase();
}

function formatDuration(durationMs: number): string {
    return `${(durationMs / 1000).toFixed(2)}s`;
}

function formatFailure(error: unknown): string {
    const lines: string[] = [];
    let operator = "";
    if (error !== null && typeof error === "object" && "message" in error) {
        const descriptor = error as { message?: unknown; operator?: unknown; stack?: unknown };
        if (typeof descriptor.message === "string") {
            lines.push(descriptor.message);
        } else if (descriptor.message !== undefined) {
            // Render a non-string .message (number, object, circular) usefully
            // instead of the whole-error toString, which collapses to [object Object].
            lines.push(inspect(descriptor.message, { depth: 4, breakLength: 120 }));
        }
        if (typeof descriptor.operator === "string") {
            operator = ` [${descriptor.operator}]`;
        }
        // Stack frames are the most useful locator when a module has many asserts.
        if (typeof descriptor.stack === "string") {
            const frames = descriptor.stack
                .split("\n")
                .filter((line) => line.trim().startsWith("at "))
                .slice(0, 5)
                .map((line) => line.trim());
            if (frames.length > 0) {
                lines.push(frames.join("\n"));
            }
        }
    } else {
        lines.push(String(error));
    }
    return `  ${truncate(lines.join("\n"))}${operator}\n`;
}

function truncate(value: string, limit = 500): string {
    return value.length > limit
        ? `${value.slice(0, limit)}… (+${value.length - limit} chars)`
        : value;
}
