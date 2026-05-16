import { useEffect, useState, useCallback } from "react";
import { Switch } from "@/components/ui/switch";
import { Text } from "@/components/ui/text";
import { Input } from "@/components/ui/input";
import { Field, Label, Description } from "@/components/ui/fieldset";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  WifiIcon,
  FolderIcon,
  BoltIcon,
  WrenchIcon,
  CloudIcon,
  XMarkIcon,
  CogIcon,
  ArrowLeftIcon,
  ArrowDownTrayIcon,
} from "@heroicons/react/20/solid";
import { Settings as SettingsType } from "@/gotypes";
import { useNavigate } from "@tanstack/react-router";
import { useUser } from "@/hooks/useUser";
import { useCloudStatus } from "@/hooks/useCloudStatus";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getSettings,
  type CloudStatusResponse,
  updateCloudSetting,
  updateSettings,
  getInferenceCompute,
} from "@/api";
import { isNativeMobile } from "@/utils/mobile";
import {
  getApiKey,
  setApiKey,
  clearApiKey,
  validateApiKey,
} from "@/lib/ollama-cloud";
import {
  getStoredTheme,
  setStoredTheme,
  type Theme,
} from "@/lib/theme";
import {
  loadCustomModels,
  saveCustomModel,
  deleteCustomModel,
  type CustomModel,
} from "@/lib/mobile-storage";

function AnimatedDots() {
  return (
    <span className="inline-flex">
      <span className="animate-pulse">.</span>
      <span className="animate-pulse" style={{ animationDelay: "0.2s" }}>
        .
      </span>
      <span className="animate-pulse" style={{ animationDelay: "0.4s" }}>
        .
      </span>
    </span>
  );
}

