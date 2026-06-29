import type {
  CandidateCommitCommand,
  MaterialProjection,
} from "../music_data_platform/index.js";
import type {
  MusicExperienceQueuePlaybackCommand,
  MusicExperienceRadioTruthCommand,
} from "../contracts/music_experience.js";
import {
  createMusicExperienceRuntimeModule,
} from "../music_experience/stage_adapter/index.js";
import type { RuntimeModule } from "../stage_core/index.js";

export type MusicExperienceServerPorts = {
  candidateCommit(): CandidateCommitCommand | undefined;
  materialProjection(): MaterialProjection | undefined;
  queuePlayback(): MusicExperienceQueuePlaybackCommand | undefined;
  radioTruth(): MusicExperienceRadioTruthCommand | undefined;
};

export type CreateMusicExperienceServerRuntimeModuleInput = {
  ports: MusicExperienceServerPorts;
};

export function createMusicExperienceServerRuntimeModule(
  input: CreateMusicExperienceServerRuntimeModuleInput,
): RuntimeModule {
  return createMusicExperienceRuntimeModule({
    candidateCommit: lazyCandidateCommitCommand(input.ports),
    materialProjection: lazyMaterialProjection(input.ports),
    queuePlayback: lazyQueuePlaybackCommand(input.ports),
    radioTruth: lazyRadioTruthCommand(input.ports),
  });
}

function lazyCandidateCommitCommand(
  ports: Pick<MusicExperienceServerPorts, "candidateCommit">,
): CandidateCommitCommand {
  return {
    commitCandidate(commandInput) {
      const port = ports.candidateCommit();

      if (port === undefined) {
        throw new Error("Candidate Commit command is not initialized.");
      }

      return port.commitCandidate(commandInput);
    },
  };
}

function lazyMaterialProjection(
  ports: Pick<MusicExperienceServerPorts, "materialProjection">,
): MaterialProjection {
  return {
    projectMusicMaterial(projectInput) {
      const port = ports.materialProjection();

      if (port === undefined) {
        throw new Error("Material Projection is not initialized.");
      }

      return port.projectMusicMaterial(projectInput);
    },
    projectMusicMaterials(projectInput) {
      const port = ports.materialProjection();

      if (port === undefined) {
        throw new Error("Material Projection is not initialized.");
      }

      return port.projectMusicMaterials(projectInput);
    },
  };
}

function lazyQueuePlaybackCommand(
  ports: Pick<MusicExperienceServerPorts, "queuePlayback">,
): MusicExperienceQueuePlaybackCommand {
  const resolve = (): MusicExperienceQueuePlaybackCommand => {
    const port = ports.queuePlayback();
    if (port === undefined) {
      throw new Error("Music Experience Queue Playback command is not initialized.");
    }
    return port;
  };
  return {
    append: (commandInput) => resolve().append(commandInput),
    remove: (commandInput) => resolve().remove(commandInput),
    replace: (commandInput) => resolve().replace(commandInput),
    move: (commandInput) => resolve().move(commandInput),
    clear: (commandInput) => resolve().clear(commandInput),
    playNow: (commandInput) => resolve().playNow(commandInput),
  };
}

function lazyRadioTruthCommand(
  ports: Pick<MusicExperienceServerPorts, "radioTruth">,
): MusicExperienceRadioTruthCommand {
  return {
    setRadioDirection(commandInput) {
      const port = ports.radioTruth();
      if (port === undefined) {
        throw new Error("Music Experience Radio Truth command is not initialized.");
      }
      return port.setRadioDirection(commandInput);
    },
    setRadioMotif(commandInput) {
      const port = ports.radioTruth();
      if (port === undefined) {
        throw new Error("Music Experience Radio Truth command is not initialized.");
      }
      return port.setRadioMotif(commandInput);
    },
    clearRadioMotif(commandInput) {
      const port = ports.radioTruth();
      if (port === undefined) {
        throw new Error("Music Experience Radio Truth command is not initialized.");
      }
      return port.clearRadioMotif(commandInput);
    },
    addRadioVariation(commandInput) {
      const port = ports.radioTruth();
      if (port === undefined) {
        throw new Error("Music Experience Radio Truth command is not initialized.");
      }
      return port.addRadioVariation(commandInput);
    },
    removeRadioVariation(commandInput) {
      const port = ports.radioTruth();
      if (port === undefined) {
        throw new Error("Music Experience Radio Truth command is not initialized.");
      }
      return port.removeRadioVariation(commandInput);
    },
    replaceRadioVariation(commandInput) {
      const port = ports.radioTruth();
      if (port === undefined) {
        throw new Error("Music Experience Radio Truth command is not initialized.");
      }
      return port.replaceRadioVariation(commandInput);
    },
    moveRadioVariation(commandInput) {
      const port = ports.radioTruth();
      if (port === undefined) {
        throw new Error("Music Experience Radio Truth command is not initialized.");
      }
      return port.moveRadioVariation(commandInput);
    },
    clearRadioVariations(commandInput) {
      const port = ports.radioTruth();
      if (port === undefined) {
        throw new Error("Music Experience Radio Truth command is not initialized.");
      }
      return port.clearRadioVariations(commandInput);
    },
    writeRadioPosture(commandInput) {
      const port = ports.radioTruth();
      if (port === undefined) {
        throw new Error("Music Experience Radio Truth command is not initialized.");
      }
      return port.writeRadioPosture(commandInput);
    },
    addRadioLean(commandInput) {
      const port = ports.radioTruth();
      if (port === undefined) {
        throw new Error("Music Experience Radio Truth command is not initialized.");
      }
      return port.addRadioLean(commandInput);
    },
    removeRadioLean(commandInput) {
      const port = ports.radioTruth();
      if (port === undefined) {
        throw new Error("Music Experience Radio Truth command is not initialized.");
      }
      return port.removeRadioLean(commandInput);
    },
    replaceRadioLean(commandInput) {
      const port = ports.radioTruth();
      if (port === undefined) {
        throw new Error("Music Experience Radio Truth command is not initialized.");
      }
      return port.replaceRadioLean(commandInput);
    },
    moveRadioLean(commandInput) {
      const port = ports.radioTruth();
      if (port === undefined) {
        throw new Error("Music Experience Radio Truth command is not initialized.");
      }
      return port.moveRadioLean(commandInput);
    },
    clearRadioLean(commandInput) {
      const port = ports.radioTruth();
      if (port === undefined) {
        throw new Error("Music Experience Radio Truth command is not initialized.");
      }
      return port.clearRadioLean(commandInput);
    },
  };
}
