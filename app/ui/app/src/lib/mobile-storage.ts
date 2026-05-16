import { ChatInfo, Chat, Settings } from "@/gotypes";

const CHATS_KEY = "ollama_chats";
const CHAT_PREFIX = "ollama_chat_";
const SETTINGS_KEY = "ollama_settings";
const CUSTOM_MODELS_KEY = "ollama_custom_models";

function safeParse<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function safeSet(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or disabled
  }
}

export function loadChats(): ChatInfo[] {
  const items = safeParse<any[]>(CHATS_KEY, []);
  return items.map((i) => new ChatInfo(i));
}

export function saveChats(chats: ChatInfo[]) {
  safeSet(
    CHATS_KEY,
    chats.map((c) => ({
      id: c.id,
      title: c.title,
      userExcerpt: c.userExcerpt,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
    })),
  );
}

export function loadChat(chatId: string): Chat | null {
  const raw = safeParse<any>(`${CHAT_PREFIX}${chatId}`, null);
  if (!raw) return null;
  return new Chat(raw);
}

export function saveChat(chat: Chat) {
  safeSet(`${CHAT_PREFIX}${chat.id}`, {
    id: chat.id,
    title: chat.title,
    messages: chat.messages.map((m) => ({
      role: m.role,
      content: m.content,
      thinking: m.thinking,
      stream: m.stream,
      model: m.model,
      attachments: m.attachments,
      created_at: m.created_at,
      updated_at: m.updated_at,
    })),
    created_at: chat.created_at,
  });
}

export function deleteChat(chatId: string) {
  localStorage.removeItem(`${CHAT_PREFIX}${chatId}`);
  const chats = loadChats();
  saveChats(chats.filter((c) => c.id !== chatId));
}

export function renameChat(chatId: string, title: string) {
  const chats = loadChats();
  const chat = chats.find((c) => c.id === chatId);
  if (chat) {
    chat.title = title;
    saveChats(chats);
  }
  const fullChat = loadChat(chatId);
  if (fullChat) {
    fullChat.title = title;
    saveChat(fullChat);
  }
}

export function createChat(title = "New Chat"): Chat {
  const id = crypto.randomUUID();
  const chat = new Chat({
    id,
    title,
    messages: [],
    created_at: new Date().toISOString(),
  });
  saveChat(chat);
  const chats = loadChats();
  chats.unshift(
    new ChatInfo({
      id,
      title,
      userExcerpt: "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }),
  );
  saveChats(chats);
  return chat;
}

export function loadSettings(): Partial<Settings> {
  return safeParse<Partial<Settings>>(SETTINGS_KEY, {});
}

export function saveSettings(settings: Partial<Settings>) {
  safeSet(SETTINGS_KEY, settings);
}

export interface CustomModel {
  id: string;
  name: string;
  baseModel: string;
  systemPrompt: string;
  temperature?: number;
  createdAt: string;
}

export function loadCustomModels(): CustomModel[] {
  return safeParse<CustomModel[]>(CUSTOM_MODELS_KEY, []);
}

export function saveCustomModel(model: CustomModel) {
  const models = loadCustomModels();
  const idx = models.findIndex((m) => m.id === model.id);
  if (idx >= 0) {
    models[idx] = model;
  } else {
    models.push(model);
  }
  safeSet(CUSTOM_MODELS_KEY, models);
}

export function deleteCustomModel(id: string) {
  const models = loadCustomModels().filter((m) => m.id !== id);
  safeSet(CUSTOM_MODELS_KEY, models);
}