export default function Settings() {
  const queryClient = useQueryClient();
  const [showSaved, setShowSaved] = useState(false);
  const [restartMessage, setRestartMessage] = useState(false);
  const {
    user,
    isAuthenticated,
    refreshUser,
    isRefreshing,
    refetchUser,
    fetchConnectUrl,
    isLoading,
    disconnectUser,
  } = useUser();
  const [isAwaitingConnection, setIsAwaitingConnection] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [pollingInterval, setPollingInterval] = useState<number | null>(null);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [apiKeyError, setApiKeyError] = useState<string | null>(null);
  const [apiKeyValidating, setApiKeyValidating] = useState(false);
  const [storedKey, setStoredKey] = useState<string | null>(null);
  const [currentTheme, setCurrentTheme] = useState<Theme>("system");
  const [customModels, setCustomModels] = useState<CustomModel[]>([]);
  const [showCustomModelForm, setShowCustomModelForm] = useState(false);
  const [editingCustomModel, setEditingCustomModel] = useState<CustomModel | null>(null);
  const [customModelName, setCustomModelName] = useState("");
  const [customModelBase, setCustomModelBase] = useState("");
  const [customModelSystem, setCustomModelSystem] = useState("");
  const [customModelTemp, setCustomModelTemp] = useState<number>(0.7);
  const navigate = useNavigate();
  const {
    cloudDisabled,
    cloudStatus,
    isLoading: cloudStatusLoading,
  } = useCloudStatus();

  const {
    data: settingsData,
    isLoading: loading,
    error,
  } = useQuery({
    queryKey: ["settings"],
    queryFn: getSettings,
  });

  const settings = settingsData?.settings || null;

  const { data: inferenceComputeResponse } = useQuery({
    queryKey: ["inferenceCompute"],
    queryFn: getInferenceCompute,
  });

  const defaultContextLength = inferenceComputeResponse?.defaultContextLength;

  const updateSettingsMutation = useMutation({
    mutationFn: updateSettings,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      setShowSaved(true);
      setTimeout(() => setShowSaved(false), 1500);
    },
  });

  const updateCloudMutation = useMutation({
    mutationFn: (enabled: boolean) => updateCloudSetting(enabled),
    onMutate: async (enabled: boolean) => {
      await queryClient.cancelQueries({ queryKey: ["cloudStatus"] });

      const previous = queryClient.getQueryData<CloudStatusResponse | null>([
        "cloudStatus",
      ]);
      const envForcesDisabled =
        previous?.source === "env" || previous?.source === "both";

      queryClient.setQueryData<CloudStatusResponse | null>(
        ["cloudStatus"],
        previous
          ? {
              ...previous,
              disabled: !enabled || envForcesDisabled,
            }
          : {
              disabled: !enabled,
              source: "config",
            },
      );

      return { previous };
    },
    onError: (_error, _enabled, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(["cloudStatus"], context.previous);
      }
    },
    onSuccess: (status) => {
      queryClient.setQueryData<CloudStatusResponse | null>(
        ["cloudStatus"],
        status,
      );
      queryClient.invalidateQueries({ queryKey: ["models"] });
      queryClient.invalidateQueries({ queryKey: ["cloudStatus"] });

      setShowSaved(true);
      setTimeout(() => setShowSaved(false), 1500);
    },
  });

  useEffect(() => {
    refetchUser();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (isNativeMobile()) {
      getApiKey().then((k) => setStoredKey(k));
      getStoredTheme().then((t) => setCurrentTheme(t));
      setCustomModels(loadCustomModels());
    }
  }, []);

  const handleSaveCustomModel = () => {
    if (!customModelName.trim() || !customModelBase.trim()) return;
    const model: CustomModel = {
      id: editingCustomModel?.id || crypto.randomUUID(),
      name: customModelName.trim(),
      baseModel: customModelBase.trim(),
      systemPrompt: customModelSystem.trim(),
      temperature: customModelTemp,
      createdAt: editingCustomModel?.createdAt || new Date().toISOString(),
    };
    saveCustomModel(model);
    setCustomModels(loadCustomModels());
    setShowCustomModelForm(false);
    setEditingCustomModel(null);
    setCustomModelName("");
    setCustomModelBase("");
    setCustomModelSystem("");
    setCustomModelTemp(0.7);
  };

  const handleDeleteCustomModel = (id: string) => {
    deleteCustomModel(id);
    setCustomModels(loadCustomModels());
  };

  const handleEditCustomModel = (model: CustomModel) => {
    setEditingCustomModel(model);
    setCustomModelName(model.name);
    setCustomModelBase(model.baseModel);
    setCustomModelSystem(model.systemPrompt);
    setCustomModelTemp(model.temperature ?? 0.7);
    setShowCustomModelForm(true);
  };

  useEffect(() => {
    const handleFocus = () => {
      if (isAwaitingConnection && pollingInterval) {
        // Stop polling when window gets focus
        clearInterval(pollingInterval);
        setPollingInterval(null);
        // Reset awaiting connection state
        setIsAwaitingConnection(false);
        // Make one last refresh request
        refreshUser();
      }
    };

    window.addEventListener("focus", handleFocus);

    return () => {
      window.removeEventListener("focus", handleFocus);
    };
  }, [isAwaitingConnection, refreshUser, pollingInterval]);

  // Check if user is authenticated after refresh
  useEffect(() => {
    if (isAwaitingConnection && isAuthenticated) {
      setIsAwaitingConnection(false);
      setConnectionError(null);
      if (pollingInterval) {
        clearInterval(pollingInterval);
        setPollingInterval(null);
      }
    }
  }, [isAuthenticated, isAwaitingConnection, pollingInterval]);

  // Cleanup interval on unmount
  useEffect(() => {
    return () => {
      if (pollingInterval) {
        clearInterval(pollingInterval);
      }
    };
  }, [pollingInterval]);

  const handleChange = useCallback(
    (field: keyof SettingsType, value: boolean | string | number) => {
      if (settings) {
        const updatedSettings = new SettingsType({
          ...settings,
          [field]: value,
        });

        // If context length is being changed, show restart message
        if (field === "ContextLength" && value !== settings.ContextLength) {
          setRestartMessage(true);
          // Hide restart message after 3 seconds
          setTimeout(() => setRestartMessage(false), 3000);
        }

        updateSettingsMutation.mutate(updatedSettings);
      }
    },
    [settings, updateSettingsMutation],
  );

  const handleResetToDefaults = () => {
    if (settings) {
      const defaultSettings = new SettingsType({
        Expose: false,
        Browser: false,
        Models: "",
        Agent: false,
        Tools: false,
        ContextLength: 0,
        AutoUpdateEnabled: true,
      });
      updateSettingsMutation.mutate(defaultSettings);
    }
  };

  const cloudOverriddenByEnv =
    cloudStatus?.source === "env" || cloudStatus?.source === "both";
  const cloudToggleDisabled =
    cloudStatusLoading || updateCloudMutation.isPending || cloudOverriddenByEnv;

  const handleConnectOllamaAccount = async () => {
    setConnectionError(null);

    // If user is already authenticated, no need to connect
    if (isAuthenticated) {
      return;
    }

    try {
      // If we don't have a user or user has no name, get connect URL
      if (!user || !user?.name) {
        const { data: connectUrl } = await fetchConnectUrl();
        if (connectUrl) {
          window.open(connectUrl, "_blank");
          setIsAwaitingConnection(true);
          // Start polling every 5 seconds
          const interval = setInterval(() => {
            refreshUser();
          }, 5000);
          setPollingInterval(interval);
        } else {
          setConnectionError("Failed to get connect URL");
        }
      }
    } catch (error) {
      console.error("Error connecting to Ollama account:", error);
      setConnectionError(
        error instanceof Error
          ? error.message
          : "Failed to connect to Ollama account",
      );
      setIsAwaitingConnection(false);
    }
  };

  const handleSaveApiKey = async () => {
    if (!apiKeyInput.trim()) return;
    setApiKeyValidating(true);
    setApiKeyError(null);
    try {
      const valid = await validateApiKey(apiKeyInput.trim());
      if (valid) {
        await setApiKey(apiKeyInput.trim());
        setStoredKey(apiKeyInput.trim());
        setApiKeyInput("");
        refreshUser();
      } else {
        setApiKeyError("Invalid API key");
      }
    } catch {
      setApiKeyError("Failed to validate key");
    } finally {
      setApiKeyValidating(false);
    }
  };

  const handleClearApiKey = async () => {
    await clearApiKey();
    setStoredKey(null);
    refreshUser();
  };

  if (loading) {
    return null;
  }

  if (error || !settings) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center">
        <div className="text-red-500">Failed to load settings</div>
      </div>
    );
  }

  const isWindows = navigator.platform.toLowerCase().includes("win");
  const handleCloseSettings = () => {
    const chatId = settings.LastHomeView === "chat" ? "new" : "launch";
    navigate({ to: "/c/$chatId", params: { chatId } });
  };

  return (
    <main className="flex h-[100dvh] w-full flex-col select-none dark:bg-neutral-900">
      <header
        className="w-full flex flex-none justify-between h-[52px] py-2.5 items-center border-b border-neutral-200 dark:border-neutral-800 select-none"
        onMouseDown={() => window.drag && window.drag()}
        onDoubleClick={() => window.doubleClick && window.doubleClick()}
        data-desktop-only
      >
        <h1
          className={`${isWindows ? "pl-4" : "pl-24"} flex items-center font-rounded text-md font-medium dark:text-white`}
        >
          {isWindows && (
            <button
              onClick={handleCloseSettings}
              className="hover:bg-neutral-100 mr-3 dark:hover:bg-neutral-800 rounded-full p-1.5"
            >
              <ArrowLeftIcon className="w-5 h-5 dark:text-white" />
            </button>
          )}
          Settings
        </h1>
        {!isWindows && (
          <button
            onClick={handleCloseSettings}
            className="p-1 hover:bg-neutral-100 mr-3 dark:hover:bg-neutral-800 rounded-full"
          >
            <XMarkIcon className="w-6 h-6 dark:text-white" />
          </button>
        )}
      </header>
      <div className="w-full p-6 overflow-y-auto flex-1 overscroll-contain">
        <div className="space-y-4 max-w-2xl mx-auto">
          {/* Connect Ollama Account */}
          <div className="overflow-hidden rounded-xl bg-white dark:bg-neutral-800">
            <div className="p-4">
              <Field>
                {isLoading ? (
                  // Loading skeleton, this will only happen if the app started recently
                  <div className="flex items-center justify-between">
                    <div className="space-y-2">
                      <div className="h-4 bg-neutral-200 dark:bg-neutral-700 rounded animate-pulse w-24"></div>
                      <div className="h-3 bg-neutral-200 dark:bg-neutral-700 rounded animate-pulse w-32"></div>
                    </div>
                    <div className="h-10 w-10 bg-neutral-200 dark:bg-neutral-700 rounded-full animate-pulse"></div>
                  </div>
                ) : user && user.name ? (
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center space-x-2">
                        <Label className="text-sm font-medium text-neutral-900 dark:text-white">
                          {user?.name}
                        </Label>
                      </div>
                      <Description className="text-sm text-neutral-500 dark:text-neutral-400">
                        {user?.email}
                      </Description>
                      <div className="flex items-center space-x-2 mt-2">
                        {user?.plan === "free" && (
                          <Button
                            type="button"
                            color="dark"
                            className="px-3 py-2 text-sm font-medium bg-black/90 backdrop-blur-sm text-white rounded-lg border border-white/10 shadow-2xl transition-all duration-300 ease-out relative overflow-hidden group"
                            onClick={() =>
                              window.open(
                                "https://ollama.com/upgrade",
                                "_blank",
                              )
                            }
                          >
                            <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/20 via-purple-500/20 to-green-500/20 opacity-60 group-hover:opacity-80 transition-opacity duration-300"></div>
                            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000 ease-out"></div>
                            <span className="relative z-10 flex items-center space-x-2">
                              <span>Upgrade</span>
                            </span>
                          </Button>
                        )}
                        <Button
                          type="button"
                          color="white"
                          className="px-3 py-2 text-sm"
                          onClick={() =>
                            window.open("https://ollama.com/settings", "_blank")
                          }
                        >
                          Manage
                        </Button>
                        <Button
                          type="button"
                          color="zinc"
                          className="px-3 py-2 text-sm"
                          onClick={() => disconnectUser()}
                        >
                          Sign out
                        </Button>
                      </div>
                    </div>
                    {user?.avatarurl && (
                      <img
                        src={user.avatarurl}
                        alt={user?.name}
                        className="h-10 w-10 rounded-full bg-neutral-200 dark:bg-neutral-700 flex-shrink-0"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.className = "hidden";
                        }}
                      />
                    )}
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Ollama account</Label>
                      <Description>Not connected</Description>
                    </div>
                    <Button
                      type="button"
                      color="white"
                      onClick={handleConnectOllamaAccount}
                      disabled={isRefreshing || isAwaitingConnection}
                    >
                      {isRefreshing || isAwaitingConnection ? (
                        <AnimatedDots />
                      ) : (
                        "Sign In"
                      )}
                    </Button>
                  </div>
                )}
              </Field>
              {connectionError && (
                <div className="mt-3 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                  <Text className="text-sm text-red-600 dark:text-red-400">
                    {connectionError}
                  </Text>
                </div>
              )}
            </div>
          </div>

          {/* API Key (mobile only) */}
          {isNativeMobile() && (
            <div className="overflow-hidden rounded-xl bg-white dark:bg-neutral-800">
              <div className="p-4">
                <Field>
                  <Label>Ollama.com API Key</Label>
                  <Description>Required to use cloud models</Description>
                  {storedKey ? (
                    <div className="mt-2 flex items-center gap-2">
                      <Input
                        value={storedKey.slice(0, 8) + "..."}
                        readOnly
                        className="flex-1"
                      />
                      <Button
                        type="button"
                        color="zinc"
                        onClick={handleClearApiKey}
                      >
                        Clear
                      </Button>
                    </div>
                  ) : (
                    <div className="mt-2 flex items-center gap-2">
                      <Input
                        type="password"
                        placeholder="sk-..."
                        value={apiKeyInput}
                        onChange={(e) => setApiKeyInput(e.target.value)}
                        className="flex-1"
                      />
                      <Button
                        type="button"
                        color="dark"
                        onClick={handleSaveApiKey}
                        disabled={apiKeyValidating || !apiKeyInput.trim()}
                      >
                        {apiKeyValidating ? "..." : "Save"}
                      </Button>
                    </div>
                  )}
                  {apiKeyError && (
                    <div className="mt-2 text-xs text-red-600 dark:text-red-400">
                      {apiKeyError}
                    </div>
                  )}
                </Field>
              </div>
            </div>
          )}

          {/* Custom Models (mobile only) */}
          {isNativeMobile() && (
            <div className="overflow-hidden rounded-xl bg-white dark:bg-neutral-800">
              <div className="p-4 space-y-3">
                <Field>
                  <Label>Custom Models</Label>
                  <Description>
                    Create custom model configurations with system prompts.
                  </Description>
                </Field>

                {customModels.length > 0 && (
                  <div className="space-y-2">
                    {customModels.map((cm) => (
                      <div
                        key={cm.id}
                        className="flex items-center justify-between px-3 py-2 bg-neutral-50 dark:bg-neutral-700/50 rounded-lg"
                      >
                        <div className="min-w-0">
                          <div className="text-sm font-medium truncate">
                            {cm.name}
                          </div>
                          <div className="text-xs text-neutral-500 dark:text-neutral-400 truncate">
                            Base: {cm.baseModel}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                          <Button
                            type="button"
                            color="white"
                            className="px-2 py-1 text-xs"
                            onClick={() => handleEditCustomModel(cm)}
                          >
                            Edit
                          </Button>
                          <Button
                            type="button"
                            color="zinc"
                            className="px-2 py-1 text-xs"
                            onClick={() => handleDeleteCustomModel(cm.id)}
                          >
                            Delete
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {!showCustomModelForm && (
                  <Button
                    type="button"
                    color="dark"
                    className="w-full"
                    onClick={() => {
                      setEditingCustomModel(null);
                      setCustomModelName("");
                      setCustomModelBase("");
                      setCustomModelSystem("");
                      setCustomModelTemp(0.7);
                      setShowCustomModelForm(true);
                    }}
                  >
                    + New Custom Model
                  </Button>
                )}

                {showCustomModelForm && (
                  <div className="space-y-3 pt-2 border-t border-neutral-200 dark:border-neutral-700">
                    <Input
                      placeholder="Model name (e.g. My Assistant)"
                      value={customModelName}
                      onChange={(e) => setCustomModelName(e.target.value)}
                    />
                    <Input
                      placeholder="Base model (e.g. qwen3.5:397b)"
                      value={customModelBase}
                      onChange={(e) => setCustomModelBase(e.target.value)}
                    />
                    <textarea
                      placeholder="System prompt..."
                      value={customModelSystem}
                      onChange={(e) => setCustomModelSystem(e.target.value)}
                      rows={3}
                      className="w-full px-3 py-2 text-sm bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-600 rounded-lg outline-none focus:border-neutral-400 dark:text-white resize-none"
                    />
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-neutral-600 dark:text-neutral-400">
                        Temperature:
                      </span>
                      <input
                        type="range"
                        min={0}
                        max={2}
                        step={0.1}
                        value={customModelTemp}
                        onChange={(e) =>
                          setCustomModelTemp(parseFloat(e.target.value))
                        }
                        className="flex-1"
                      />
                      <span className="text-sm text-neutral-600 dark:text-neutral-400 w-10 text-right">
                        {customModelTemp.toFixed(1)}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        color="white"
                        className="flex-1"
                        onClick={() => {
                          setShowCustomModelForm(false);
                          setEditingCustomModel(null);
                        }}
                      >
                        Cancel
                      </Button>
                      <Button
                        type="button"
                        color="dark"
                        className="flex-1"
                        disabled={
                          !customModelName.trim() || !customModelBase.trim()
                        }
                        onClick={handleSaveCustomModel}
                      >
                        {editingCustomModel ? "Update" : "Create"}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Local Configuration */}
          <div className="relative overflow-hidden rounded-xl bg-white dark:bg-neutral-800">
            <div className="space-y-4 p-4">
              {!isNativeMobile() && (
                <Field>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start space-x-3 flex-1">
                      <CloudIcon className="mt-1 h-5 w-5 flex-shrink-0 text-black dark:text-neutral-100" />
                      <div>
                        <Label>Cloud</Label>
                        <Description>
                          {cloudOverriddenByEnv
                            ? "The OLLAMA_NO_CLOUD environment variable is currently forcing cloud off."
                            : "Enable cloud models and web search."}
                        </Description>
                      </div>
                    </div>
                    <div className="flex-shrink-0">
                      <Switch
                        checked={!cloudDisabled}
                        disabled={cloudToggleDisabled}
                        onChange={(checked) => {
                          if (cloudOverriddenByEnv) {
                            return;
                          }
                          updateCloudMutation.mutate(checked);
                        }}
                      />
                    </div>
                  </div>
                </Field>
              )}

              {isNativeMobile() && (
                <Field>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start space-x-3 flex-1">
                      <CogIcon className="mt-1 h-5 w-5 flex-shrink-0 text-black dark:text-neutral-100" />
                      <div>
                        <Label>Dark mode</Label>
                        <Description>Use dark theme throughout the app.</Description>
                      </div>
                    </div>
                    <div className="flex-shrink-0">
                      <Switch
                        checked={currentTheme === "dark"}
                        onChange={(checked) => {
                          const next: Theme = checked ? "dark" : "light";
                          setCurrentTheme(next);
                          setStoredTheme(next);
                        }}
                      />
                    </div>
                  </div>
                </Field>
              )}

              {!isNativeMobile() && (
                <>
                  {/* Auto Update */}
                  <Field>
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start space-x-3 flex-1">
                        <ArrowDownTrayIcon className="mt-1 h-5 w-5 flex-shrink-0 text-black dark:text-neutral-100" />
                        <div>
                          <Label>Auto-download updates</Label>
                          <Description>
                            {settings.AutoUpdateEnabled
                              ? "Automatically download updates when available."
                              : "Updates will not be downloaded automatically."}
                          </Description>
                        </div>
                      </div>
                      <div className="flex-shrink-0">
                        <Switch
                          checked={settings.AutoUpdateEnabled}
                          onChange={(checked) => handleChange("AutoUpdateEnabled", checked)}
                        />
                      </div>
                    </div>
                  </Field>

                  {/* Expose Ollama */}
                  <Field>
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start space-x-3 flex-1">
                        <WifiIcon className="mt-1 h-5 w-5 flex-shrink-0 text-black dark:text-neutral-100" />
                        <div>
                          <Label>Expose Ollama to the network</Label>
                          <Description>
                            Allow other devices or services to access Ollama.
                          </Description>
                        </div>
                      </div>
                      <div className="flex-shrink-0">
                        <Switch
                          checked={settings.Expose}
                          onChange={(checked) => handleChange("Expose", checked)}
                        />
                      </div>
                    </div>
                  </Field>

                  {/* Model Directory */}
                  <Field>
                    <div className="flex items-start space-x-3">
                      <FolderIcon className="mt-1 h-5 w-5 flex-shrink-0 text-black dark:text-neutral-100" />
                      <div className="w-full">
                        <Label>Model location</Label>
                        <Description>Location where models are stored.</Description>
                        <div className="mt-2 flex items-center space-x-2">
                          <Input
                            value={settings.Models || ""}
                            onChange={(e) => handleChange("Models", e.target.value)}
                            readOnly
                          />
                          <Button
                            type="button"
                            color="white"
                            className="px-2"
                            onClick={async () => {
                              if (window.webview?.selectModelsDirectory) {
                                try {
                                  const directory =
                                    await window.webview.selectModelsDirectory();
                                  if (directory) {
                                    handleChange("Models", directory);
                                  }
                                } catch (error) {
                                  console.error(
                                    "Error selecting models directory:",
                                    error,
                                  );
                                }
                              }
                            }}
                          >
                            <FolderIcon className="w-4 h-4 mr-1" />
                            Browse
                          </Button>
                        </div>
                      </div>
                    </div>
                  </Field>

                  {/* Context Length */}
                  <Field>
                    <div className="flex items-start space-x-3">
                      <CogIcon className="mt-1 h-5 w-5 flex-shrink-0 text-black dark:text-neutral-100" />
                      <div className="w-full">
                        <Label>Context length</Label>
                        <Description>
                          Context length determines how much of your conversation
                          local LLMs can remember and use to generate responses.
                        </Description>
                        <div className="mt-3">
                          <Slider
                            value={settings.ContextLength || defaultContextLength || 0}
                            onChange={(value) => {
                              handleChange("ContextLength", value);
                            }}
                            disabled={!defaultContextLength}
                            options={[
                              { value: 4096, label: "4k" },
                              { value: 8192, label: "8k" },
                              { value: 16384, label: "16k" },
                              { value: 32768, label: "32k" },
                              { value: 65536, label: "64k" },
                              { value: 131072, label: "128k" },
                              { value: 262144, label: "256k" },
                            ]}
                          />
                        </div>
                      </div>
                    </div>
                  </Field>
                </>
              )}
            </div>
          </div>

          {/* Agent Mode */}
          {!isNativeMobile() && window.OLLAMA_TOOLS && (
            <div className="overflow-hidden rounded-xl bg-white dark:bg-neutral-800">
              <div className="space-y-4 p-4">
                <Field>
                  <div className="flex items-center justify-between">
                    <div className="flex items-start space-x-3">
                      <BoltIcon className="mt-1 h-5 w-5 flex-shrink-0 text-black dark:text-neutral-100" />
                      <div>
                        <Label>Enable Agent Mode</Label>
                        <Description>
                          Use multi-turn tools to fulfill user requests
                        </Description>
                      </div>
                    </div>
                    <Switch
                      checked={settings.Agent}
                      onChange={(checked) => handleChange("Agent", checked)}
                    />
                  </div>
                </Field>

                {/* Tools Mode */}
                <Field>
                  <div className="flex items-center justify-between">
                    <div className="flex items-start space-x-3">
                      <WrenchIcon className="mt-1 h-5 w-5 flex-shrink-0 text-black dark:text-neutral-100" />
                      <div>
                        <Label>Enable Tools Mode</Label>
                        <Description>
                          Use single-turn tools to fulfill user requests
                        </Description>
                      </div>
                    </div>
                    <Switch
                      checked={settings.Tools}
                      onChange={(checked) => handleChange("Tools", checked)}
                    />
                  </div>
                </Field>
              </div>
            </div>
          )}

          {/* Reset button */}
          {!isNativeMobile() && (
            <div className="mt-6 flex justify-end px-4">
              <Button
                type="button"
                color="white"
                className="px-3"
                onClick={handleResetToDefaults}
              >
                Reset to defaults
              </Button>
            </div>
          )}
        </div>

        {/* Saved indicator */}
        {(showSaved || restartMessage) && (
          <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 transition-opacity duration-300 z-50">
            <Badge
              color="green"
              className="!bg-green-500 !text-white dark:!bg-green-600"
            >
              Saved
            </Badge>
          </div>
        )}
      </div>
    </main>
  );
}
