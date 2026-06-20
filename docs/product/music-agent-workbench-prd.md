# MineMusic Music Agent Workbench PRD

> Status: Draft PRD
> Scope: Product function requirements for the next MineMusic music-agent UI and
> agent workflow stage.
> Not authority: This is not an architecture document, implementation plan,
> formal glossary, or current-state ledger.

## Product Direction

MineMusic is moving toward a private music agent: a personal music assistant
that can talk with the user about music, play music, recommend music, run an AI
radio experience, understand the user's library, help organize music assets, and
eventually bring music information and analysis into the user's listening life.

The next stage should prioritize an extensible product frame. The first version
does not need to complete every future capability. It needs to make the core UI
and agent workflow able to grow into those capabilities without changing the
basic user model each time.

## Product Promises

### Playable Music Experience

MineMusic should turn fuzzy music intent into a playable, conversational,
adjustable music experience.

Examples:

- "来点像 whoo 但更阴一点的夜晚歌."
- "用这张专辑开一个电台."
- "这首歌的空旷感保留，但换成更 shoegaze 的方向."

The product response is not just a list. It should become listening: music plays,
recommendations appear, the user can ask why, change direction, add variation,
save or dismiss items, and keep the experience moving.

### Private Music Understanding

MineMusic should gradually understand the user's music world: their library,
language, taste boundaries, scenes, recurring motifs, and feedback patterns.

For the first version, this understanding can stay session-level. Long-term
Memory is a later capability and should be introduced with explicit user
confirmation when the product is ready.

### Music Information In Daily Life

MineMusic should eventually help collect, summarize, and interpret music
information: artist news, album context, reviews, charts, interviews, release
signals, and listening notes.

The important product direction is that information should flow back into music
life: recommendations, radio directions, library organization, collection ideas,
and conversations.

### Music Asset Organization

MineMusic should help the user organize their library, albums, collections,
source imports, and listening relationships.

The first version should expose the library as useful context for the agent and
radio experience. Fuller collection management can grow from the same UI and
workflow model later.

## UI Framework

### Fixed Core Components

The product always keeps two primary frontend components present:

- **Chat**: conversation, explanation, negotiation, natural-language commands,
  and object-focused discussion with the agent.
- **Music Playback**: built-in playback, now playing, playback controls, queue,
  current track context, and listening state.

These two components are the core of the product. Other functions can expand
or collapse around them, but they do not replace or cover them.

#### Music Playback Minimum

The first version of Music Playback should feel like a real built-in player,
not a link panel.

Minimum requirements:

- current playing song with MusicCard-level context, cover, title, and artist;
- play and pause;
- previous and next;
- progress bar and current time;
- volume;
- queue;
- current playback source;
- basic playback error state;
- music sent from Recommendations, Library, or Radio can enter playback.

Lyrics, visualizers, equalizers, device casting, and complex playback history
are later enhancements.

#### Selected Object In Chat

When the user selects an object from a Functional Card, Chat should show a
lightweight selected-object strip with the object type and short summary.
Subsequent user messages are interpreted as object-focused until the user clears
the selection, chooses another object, or returns to general chat.

#### Contextual Action Cards

Action Cards are short-lived contextual interaction cards. They can appear in
Chat or inside the Functional Card where the action was initiated. They carry
confirmation, choice, apply-to, or open actions without becoming a persistent
feature surface.

Examples:

- confirm a high-impact agent proposal;
- choose one of several recommendation directions;
- approve adding a track, album, or artist as a Radio motif or variation;
- choose whether to open a Functional Card;
- confirm a library organization action.

Functional Cards are persistent workbench surfaces such as Radio,
Recommendations, or Library. An Action Card can open a Functional Card or write
a decision back to one, but it should not become a complex feature page.

First-version Action Card types:

- **Confirm**: confirm or cancel a proposal.
- **Choose**: choose one direction or candidate from a small set.
- **Apply To**: send an object to Playback, Radio motif, Radio variation, or
  Recommendations.
- **Open**: open a Functional Card, batch, or detail view.

After the user acts on an Action Card, the UI should show a clear outcome such
as confirmed, cancelled, applied to Radio motif, applied to Radio variation,
added to queue, opened Recommendations, proposal dismissed, or failed with a
reason. The affected Functional Card or Playback surface should update.

