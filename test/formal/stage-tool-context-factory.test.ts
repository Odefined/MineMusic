import assert from "node:assert/strict";
import type { HandleMintingPort, LookupCursorStore, StageToolAuditPort, StageToolExecutionGate, } from "../../src/contracts/stage_interface.js";
import { createStageToolContextFactory } from "../../src/stage_interface/index.js";
import { createServerHost, createStageToolContextAssembly, type MusicDataPlatformRuntimeModule, } from "../../src/server/index.js";
import { createPostgresTestSchema, postgresTestDatabaseUrl } from "../support/postgres.js";
const fixedNow = "2026-06-18T00:00:00.000Z";
const stubHandleMinting: HandleMintingPort = {
    async mint() {
        return "stub-handle";
    },
    async resolve() {
        return undefined;
    },
};
const stubLookupCursors: LookupCursorStore = {
    async register() {
        return "lc_stub";
    },
    async resolve() {
            return {
            ok: true,
            value: {
                internalCursor: "internal-cursor",
                queryInput: {},
            },
        };
    },
};
const stubGate: StageToolExecutionGate = {
    async preflight() {
        return { decision: "allow", auditLevel: "metadata" };
    },
};
const stubAudit: StageToolAuditPort = {
    async record() {
        return { ok: true, value: undefined };
    },
};
// createStageToolContextFactory closes over the real ports and threads only the
// per-call scalars through. providerAvailability is intentionally NOT bound (no
// shipped handler reads it), so the context keeps the conservative default.
{
    const factory = createStageToolContextFactory({
        ownerScope: "local",
        clock: () => fixedNow,
        handleMinting: stubHandleMinting,
        lookupCursors: stubLookupCursors,
        executionGate: stubGate,
        audit: stubAudit,
    });
    const ctx = await factory.createToolContext({
        sessionId: "factory-session",
        requestId: "factory-request",
    });
    assert.equal(ctx.ownerScope, "local");
    assert.equal(ctx.sessionId, "factory-session");
    assert.equal(ctx.requestId, "factory-request");
    assert.equal(ctx.clock(), fixedNow);
    assert.equal(ctx.handleMinting, stubHandleMinting);
    assert.equal(ctx.lookupCursors, stubLookupCursors);
    assert.equal(ctx.executionGate, stubGate);
    assert.equal(ctx.audit, stubAudit);
    assert.equal(ctx.abortSignal, undefined);
    assert.equal(await ctx.providerAvailability.isProviderAvailable({ providerId: "netease", ownerScope: "local" }), false);
    const controller = new AbortController();
    const ctxWithAbort = await factory.createToolContext({
        sessionId: "s",
        requestId: "r",
        abortSignal: controller.signal,
    });
    assert.equal(ctxWithAbort.abortSignal, controller.signal);
    // The bound handleMinting is the real stub, not the unavailable default that
    // throws on mint.
    assert.equal(await ctx.handleMinting.mint({
        ownerScope: "local",
        handleKind: "library",
        internalAnchor: { x: 1 },
    }), "stub-handle");
}
// createStageToolContextAssembly binds a LAZY handleMinting that resolves from
// the owning module on first use, defaults ownerScope to "local", and composes
// a real conservative gate + audit.
{
    let mintCalls = 0;
    let cursorRegisterCalls = 0;
    const port: HandleMintingPort = {
        async mint() {
            mintCalls += 1;
            return "assembly-handle";
        },
        async resolve() {
            return undefined;
        },
    };
    const cursorStore: LookupCursorStore = {
        async register() {
            cursorRegisterCalls += 1;
            return "lc_assembly";
        },
        async resolve() {
            return {
                ok: true,
                value: {
                    internalCursor: "internal-cursor",
                    queryInput: {},
                },
            };
        },
    };
    const mdp: Pick<MusicDataPlatformRuntimeModule, "handleMinting" | "lookupCursorStore"> = {
        handleMinting() {
            return port;
        },
        lookupCursorStore() {
            return cursorStore;
        },
    };
    const factory = createStageToolContextAssembly({ musicDataPlatformModule: mdp });
    const ctx = await factory.createToolContext({ sessionId: "s", requestId: "r" });
    assert.equal(ctx.ownerScope, "local");
    assert.equal(await ctx.handleMinting.mint({
        ownerScope: "local",
        handleKind: "library",
        internalAnchor: {},
    }), "assembly-handle");
    assert.equal(mintCalls, 1);
    assert.equal(await ctx.lookupCursors.register({
        ownerScope: "local",
        internalCursor: "internal-cursor",
        queryInput: {},
    }), "lc_assembly");
    assert.equal(cursorRegisterCalls, 1);
    const scoped = createStageToolContextAssembly({ musicDataPlatformModule: mdp, ownerScope: "owner-b" });
    assert.equal((await scoped.createToolContext({ sessionId: "s", requestId: "r" })).ownerScope, "owner-b");
}
// The lazy handleMinting fails loudly when the owning module is not initialized,
// rather than silently falling back to the unavailable default.
{
    const uninitialized: Pick<MusicDataPlatformRuntimeModule, "handleMinting" | "lookupCursorStore"> = {
        handleMinting() {
            return undefined;
        },
        lookupCursorStore() {
            return undefined;
        },
    };
    const factory = createStageToolContextAssembly({ musicDataPlatformModule: uninitialized });
    const ctx = await factory.createToolContext({ sessionId: "s", requestId: "r" });
    await assert.rejects(ctx.handleMinting.mint({
        ownerScope: "local",
        handleKind: "library",
        internalAnchor: {},
    }), /Music Data Platform initialization/u);
    // The lazy guard covers resolve() too, not just mint().
    await assert.rejects(async () => await ctx.handleMinting.resolve({
        ownerScope: "local",
        handleKind: "library",
        publicId: "any",
    }), /Music Data Platform initialization/u);
    await assert.rejects(async () => await ctx.lookupCursors.register({
        ownerScope: "local",
        internalCursor: "internal-cursor",
        queryInput: {},
    }), /Music Data Platform initialization/u);
}
// The default Server Host exposes a real factory after start; the factory
// produces a context whose handleMinting is the real registry-backed port.
{
    const databaseUrl = postgresTestDatabaseUrl();
    const databaseSchema = `minemusic_stage_tool_context_factory_${process.pid}`;
    await createPostgresTestSchema({
        connectionString: databaseUrl,
        schema: databaseSchema,
    });
    const host = createServerHost({
        config: {
            database: {
                url: databaseUrl,
                schema: databaseSchema,
            },
            localSources: {
                rootDir: `/tmp/minemusic-stage-tool-context-local-sources-${process.pid}`,
            },
            projectionMaintenance: { enabled: false },
        },
    });
    assert.equal(host.toolContextFactory() === undefined, false);
    const started = await host.start();
    assert.equal(started.ok, true);
    const factory = host.toolContextFactory();
    assert.equal(factory === undefined, false);
    if (factory !== undefined) {
        const ctx = await factory.createToolContext({ sessionId: "host-session", requestId: "host-request" });
        assert.equal(ctx.ownerScope, "local");
        assert.equal(ctx.sessionId, "host-session");
        const publicId = await ctx.handleMinting.mint({
            ownerScope: "local",
            handleKind: "library",
            internalAnchor: { materialRef: "material:recording:m_factory" },
        });
        assert.equal(typeof publicId, "string");
        assert.equal(publicId.length > 0, true);
    }
    await host.stop();
}
// An injection-path Server Host (caller-supplied modules) has no composed
// factory, so toolContextFactory() returns undefined.
{
    const host = createServerHost({ modules: [] });
    assert.equal(host.toolContextFactory(), undefined);
}
