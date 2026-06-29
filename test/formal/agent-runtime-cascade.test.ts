import assert from "node:assert/strict";

import { createAgentRunCascadeCoordinator } from "../../src/agent_runtime/index.js";

const ownerScope = "owner_agent_runtime_cascade";

{
  const cascade = createAgentRunCascadeCoordinator({ ownerScope });
  const radioLease = cascade.register({
    runId: "radio-dependent-run",
    actor: "radio_agent",
    basis: {
      radioDirectionRevision: 1,
      radioSessionRevision: 1,
    },
  });

  cascade.observeRevisionChange({
    ownerScope,
    concern: "radio-direction",
    newRevision: 2,
    actor: "main_agent",
  });

  assert.equal(radioLease.abortSignal.aborted, true);
  radioLease.release();
}

{
  const cascade = createAgentRunCascadeCoordinator({ ownerScope });
  const radioLease = cascade.register({
    runId: "radio-queue-independent-run",
    actor: "radio_agent",
    basis: {
      radioDirectionRevision: 1,
      radioSessionRevision: 1,
    },
  });

  cascade.observeRevisionChange({
    ownerScope,
    concern: "queue",
    newRevision: 2,
    actor: "main_agent",
  });

  assert.equal(radioLease.abortSignal.aborted, false);
  radioLease.release();
}

{
  const cascade = createAgentRunCascadeCoordinator({ ownerScope });
  const mainLease = cascade.register({
    runId: "main-dependent-run",
    actor: "main_agent",
    basis: {
      radioDirectionRevision: 1,
    },
  });
  const radioLease = cascade.register({
    runId: "radio-dependent-run",
    actor: "radio_agent",
    basis: {
      radioDirectionRevision: 1,
    },
  });

  cascade.observeRevisionChange({
    ownerScope,
    concern: "radio-direction",
    newRevision: 2,
    actor: "user",
  });

  assert.equal(mainLease.abortSignal.aborted, true);
  assert.equal(radioLease.abortSignal.aborted, true);
  mainLease.release();
  radioLease.release();
}

{
  const cascade = createAgentRunCascadeCoordinator({ ownerScope });
  const mainLease = cascade.register({
    runId: "main-dependent-run",
    actor: "main_agent",
    basis: {
      radioDirectionRevision: 1,
    },
  });
  const radioLease = cascade.register({
    runId: "radio-dependent-run",
    actor: "radio_agent",
    basis: {
      radioDirectionRevision: 1,
    },
  });

  cascade.observeRevisionChange({
    ownerScope,
    concern: "radio-direction",
    newRevision: 2,
    actor: "radio_agent",
  });

  assert.equal(mainLease.abortSignal.aborted, false);
  assert.equal(radioLease.abortSignal.aborted, false);
  mainLease.release();
  radioLease.release();
}

{
  const cascade = createAgentRunCascadeCoordinator({ ownerScope });
  const radioLease = cascade.register({
    runId: "foreign-owner-run",
    actor: "radio_agent",
    basis: {
      radioDirectionRevision: 1,
    },
  });

  cascade.observeRevisionChange({
    ownerScope: "other-owner",
    concern: "radio-direction",
    newRevision: 2,
    actor: "main_agent",
  });

  assert.equal(radioLease.abortSignal.aborted, false);
  radioLease.release();
}
