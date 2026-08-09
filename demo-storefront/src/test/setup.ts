/**
 * Test setup for demo-storefront component tests.
 *
 * Registers happy-dom's DOM globals (window/document/navigator/HTMLElement…)
 * so @testing-library/react renders into a real DOM and `screen` queries work.
 * Loaded via `bun test --preload`.
 */
import { Window } from "happy-dom";

const window_ = new Window({ url: "http://localhost" });

Object.assign(globalThis, {
  window: window_,
  document: window_.document,
  navigator: window_.navigator,
  HTMLElement: window_.HTMLElement,
  Element: window_.Element,
  Node: window_.Node,
  Event: window_.Event,
  CustomEvent: window_.CustomEvent,
  MutationObserver: window_.MutationObserver,
  getComputedStyle: window_.getComputedStyle.bind(window_),
  requestAnimationFrame: (cb: FrameRequestCallback) =>
    setTimeout(() => cb(performance.now()), 0) as unknown as number,
  cancelAnimationFrame: (id: number) => clearTimeout(id),
});

window_.document.body.innerHTML = "<div id='root'></div>";