### Functional Cards

All other product capabilities appear as Functional Cards.

Functional Cards can appear as compact cards on the home/workbench surface.
When clicked, one Functional Card can expand into the available work area while
Chat and Music Playback remain visible.

First-version rules:

- Multiple compact Functional Cards can be visible.
- Only one Functional Card is expanded at a time.
- Expanded cards use the remaining workspace and preserve Chat + Playback.
- The agent does not automatically steal focus or switch the expanded card in
  the first version.
- Compact cards show at least: feature name, state, one-line summary, and one
  primary action.
- The primary action on a compact card is an entry action, such as open, start,
  view latest, or review. Detailed controls belong in the expanded card.
- Users can close or dismiss specific content cards/items inside a Functional
  Card.
- Dismissing a specific card is interface cleanup. It is not dislike, block, or
  long-term taste feedback.

Expanded cards organize actions into three layers:

- **Primary action**: the main next step for the expanded card.
- **Object actions**: actions on a concrete item, such as play, add to queue,
  send to Radio, select in Chat, or dismiss.
- **Agent actions**: requests that ask the agent to continue work, such as find
  more like this, make it darker, explain this batch, or organize this
  selection.

### Common Card Object Flow

Objects inside Functional Cards should be actionable. A music object can be sent
to these destinations:

- **Chat**: select the object and talk with the agent about it.
- **Playback**: play it or add it to the queue.
- **Radio**: use it as a motif or as a variation.

This gives new future cards a shared product contract: their objects can enter
conversation, listening, and radio workflows.

### Shared Operation Model

User operations and agent operations should act on the same product objects and
workflows. A button click and a Chat instruction can trigger the same underlying
product action: play this song, add it to queue, dismiss this recommendation,
turn this track into a radio motif, add this album as a variation, or ask for
more like this.

When the user and agent act on the same object, the user's explicit action wins
and agent work should continue from the latest object state. If the user
dismisses a MusicCard, changes a variation, or edits queue while the agent is
preparing related work, the agent should not apply stale actions to the old
state.

The difference is not a separate product model. The difference is permission,
confirmation, and whether the operation is exposed as a visible UI control. The
agent may also have access to MineMusic tools that have no direct frontend
control. Those backstage tools should still return to the user as understandable
product state, cards, recommendations, playback changes, radio updates, library
summaries, or Chat explanations.

Product permission has three levels:

- **User direct**: user clicks or explicit instructions execute directly, such
  as play, add to queue, or dismiss a card.
- **Agent auto**: the agent may execute low-risk actions automatically, such as
  creating recommendation batches, updating the radio direction summary, or
  maintaining Autoplay Radio queue continuity.
- **Agent proposes**: the agent proposes and waits for user confirmation before
  high-impact actions, such as long-term memory adoption, bulk library
  organization, deletion, major collection changes, or cross-platform writes.
  Contextual Action Cards can carry these confirmations.

### Main Agent And Radio Subagent

The user-facing MineMusic Agent and the Radio subagent run in parallel.

The user-facing MineMusic Agent owns conversation continuity:

- ordinary music conversation;
- recommendation explanation;
- object-focused discussion;
- natural-language commands;
- agent Speak messages;
- Contextual Action Cards that arise in conversation.

The Radio subagent owns the active radio workflow loop:

- motif;
- variations;
- Autoplay Radio or Preview Radio mode;
- direction summary;
- candidate work;
- recommendation batches;
- playback and queue continuity intent;
- radio-specific behavior signals.

They communicate through messages and shared music workspace state:

- current playback item;
- queue;
- selected object;
- current recommendation batch;
- active Radio session summary;
- recent user actions;
- visible cards and action cards;
- latest explicit user intent.

Chat can continue while the Radio subagent keeps working. Radio can keep playing
while the user-facing MineMusic Agent answers ordinary music questions. When the
user gives radio-related instructions through Chat, the main agent can pass them
to the Radio subagent. When the Radio subagent produces recommendations or state
changes, those results update Playback, Recommendations, Radio Card, and the
shared workspace so the main agent can discuss them with the user.

### Agent Work Visibility

