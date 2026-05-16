import { StrictMode } from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider, createRouter } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { routeTree } from "./routeTree.gen";
import { fetchUser } from "./api";
import { StreamingProvider } from "./contexts/StreamingContext";
import { isNativeMobile } from "./utils/mobile";
import { initTheme } from "./lib/theme";

// Initialize theme before React renders
initTheme();

// Persist current route for mobile background recovery
const ROUTE_KEY = "ollama_last_route";
function saveCurrentRoute() {
  if (!isNativeMobile()) return;
  try {
    const path = window.location.pathname + window.location.search;
    localStorage.setItem(ROUTE_KEY, path);
  } catch {
    // ignore
  }
}
function getSavedRoute(): string | null {
  if (!isNativeMobile()) return null;
  try {
    return localStorage.getItem(ROUTE_KEY);
  } catch {
    return null;
  }
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") {
    saveCurrentRoute();
  }
});
window.addEventListener("beforeunload", saveCurrentRoute);

// Initialize Capacitor plugins on mobile
async function initMobile() {
  if (!isNativeMobile()) return;

  const [
    { StatusBar },
    { Keyboard, KeyboardResize },
  ] = await Promise.all([
    import("@capacitor/status-bar"),
    import("@capacitor/keyboard"),
  ]);

  await StatusBar.setOverlaysWebView({ overlay: false });
  try {
    await Keyboard.setResizeMode({ mode: KeyboardResize.Native });
  } catch {
    // iOS-only; Android uses resizeOnFullScreen config
  }

  // Android WebView doesn't report safe-area-inset-top for status bar
  // Add fallback padding when env() returns 0
  const computedPadding = parseFloat(getComputedStyle(document.body).paddingTop);
  if (computedPadding === 0) {
    document.documentElement.style.setProperty("--safe-area-top", "32px");
    document.body.style.paddingTop = "32px";
  }
}

initMobile().catch(console.error);

const queryClient = new QueryClient({
  defaultOptions: {
    mutations: {
      networkMode: "always", // Run mutations regardless of network state
    },
    queries: {
      networkMode: "always", // Allow queries even when offline (local server)
    },
  },
});

fetchUser().then((userData) => {
  if (userData) {
    queryClient.setQueryData(["user"], userData);
  }
});

const router = createRouter({
  routeTree,
  context: { queryClient },
});

// Register the router instance for type safety
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

// Restore saved route on mobile after backgrounding
const savedRoute = getSavedRoute();
if (savedRoute) {
  // Defer navigation until router is ready
  const unsub = router.subscribe("onResolved", () => {
    unsub();
    if (
      savedRoute &&
      savedRoute !== "/" &&
      savedRoute !== window.location.pathname
    ) {
      const nav = router.navigate({ to: savedRoute as any });
      if (nav && typeof nav === "object" && "catch" in nav) {
        nav.catch(() => {});
      }
    }
  });
}

const rootElement = document.getElementById("root")!;
if (!rootElement.innerHTML) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <StreamingProvider>
          <RouterProvider router={router} />
        </StreamingProvider>
      </QueryClientProvider>
    </StrictMode>,
  );
}
