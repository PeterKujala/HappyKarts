/** @param {string} selector @param {ParentNode} [root] @returns {any} */
export const $ = (selector, root = document) => root.querySelector(selector);
/** @param {string} selector @param {ParentNode} [root] @returns {any[]} */
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

/** @param {{ text?: string, className?: string, label?: string, title?: string, help?: string }} [options] */
export function button(options = {}) {
  const { text, className = '', label, title, help } = options;
  const element = document.createElement('button');
  element.type = 'button';
  element.className = className;
  element.textContent = text;
  if (label) element.setAttribute('aria-label', label);
  if (title) element.title = title;
  if (help) element.dataset.help = help;
  return element;
}

export function setText(selector, value) {
  const element = typeof selector === 'string' ? $(selector) : selector;
  if (element) element.textContent = value ?? '';
}
