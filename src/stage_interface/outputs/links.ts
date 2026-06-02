import type {
  MusicMaterial,
  PublicDisplayLink,
} from "../../contracts/index.js";

export function publicDisplayLinksForMaterial(material: MusicMaterial): PublicDisplayLink[] {
  return (material.playableLinks ?? []).map((link) => ({
    ...(link.label === undefined ? {} : { label: link.label }),
    url: link.url,
  }));
}
