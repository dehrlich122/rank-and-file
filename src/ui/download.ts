// Hand the player a text file to keep (a level as .yaml): the browser's own save, no server.
import type { Draft } from "../editor/draft";
import { draftToYaml } from "../editor/levelData";

/** A file name from a title: "Cross the Courtyard!" is "cross-the-courtyard". */
const fileName = (title: string, fallback = "level"): string => title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || fallback;

function download(name: string, text: string, type = "text/yaml"): void {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([text], { type: `${type};charset=utf-8` }));
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

/** Save a level as `<title>.yaml`. */
export const downloadLevel = (draft: Draft): void => download(`${fileName(draft.title)}.yaml`, draftToYaml(draft));
