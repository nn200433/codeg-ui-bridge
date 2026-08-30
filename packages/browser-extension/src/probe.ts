/**
 * MAIN-world probe: Vue dev builds expose component identity on the DOM —
 * Vue 3 via element.__vueParentComponent.type.__file, Vue 2 via
 * element.__vue__.$options.__file. The content script lives in the isolated
 * world and cannot read these JS props, so it marks the target with
 * data-codeg-probe-token and dispatches "codeg-source-probe"; this script
 * resolves the file and writes data-codeg-source-* attributes back.
 */

interface Vue2Vm {
  $options: { __file?: string; name?: string; _componentTag?: string };
}

interface Vue3Instance {
  type?: { __file?: string; __name?: string; name?: string };
}

const PROBE_EVENT = "codeg-source-probe";
const PROBE_DONE_EVENT = "codeg-source-probe-done";
const TOKEN_ATTR = "data-codeg-probe-token";
const FILE_ATTR = "data-codeg-source-file";
const COMPONENT_ATTR = "data-codeg-component";

function resolveVueSource(element: Element): { file: string; component?: string } | undefined {
  let node: Element | null = element;
  while (node) {
    const vue3 = (node as unknown as { __vueParentComponent?: Vue3Instance }).__vueParentComponent;
    const file3 = vue3?.type?.__file;
    if (file3) {
      return { file: file3, component: vue3?.type?.__name || vue3?.type?.name };
    }
    const vm = (node as unknown as { __vue__?: Vue2Vm }).__vue__;
    const file2 = vm?.$options?.__file;
    if (file2) {
      return { file: file2, component: vm?.$options?.name || vm?.$options?._componentTag };
    }
    node = node.parentElement;
  }
  return undefined;
}

function boot(): void {
  const host = window as unknown as { __CODEG_SOURCE_PROBE__?: boolean };
  if (host.__CODEG_SOURCE_PROBE__) {
    return;
  }
  host.__CODEG_SOURCE_PROBE__ = true;

  window.addEventListener(PROBE_EVENT, (event) => {
    const token = (event as CustomEvent<string>).detail;
    if (!token) {
      return;
    }
    const target = document.querySelector(`[${TOKEN_ATTR}="${token}"]`);
    if (!target) {
      return;
    }
    target.removeAttribute(TOKEN_ATTR);
    const found = resolveVueSource(target);
    if (!found) {
      window.dispatchEvent(new CustomEvent(PROBE_DONE_EVENT, { detail: token }));
      return;
    }
    if (!target.getAttribute(FILE_ATTR)) {
      target.setAttribute(FILE_ATTR, found.file);
    }
    if (found.component && !target.getAttribute(COMPONENT_ATTR)) {
      target.setAttribute(COMPONENT_ATTR, found.component);
    }
    window.dispatchEvent(new CustomEvent(PROBE_DONE_EVENT, { detail: token }));
  });
}

boot();
