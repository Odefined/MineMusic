import type { MusicDatabaseSchemaContribution } from "../storage/index.js";
import { agentRuntimeTranscriptSchema } from "./schema.js";

export const agentRuntimeSchemas: readonly MusicDatabaseSchemaContribution[] = [
  agentRuntimeTranscriptSchema,
];

export {
  createAgentRuntimeUserTurnController,
} from "./agent_user_turn_trigger.js";
export type {
  AgentRuntimeUserTurnAssistantMessage,
  AgentRuntimeUserTurnController,
  AgentRuntimeUserTurnResult,
  AgentRuntimeUserTurnStopReason,
  CreateAgentRuntimeUserTurnControllerInput,
  RunAgentRuntimeUserTurnInput,
} from "./agent_user_turn_trigger.js";
export {
  createActorRuntimeSession,
} from "./actor_runtime_session.js";
export type {
  ActorRuntimeSession,
  ActorRuntimeSessionRunResult,
  ActorRuntimeSessionRunHooks,
  CreateActorRuntimeSessionInput,
} from "./actor_runtime_session.js";
export {
  createAgentRunCascadeCoordinator,
} from "./agent_run_cascade.js";
export type {
  AgentRunCascadeCoordinator,
  AgentRunCascadeLease,
} from "./agent_run_cascade.js";
export type {
  MineMusicPiAgentAdapterOptions,
} from "./pi_engine.js";
export {
  actorKindForDefinition,
  mainDefinition,
  radioDefinition,
  selectActorStageToolDeclarations,
  validateActorDefinition,
} from "./actor_definition.js";
export type {
  ActorDefinition,
  ActorIdentity,
  ActorInstruction,
  ActorName,
  WorkspaceContextSectionName,
} from "./actor_definition.js";
export {
  createWorkspaceContextAssembler,
} from "./workspace_context_assembler.js";
export type {
  CreateWorkspaceContextAssemblerInput,
  WorkspaceContextAssembly,
  WorkspaceContextAssembler,
} from "./workspace_context_assembler.js";
export {
  encodeWorkspaceContext,
  renderAgentRuntimeSystemPrompt,
  renderWorkspaceContextForSystemPrompt,
} from "./workspace_context_encoder.js";
export type {
  EncodedWorkspaceContext,
  ListeningWorkspaceContextSection,
  RadioWorkspaceContextSection,
} from "./workspace_context_encoder.js";
export {
  toPiToolName,
} from "./stage_tool_bridge.js";
export type {
  AgentRuntimeStageToolContextFactoryPort,
  StageToolDispatchPort,
  StageToolResultObserver,
} from "./stage_tool_bridge.js";
export {
  createAgentRuntimeBackgroundRefillPort,
} from "./agent_background_refill_trigger.js";
export type {
  CreateAgentRuntimeBackgroundRefillPortInput,
} from "./agent_background_refill_trigger.js";
export {
  cappedAgentTranscript,
  createInMemoryAgentRuntimeTranscriptStore,
  createPostgresAgentRuntimeTranscriptStore,
} from "./agent_transcript_store.js";
export type {
  AgentRuntimeTranscriptKey,
  AgentRuntimeTranscriptStore,
} from "./agent_transcript_store.js";
export {
  agentRuntimeTranscriptSchema,
} from "./schema.js";
export {
  createInMemoryMainRadioNotifyChannel,
} from "./main_radio_channel.js";
export type {
  MainRadioNotifyChannel,
} from "./main_radio_channel.js";
export {
  RADIO_REFILL_JOB_TYPE,
  createRadioSupervisor,
} from "./radio_supervisor.js";
export type {
  CreateRadioSupervisorInput,
  RadioBackgroundWorkPort,
  RadioPacingReadPort,
  RadioPacingSnapshot,
  RadioRefillRunPort,
  RadioSupervisor,
  RadioSupervisorClock,
  RadioSupervisorSnapshot,
  RadioWakeDecision,
} from "./radio_supervisor.js";
export {
  candidateExhaustionNotify,
} from "./speech_level.js";
export {
  createRadioRunResultRecorder,
} from "./radio_run_result_recorder.js";
export type {
  RadioRunResultRecorder,
} from "./radio_run_result_recorder.js";
export {
  createRadioSessionToolRegistrations,
  radioSessionInstrument,
  radioSessionPauseDescriptor,
  radioSessionResumeDescriptor,
  radioSessionShutdownDescriptor,
  radioSessionStartDescriptor,
  radioSessionToolNames,
} from "./radio_session_tools.js";
export type {
  RadioSessionControlPort,
  RadioSessionControlResult,
} from "./radio_session_tools.js";
export {
  createRadioRunFinishToolRegistration,
  isRadioRunFinishOutput,
  radioRunFinishDescriptor,
  radioRunFinishPiToolName,
  radioRunFinishToolName,
  withRadioRunFinishGuards,
} from "./radio_run_finish_tool.js";
