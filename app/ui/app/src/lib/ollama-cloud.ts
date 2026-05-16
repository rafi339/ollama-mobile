import { CapacitorHttp } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";
import { ChatEvent, ErrorEvent, Model } from "@/gotypes";
import { loadChat } from "./mobile-storage";

const API_BASE = "https://ollama.com/api";
const PREF_KEY = "ollama_api_key";

// Use Capacitor Preferences for secure API key storage
let _apiKey: string | null = null;
let _apiKeyLoaded = false;

export async function getApiKey(): Promise<string | null> {
  if (_apiKeyLoaded) return _apiKey;
  const { value } = await Preferences.get({ key: PREF_KEY });
  _apiKey = value;
  _apiKeyLoaded = true;
  return value;
}

export async function setApiKey(key: string) {
  await Preferences.set({ key: PREF_KEY, value: key });
  _apiKey = key;
  _apiKeyLoaded = true;
}

export async function clearApiKey() {
  await Preferences.remove({ key: PREF_KEY });
  _apiKey = null;
  _apiKeyLoaded = true;
}

export async function validateApiKey(key: string): Promise<boolean> {
  try {
    const res = await CapacitorHttp.request({
      method: "GET",
      url: `${API_BASE}/tags`,
      headers: {
        Authorization: `Bearer ${key}`,
      },
    });
    return res.status >= 200 && res.status < 300;
  } catch {
    return false;
  }
}

export async function fetchModels(apiKey: string): Promise<Model[]> {
  const res = await CapacitorHttp.request({
    method: "GET",
    url: `${API_BASE}/tags`,
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`Failed to fetch models: ${res.status}`);
  }
  const data =
    typeof res.data === "string" ? JSON.parse(res.data) : res.data;
  const models: Model[] = (data.models || []).map(
    (m: any) =>
      new Model({
        model: m.name?.replace(/:latest$/, "") || m.name,
        digest: m.digest,
        modified_at: m.modified_at,
      }),
  );
  return models;
}

interface SearchResult {
  title: string;
  snippet: string;
  url: string;
}

function cleanSearchQuery(raw: string): string {
  const prefixes = [
    /^do a web search (about|for)\s*/i,
    /^search the web (about|for)\s*/i,
    /^look up\s*/i,
    /^find information (about|on)\s*/i,
    /^search (about|for)\s*/i,
    /^google\s*/i,
    /^tell me (about|what you know about)\s*/i,
    /^what is\s*/i,
    /^who is\s*/i,
    /^how to\s*/i,
  ];
  let q = raw.trim();
  for (const re of prefixes) {
    q = q.replace(re, "");
  }
  return q.trim() || raw.trim();
}

async function performWebSearch(query: string): Promise<SearchResult[]> {
  const q = cleanSearchQuery(query);
  if (!q || q.length < 2) return [];

  const apiKey = await getApiKey();
  if (!apiKey) return [];

  try {
    const res = await CapacitorHttp.request({
      method: "POST",
      url: `${API_BASE}/web_search`,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      data: JSON.stringify({ query: q, max_results: 5 }),
    });

    if (res.status < 200 || res.status >= 300) {
      return [];
    }

    const data =
      typeof res.data === "string" ? JSON.parse(res.data) : res.data;
    const results: SearchResult[] = [];
    if (Array.isArray(data.results)) {
      for (const r of data.results) {
        if (r.title && r.url) {
          results.push({
            title: r.title,
            snippet: r.content || r.title,
            url: r.url,
          });
        }
        if (results.length >= 5) break;
      }
    }
    return results;
  } catch {
    return [];
  }
}

function buildSearchContext(
  results: SearchResult[],
  query: string,
): string {
  const lines = [
    `The user asked: "${query}"`,
    "",
    "INSTRUCTION: You have web search enabled. You MUST use the search results below to answer the user's question. Do NOT say you cannot browse the web — the search results are already provided to you. Synthesize the information from the results and cite sources.",
    "",
  ];
  if (results.length === 0) {
    lines.push(
      "No web search results were found for this query. Answer based on your training knowledge, but mention that no current web results were available.",
    );
    return lines.join("\n");
  }
  lines.push("Here are the latest web search results to help answer:");
  lines.push("");
  for (const r of results) {
    lines.push(`Title: ${r.title}`);
    lines.push(`URL: ${r.url}`);
    lines.push(`Snippet: ${r.snippet}`);
    lines.push("");
  }
  lines.push(
    "Based on the above search results, provide an accurate and up-to-date answer. Cite sources using [1], [2], etc.",
  );
  return lines.join("\n");
}

