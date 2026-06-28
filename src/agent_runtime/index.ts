import type { MusicDatabaseSchemaContribution } from "../storage/index.js";
import { agentRuntimeRadioTranscriptSchema } from "./schema.js";

export const agentRuntimeSchemas: readonly MusicDatabaseSchemaContribution[] = [
  agentRuntimeRadioTranscriptSchema,
];

export {
  createMineMusicMainAgentSession,
} from "./main_agent_session.js";
export type {
  CreateMineMusicMainAgentSessionInput,
  MineMusicMainAgentAssistantMessage,
  MineMusicMainAgentSession,
  MineMusicMainAgentTurnResult,
  MineMusicMainAgentTurnStopReason,
  RunMineMusicMainAgentTurnInput,
} from "./main_agent_session.js";
export {
  createMineMusicPiAgentAdapter,
} from "./pi_engine.js";
export type {
  CreateMineMusicPiAgentAdapterInput,
  MineMusicPiAgentAdapterOptions,
} from "./pi_engine.js";
export {
  assembleAgentSessionContext,
  captureAgentSessionContext,
  renderAgentSessionContextForSystemPrompt,
  renderSystemPromptWithSessionContext,
} from "./session_context.js";
export type {
  AgentSessionContext,
  CaptureAgentSessionContextInput,
} from "./session_context.js";
export {
  createStageToolBridge,
  isStageToolErrorDetails,
  toPiToolName,
} from "./stage_tool_bridge.js";
export type {
  AgentRuntimeStageToolContextFactoryPort,
  CreateStageToolBridgeInput,
  StageToolDispatchPort,
  StageToolBridgeDetails,
  StageToolErrorDetails,
} from "./stage_tool_bridge.js";
export {
  createPiRadioRefillRunPort,
  restoreRadioAgentTranscript,
} from "./radio_run.js";
export type {
  CreatePiRadioRefillRunPortInput,
} from "./radio_run.js";
export {
  createInMemoryRadioTranscriptStore,
  createPostgresRadioTranscriptStore,
} from "./radio_session_repo_facade.js";
export type {
  RadioTranscriptKey,
  RadioTranscriptStore,
} from "./radio_session_repo_facade.js";
export {
  agentRuntimeRadioTranscriptSchema,
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
  RADIO_STAGE_TOOL_NAMES,
  createRadioToolBridge,
  selectRadioStageToolDeclarations,
} from "./radio_tool_pack.js";
export type {
  CreateRadioToolBridgeInput,
  RadioToolBridgeCache,
} from "./radio_tool_pack.js";
export {
  radioResultFromMessages,
} from "./radio_result_extraction.js";
export type {
  RadioResultFromMessagesInput,
} from "./radio_result_extraction.js";
