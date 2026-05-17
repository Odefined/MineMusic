# MineMusic Stage Kernel Proposal

## 1. Product Definition

MineMusic is a music stage for an LLM music partner, secretary, and agent.

The LLM performs the music experience: it listens to the user's wording,
understands the musical situation, chooses what to say, and makes the final
recommendation.

MineMusic provides the stage underneath that experience:

```text
grounded music material
source-backed playable links
stable identity anchors
music memory
session continuity
LLM-facing instruments
effect boundaries
event records
```

The central product idea is:

```text
The LLM keeps musical freedom.
MineMusic keeps grounding and consequence control.
```

The stage governs consequences, not imagination.

---

## 2. Design Lessons From The Previous Iteration

The previous iteration produced several useful design lessons. These are product
and architecture lessons, not implementation requirements.

### 2.1 Music Should Not Become A Scoring Machine

The system should not force every music request through a rigid intent schema,
ranking formula, or deterministic taste ontology.

The ordinary path should stay conversational:

```text
user music request
  -> LLM musical interpretation
  -> grounded material when needed
  -> LLM recommendation and explanation
```

Internal hints may help the LLM avoid obvious mistakes, but user-facing music
language should remain musical, not algorithmic.

---

### 2.2 Identity, Source Access, And Memory Are Separate

MineMusic keeps three questions separate:

```text
What music object is this?
Where can the user access it?
What does this mean for the user's music memory?
```

These questions are related, but they should not collapse into one object or
one service.

```text
Canonical Store answers identity.
Source plugins answer availability and links.
Memory answers preference, rule, and context.
Events answer what happened.
Effects answer what may be done.
```

This separation is the main guardrail against wrong-version memory, fake
playability, source lock-in, and overconfident long-term taste claims.

---

### 2.3 The LLM Owns Final Musical Judgment

MineMusic should provide a grounded decision space. It should not become the
final recommender.

MineMusic can:

```text
return playable material
surface unresolved matches
mark blocked items
attach source evidence
attach canonical identity
prepare effect proposals
record user feedback
```

The LLM chooses how to use that material in the conversation.

---

### 2.4 Side Effects Need A Boundary

Showing a playable link is different from opening it.
Recommending a song is different from playing it.
Recording an event is different from writing durable memory.

MineMusic should make those differences explicit through an effect boundary.
The LLM can propose actions; MineMusic governs what can be executed, recorded,
or persisted.

---

### 2.5 Extension Should Happen Through Capability Slots

External capability should not leak into core concepts just because it arrives
from a particular plugin package.

MineMusic should separate:

```text
capability slot: what kind of ability the system needs
plugin package: who implements one or more abilities
instrument: how the LLM sees and uses those abilities
tool: the governed callable operation
```

This keeps extension points stable while letting implementations vary.

---

## 3. Core Shape

```text
User
  -> LLM Agent Runtime
    -> MineMusic Stage Kernel
      -> Handbook
      -> StageSession
      -> Instruments
      -> Grounding
      -> Material State
      -> Effect Proposal
        -> Core Capability Layer
          -> Canonical Store
          -> Source Resolution
          -> Music Knowledge
          -> Memory
          -> Events
          -> Effects
            -> Plugin Edge Layer
              -> capability slots
              -> plugin packages
              -> adapters
                -> Storage Layer
```

The Stage Kernel is the LLM-facing governance layer of MineMusic.

It prepares context, exposes instruments, grounds music material, records
events, and routes effect proposals. It is the stage interface the LLM performs
on.

The system has four conceptual layers:

```text
Stage Layer
  Gives the LLM a Handbook, instruments, material states, and effect proposals.

Core Capability Layer
  Owns MineMusic business abilities such as identity, source resolution,
  memory, events, effects, and music knowledge coordination.

Plugin Edge Layer
  Connects replaceable source, knowledge, identity-signal, context, effect,
  playback, and storage providers through capability slots.

Storage Layer
  Owns persistence details behind repositories and stores.
```

