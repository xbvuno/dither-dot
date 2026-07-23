/**
 * Utility helper for triggering native haptic vibration feedback.
 * Safely feature-detects navigator.vibrate so unsupported devices or browsers do not throw.
 * 
 * @param {number|number[]} pattern - Vibration duration in ms or pattern array (default 5ms)
 */
export function triggerHapticPulse(pattern = 5) {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(pattern);
    }
  } catch {
    // Ignore unsupported browser contexts or blocked permissions
  }
}
