import { useEffect, useState } from "react";

const STORAGE_KEY = "asva-onboarding-dismissed";

/**
 * Tracks whether the merchant has dismissed the first-run onboarding
 * card on the Home page. Returns { showOnboarding, dismiss }.
 *
 * showOnboarding is true on first visit and stays true until the
 * merchant clicks Got it on the card. Dismissal is persisted in
 * localStorage so it survives navigation and tab refreshes.
 *
 * Why a separate hook: §5.1.3 of the Shopify App Store policy
 * requires "detailed onboarding instructions for theme app
 * extensions" — a proactive setup walkthrough, not just reactive
 * fix tooltips. This card is the proactive walkthrough.
 */
export function useOnboarding() {
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const dismissed = localStorage.getItem(STORAGE_KEY);
      setShowOnboarding(!dismissed);
    } catch {
      setShowOnboarding(true);
    }
    setHydrated(true);
  }, []);

  const dismiss = () => {
    try {
      localStorage.setItem(STORAGE_KEY, String(Date.now()));
    } catch {
      /* ignore */
    }
    setShowOnboarding(false);
  };

  // Only return true once hydration completes — avoids flashing
  // the card on every server render before localStorage is read.
  return { showOnboarding: hydrated && showOnboarding, dismiss };
}