interface SendChatParams {
  chatId: string;
  message: string;
  model: string;
  attachments?: Array<{ filename: string; data: Uint8Array }>;
  signal?: AbortSignal;
  index?: number;
  think?: boolean | string;
  webSearch?: boolean;
  systemPrompt?: string;
  temperature?: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseThinking(content: string): {
  thinking: string;
  rest: string;
} {
  const startTag = "<thinking>";
  const endTag = "</thinking>";
  const startIdx = content.indexOf(startTag);
  if (startIdx === -1) {
    return { thinking: "", rest: content };
  }
  const endIdx = content.indexOf(endTag, startIdx + startTag.length);
  if (endIdx === -1) {
    return { thinking: "", rest: content };
  }
  const thinking = content.slice(
    startIdx + startTag.length,
    endIdx,
  );
  const rest =
    content.slice(0, startIdx).trim() +
    "\n\n" +
    content.slice(endIdx + endTag.length).trim();
  return { thinking: thinking.trim(), rest: rest.trim() };
}

function cleanCitations(text: string): string {
  // Strip broken citation markers like 【1†lines-1-13】
  return text.replace(/【\d+†[^】]+】/g, "");
}

async function* streamChunks(
  text: string,
  chunkSize: number,
  delayMs: number,
): AsyncGenerator<string> {
  for (let i = 0; i < text.length; i += chunkSize) {
    yield text.slice(i, i + chunkSize);
    await sleep(delayMs);
  }
}

export async function* sendChatMessage(
  params: SendChatParams,
): AsyncGenerator<ChatEvent | ErrorEvent> {
  const apiKey = await getApiKey();
  if (!apiKey) {
    throw new Error("No API key configured");
  }

  // Load existing chat history
  const chat = loadChat(params.chatId);
  const messages: Array<{
    role: string;
    content: string;
    images?: string[];
    tool_calls?: Array<{
      id?: string;
      type?: string;
      function: { name: string; arguments: string };
    }>;
    name?: string;
  }> = [];

  // Inject custom model system prompt as first system message
  if (params.systemPrompt) {
    messages.push({ role: "system", content: params.systemPrompt });
  }

  if (chat && chat.messages) {
    let msgs = chat.messages;
    // If editing at an index, truncate
    if (
      params.index !== undefined &&
      params.index >= 0 &&
      params.index < msgs.length
    ) {
      msgs = msgs.slice(0, params.index);
    }
    for (const m of msgs) {
      messages.push({ role: m.role, content: m.content });
    }
  }

  // Web search tool will be used only if model calls it

  // Build user message with optional image attachments
  const userMessage: {
    role: string;
    content: string;
    images?: string[];
  } = { role: "user", content: params.message };

  if (params.attachments && params.attachments.length > 0) {
    userMessage.images = params.attachments.map((att) => {
      // Convert Uint8Array to base64
      const binary = Array.from(att.data)
        .map((b) => String.fromCharCode(b))
        .join("");
      return btoa(binary);
    });
  }

  // Prompt-based web search: model outputs <web>query</web> to trigger search
  let currentMessages = [...messages];
  let finalContent = "";
  let finalThinking = "";
  let finalRest = "";

  if (params.webSearch) {
    const systemPrompt =
      "You have access to a web search tool. When you need current information or want to verify facts, output EXACTLY: <web>your search query</web> on its own line. Do NOT answer the question yet. Only output the tag.";
    currentMessages.push({ role: "system", content: systemPrompt });
  }

  async function callChatAPI(msgs: typeof messages): Promise<any> {
    const reqBody: Record<string, unknown> = {
      model: params.model,
      messages: msgs,
      stream: false,
    };
    if (params.temperature !== undefined) {
      reqBody.options = { temperature: params.temperature };
    }
    if (
      params.think !== undefined &&
      (typeof params.think === "boolean" ||
        (typeof params.think === "string" && params.think !== ""))
    ) {
      reqBody.think = params.think;
    }

    const body = JSON.stringify(reqBody);
    const res = await CapacitorHttp.request({
      method: "POST",
      url: `${API_BASE}/chat`,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      data: body,
    });

    if (res.status < 200 || res.status >= 300) {
      const errText =
        typeof res.data === "string" ? res.data : JSON.stringify(res.data);
      throw new Error(errText || `HTTP ${res.status}`);
    }

    return typeof res.data === "string" ? JSON.parse(res.data) : res.data;
  }

  // Multi-turn search loop: model can search as many times as needed
  let loopCount = 0;
  try {
    while (loopCount < 5) {
      loopCount++;
      const data = await callChatAPI(currentMessages);
      if (data.error) throw new Error(data.error);

      const draftContent = data.message?.content || "";

      // Check if model wants to search (only honor if toggle is ON)
      const webTagRegex = /<web>([\s\S]*?)<\/web>/;
      const match = params.webSearch ? draftContent.match(webTagRegex) : null;

      if (match) {
        const searchQuery = match[1].trim();

        yield new ChatEvent({
          eventName: "thinking",
          thinking: `Searching the web for "${searchQuery.slice(0, 60)}"...`,
          thinkingTimeStart: new Date(),
        });

        const searchResults = await performWebSearch(searchQuery);

        if (searchResults.length > 0) {
          const context = buildSearchContext(searchResults, searchQuery);
          yield new ChatEvent({
            eventName: "thinking",
            thinking: `Found ${searchResults.length} search result${searchResults.length > 1 ? "s" : ""} for "${searchQuery.slice(0, 60)}"`,
            thinkingTimeStart: new Date(),
          });
          currentMessages.push({
            role: "assistant",
            content: draftContent,
          });
          currentMessages.push({
            role: "system",
            content: `Here are the web search results for "${searchQuery.slice(0, 60)}":\n\n${context}\n\nNow continue answering the user's original question. Cite sources with [1], [2], etc. Output another <web> tag if you need to search for more information.`,
          });
        } else {
          yield new ChatEvent({
            eventName: "thinking",
            thinking: `No search results found for "${searchQuery.slice(0, 60)}".`,
            thinkingTimeStart: new Date(),
          });
          currentMessages.push({
            role: "assistant",
            content: draftContent,
          });
          currentMessages.push({
            role: "system",
            content: `No web search results found for "${searchQuery.slice(0, 60)}". Continue answering based on your knowledge.`,
          });
        }

        // Loop back to let model decide if more searches needed
        continue;
      }

      // No <web> tag - this is the final answer
      finalContent = draftContent;
      break;
    }
  } catch {
    finalContent = "";
  }

  // Strip <web> tags if toggle is OFF so they don't appear in chat
  if (!params.webSearch) {
    finalContent = finalContent.replace(/<web>[\s\S]*?<\/web>/g, "").trim();
  }

  const { thinking: rawThinking, rest: rawRest } = parseThinking(finalContent);
  finalThinking = cleanCitations(rawThinking);
  finalRest = cleanCitations(rawRest);

  // Store complete response for recovery if streaming is interrupted
  localStorage.setItem(
    `ollama_pending_${params.chatId}`,
    JSON.stringify({ content: finalRest, thinking: finalThinking, model: params.model }),
  );

  // Stream thinking content first if present
  if (finalThinking) {
    const now = new Date();
    yield new ChatEvent({
      eventName: "chat",
      content: "",
      thinking: "",
      thinkingTimeStart: now,
    });
    for await (const chunk of streamChunks(finalThinking, 5, 5)) {
      yield new ChatEvent({
        eventName: "thinking",
        thinking: chunk,
        thinkingTimeStart: now,
      });
    }
    yield new ChatEvent({
      eventName: "thinking",
      thinking: "",
      thinkingTimeStart: now,
      thinkingTimeEnd: new Date(),
    });
  }

  // Stream main content word-by-word for live feel
  if (finalRest) {
    for await (const chunk of streamChunks(finalRest, 5, 5)) {
      yield new ChatEvent({
        eventName: "chat",
        content: chunk,
      });
    }
  }

  localStorage.removeItem(`ollama_pending_${params.chatId}`);
  yield new ChatEvent({ eventName: "done" });
}
