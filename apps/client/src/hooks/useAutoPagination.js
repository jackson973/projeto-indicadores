import { useCallback, useEffect, useRef, useState } from "react";

export const useAutoPagination = (totalPages, { intervalMs = 8000, resumeAfterMs = 15000, enabled = true } = {}) => {
  const [page, setPageInternal] = useState(1);
  const [paused, setPaused] = useState(false);
  const resumeTimerRef = useRef(null);
  const intervalRef = useRef(null);

  // Auto-advance
  useEffect(() => {
    if (!enabled || paused || totalPages <= 1) {
      clearInterval(intervalRef.current);
      return;
    }
    intervalRef.current = setInterval(() => {
      setPageInternal((current) => (current >= totalPages ? 1 : current + 1));
    }, intervalMs);
    return () => clearInterval(intervalRef.current);
  }, [enabled, paused, totalPages, intervalMs]);

  // Clamp page when totalPages shrinks
  useEffect(() => {
    setPageInternal((current) => Math.min(current, Math.max(1, totalPages)));
  }, [totalPages]);

  // User-triggered page change: pause + schedule resume
  const setPage = useCallback((pageOrUpdater) => {
    setPageInternal(pageOrUpdater);
    setPaused(true);
    clearTimeout(resumeTimerRef.current);
    resumeTimerRef.current = setTimeout(() => setPaused(false), resumeAfterMs);
  }, [resumeAfterMs]);

  // Cleanup
  useEffect(() => {
    return () => {
      clearInterval(intervalRef.current);
      clearTimeout(resumeTimerRef.current);
    };
  }, []);

  return { page, setPage };
};