The Stage Kernel should stay small enough to understand. Durable music concepts
belong in the Core Capability Layer. Replaceable external behavior belongs at
the Plugin Edge Layer. Persistence details belong in the Storage Layer.

---

## 4. The LLM Agent's Role

The LLM has three roles in MineMusic.

### 4.1 Music Partner

The LLM understands and expresses music with the user.

The user can speak naturally:

```text
Recommend something for writing tonight, but not too noisy.
This is not the version I meant.
I want something quieter, but not sleepy.
Why do I keep returning to this kind of sound?
```

The LLM can:

```text
interpret musical language
describe musical feeling
choose recommendation direction
ask a useful follow-up question
stay quiet when enough is clear
handle version-sensitive feedback
offer exploration without pretending it is grounded
```

MineMusic should not force the LLM to first reduce the user request into a fixed
intent schema.

---

### 4.2 Music Secretary

The LLM helps organize the user's music life.

It can help maintain:

```text
music preferences
hard avoids
version corrections
recommendation history
playlist drafts
artists or scenes to explore
recent listening context
explicit user rules
```

The secretary role depends on grounded targets and event evidence. Weak LLM
inference should become a memory proposal, not durable memory.

---

### 4.3 Music Agent

The LLM can use MineMusic instruments and propose actions on the user's behalf.

For example:

```text
search for possible music material
resolve a song, artist, album, or version
ask for playable links
ask for identity evidence
propose a memory update
propose a future playback or queue action
record user feedback
```

When an action affects external systems or durable state, the LLM proposes an
effect. MineMusic handles the boundary.

---

## 5. Stage Kernel Responsibilities

The Stage Kernel is responsible for the LLM-facing stage.

It manages:

```text
dynamic session context
StageSession continuity
instrument exposure
tool invocation governance
music material grounding
canonical identity lookup
memory proposal routing
effect proposal routing
event recording
audit visibility
```

The Stage Kernel cares about:

```text
which instruments are available
which source links are grounded
which music objects have stable identity
which actions require permission
which events should be recorded
which memory writes are supported by evidence
which results are unresolved or blocked
```

The LLM handles:

```text
musical interpretation
musical expression
final recommendation choice
explanation style
conversation pacing
when to ask
when to search
when to stop
```

This split keeps the LLM musically free while making system consequences
traceable.

---

## 6. Handbook, StageSession, And StageVibe

### 6.1 Handbook

The Handbook is the LLM's session-scoped working manual.

It is compiled by the Stage Kernel from:

```text
global stage rules
current user rules
current session state
available instruments
permission boundaries
relevant memory summaries
plugin-provided guidance
```

It tells the LLM how to use the stage. It is not a music knowledge base, a
memory store, or a separate agent brain.

---

### 6.2 StageSession

`StageSession` stores the current stage continuity.

```ts
type StageSession = {
  id: string;
  posture: "conversation" | "recommendation" | "dj_stub" | "research" | string;
  notes?: string;
  activeInstruments: string[];
  autonomy?: "manual" | "copilot" | "supervised";
  state?: Record<string, unknown>;
};
```

The session records the current stance and available instruments. It should not
become a fixed workflow engine.

---

### 6.3 StageVibe

`StageVibe` is soft session guidance for the LLM.

It can describe:

```text
tone
pace
exploration level
recommendation risk
explanation density
whether to keep direction or drift slightly
```

Example:

```text
late-night writing, low interruption, mild drift, concise
```

Vibe shapes expression. Permission governs action.

---

## 7. Core Boundaries

MineMusic should preserve these ownership boundaries.

### 7.1 Canonical Store

Canonical Store owns MineMusic's stable identity anchors.

It answers:

```text
What music object is this?
Which stable MineMusic identity should events and memory target?
Which external identity keys or aliases point to the same object?
```

It does not own current playability, source account state, or the user's taste.

---

### 7.2 Source Plugins

