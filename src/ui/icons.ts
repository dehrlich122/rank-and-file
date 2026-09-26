// Every UI icon, drawn as inline SVG in one place, so a visual redesign can
// swap them all here. (Unicode glyphs like ⏮ ⏭ ⏸ can turn into colour emoji
// on some systems, and ▶| looks too much like Play.) Icons use currentColor,
// so they follow the button's text colour in both themes.

const SVG = "http://www.w3.org/2000/svg";

type Shape = { d: string; fill?: boolean };

const ICONS = {
  // playback: chevrons for stepping, a solid triangle for Play
  toStart: [{ d: "M12 6l-6 6 6 6M19 6l-6 6 6 6" }],
  stepBack: [{ d: "M15 6l-6 6 6 6" }],
  play: [{ d: "M8 5.5v13l10.5-6.5z", fill: true }],
  pause: [{ d: "M7 5.5h3.5v13H7zM13.5 5.5H17v13h-3.5z", fill: true }],
  stepForward: [{ d: "M9 6l6 6-6 6" }],
  toEnd: [{ d: "M5 6l6 6-6 6M12 6l6 6-6 6" }],
  // the lesson panel: a panel edge with an arrow (mirrored in CSS when the panel is on the right)
  collapsePanel: [{ d: "M4 4v16" }, { d: "M17 7l-5 5 5 5M12 12h9" }],
  expandPanel: [{ d: "M4 4v16" }, { d: "M14 7l5 5-5 5M8 12h11" }],
  // settings: three sliders
  settings: [{ d: "M4 7h9M17 7h3M4 12h3M11 12h9M4 17h11M19 17h1" }, { d: "M15 5v4M9 10v4M17 15v4" }],
} satisfies Record<string, Shape[]>;

export type IconName = keyof typeof ICONS;

export function icon(name: IconName): SVGSVGElement {
  const element = document.createElementNS(SVG, "svg");
  element.setAttribute("viewBox", "0 0 24 24");
  element.setAttribute("class", `icon icon-${name}`);
  element.setAttribute("aria-hidden", "true");
  for (const shape of ICONS[name] as Shape[]) {
    const path = document.createElementNS(SVG, "path");
    path.setAttribute("d", shape.d);
    if (shape.fill) {
      path.setAttribute("fill", "currentColor");
    } else {
      path.setAttribute("fill", "none");
      path.setAttribute("stroke", "currentColor");
      path.setAttribute("stroke-width", "2.2");
      path.setAttribute("stroke-linecap", "round");
      path.setAttribute("stroke-linejoin", "round");
    }
    element.append(path);
  }
  return element;
}
