import {
  ChatResponse,
  ChatsResponse,
  ChatEvent,
  DownloadEvent,
  ErrorEvent,
  InferenceComputeResponse,
  ModelCapabilitiesResponse,
  Model,
  ChatRequest,
  Settings,
  User,
  Message,
  File,
} from "@/gotypes";
import { parseJsonlFromResponse } from "./util/jsonl-parsing";
import { ollamaClient as ollama } from "./lib/ollama-client";
import type { ModelResponse } from "ollama/browser";
import { API_BASE, OLLAMA_DOT_COM } from "./lib/config";
import { CapacitorHttp } from "@capacitor/core";
import { isNativeMobile } from "@/utils/mobile";
import {
  loadChats,
  loadChat,
  loadSettings,
  saveSettings,
  renameChat as storageRenameChat,
  deleteChat as storageDeleteChat,
  createChat,
  saveChat,
  loadCustomModels,
} from "./lib/mobile-storage";
import {
  getApiKey,
  clearApiKey,
  fetchModels as cloudFetchModels,
  sendChatMessage,
} from "./lib/ollama-cloud";

// Patch fetch on mobile to route through CapacitorHttp, bypassing CORS
if (isNativeMobile()) {
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    let headers: Record<string, string> = {};
    if (init?.headers) {
      if (init.headers instanceof Headers) {
        init.headers.forEach((v, k) => {
          headers[k] = v;
        });
      } else if (Array.isArray(init.headers)) {
        init.headers.forEach(([k, v]) => {
          headers[k] = v;
        });
      } else {
        headers = init.headers as Record<string, string>;
      }
    }
    try {
      const res = await CapacitorHttp.request({
        method: (init?.method as any) || "GET",
        url,
        headers,
        data: init?.body,
      });
      const body =
        typeof res.data === "string" ? res.data : JSON.stringify(res.data);
      return new Response(body, {
        status: res.status,
        headers: res.headers,
      });
    } catch (err) {
      throw new TypeError(`Failed to fetch: ${err}`);
    }
  };
}

// Extend Model class with utility methods
declare module "@/gotypes" {
  interface Model {
    isCloud(): boolean;
  }
}

Model.prototype.isCloud = function (): boolean {
  return this.model.endsWith("cloud");
};

export type CloudStatusSource = "env" | "config" | "both" | "none";
export interface CloudStatusResponse {
  disabled: boolean;
  source: CloudStatusSource;
}