MineMusic is an agent product, so agent work does not have to be completely
hidden behind final UI results. Like coding-agent products, it can show some
work trace when useful and keep it quiet when it would distract from the music
experience.

The product should support both:

- **result-first display**: the user mainly sees product outcomes, such as
  MusicCards, radio updates, playback changes, and library summaries.
- **visible work trace**: the user can see or expand what the agent is doing,
  such as searching, comparing, analyzing a library range, checking playable
  options, or preparing a batch.

The agent work trace is not a replacement for product UI. It is an optional
agent-facing layer that helps users understand, supervise, or interrupt the
agent's work.

First-version default:

- Chat should not become a full tool log.
- Relevant Functional Cards can show lightweight agent status, such as searching
  library, building radio batch, checking playable options, or analyzing a
  selection.
- Users can expand status to see a short step summary.
- High-impact actions appear as confirmation proposals.
- Raw technical tool names belong to debug or developer-facing views, not the
  default music experience.

Users should be able to interrupt visible agent work. First-version interrupts
include stopping the current recommendation batch, pausing Radio queue
maintenance, cancelling a foreground library analysis/import flow, dismissing an
unconfirmed proposal, or telling the agent to stop and change direction. Already
visible results remain available; unfinished results should stop entering the
UI, and the agent should acknowledge the interruption in Chat.

Agent work should not block the user's live interaction. While the agent is
finding candidate queue items, building a recommendation batch, analyzing a
library range, or checking playable options, the user must still be able to
chat, give feedback, change variations, skip, reorder queue, play another item,
or interrupt the work. New user feedback should be allowed to redirect or
supersede the in-progress agent work.

When new user feedback conflicts with in-progress agent work, the latest user
intent wins. Already visible cards or queue items can remain available, but the
agent should stop expanding the old direction and continue from the updated
intent.

### Agent Speech Policy

Agent speech is event-driven and decision-oriented. Routine work should update
UI state without turning Chat into a log.

Speech levels:

- **Silent**: routine queue maintenance, candidate search, card refresh,
  and status changes update the relevant UI surfaces without a Chat message.
- **Notify**: new batches, card updates, or items needing attention
  can appear as card badges, statuses, or short prompts.
- **Speak**: the agent speaks in Chat when the message changes
  user decision-making or the music experience.

First-version proactive Chat triggers:

- a user decision is needed;
- behavior signals conflict with motif or active variations;
- an important result is ready;
- a blocker or unsatisfied constraint appears;
- the product enters, switches, or exits an important mode;
- a sparse session summary would help the user steer the experience.

Radio should mostly use Silent or Notify. It should Speak when user confirmation,
direction conflict, a blocker, or a meaningful session-level explanation is
needed. User requests such as "少说话" or "这轮多解释" belong in the current
ordinary Chat context rather than a separate first-version settings or
preference surface.

## First-Version Functional Cards

### Radio Card

Radio Card is the control surface for an AI-driven radio session.

It owns the radio experience inputs and direction:

- current motif;
- variations;
- radio running state;
- Autoplay Radio or Preview Radio mode;
- current direction summary;
- start, pause, resume, and end controls.

Music Playback owns the general playback queue. Recommendations Card owns the
recommendation result shelf.

Motif and active variations are the core radio constraints. Playback and queue
behavior tunes the current session under those constraints.

#### Radio Workflow Subagent

Radio is a workflow loop that can run as a subagent under the user-facing
MineMusic Agent. The Radio subagent combines an LLM, workflow harness,
MineMusic tools, radio state, playback state, and UI/action surfaces into one
continuous music-agent experience.

A Radio session carries the working material the Radio subagent needs:

- motif and active variations;
- ordinary Chat context and selected object;
- playback state, queue state, and recent playback/queue actions;
- library context and user feedback;
- candidate music handles, playable candidates, hints, and scores.

Candidate helpers provide handles, hints, scores, and playable status. The
Radio subagent uses the LLM to make the final song choice and produce
recommendation reasons.

The Radio workflow loop lets the Radio subagent:

- expand the candidate set;
- inspect music handles when more detail is useful;
- refresh playable options;
- create recommendation batches;
- add selected songs to queue in Autoplay Radio;
- update the direction summary;
- create proposals or Contextual Action Cards;
- surface results through Playback, Recommendations, Radio Card, and Chat.

