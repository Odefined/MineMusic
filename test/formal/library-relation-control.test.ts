import assert from "node:assert/strict";
import { refKey, type Ref } from "../../src/contracts/kernel.js";
import type { LibraryRelationStateOutput, StageToolContext, } from "../../src/contracts/stage_interface.js";
import { MusicDataPlatformError, } from "../../src/music_data_platform/index.js";
import { createLibraryRelationBlockRegistration, createLibraryRelationFavoriteRegistration, createLibraryRelationGetRegistration, createLibraryRelationSaveRegistration, createLibraryRelationUnblockRegistration, createLibraryRelationUnfavoriteRegistration, createLibraryRelationUnsaveRegistration, libraryRelationBlockDescriptor, libraryRelationFavoriteDescriptor, libraryRelationGetDescriptor, libraryRelationInstrument, libraryRelationSaveDescriptor, libraryRelationUnblockDescriptor, libraryRelationUnfavoriteDescriptor, libraryRelationUnsaveDescriptor, type LibraryRelationControlPort, } from "../../src/music_data_platform/stage_adapter/index.js";
import { assertSampleOutputHasNoInternalAnchors, createStageInterface, } from "../../src/stage_interface/index.js";
const now = "2026-06-18T00:00:00.000Z";
const libraryHandleId = "mh_relation_control";
const materialRef: Ref = {
    namespace: "material",
    kind: "recording",
    id: "m_relation_control",
};
const relationDescriptors = [
    libraryRelationGetDescriptor,
    libraryRelationSaveDescriptor,
    libraryRelationUnsaveDescriptor,
    libraryRelationFavoriteDescriptor,
    libraryRelationUnfavoriteDescriptor,
    libraryRelationBlockDescriptor,
    libraryRelationUnblockDescriptor,
];
assert.equal(libraryRelationInstrument.id, "library.relation");
assert.deepEqual(relationDescriptors.map((descriptor) => descriptor.name), [
    "library.relation.get",
    "library.relation.save",
    "library.relation.unsave",
    "library.relation.favorite",
    "library.relation.unfavorite",
    "library.relation.block",
    "library.relation.unblock",
]);
assert.deepEqual(libraryRelationGetDescriptor.errors.map((error) => error.code), ["invalid_input", "item_not_found", "owner_scope_unsupported"]);
assert.equal(libraryRelationGetDescriptor.sideEffect.durableUserStateWrite, false);
assert.equal(libraryRelationGetDescriptor.sideEffect.externalCall, false);
assert.equal(libraryRelationGetDescriptor.invocationPolicy.readOnlyHint, true);
assert.equal("ownerRelationDrivenByUserRequest" in libraryRelationGetDescriptor.invocationPolicy, false);
for (const descriptor of relationDescriptors.slice(1)) {
    assert.equal(descriptor.sideEffect.durableUserStateWrite, true);
    assert.equal(descriptor.sideEffect.externalCall, false);
    assert.equal(descriptor.invocationPolicy.defaultDecision, "auto");
    assert.equal(descriptor.invocationPolicy.ownerRelationDrivenByUserRequest, true);
    assert.equal(descriptor.invocationPolicy.destructiveHint, false);
    assert.deepEqual(descriptor.errors.map((error) => error.code), ["invalid_input", "item_not_found", "owner_scope_unsupported", "item_not_writable"]);
}
{
    let getCalls = 0;
    const result = await interfaceFor({
        async getRelationState(input) {
            getCalls += 1;
            assert.deepEqual(input, {
                ownerScope: "local",
                materialRef,
            });
            return {
                saved: true,
                favorite: false,
                blocked: false,
            };
        },
        async editRelation() {
            throw new Error("get must not edit relation state");
        },
    }).dispatch(testStageToolContext({ materialRef }), {
        toolName: "library.relation.get",
        payload: {
            item: {
                kind: "material",
                id: libraryHandleId,
            },
        },
    });
    assert.equal(result.ok, true);
    assert.equal(getCalls, 1);
    if (result.ok) {
        assert.deepEqual(result.value.result, {
            relations: {
                saved: true,
                favorite: false,
                blocked: false,
            },
        });
        assert.equal("item" in result.value.result, false);
        assert.equal(JSON.stringify(result.value.result).includes("materialRef"), false);
        assertSampleOutputHasNoInternalAnchors({
            label: "library.relation.get output",
            output: result.value.result,
        });
    }
}
{
    // ADR-0040 guard #3: a material handle with no library relation (never
    // admitted via save/favorite/import) is accepted by library.relation.get and
    // reports saved:false. The "material" handle kind does not presuppose library
    // admission — admission is a fact queried by the tool, not asserted by the
    // handle kind, so reading a never-admitted material is legal and returns false.
    const result = await interfaceFor({
        async getRelationState(input) {
            assert.deepEqual(input, {
                ownerScope: "local",
                materialRef,
            });
            return {
                saved: false,
                favorite: false,
                blocked: false,
            };
        },
        async editRelation() {
            throw new Error("get must not edit relation state");
        },
    }).dispatch(testStageToolContext({ materialRef }), {
        toolName: "library.relation.get",
        payload: {
            item: {
                kind: "material",
                id: libraryHandleId,
            },
        },
    });
    assert.equal(result.ok, true);
    if (result.ok) {
        assert.deepEqual(result.value.result, {
            relations: {
                saved: false,
                favorite: false,
                blocked: false,
            },
        });
    }
}
{
    let editCalls = 0;
    const result = await interfaceFor({
        async getRelationState() {
            throw new Error("save must not call read path directly");
        },
        async editRelation(input) {
            editCalls += 1;
            assert.deepEqual(input, {
                ownerScope: "local",
                materialRef,
                edit: "save",
                now,
            });
            return {
                saved: true,
                favorite: true,
                blocked: false,
            };
        },
    }).dispatch(testStageToolContext({ materialRef }), {
        toolName: "library.relation.save",
        payload: {
            item: {
                kind: "material",
                id: libraryHandleId,
            },
        },
    });
    assert.equal(result.ok, true);
    assert.equal(editCalls, 1);
    assert.deepEqual(expectRelationOutput(result), {
        relations: {
            saved: true,
            favorite: true,
            blocked: false,
        },
    });
}
{
    let calls = 0;
    const result = await interfaceFor({
        async getRelationState() {
            calls += 1;
            throw new Error("candidate input must be rejected before handler");
        },
        async editRelation() {
            calls += 1;
            throw new Error("candidate input must be rejected before handler");
        },
    }).dispatch(testStageToolContext({ materialRef }), {
        toolName: "library.relation.save",
        payload: {
            item: {
                kind: "candidate",
                id: "cand_relation_control",
            },
        },
    });
    assert.equal(result.ok, false);
    assert.equal(calls, 0);
    if (!result.ok) {
        assert.equal(result.error.code, "stage_interface.invalid_input");
    }
}
{
    const result = await interfaceFor(unexpectedControl()).dispatch(testStageToolContext({}), {
        toolName: "library.relation.get",
        payload: {
            item: {
                kind: "material",
                id: libraryHandleId,
            },
        },
    });
    assertDeclaredError(result, "item_not_found");
}
{
    const result = await interfaceFor(unexpectedControl()).dispatch(testStageToolContext({
        anchor: {
            materialRef: "source_netease:track:not-material",
        },
    }), {
        toolName: "library.relation.get",
        payload: {
            item: {
                kind: "material",
                id: libraryHandleId,
            },
        },
    });
    assertDeclaredError(result, "invalid_input");
}
{
    const result = await interfaceFor({
        async getRelationState() {
            throw new MusicDataPlatformError({
                code: "music_data.material_not_writable",
                message: "not writable",
            });
        },
        async editRelation() {
            throw new Error("get error mapping must not edit");
        },
    }).dispatch(testStageToolContext({ materialRef }), {
        toolName: "library.relation.get",
        payload: {
            item: {
                kind: "material",
                id: libraryHandleId,
            },
        },
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
        assert.equal(result.error.code, "item_not_found");
    }
}
{
    const result = await interfaceFor({
        async getRelationState() {
            throw new Error("save error mapping must use edit path");
        },
        async editRelation() {
            throw new MusicDataPlatformError({
                code: "music_data.material_not_writable",
                message: "not writable",
            });
        },
    }).dispatch(testStageToolContext({ materialRef }), {
        toolName: "library.relation.save",
        payload: {
            item: {
                kind: "material",
                id: libraryHandleId,
            },
        },
    });
    assertDeclaredError(result, "item_not_writable");
}
function interfaceFor(control: LibraryRelationControlPort) {
    return createStageInterface({
        instruments: [libraryRelationInstrument],
        registrations: [
            createLibraryRelationGetRegistration({ control }),
            createLibraryRelationSaveRegistration({ control }),
            createLibraryRelationUnsaveRegistration({ control }),
            createLibraryRelationFavoriteRegistration({ control }),
            createLibraryRelationUnfavoriteRegistration({ control }),
            createLibraryRelationBlockRegistration({ control }),
            createLibraryRelationUnblockRegistration({ control }),
        ],
    });
}
function testStageToolContext(input: {
    materialRef?: Ref;
    anchor?: unknown;
}): StageToolContext {
    return {
        ownerScope: "local",
        sessionId: "library-relation-control-test",
        requestId: "library-relation-control-test-request",
        clock: () => now,
        handleMinting: {
            async mint() {
                return "unused-handle";
            },
            async resolve(resolveInput) {
                if (resolveInput.publicId !== libraryHandleId) {
                    return undefined;
                }
                if ("anchor" in input) {
                    return input.anchor;
                }
                return input.materialRef === undefined
                    ? undefined
                    : { materialRef: refKey(input.materialRef) };
            },
        },
        lookupCursors: {
            register() {
                throw new Error("library relation tests must not touch lookup cursors");
            },
            resolve() {
                throw new Error("library relation tests must not touch lookup cursors");
            },
        },
        providerAvailability: {
            async isProviderAvailable() {
                return true;
            },
        },
        executionGate: {
            async preflight() {
                return {
                    decision: "allow",
                    auditLevel: "metadata",
                };
            },
        },
    };
}
function unexpectedControl(): LibraryRelationControlPort {
    return {
        async getRelationState() {
            throw new Error("unexpected relation get");
        },
        async editRelation() {
            throw new Error("unexpected relation edit");
        },
    };
}
function expectRelationOutput(result: Awaited<ReturnType<ReturnType<typeof interfaceFor>["dispatch"]>>): LibraryRelationStateOutput {
    assert.equal(result.ok, true);
    if (!result.ok) {
        throw new Error("expected relation call to succeed");
    }
    return result.value.result as LibraryRelationStateOutput;
}
function assertDeclaredError(result: Awaited<ReturnType<ReturnType<typeof interfaceFor>["dispatch"]>>, code: string): void {
    assert.equal(result.ok, false);
    if (!result.ok) {
        assert.equal(result.error.code, code);
    }
}