Source plugins own access to replaceable music sources.

They answer:

```text
Can this item be found in this source?
Is there a playable link?
What source-specific reference identifies it?
What source-specific actions might be possible?
```

Source references and playable links are evidence. They should not become
MineMusic's durable identity by themselves.

---

### 7.3 Music Knowledge Providers

Music knowledge providers may supply identity evidence, relationships, metadata,
similarity hints, discography facts, or related music material.

They answer:

```text
What is this music object?
How does it relate to other music objects?
What external identity evidence exists?
```

Knowledge material still needs source resolution before MineMusic can present it
as playable.

---

### 7.4 Event Service

Events record what happened.

Examples:

```text
asked_recommendation
opened_link
liked
disliked
wrong_version
not_playable
accepted_recommendation
rejected_recommendation
```

Events are raw music-life facts. They are not automatically long-term taste.

---

### 7.5 Memory Service

Memory stores derived preferences, rules, and contextual taste.

Memory should come from:

```text
explicit user statements
repeated evidence
strong feedback about a grounded target
undoable routine taste learning
```

Routine evidence-backed taste learning should not interrupt listening. Weak
LLM guesses should remain proposals.

---

### 7.6 Effect Boundary

Effects govern actions and durable writes.

Examples:

```text
open_link
play
queue_add
playlist_write
source_writeback
memory_update
notification
```

The boundary should preserve the difference between talking about music,
showing links, opening links, changing playback, and writing durable state.

---

## 8. MusicMaterial And Ref

`MusicMaterial` is a music object or music idea that the user, LLM, or an
instrument can discuss, ground, recommend, or act on.

It should carry enough structure for the LLM to reason honestly without turning
every music idea into a permanent database object.

```ts
type Ref = {
  namespace: string;
  kind: string;
  id: string;
  label?: string;
  url?: string;
};

type MusicMaterial = {
  id: string;
  kind: string;
  label: string;
  state: MaterialState;
  canonicalRef?: Ref;
  sourceRefs?: Ref[];
  playableLinks?: PlayableLink[];
  notes?: string;
  evidence?: MaterialEvidence[];
};
```

`Ref` identifies something in a namespace.

Examples:

```text
canonical:recording
canonical:artist
source:<provider>:track
knowledge:<provider>:recording
plugin:<plugin-id>:item
```

Namespaces remain open, but MineMusic should keep their meanings distinct.

---

## 9. Material States

MineMusic should attach a plain state to material before the LLM uses it in a
recommendation or action.

```ts
type MaterialState =
  | "grounded"
  | "confirmed_playable"
  | "source_only_playable"
  | "exploration"
  | "unresolved"
  | "blocked"
  | "verbal_only";
```

### 9.1 Confirmed Playable

The material has a stable identity target, source grounding, and at least one
usable playable link.

It can be shown as a playable recommendation.

---

### 9.2 Source-Only Playable

The material has a source item and playable link, but no settled canonical
target yet.

It can be shown as a link, but durable memory and events should resolve or
create a canonical target first.

---

### 9.3 Exploration

The material may be musically relevant, but MineMusic has not confirmed a
playable source link.

The LLM may mention it as exploration, but should not present it as playable.

---

### 9.4 Unresolved

The exact identity, version, or source match is not settled.

Unresolved does not mean bad music. It means MineMusic should not silently guess
when playability, memory, or action depends on the exact match.

---

### 9.5 Blocked

The material is blocked by an explicit rule, hard avoid, permission boundary, or
source condition.

Blocked material should not enter a playable recommendation.

---

## 10. Canonical Store

The Canonical Store is MineMusic's identity ledger.

It stores MineMusic-owned canonical records and the evidence that points to
them.

```ts
type CanonicalRecord = {
  ref: Ref;
  kind: "artist" | "work" | "recording" | "release_group" | string;
  label: string;
  status: "active" | "provisional" | "merged" | "rejected";
  externalKeys?: Ref[];
  aliases?: string[];
};
```

