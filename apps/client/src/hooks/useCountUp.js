import { useEffect, useRef, useState } from "react";

export const useCountUp = (target, { duration = 1500, formatter = String } = {}) => {
  const [display, setDisplay] = useState(() => formatter(target));
  const prevRef = useRef(target);
  const rafRef = useRef(null);

  useEffect(() => {
    const from = prevRef.current;
    const to = target;
    if (from === to) {
      setDisplay(formatter(to));
      return;
    }

    const startTime = performance.now();

    const tick = (now) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 4); // easeOutQuart
      const current = from + (to - from) * eased;
      setDisplay(formatter(current));

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        prevRef.current = to;
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      prevRef.current = to;
    };
  }, [target, duration, formatter]);

  return display;
};