#### Starting Radio

The primary Radio entrypoint is the Radio Card motif input. The user can open
Radio Card, enter or select a motif, and start the radio session from there.

Radio Card should provide a motif composer. The user can type a natural-language
motif, choose or drag in a track, choose or drag in an album, choose or drag in
an artist, or fill the motif from the current selected object.

Radio can also start from Chat or from a selected music object. These entries
create or fill the Radio motif and bring the user into the same radio session
flow.

After Radio starts, Radio Card should show the current motif, variations area,
Autoplay Radio or Preview Radio mode, a one-sentence agent direction
understanding, current status such as preparing, playing, or waiting for input,
and the main next action such as pause, resume, adjust, or stop.

#### Motif

A motif is the primary seed for the radio session.

First-version motif inputs:

- natural-language description;
- track;
- album;
- artist.

Future motif inputs can include playlists, collections, information-analysis
items, review excerpts, and listening-history slices.

#### Variation

A variation is a secondary change layered on top of the motif. Users can add,
remove, enable, disable, and adjust variations.

Variation entrypoints:

- add directly in Radio Card;
- add through Chat, such as "加一个更阴的变化";
- add from a MusicCard, Library object, or current playing song.

First-version variation inputs match motif inputs:

- natural-language description;
- track;
- album;
- artist.

Variation strength should be lightweight:

- slight;
- normal;
- strong.

Natural language can map into these strengths, such as "稍微更阴一点" or
"大幅减少电子感."

#### Direction Summary

Radio Card should show a short current-direction summary. It lets the user see
what the agent thinks the radio is doing.

Example:

> 以空旷女声和夜晚 shoegaze 为主线，保持低亮度和漂浮感，减少过强电子节拍。

The summary should combine the motif and active variations. It is the user's
calibration point for the agent's understanding. The user can correct this
summary directly through Chat or through the Radio Card, and the agent updates
the current radio direction from that correction.

#### Autoplay And Preview Radio

Radio has two recommendation delivery modes:

- **Autoplay Radio**: the agent recommends and maintains playback queue
  continuity.
- **Preview Radio**: the agent creates recommendation batches, and the user chooses
  what to play or add to queue.

In Autoplay Radio, user queue actions take priority. If the user deletes,
reorders, skips, inserts, or plays something manually, the agent treats that as
session context for future recommendations and continues from there.

### Recommendations Card

Recommendations Card is the agent's recommendation shelf.

It shows recommendation batches from Chat and Radio. Each recommended song is
shown as a concise MusicCard with a one-sentence reason by default.

Users can:

- play;
- add to queue;
- select the MusicCard and chat about it;
- ask why it was recommended;
- ask for nearby alternatives;
- request a negative adjustment;
- use the song as a motif;
- use the song as a variation;
- dismiss the specific MusicCard;
- give explicit feedback such as dislike, block, or "do not recommend this kind."

#### Recommendation Batches

Recommendations refresh by batch, not by replacing the whole surface.

Each time the agent produces a recommendation set from Chat or Radio, it creates
a new batch. A batch records its source, such as:

- from Chat;
- from Radio;
- from a motif;
- from a variation;
- from a correction request.

New batches are added while previous batches remain available to fold, clear,
or revisit.

When motif, variations, or the user's direction changes, older batches should
remain available but can be marked as previous direction or before variation
change. The agent should not keep expanding an older batch after the user has
changed direction.

#### Negative Adjustment

Users can correct a single MusicCard or a whole batch:

- "不要这么亮."
- "少一点 guitar."
- "不要这个艺人."
- "更小众."
- "保留氛围但换节奏."
- "这首不对，太流行了."

The agent can respond by producing a new recommendation batch or by updating the
radio variation/direction when the recommendation belongs to a radio session.

### Library Card

Library Card is the user's music-library context entrypoint.

First version focuses on making the library useful to the agent and radio:

- import status;
- library scale;
- recent imports;
- saved/favorite overview;
- visible scopes that can inform radio or recommendations;
- selectable songs, albums, artists, and library scopes.

Users can select library objects and talk with the agent:

