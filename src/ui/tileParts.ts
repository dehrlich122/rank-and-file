// The two pieces every tile on the board is made of: an SVG <title> for the hover text, and a sprite group centred on its square.
import { S } from "./sprites/floor";
import { svg } from "./svg";

/** An SVG <title>: the text a browser shows on hover. */
export function tooltip(text: string): SVGTitleElement {
  const title = svg("title", {});
  title.textContent = text;
  return title;
}

/** A tile's sprite, centred on its square. */
export function sprite(left: number, top: number, art: SVGElement): SVGGElement {
  return svg("g", { class: "spr", transform: `translate(${left + S / 2} ${top + S / 2})` }, art);
}
