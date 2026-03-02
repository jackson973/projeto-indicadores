import { useEffect, useState } from "react";

export const useAnimationCycle = (intervalMs = 30000, initialDelayMs = 0, enabled = true) => {
  const [cycle, setCycle] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let intervalId;
    const timeoutId = setTimeout(() => {
      setCycle((c) => c + 1);
      intervalId = setInterval(() => setCycle((c) => c + 1), intervalMs);
    }, initialDelayMs);

    return () => {
      clearTimeout(timeoutId);
      if (intervalId) clearInterval(intervalId);
    };
  }, [intervalMs, initialDelayMs, enabled]);

  return cycle;
};