- "用这个艺人开电台."
- "找这张专辑附近的东西."
- "为什么我会喜欢这类?"
- "从这个范围里推荐."
- "把这类方向加入 variation."

Library scopes can be sent to Radio as a motif or variation, such as starting a
radio session from a saved library range or adding an album collection as a
variation.

Full library management, album-collection organization, cleanup, grouping, and
bulk editing can grow from this entrypoint.

## Card Refresh And Lifecycle

Card refresh should be event-driven.

Refresh events include:

- user sends a relevant Chat command;
- user directly edits a Functional Card;
- the agent produces a new result through MineMusic tools;
- radio state changes;
- recommendation batch is created;
- library status changes after user- or agent-initiated work.

Compact cards can show badge/status changes when they update. Expanded-card
focus remains user-controlled in the first version.

Users can dismiss concrete content cards/items. Dismiss means "remove from the
current view." It is separate from taste feedback.

## User Signal Model

The product should distinguish different user signals:

- **UI cleanup**: dismiss, fold, or clear content. This organizes the interface
  and does not mean taste feedback.
- **Playback and queue actions**: play, pause, skip, replay, add to queue,
  reorder, remove from queue, or jump to another item. These are behavioral
  signals for the current session and radio flow.
- **Session steering**: natural-language corrections such as make it darker,
  less guitar, more obscure, avoid this artist for now, or keep the atmosphere
  but change the rhythm.
- **Explicit preference**: like, dislike, block, do not recommend this kind, or
  remember this preference. These are stronger preference signals and future
  long-term memory inputs.

Playback and queue actions should be treated as weak-to-medium short-term
signals. They can tune the current session, especially when repeated, but motif
and active variations remain the primary radio constraints.

## Agent Workflow Requirements

The agent and user share the same product operation space. Chat commands should
be able to operate on the current selected object, current expanded card, and
current playback/radio context when the user's intent is clear.

The agent should understand the frontend state as part of its working context:

- current selected object as the default discussion focus;
- active expanded Functional Card;
- current playback item;
- queue state;
- current radio motif;
- active variations;
- recent recommendation batches;
- recent user corrections.

The agent should use MineMusic tools and update the UI through product-level
results:

- recommendations produce MusicCards in Recommendations Card;
- radio changes update Radio Card;
- queue and playback changes update Music Playback;
- selected objects become Chat context;
- library state appears through Library Card.

First-version focus behavior:

- user controls which Functional Card is expanded;
- agent can update card content and status;
- agent does not automatically switch focus;
- Chat can tell the user when a card has new content.

## First-Version Scope

The first version should prove the workbench shape:

- fixed Chat;
- fixed built-in Music Playback;
- Functional Cards system;
- Radio Card;
- Recommendations Card;
- Library Card;
- selectable MusicCards and library objects;
- object flow to Chat, Playback, and Radio;
- radio motif and variations;
- recommendation batches;
- Autoplay Radio and Preview Radio delivery;
- event-driven card refresh;
- dismissible concrete content cards.

## First-Version Acceptance Stories

### Chat Recommendation To Playback

The user gives a fuzzy music intent in Chat. The agent creates a recommendation
batch in Recommendations Card. The user selects a MusicCard, asks follow-up
questions in Chat, then plays it or adds it to the queue in Music Playback.

### Radio From Motif To Continuous Playback

The user starts Radio from natural language, a track, an album, or an artist.
The user adds variations. In Autoplay Radio, the agent recommends music and
keeps playback moving through the queue. When the user skips, reorders, inserts,
or plays something manually, the agent treats that as session context and
continues from the updated direction.

### Library As Context Entry

The user opens Library Card, selects an artist, album, track, or library scope,
and discusses it with the agent in Chat. The user can then send that object to
Radio as a motif or variation, or ask the agent to generate Recommendations
from it.

Future capabilities should fit this same shape:

- Memory Card;
- music information and analysis cards;
- album collection cards;
- library organization cards;
- richer radio history;
- deeper recommendation explanation;
- long-term taste memory proposals.

## Open Questions

These remain for the next product grilling pass:

Visual layout is adjustable and should not block product requirements. The key
requirements are what users can do, how the agent participates, and how objects
move between Chat, Playback, Radio, Recommendations, and Library.
