import { useToast } from "@chakra-ui/react";
import { useCallback } from "react";

/**
 * Wrapper around Chakra's useToast with consistent defaults:
 * - isClosable: true
 * - duration: 3000
 * - position: bottom (or whichever the app uses)
 */
export default function useAppToast() {
  const toast = useToast();

  return useCallback(
    (options) =>
      toast({
        duration: 3000,
        isClosable: true,
        ...options,
      }),
    [toast],
  );
}
