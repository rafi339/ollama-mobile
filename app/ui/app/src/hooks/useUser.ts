import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchUser, fetchConnectUrl, disconnectUser } from "@/api";
import { isNativeMobile } from "@/utils/mobile";
import { getApiKey } from "@/lib/ollama-cloud";

export function useUser() {
  const queryClient = useQueryClient();

  const userQuery = useQuery({
    queryKey: ["user"],
    queryFn: async () => {
      if (isNativeMobile()) {
        const key = await getApiKey();
        return key
          ? { id: "mobile", email: "", name: "Mobile User" }
          : null;
      }
      return fetchUser();
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    retry: 10,
    retryDelay: (attemptIndex) => Math.min(500 * attemptIndex, 2000),
    refetchOnMount: true,
  });

  const refreshUser = useMutation({
    mutationFn: () => {
      if (isNativeMobile()) {
        return getApiKey().then((key) =>
          key ? { id: "mobile", email: "", name: "Mobile User" } : null,
        );
      }
      return fetchUser();
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["user"], data);
    },
  });

  const connectUrlQuery = useQuery({
    queryKey: ["connectUrl"],
    queryFn: fetchConnectUrl,
    enabled: false,
    staleTime: Infinity,
  });

  const disconnectMutation = useMutation({
    mutationFn: disconnectUser,
    onSuccess: () => {
      queryClient.setQueryData(["user"], null);
    },
  });

  const isLoading = userQuery.isLoading || userQuery.isFetching;
  const isAuthenticated = Boolean(userQuery.data?.name);

  return {
    user: userQuery.data,
    isLoading,
    isError: userQuery.isError,
    error: userQuery.error,
    isAuthenticated,
    refreshUser: refreshUser.mutate,
    isRefreshing: refreshUser.isPending,
    refetchUser: userQuery.refetch,
    fetchConnectUrl: connectUrlQuery.refetch,
    connectUrl: connectUrlQuery.data,
    disconnectUser: disconnectMutation.mutate,
  };
}
