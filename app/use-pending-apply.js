import { useEffect, useState } from "react";

const STORAGE_KEY = "asva-pending-apply";

/**
 * Tracks whether the merchant has clicked an Apply-fix button and
 * not yet rescanned. Surfaces the "you applied a fix — want to
 * rescan?" banner on Home and Fixes when they switch back to the
 * Asva tab from the theme editor.
 *
 * Flow:
 *   1. Merchant clicks Apply fix     → markPendingApply() sets the flag
 *   2. New tab opens (theme editor)  → original tab stays on /app/fixes
 *   3. Merchant toggles embed + Save → comes back to Asva tab
 *   4. visibilitychange fires        → hook sees the flag → pending = true
 *   5. Banner shows "Rescan now"     → click → flag cleared, /app?rescan=1
 *
 * Flag lives in localStorage so it survives tab refreshes. If the
 * merchant never comes back, the flag stays and the banner shows on
 * their next visit — that's fine; rescanning is always cheap.
 */
export function usePendingApply() {
  const [pendingApply, setPendingApply] = useState(false);

  useEffect(() => {
    const check = () => {
      if (typeof window === "undefined") return;
      if (document.visibilityState !== "visible") return;
      try {
        if (localStorage.getItem(STORAGE_KEY)) {
          setPendingApply(true);
        }
      } catch {
        // localStorage can throw in private-mode / quota-exceeded — ignore.
      }
    };
    check();
    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);
    return () => {
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("focus", check);
    };
  }, []);

  const clear = () => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    setPendingApply(false);
  };

  return { pendingApply, clear };
}

/**
 * Called from the Apply-fix button's onClick. Sets the localStorage
 * flag so the hook can detect when the merchant comes back.
 */
export function markPendingApply() {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
}
