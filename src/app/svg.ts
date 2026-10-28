/** Builds SVG from DOM nodes (never from strings), so no text ever passes through innerHTML. */

const NS = 'http://www.w3.org/2000/svg';

/** An SVG element with attributes and children; a string child becomes a text node. */
export function svgEl<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
  ...children: Array<Node | string>
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, tag);
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, String(value));
  node.append(...children);
  return node;
}
