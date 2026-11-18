// Element builders. Text goes in only as text nodes, so a name a stranger chose is never read as
// markup, and styles are set through the style object, which the page's content-security-policy
// allows where a style attribute is not.

export interface ElOptions {
  class?: string;
  attrs?: Record<string, string>;
  data?: Record<string, string>;
  text?: string;
}

export type Child = Node | string | null | undefined | false;

function append(parent: Element, children: readonly Child[]): void {
  for (const child of children) {
    if (child === null || child === undefined || child === false) {
      continue;
    }
    parent.append(typeof child === "string" ? document.createTextNode(child) : child);
  }
}

function decorate(node: Element, options: ElOptions): void {
  if (options.class !== undefined) {
    node.setAttribute("class", options.class);
  }
  for (const [name, value] of Object.entries(options.attrs ?? {})) {
    node.setAttribute(name, value);
  }
  for (const [name, value] of Object.entries(options.data ?? {})) {
    (node as HTMLElement).dataset[name] = value;
  }
  if (options.text !== undefined) {
    node.textContent = options.text;
  }
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  options: ElOptions = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  decorate(node, options);
  append(node, children);
  return node;
}

const SVG_NS = "http://www.w3.org/2000/svg";

export function svg<K extends keyof SVGElementTagNameMap>(
  tag: K,
  options: ElOptions = {},
  ...children: Child[]
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  decorate(node, options);
  append(node, children);
  return node;
}

// Sets a node's text only when it changes, so an element that is updated in place on every
// snapshot is touched only when something it shows has moved.
export function setText(node: Node, text: string): void {
  if (node.textContent !== text) {
    node.textContent = text;
  }
}

export function setAttr(node: Element, name: string, value: string | null): void {
  if (value === null) {
    if (node.hasAttribute(name)) {
      node.removeAttribute(name);
    }
  } else if (node.getAttribute(name) !== value) {
    node.setAttribute(name, value);
  }
}

export function setSrc(node: HTMLImageElement, url: string | null): void {
  if (url === null) {
    if (node.hasAttribute("src")) {
      node.removeAttribute("src");
    }
  } else if (node.getAttribute("src") !== url) {
    node.setAttribute("src", url);
  }
}

// Counts the elements the page has made, stamped on them so a test can tell a node that was kept
// from one that was made again.
let created = 0;

export function stamp(node: HTMLElement): void {
  created += 1;
  node.dataset.created = String(created);
}