External music knowledge can provide identity evidence. MineMusic still owns
its canonical records.

A source item can point toward canonical identity, but source identity should
not become the canonical authority by default.

The MVP only needs enough identity support to:

```text
anchor recommended material
attach user feedback
avoid wrong-version memory
record events against stable targets when possible
carry provisional identity when exact resolution is not finished
```

---

## 11. Memory, Events, And Effects

These three layers should stay separate.

```text
Events: what happened.
Memory: what MineMusic has learned from what happened.
Effects: what action may be taken.
```

### 11.1 Events

```ts
type StageEvent = {
  id: string;
  time: string;
  sessionId: string;
  actor: "user" | "llm" | "stage" | "instrument" | "plugin";
  type: string;
  target?: Ref;
  payload: unknown;
};
```

Events should be broad and factual. They preserve evidence for later memory and
debugging.

---

### 11.2 Memory

```ts
type MemoryEntry = {
  id: string;
  text: string;
  target?: Ref;
  kind: "explicit_rule" | "contextual_preference" | "version_correction" | string;
  evidenceEventIds?: string[];
  confidence?: number;
  scope?: "session" | "long_term";
  undoable?: boolean;
};
```

Most music memory can remain natural language, but action-relevant memory should
attach to a stable target when possible.

Memory target priority:

```text
canonical ref
provisional canonical ref
source ref
plain text
```

Plain text memory is acceptable for soft taste, but wrong-version rules and
durable feedback should seek a stable music target.

---

### 11.3 Effects

```ts
type EffectProposal = {
  id: string;
  kind: string;
  target?: Ref | MusicMaterial | MusicMaterial[];
  preview?: string;
  reason?: string;
  requiresConfirmation: boolean;
  reversible?: boolean;
};
```

MVP effect handling should focus on durable writes and external actions. A
normal recommendation that displays a playable link is not playback and does
not require an effect by itself.

---

## 12. Plugin, Instrument, And Tool

MineMusic separates extension packaging from runtime capability and LLM-facing
use.

```text
Plugin Package = replaceable implementation bundle.
Capability Slot = stable runtime interface for one kind of ability.
Instrument = LLM-visible capability assembled for the Handbook.
Tool = governed callable operation exposed through an instrument.
```

A plugin is not itself the business layer. It is a package that can register
providers for one or more capability slots.

### 12.1 Plugin Slots

Plugins connect to MineMusic through capability slots.

```text
Source Slot
Knowledge Slot
Identity Signal Slot
Context Slot
Effect Slot
Playback Slot
Storage Slot
```

The relationship is many-to-many:

```text
one plugin package -> one or more capability slots
one capability slot -> one or more plugin providers
one instrument -> may compose providers from several slots
one tool -> governed operation over an instrument
```

For example, a single plugin may provide both source access and context slices.
Another plugin may provide knowledge facts plus identity signals. The runtime
registers each capability separately, so core services depend on slot
interfaces rather than concrete plugin packages.

Slots describe what a capability does. Plugins describe who implements it.
Instruments describe what the LLM can use. Tools describe the callable actions.

---

### 12.2 Slot Responsibilities

Each slot has a narrow responsibility.

```text
Source Slot
  Provides source references, availability, source account signals, and playable
  links.

Knowledge Slot
  Provides music facts, relationships, metadata, and related material.

Identity Signal Slot
  Provides external keys, aliases, fingerprints, and matching hints. It does not
  write canonical records directly.

Context Slot
  Provides short-lived or scoped context slices for the current session.

Effect Slot
  Executes confirmed external actions after the Effect Boundary approves them.

Playback Slot
  Prepares or executes playback-facing actions through external players or
  source surfaces.

Storage Slot
  Provides repository or persistence implementations behind domain interfaces.
```

Slots are stable extension points. Plugin packages are replaceable providers
for those slots.

---

### 12.3 Instruments

Instruments are what the LLM sees.

