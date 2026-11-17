import { useEffect, type RefObject } from "react";

/** Pause preview audio when the studio scrolls off-screen (e.g. another kit tab). */
export function usePauseWhenHidden(
  rootRef: RefObject<HTMLElement | null>,
  pause: () => void,
) {
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry && !entry.isIntersecting) pause();
      },
      { threshold: 0.12 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [pause, rootRef]);
}

export function stopSpeechSynthesis() {
  if (typeof window !== "undefined" && window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
}
