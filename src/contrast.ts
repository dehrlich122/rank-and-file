// WCAG contrast, in one place: the build's contrast check (scripts/check-contrast.mjs) and the style guide's swatches
// both use it. Colours are [r, g, b] with channels 0 to 255.
const channel = (v: number): number => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);

/** Relative luminance. */
const luminance = ([r, g, b]: number[]): number => 0.2126 * channel(r!) + 0.7152 * channel(g!) + 0.0722 * channel(b!);

/** The contrast ratio of two colours, 1 to 21. */
export function contrastRatio(a: number[], b: number[]): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}