Examples:

```text
Music Search
Resolver
Music Links
Music Knowledge
Memory
Effects
Session
```

An instrument may be backed by one slot, several slots, or different providers
over time. For example, a resolver instrument may use identity signals,
knowledge facts, and source resolution without exposing those internal providers
to the LLM.

The LLM sees instruments and tools. It should not need to know provider
internals, storage details, or plugin-specific implementation paths.

---

## 13. MVP Path

The MVP should prove one user-facing chain:

```text
1. User makes a natural music request.
2. LLM interprets the request musically.
3. MineMusic reads relevant context and memory.
4. MineMusic grounds possible music material.
5. Source plugins return playable links when available.
6. MineMusic marks material state honestly.
7. LLM selects and explains recommendations.
8. MineMusic records events and proposes memory updates when appropriate.
```

The MVP output is a grounded recommendation with playable links when available.

The MVP does not need to prove playback control, autonomous DJ behavior,
playlist editing, collection management, music intelligence, or notifications.
Those can enter later through the same boundaries.

---

## 14. MVP Scope

### 14.1 Required

```text
LLM-facing Handbook
StageSession
instrument registry
music material grounding
source-backed playable link display
Canonical Store anchors
event recording
memory proposal routing
effect boundary for durable writes and external actions
```

### 14.2 Allowed As Thin Stubs

```text
DJ posture
playback proposal
playlist proposal
music knowledge lookup
owned decision surface
background monitoring
```

Thin stubs reserve shape. They should not pretend the behavior is implemented.

### 14.3 Out Of MVP

```text
autoplay
queue mutation
source writeback
full player runtime
autonomous DJ sessions
bulk playlist import
heavy recommender scoring
full music intelligence pipeline
```

---

## 15. Extension Principles

### 15.1 Grow By Boundaries

New capabilities should attach to existing boundaries:

```text
new source access -> Source Slot provider
new music facts -> Knowledge Slot provider
new identity evidence -> Identity Signal Slot provider and canonical evidence
new context slice -> Context Slot provider
new external action -> Effect Slot provider and effect proposal
new playback surface -> Playback Slot provider and effect policy
new persistence backend -> Storage Slot provider
new session behavior -> StageSession posture
new preference behavior -> Memory Service protocol
```

Core code should depend on slot interfaces and MineMusic-owned business objects.
It should not depend on concrete plugin packages.

---

### 15.2 Keep The Main Path Light

Ordinary recommendations should not require a large orchestration pipeline.

The default path should remain:

```text
request
  -> LLM interpretation
  -> targeted grounding or context read
  -> honest material state
  -> recommendation
```

Heavier correctness mechanisms are justified only when they protect a concrete
music-life failure mode, such as wrong-version memory, stale playability,
unsafe effects, or conflicting durable writes.

---

### 15.3 Use Positive Ownership Rules

Architecture should be defined by ownership, not by long exclusion lists.

```text
LLM owns musical expression and final recommendation.
Stage Kernel owns LLM-facing governance.
Canonical Store owns identity anchors.
Source plugins own access and playability evidence.
Memory owns derived preferences and rules.
Events own factual history.
Effects own action boundaries.
Plugins own replaceable implementation behavior.
```

---

## 16. Final Summary

MineMusic is a music stage for an LLM music partner, secretary, and agent.

The LLM keeps musical freedom:

```text
interpretation
expression
final recommendation
conversation pacing
musical explanation
```

MineMusic keeps grounding and consequence control:

```text
identity anchors
source-backed links
material states
memory evidence
event records
effect boundaries
instrument governance
capability slots
```

The core judgment is:

```text
Identity, source access, memory, events, and effects are separate.
Playable links require source grounding.
Durable memory requires explicit or evidence-backed support.
The Stage Kernel exposes a governed stage, not a rigid recommendation pipeline.
Plugins extend capability slots; they do not define core business boundaries.
The system should protect consequences without reducing music to scores.
```
