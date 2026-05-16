import { useQuery } from "@tanstack/react-query";
import { fetchHealth } from "@/api";
import { isNativeMobile } from "@/utils/mobile";

export function useHealth() {
  const isMobile = isNativeMobile();

  const healthQuery = useQuery({
    queryKey: ["health"],
    queryFn: fetchHealth,
    refetchInterval: (query) => {
      // If the server is not healthy, poll every 10ms
      // Once healthy, stop polling
      return query.state.data === false ? 10 : false;
    },
    refetchIntervalInBackground: true,
    retry: false, // Don't retry, just return false
    staleTime: 0, // Always consider stale so we keep polling
    enabled: !isMobile,
  });

  return {
    isHealthy: isMobile ? true : (healthQuery.data ?? false),
    isChecking: healthQuery.isLoading,
  };
}