// Helper function to convert Uint8Array to base64
function uint8ArrayToBase64(uint8Array: Uint8Array): string {
  const chunkSize = 0x8000; // 32KB chunks to avoid stack overflow
  let binary = "";

  for (let i = 0; i < uint8Array.length; i += chunkSize) {
    const chunk = uint8Array.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

export async function fetchUser(): Promise<User | null> {
  if (isNativeMobile()) {
    const key = await getApiKey();
    return key
      ? new User({ id: "mobile", email: "", name: "Mobile User" })
      : null;
  }

  const response = await fetch(`${API_BASE}/api/me`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (response.ok) {
    const userData: User = await response.json();

    if (userData.avatarurl && !userData.avatarurl.startsWith("http")) {
      userData.avatarurl = `${OLLAMA_DOT_COM}${userData.avatarurl}`;
    }

    return userData;
  }

  if (response.status === 401 || response.status === 403) {
    return null;
  }

  throw new Error(`Failed to fetch user: ${response.status}`);
}

export async function fetchConnectUrl(): Promise<string> {
  if (isNativeMobile()) {
    return "";
  }

  const response = await fetch(`${API_BASE}/api/me`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (response.status === 401) {
    const data = await response.json();
    if (data.signin_url) {
      return data.signin_url;
    }
  }

  throw new Error("Failed to fetch connect URL");
}

export async function disconnectUser(): Promise<void> {
  if (isNativeMobile()) {
    await clearApiKey();
    return;
  }

  const response = await fetch(`${API_BASE}/api/signout`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error("Failed to disconnect user");
  }
}

export async function getChats(): Promise<ChatsResponse> {
  if (isNativeMobile()) {
    const chatInfos = loadChats();
    return new ChatsResponse({ chatInfos });
  }

  const response = await fetch(`${API_BASE}/api/v1/chats`);
  const data = await response.json();
  return new ChatsResponse(data);
}

export async function getChat(chatId: string): Promise<ChatResponse> {
  if (isNativeMobile()) {
    const chat = loadChat(chatId);
    if (!chat) {
      throw new Error("Chat not found");
    }
    // Recover any interrupted assistant response
    const pendingRaw = localStorage.getItem(`ollama_pending_${chatId}`);
    if (pendingRaw) {
      try {
        const pending = JSON.parse(pendingRaw);
        const lastMsg = chat.messages?.[chat.messages.length - 1];
        const alreadyRecovered =
          lastMsg &&
          lastMsg.role === "assistant" &&
          lastMsg.content === pending.content;
        if (!alreadyRecovered) {
          chat.messages.push(
            new Message({
              role: "assistant",
              content: pending.content || "",
              thinking: pending.thinking || "",
              model: pending.model || "",
            }),
          );
          saveChat(chat);
        }
      } catch {
        // ignore parse errors
      }
      localStorage.removeItem(`ollama_pending_${chatId}`);
    }
    return new ChatResponse({ chat });
  }

  const response = await fetch(`${API_BASE}/api/v1/chat/${chatId}`);
  const data = await response.json();
  return new ChatResponse(data);
}

export async function getModels(query?: string): Promise<Model[]> {
  if (isNativeMobile()) {
    const apiKey = await getApiKey();
    if (!apiKey) return [];
    const models = await cloudFetchModels(apiKey);
    const customModels = loadCustomModels();
    const allModels = [
      ...models,
      ...customModels.map(
        (cm) =>
          new Model({
            model: cm.name,
            digest: `custom-${cm.id}`,
            modified_at: new Date(cm.createdAt),
          }),
      ),
    ];
    if (query) {
      const q = query.toLowerCase().trim();
      return allModels.filter((m) => m.model.toLowerCase().startsWith(q));
    }
    return allModels;
  }

  try {
    const { models: modelsResponse } = await ollama.list();

    let models: Model[] = modelsResponse
      .filter((m: ModelResponse) => {
        const families = m.details?.families;

        if (!families || families.length === 0) {
          return true;
        }

        const isBertOnly = families.every((family: string) =>
          family.toLowerCase().includes("bert"),
        );

        return !isBertOnly;
      })
      .map((m: ModelResponse) => {
        // Remove the latest tag from the returned model
        const modelName = m.name.replace(/:latest$/, "");

        return new Model({
          model: modelName,
          digest: m.digest,
          modified_at: m.modified_at ? new Date(m.modified_at) : undefined,
        });
      });

    // Filter by query if provided
    if (query) {
      const normalizedQuery = query.toLowerCase().trim();

      const filteredModels = models.filter((m: Model) => {
        return m.model.toLowerCase().startsWith(normalizedQuery);
      });

      let exactMatch = false;
      for (const m of filteredModels) {
        if (m.model.toLowerCase() === normalizedQuery) {
          exactMatch = true;
          break;
        }
      }

      // Add query if it's in the registry and not already in the list
      if (!exactMatch) {
        const result = await getModelUpstreamInfo(new Model({ model: query }));
        const existsUpstream = result.exists;
        if (existsUpstream) {
          filteredModels.push(new Model({ model: query }));
        }
      }

      models = filteredModels;
    }

    return models;
  } catch (err) {
    throw new Error(`Failed to fetch models: ${err}`);
  }
}

export async function getModelCapabilities(
  modelName: string,
): Promise<ModelCapabilitiesResponse> {
  if (isNativeMobile()) {
    // Cloud models on ollama.com typically support tools and vision
    return new ModelCapabilitiesResponse({ capabilities: ["tools", "vision"] });
  }

  try {
    const showResponse = await ollama.show({ model: modelName });

    return new ModelCapabilitiesResponse({
      capabilities: Array.isArray(showResponse.capabilities)
        ? showResponse.capabilities
        : [],
    });
  } catch (error) {
    // Model might not be downloaded yet, return empty capabilities
    console.error(`Failed to get capabilities for ${modelName}:`, error);
    return new ModelCapabilitiesResponse({ capabilities: [] });
  }
}

export type ChatEventUnion = ChatEvent | DownloadEvent | ErrorEvent;

export async function* sendMessage(
  chatId: string,
  message: string,
  model: Model,
  attachments?: Array<{ filename: string; data: Uint8Array }>,
  signal?: AbortSignal,
  index?: number,
  webSearch?: boolean,
  fileTools?: boolean,
  forceUpdate?: boolean,
  think?: boolean | string,
): AsyncGenerator<ChatEventUnion> {
  if (isNativeMobile()) {
    let effectiveChatId = chatId;

    // Create new chat locally if needed
    if (chatId === "new") {
      const chat = createChat();
      effectiveChatId = chat.id;
      yield new ChatEvent({
        eventName: "chat_created",
        chatId: effectiveChatId,
      });
    }

    // Recover any interrupted assistant response before starting new stream
    const pendingRaw = localStorage.getItem(`ollama_pending_${effectiveChatId}`);
    if (pendingRaw) {
      try {
        const pending = JSON.parse(pendingRaw);
        const chatRecover = loadChat(effectiveChatId);
        if (chatRecover) {
          const lastMsg = chatRecover.messages?.[chatRecover.messages.length - 1];
          const alreadyRecovered =
            lastMsg &&
            lastMsg.role === "assistant" &&
            lastMsg.content === pending.content;
          if (!alreadyRecovered) {
            chatRecover.messages.push(
              new Message({
                role: "assistant",
                content: pending.content || "",
                thinking: pending.thinking || "",
                model: pending.model || "",
              }),
            );
            saveChat(chatRecover);
          }
        }
      } catch {
        // ignore parse errors
      }
      localStorage.removeItem(`ollama_pending_${effectiveChatId}`);
    }

    // Persist user message to localStorage
    const chat = loadChat(effectiveChatId);
    if (chat) {
      const userMsg = new Message({
        role: "user",
        content: message,
        attachments: attachments?.map(
          (a) =>
            new File({
              filename: a.filename,
              data: Array.from(a.data),
            }),
        ),
      });
      chat.messages = chat.messages || [];
      if (
        index !== undefined &&
        index >= 0 &&
        index < chat.messages.length
      ) {
        chat.messages = chat.messages.slice(0, index);
      }
      chat.messages.push(userMsg);
      saveChat(chat);
    }

    // Detect custom model and extract its config
    const customModels = loadCustomModels();
    const customModel = customModels.find((cm) => cm.name === model.model);
    const baseModel = customModel ? customModel.baseModel : model.model;

    // Stream from ollama.com
    const events = sendChatMessage({
      chatId: effectiveChatId,
      message,
      model: baseModel,
      attachments,
      signal,
      index,
      think,
      webSearch,
      systemPrompt: customModel?.systemPrompt,
      temperature: customModel?.temperature,
    });

    let assistantContent = "";
    for await (const event of events) {
      if (event.eventName === "chat" && event.content) {
        assistantContent += event.content;
      }
      yield event;
    }

    // Persist assistant message to localStorage
    if (chat) {
      chat.messages.push(
        new Message({
          role: "assistant",
          content: assistantContent,
          model: model.model,
        }),
      );
      saveChat(chat);
    }

    // Update chat list title from first user message
    if (chat && chat.title === "New Chat" && chat.messages.length > 0) {
      const firstUser = chat.messages.find((m) => m.role === "user");
      if (firstUser) {
        const title = firstUser.content.slice(0, 40) || "Chat";
        storageRenameChat(chat.id, title);
      }
    }

    return;
  }

  // Convert Uint8Array to base64 for JSON serialization
  const serializedAttachments = attachments?.map((att) => ({
    filename: att.filename,
    data: uint8ArrayToBase64(att.data),
  }));

  // Send think parameter when it's explicitly set (true, false, or a non-empty string).
  const shouldSendThink =
    think !== undefined &&
    (typeof think === "boolean" || (typeof think === "string" && think !== ""));

  const response = await fetch(`${API_BASE}/api/v1/chat/${chatId}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(
      new ChatRequest({
        model: model.model,
        prompt: message,
        ...(index !== undefined ? { index } : {}),
        ...(serializedAttachments !== undefined
          ? { attachments: serializedAttachments }
          : {}),
        // Always send web_search as a boolean value (default to false)
        web_search: webSearch ?? false,
        file_tools: fileTools ?? false,
        ...(forceUpdate !== undefined ? { forceUpdate } : {}),
        ...(shouldSendThink ? { think } : {}),
      }),
    ),
    signal,
  });

  for await (const event of parseJsonlFromResponse<ChatEventUnion>(response)) {
    switch (event.eventName) {
      case "download":
        yield new DownloadEvent(event);
        break;
      case "error":
        yield new ErrorEvent(event);
        break;
      default:
        yield new ChatEvent(event);
        break;
    }
  }
}

export async function getSettings(): Promise<{
  settings: Settings;
}> {
  if (isNativeMobile()) {
    const stored = loadSettings();
    return {
      settings: new Settings({
        TurboEnabled: false,
        WebSearchEnabled: false,
        ThinkEnabled: false,
        ThinkLevel: "none",
        SelectedModel: "",
        SidebarOpen: false,
        LastHomeView: "launch",
        AutoUpdateEnabled: false,
        ...stored,
      }),
    };
  }

  const response = await fetch(`${API_BASE}/api/v1/settings`);
  if (!response.ok) {
    throw new Error("Failed to fetch settings");
  }
  const data = await response.json();
  return {
    settings: new Settings(data.settings),
  };
}

export async function updateSettings(settings: Settings): Promise<{
  settings: Settings;
}> {
  if (isNativeMobile()) {
    saveSettings({
      TurboEnabled: settings.TurboEnabled,
      WebSearchEnabled: settings.WebSearchEnabled,
      ThinkEnabled: settings.ThinkEnabled,
      ThinkLevel: settings.ThinkLevel,
      SelectedModel: settings.SelectedModel,
      SidebarOpen: settings.SidebarOpen,
      LastHomeView: settings.LastHomeView,
      AutoUpdateEnabled: settings.AutoUpdateEnabled,
    });
    return { settings };
  }

  const response = await fetch(`${API_BASE}/api/v1/settings`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(settings),
  });
  if (!response.ok) {
    const error = await response.text();
    throw new Error(error || "Failed to update settings");
  }
  const data = await response.json();
  return {
    settings: new Settings(data.settings),
  };
}

export async function updateCloudSetting(
  enabled: boolean,
): Promise<CloudStatusResponse> {
  if (isNativeMobile()) {
    return { disabled: false, source: "none" };
  }

  const response = await fetch(`${API_BASE}/api/v1/cloud`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ enabled }),
  });
  if (!response.ok) {
    const error = await response.text();
    throw new Error(error || "Failed to update cloud setting");
  }

  const data = await response.json();
  return {
    disabled: Boolean(data.disabled),
    source: (data.source as CloudStatusSource) || "none",
  };
}

export async function renameChat(chatId: string, title: string): Promise<void> {
  if (isNativeMobile()) {
    storageRenameChat(chatId, title);
    return;
  }

  const response = await fetch(`${API_BASE}/api/v1/chat/${chatId}/rename`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ title: title.trim() }),
  });
  if (!response.ok) {
    const error = await response.text();
    throw new Error(error || "Failed to rename chat");
  }
}

export async function deleteChat(chatId: string): Promise<void> {
  if (isNativeMobile()) {
    storageDeleteChat(chatId);
    return;
  }

  const response = await fetch(`${API_BASE}/api/v1/chat/${chatId}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    const error = await response.text();
    throw new Error(error || "Failed to delete chat");
  }
}

// Get upstream information for model staleness checking
export async function getModelUpstreamInfo(
  model: Model,
): Promise<{ stale: boolean; exists: boolean; error?: string }> {
  if (isNativeMobile()) {
    return { stale: false, exists: true };
  }

  try {
    const response = await fetch(`${API_BASE}/api/v1/model/upstream`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: model.model,
      }),
    });

    if (!response.ok) {
      console.warn(
        `Failed to check upstream for ${model.model}: ${response.status}`,
      );
      return { stale: false, exists: false };
    }

    const data = await response.json();

    if (data.error) {
      console.warn(`Upstream check: ${data.error}`);
      return { stale: false, exists: false, error: data.error };
    }

    return { stale: !!data.stale, exists: true };
  } catch (error) {
    console.warn(`Error checking model staleness:`, error);
    return { stale: false, exists: false };
  }
}

export async function* pullModel(
  modelName: string,
  signal?: AbortSignal,
): AsyncGenerator<{
  status: string;
  digest?: string;
  total?: number;
  completed?: number;
  done?: boolean;
}> {
  if (isNativeMobile()) {
    // No local model pulling on mobile
    return;
  }

  const response = await fetch(`${API_BASE}/api/v1/models/pull`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name: modelName }),
    signal,
  });

  if (!response.ok) {
    throw new Error(`Failed to pull model: ${response.statusText}`);
  }

  for await (const event of parseJsonlFromResponse<{
    status: string;
    digest?: string;
    total?: number;
    completed?: number;
    done?: boolean;
  }>(response)) {
    yield event;
  }
}

