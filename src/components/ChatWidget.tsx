"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { ChatMessage, Product } from "@/lib/types";
import { ProductCard } from "./ProductCard";
import { v4 as uuidv4 } from "uuid";

interface ChatWidgetProps {
  creatorSlug: string;
  creatorName: string;
  creatorBio: string;
}

type StreamEvent =
  | { type: "text"; content: string }
  | { type: "product_card"; product: Product }
  | { type: "done" }
  | { type: "error"; message: string };

export function ChatWidget({ creatorSlug, creatorName, creatorBio }: ChatWidgetProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<{ type: string; retryAfterSeconds?: number } | null>(null);
  const [sessionId] = useState(() => uuidv4());
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    if (error?.type === "rate_limited" && error.retryAfterSeconds) {
      const timer = setTimeout(() => setError(null), error.retryAfterSeconds * 1000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  const sendMessage = async () => {
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;

    setError(null);
    setInput("");
    setIsLoading(true);

    const userMessage: ChatMessage = {
      id: uuidv4(),
      role: "user",
      content: trimmed,
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, userMessage]);

    const assistantMessageId = uuidv4();
    setMessages((prev) => [
      ...prev,
      { id: assistantMessageId, role: "assistant", content: "", timestamp: Date.now() },
    ]);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed, creatorSlug }),
      });

      if (response.status === 429) {
        const data = await response.json();
        setMessages((prev) => prev.filter((m) => m.id !== assistantMessageId));
        setError({
          type: data.error === "daily_cap" ? "daily_cap" : "rate_limited",
          retryAfterSeconds: data.retryAfterSeconds,
        });
        setIsLoading(false);
        return;
      }

      if (!response.ok || !response.body) {
        setMessages((prev) => prev.filter((m) => m.id !== assistantMessageId));
        setError({ type: "api_error" });
        setIsLoading(false);
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6);

          let event: StreamEvent;
          try {
            event = JSON.parse(jsonStr);
          } catch {
            continue;
          }

          if (event.type === "text") {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMessageId
                  ? { ...m, content: m.content + event.content }
                  : m
              )
            );
          } else if (event.type === "product_card") {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMessageId
                  ? {
                      ...m,
                      productCards: [...(m.productCards ?? []), event.product],
                    }
                  : m
              )
            );
          } else if (event.type === "error") {
            setError({ type: "api_error" });
          }
        }
      }
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== assistantMessageId));
      setError({ type: "offline" });
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <div className="flex items-center gap-3 p-4 bg-white border-b border-gray-200">
        <div className="h-10 w-10 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold text-sm">
          {creatorName.charAt(0).toUpperCase()}
        </div>
        <div>
          <h2 className="font-semibold text-gray-900 text-sm">{creatorName}</h2>
          <p className="text-xs text-gray-500 line-clamp-1">{creatorBio}</p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center text-gray-400 text-sm mt-8">
            <p>Ask {creatorName} anything</p>
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${
                msg.role === "user"
                  ? "bg-blue-600 text-white"
                  : "bg-white text-gray-900 border border-gray-200"
              }`}
            >
              {msg.content || (isLoading && msg.role === "assistant" && (
                <span className="inline-flex gap-1">
                  <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                </span>
              ))}
              {msg.content && <p className="whitespace-pre-wrap">{msg.content}</p>}
              {msg.productCards?.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  creatorSlug={creatorSlug}
                  sessionId={sessionId}
                />
              ))}
            </div>
          </div>
        ))}

        <div ref={messagesEndRef} />
      </div>

      {/* Error banner */}
      {error && (
        <div className="px-4 py-2 bg-amber-50 border-t border-amber-200 text-amber-800 text-xs">
          {error.type === "rate_limited" && (
            <p>Slow down! Try again in {error.retryAfterSeconds} seconds.</p>
          )}
          {error.type === "daily_cap" && (
            <p>This chat has reached its daily limit. Come back tomorrow!</p>
          )}
          {error.type === "api_error" && (
            <p>Something went wrong. Please try again in a moment.</p>
          )}
          {error.type === "offline" && (
            <p>You appear to be offline. Check your connection and try again.</p>
          )}
        </div>
      )}

      {/* Input */}
      <div className="p-4 bg-white border-t border-gray-200">
        <div className="flex gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`Ask ${creatorName} a question...`}
            rows={1}
            disabled={isLoading}
            className="flex-1 resize-none rounded-xl border border-gray-300 px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
          />
          <button
            onClick={sendMessage}
            disabled={isLoading || !input.trim()}
            className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
