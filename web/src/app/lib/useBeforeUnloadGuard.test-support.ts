/** Dispatches a cancelable beforeunload and reports whether anything asked the browser to hold it. */
export function leavingIsHeld() {
  const event = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}