export interface ModelRecommendation {
  model: string;
  description: string;
  context_length?: number;
  max_output_tokens?: number;
  vram_bytes?: number;
}

export interface ModelRecommendationsResponse {
  recommendations: ModelRecommendation[];
}

export async function getModelRecommendations(): Promise<ModelRecommendation[]> {
  if (isNativeMobile()) {
    return [];
  }

  const response = await fetch(
    `${API_BASE}/api/experimental/model-recommendations`,
  );
  if (!response.ok) {
    throw new Error(
      `Failed to fetch model recommendations: ${response.statusText}`,
    );
  }
  const data: ModelRecommendationsResponse = await response.json();
  return data.recommendations || [];
}

export async function getInferenceCompute(): Promise<InferenceComputeResponse> {
  if (isNativeMobile()) {
    return new InferenceComputeResponse({
      inferenceComputes: [],
      defaultContextLength: 4096,
    });
  }

  const response = await fetch(`${API_BASE}/api/v1/inference-compute`);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch inference compute: ${response.statusText}`,
    );
  }

  const data = await response.json();
  return new InferenceComputeResponse(data);
}

export async function fetchHealth(): Promise<boolean> {
  if (isNativeMobile()) {
    return true;
  }

  try {
    // Use the /api/version endpoint as a health check
    const response = await fetch(`${API_BASE}/api/version`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (response.ok) {
      const data = await response.json();
      // If we get a version back, the server is healthy
      return !!data.version;
    }

    return false;
  } catch (error) {
    console.error("Error checking health:", error);
    return false;
  }
}

export async function getCloudStatus(): Promise<CloudStatusResponse | null> {
  if (isNativeMobile()) {
    return { disabled: false, source: "none" };
  }

  const response = await fetch(`${API_BASE}/api/v1/cloud`);
  if (!response.ok) {
    throw new Error(`Failed to fetch cloud status: ${response.status}`);
  }

  const data = await response.json();
  return {
    disabled: Boolean(data.disabled),
    source: (data.source as CloudStatusSource) || "none",
  };
}
