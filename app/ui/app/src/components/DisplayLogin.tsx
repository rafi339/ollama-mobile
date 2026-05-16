import type { ErrorEvent } from "@/gotypes";
import { Display, type DisplayAction } from "@/components/ui/display";
import { useUser } from "@/hooks/useUser";
import { useEffect, useState } from "react";
import { isNativeMobile } from "@/utils/mobile";
import { validateApiKey } from "@/lib/ollama-cloud";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface DisplayLoginProps {
  error: ErrorEvent | null;
  className?: string;
  onDismiss?: () => void;
  message?: string;
}

export const DisplayLogin = ({
  error,
  className,
  onDismiss,
  message,
}: DisplayLoginProps) => {
  const { fetchConnectUrl, refetchUser, isAuthenticated } = useUser();
  const [isAwaitingAuth, setIsAwaitingAuth] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [keyError, setKeyError] = useState<string | null>(null);
  const [validating, setValidating] = useState(false);

  useEffect(() => {
    const handleFocus = () => {
      if (isAwaitingAuth) {
        setIsAwaitingAuth(false);
        refetchUser();
      }
    };

    window.addEventListener("focus", handleFocus);

    return () => {
      window.removeEventListener("focus", handleFocus);
    };
  }, [isAwaitingAuth, refetchUser]);

  useEffect(() => {
    if (isAuthenticated && isAwaitingAuth) {
      setIsAwaitingAuth(false);
      if (onDismiss) {
        onDismiss();
      }
    }
  }, [isAuthenticated, isAwaitingAuth, onDismiss]);

  if (!error || error.code !== "cloud_unauthorized" || isAuthenticated)
    return null;

  const handleSignIn = async () => {
    try {
      const { data: connectUrl } = await fetchConnectUrl();
      if (connectUrl) {
        window.open(connectUrl, "_blank");
        setIsAwaitingAuth(true);
      }
    } catch (error) {
      console.error("Error getting connect URL:", error);
    }
  };

  const handleSaveKey = async () => {
    if (!apiKey.trim()) return;
    setValidating(true);
    setKeyError(null);
    try {
      const valid = await validateApiKey(apiKey.trim());
      if (valid) {
        await setApiKey(apiKey.trim());
        refetchUser();
        if (onDismiss) onDismiss();
      } else {
        setKeyError("Invalid API key");
      }
    } catch (e) {
      setKeyError("Failed to validate key");
    } finally {
      setValidating(false);
    }
  };

  if (isNativeMobile()) {
    return (
      <div className={`rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/20 ${className || ""}`}>
        <p className="mb-2 text-sm text-red-600 dark:text-red-400">
          {message || "Enter your ollama.com API key to use cloud models"}
        </p>
        <div className="flex items-center gap-2">
          <Input
            type="password"
            placeholder="sk-..."
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            className="flex-1"
          />
          <Button
            onClick={handleSaveKey}
            disabled={validating || !apiKey.trim()}
            color="dark"
          >
            {validating ? "..." : "Save"}
          </Button>
        </div>
        {keyError && (
          <p className="mt-1 text-xs text-red-600 dark:text-red-400">{keyError}</p>
        )}
      </div>
    );
  }

  const action: DisplayAction = {
    label: "Sign In",
    onClick: handleSignIn,
  };

  return (
    <Display
      message={message || "Cloud models require an Ollama account"}
      action={action}
      className={className}
      onDismiss={onDismiss}
    />
  );
};
