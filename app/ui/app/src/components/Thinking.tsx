import { useEffect, useState, useRef } from "react";
import StreamingMarkdownContent from "./StreamingMarkdownContent";

export default function Thinking({
  thinking,
  startTime,
  endTime,
}: {
  thinking: string;
  startTime?: Date;
  endTime?: Date;
}) {
  const [isCollapsed, setIsCollapsed] = useState(true);
  const [hasUserInteracted, setHasUserInteracted] = useState(false);
  const [contentHeight, setContentHeight] = useState<number>(0);
  const [hasOverflow, setHasOverflow] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const activelyThinking = startTime && !endTime;
  const finishedThinking = startTime && endTime;

  // Auto-collapse when thinking is done (only if user hasn't manually interacted)
  useEffect(() => {
    if (endTime && !hasUserInteracted) {
      setIsCollapsed(true);
    }
  }, [endTime, hasUserInteracted]);

  // Reset user interaction flag when a new thinking session starts
  useEffect(() => {
    if (activelyThinking) {
      setHasUserInteracted(false);
    }
  }, [activelyThinking]);

  // Measure content height for animations
  useEffect(() => {
    if (contentRef.current) {
      const resizeObserver = new ResizeObserver(() => {
        if (contentRef.current) {
          setContentHeight(contentRef.current.scrollHeight);
        }
      });
      resizeObserver.observe(contentRef.current);
      return () => resizeObserver.disconnect();
    }
  }, [thinking]);

  // Position content to show bottom when collapsed
  useEffect(() => {
    if (isCollapsed && contentRef.current && wrapperRef.current) {
      requestAnimationFrame(() => {
        if (!contentRef.current || !wrapperRef.current) return;

        const contentHeight = contentRef.current.scrollHeight;
        const wrapperHeight = wrapperRef.current.clientHeight;
        if (contentHeight > wrapperHeight) {
          const translateY = -(contentHeight - wrapperHeight);
          contentRef.current.style.transform = `translateY(${translateY}px)`;
          setHasOverflow(true);
        } else {
          contentRef.current.style.transform = "translateY(0)";
          setHasOverflow(false);
        }
      });
    } else if (contentRef.current) {
      contentRef.current.style.transform = "translateY(0)";
      setHasOverflow(false);
    }
  }, [thinking, isCollapsed]);

  useEffect(() => {
    if (activelyThinking && wrapperRef.current && !isCollapsed) {
      // When expanded and actively thinking, scroll to bottom
      wrapperRef.current.scrollTop = wrapperRef.current.scrollHeight;
    }
  }, [thinking, activelyThinking, isCollapsed]);

  const lastToggleRef = useRef(0);
  const handleToggle = () => {
    const now = Date.now();
    if (now - lastToggleRef.current < 300) return;
    lastToggleRef.current = now;
    setIsCollapsed((c) => !c);
    setHasUserInteracted(true);
  };

  // Detect thinking type from content for icon/title
  const t = thinking.toLowerCase();
  const isSearchStatus = t.includes("searching the web") || t.includes("searching for");
  const isSearchResults = t.includes("found ") && t.includes("search result");
  const isSearchResults2 = t.includes("search results for");
  const searchPhase = isSearchStatus || isSearchResults || isSearchResults2;

  // Calculate max height for smooth animations
  const getMaxHeight = () => {
    if (isCollapsed) {
      return finishedThinking ? "0px" : "12rem";
    }
    // When expanded, use the content height or grow naturally
    return contentHeight ? `${contentHeight}px` : "none";
  };

  return (
    <div
      className={`flex mb-4 flex-col w-full ${activelyThinking || !isCollapsed ? "text-neutral-800 dark:text-neutral-200" : "text-neutral-600 dark:text-neutral-400"}
         hover:text-neutral-800
        dark:hover:text-neutral-200 transition-colors`}
    >
      <div
        className="flex items-center cursor-pointer group/thinking self-start relative py-3 pr-4"
        onClick={handleToggle}
        style={{ touchAction: "manipulation", WebkitTapHighlightColor: "transparent" }}
      >
        {/* Icon based on content type */}
        <svg
          className={`w-4 h-4 absolute left-0 top-1/2 -translate-y-1/2 transition-opacity pointer-events-none ${
            isCollapsed ? "opacity-100" : "opacity-0"
          } group-hover/thinking:opacity-0 will-change-opacity`}
          viewBox="0 0 24 24"
          fill="currentColor"
        >
          {searchPhase ? (
            isSearchStatus ? (
              <g>
                <path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
              </g>
            ) : (
              <g>
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" />
              </g>
            )
          ) : (
            <path d="M9 21c0 .55.45 1 1 1h4c.55 0 1-.45 1-1v-1H9v1zm3-19C8.14 2 5 5.14 5 9c0 2.38 1.19 4.47 3 5.74V17c0 .55.45 1 1 1h6c.55 0 1-.45 1-1v-2.26c1.81-1.27 3-3.36 3-5.74 0-3.86-3.14-7-7-7zm2.85 11.1l-.85.6V16h-4v-2.3l-.85-.6A4.997 4.997 0 0 1 7 9c0-2.76 2.24-5 5-5s5 2.24 5 5c0 1.63-.8 3.16-2.15 4.1z" />
          )}
        </svg>

        {/* Arrow */}
        <svg
          className={`h-4 w-4 absolute transition-all pointer-events-none ${
            isCollapsed
              ? "-rotate-90 opacity-0 group-hover/thinking:opacity-100"
              : "rotate-0 opacity-100"
          } will-change-[opacity,transform]`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>

        <h3 className="ml-6">
          {activelyThinking
            ? searchPhase
              ? thinking.slice(0, 80)
              : "Thinking..."
            : finishedThinking
              ? (() => {
                  const thinkingTime =
                    (endTime.getTime() - startTime.getTime()) / 1000;
                  return thinkingTime < 2
                    ? "Thought for a moment"
                    : `Thought for ${thinkingTime.toFixed(1)} seconds`;
                })()
              : "Thinking..."}
        </h3>
      </div>
      <div
        ref={wrapperRef}
        className={`text-xs text-neutral-500 dark:text-neutral-500 rounded-md
          transition-[max-height,opacity] duration-300 ease-in-out relative ml-6 mt-2
          ${isCollapsed ? "overflow-hidden" : "overflow-y-auto"}`}
        style={{
          maxHeight: isCollapsed ? getMaxHeight() : undefined,
          opacity: isCollapsed && finishedThinking ? 0 : 1,
        }}
      >
        <div
          ref={contentRef}
          className="transition-transform duration-300 opacity-75 select-text"
        >
          <StreamingMarkdownContent
            content={thinking}
            isStreaming={activelyThinking}
            size="sm"
          />
        </div>

        {/* Gradient overlay for fade effect when collapsed and scrolled */}
        {isCollapsed && hasOverflow && (
          <div className="absolute inset-x-0 -top-1 h-8 pointer-events-none bg-gradient-to-b from-white dark:from-neutral-900 to-transparent" />
        )}
      </div>
    </div>
  );
}
