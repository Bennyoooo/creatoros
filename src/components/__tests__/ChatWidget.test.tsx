import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ChatWidget } from "../ChatWidget";

let uuidCounter = 0;
vi.mock("uuid", () => ({
  v4: () => `test-uuid-${++uuidCounter}`,
}));

function mockStreamResponse(events: Array<{ type: string; content?: string; product?: unknown; message?: string }>) {
  const encoded = events
    .map((e) => `data: ${JSON.stringify(e)}\n\n`)
    .join("");
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(encoded));
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}

describe("ChatWidget", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  it("renders creator name and bio", () => {
    render(
      <ChatWidget creatorSlug="demo" creatorName="Test Creator" creatorBio="Health expert" />
    );
    expect(screen.getByText("Test Creator")).toBeInTheDocument();
    expect(screen.getByText("Health expert")).toBeInTheDocument();
  });

  it("shows empty state prompt", () => {
    render(
      <ChatWidget creatorSlug="demo" creatorName="Test Creator" creatorBio="Bio" />
    );
    expect(screen.getByText("Ask Test Creator anything")).toBeInTheDocument();
  });

  it("renders privacy notice", () => {
    render(
      <ChatWidget creatorSlug="demo" creatorName="Test Creator" creatorBio="Bio" />
    );
    expect(
      screen.getByText(/AI-generated responses/)
    ).toBeInTheDocument();
  });

  it("does not send empty messages", () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    render(
      <ChatWidget creatorSlug="demo" creatorName="Test Creator" creatorBio="Bio" />
    );
    fireEvent.click(screen.getByText("Send"));
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("disables send button when input is empty", () => {
    render(
      <ChatWidget creatorSlug="demo" creatorName="Test Creator" creatorBio="Bio" />
    );
    const button = screen.getByText("Send");
    expect(button).toBeDisabled();
  });

  it("enables send button when input has text", () => {
    render(
      <ChatWidget creatorSlug="demo" creatorName="Test Creator" creatorBio="Bio" />
    );
    const textarea = screen.getByPlaceholderText("Ask Test Creator a question...");
    fireEvent.change(textarea, { target: { value: "hello" } });
    const button = screen.getByText("Send");
    expect(button).not.toBeDisabled();
  });

  it("shows user message optimistically on send", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        mockStreamResponse([
          { type: "text", content: "Hi there!" },
          { type: "done" },
        ])
      )
    );

    render(
      <ChatWidget creatorSlug="demo" creatorName="Test Creator" creatorBio="Bio" />
    );

    const textarea = screen.getByPlaceholderText("Ask Test Creator a question...");
    fireEvent.change(textarea, { target: { value: "What supplements?" } });
    fireEvent.click(screen.getByText("Send"));

    await waitFor(() => {
      expect(screen.getByText("What supplements?")).toBeInTheDocument();
    });
  });

  it("shows assistant response from stream", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        mockStreamResponse([
          { type: "text", content: "I recommend vitamin D." },
          { type: "done" },
        ])
      )
    );

    render(
      <ChatWidget creatorSlug="demo" creatorName="Test Creator" creatorBio="Bio" />
    );

    const textarea = screen.getByPlaceholderText("Ask Test Creator a question...");
    fireEvent.change(textarea, { target: { value: "Hello" } });
    fireEvent.click(screen.getByText("Send"));

    await waitFor(() => {
      expect(screen.getByText("I recommend vitamin D.")).toBeInTheDocument();
    });
  });

  it("shows rate limit error on 429", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: "rate_limited", retryAfterSeconds: 30 }), {
          status: 429,
        })
      )
    );

    render(
      <ChatWidget creatorSlug="demo" creatorName="Test Creator" creatorBio="Bio" />
    );

    const textarea = screen.getByPlaceholderText("Ask Test Creator a question...");
    fireEvent.change(textarea, { target: { value: "Hello" } });
    fireEvent.click(screen.getByText("Send"));

    await waitFor(() => {
      expect(screen.getByText(/Slow down/)).toBeInTheDocument();
    });
  });

  it("shows daily cap error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: "daily_cap" }), { status: 429 })
      )
    );

    render(
      <ChatWidget creatorSlug="demo" creatorName="Test Creator" creatorBio="Bio" />
    );

    const textarea = screen.getByPlaceholderText("Ask Test Creator a question...");
    fireEvent.change(textarea, { target: { value: "Hello" } });
    fireEvent.click(screen.getByText("Send"));

    await waitFor(() => {
      expect(screen.getByText(/daily limit/)).toBeInTheDocument();
    });
  });

  it("shows API error on 500", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: "api_error" }), { status: 500 })
      )
    );

    render(
      <ChatWidget creatorSlug="demo" creatorName="Test Creator" creatorBio="Bio" />
    );

    const textarea = screen.getByPlaceholderText("Ask Test Creator a question...");
    fireEvent.change(textarea, { target: { value: "Hello" } });
    fireEvent.click(screen.getByText("Send"));

    await waitFor(() => {
      expect(screen.getByText(/Something went wrong/)).toBeInTheDocument();
    });
  });

  it("shows offline error on network failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("Network error"))
    );

    render(
      <ChatWidget creatorSlug="demo" creatorName="Test Creator" creatorBio="Bio" />
    );

    const textarea = screen.getByPlaceholderText("Ask Test Creator a question...");
    fireEvent.change(textarea, { target: { value: "Hello" } });
    fireEvent.click(screen.getByText("Send"));

    await waitFor(() => {
      expect(screen.getByText(/offline/)).toBeInTheDocument();
    });
  });

  it("clears input after sending", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        mockStreamResponse([{ type: "text", content: "Hi" }, { type: "done" }])
      )
    );

    render(
      <ChatWidget creatorSlug="demo" creatorName="Test Creator" creatorBio="Bio" />
    );

    const textarea = screen.getByPlaceholderText("Ask Test Creator a question...") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "Hello" } });
    fireEvent.click(screen.getByText("Send"));

    await waitFor(() => {
      expect(textarea.value).toBe("");
    });
  });

  it("sends Enter key to submit", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      mockStreamResponse([{ type: "text", content: "Hi" }, { type: "done" }])
    );
    vi.stubGlobal("fetch", fetchSpy);

    render(
      <ChatWidget creatorSlug="demo" creatorName="Test Creator" creatorBio="Bio" />
    );

    const textarea = screen.getByPlaceholderText("Ask Test Creator a question...");
    fireEvent.change(textarea, { target: { value: "Hello" } });
    fireEvent.keyDown(textarea, { key: "Enter", code: "Enter" });

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalled();
    });
  });
});
