/**
 * Defers function execution until browser is idle to avoid blocking critical path.
 * Uses requestIdleCallback when available, falls back to setTimeout.
 *
 * @param fn - Function to execute when browser is idle
 */
export function defer(fn: () => void) {
    if ('requestIdleCallback' in window) {
        requestIdleCallback(fn, { timeout: 2000 });
    } else {
        setTimeout(fn, 0);
    }
}
