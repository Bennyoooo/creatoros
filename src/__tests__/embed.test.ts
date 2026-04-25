import { describe, it, expect, beforeEach, vi } from "vitest";
import fs from "fs";
import path from "path";

const embedScript = fs.readFileSync(
  path.join(process.cwd(), "public/embed.js"),
  "utf-8"
);

describe("embed.js", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    // @ts-expect-error -- resetting global flag
    delete window.__creatoros_loaded;
  });

  function loadEmbed(attrs: Record<string, string> = {}) {
    const script = document.createElement("script");
    script.setAttribute("data-creator", attrs["data-creator"] ?? "demo");
    if (attrs["data-host"]) script.setAttribute("data-host", attrs["data-host"]);
    script.src = attrs.src ?? "https://creatoros.com/embed.js";
    document.body.appendChild(script);

    // Inject currentScript reference and eval
    Object.defineProperty(document, "currentScript", {
      value: script,
      configurable: true,
    });
    eval(embedScript);
  }

  it("creates the widget container", () => {
    loadEmbed();
    const container = document.getElementById("creatoros-widget");
    expect(container).not.toBeNull();
  });

  it("creates the chat bubble button", () => {
    loadEmbed();
    const bubble = document.getElementById("creatoros-bubble");
    expect(bubble).not.toBeNull();
    expect(bubble!.innerHTML).toBe("💬");
  });

  it("creates an iframe with correct src", () => {
    loadEmbed({ "data-creator": "testcreator" });
    const iframe = document.querySelector("iframe");
    expect(iframe).not.toBeNull();
    expect(iframe!.src).toContain("/chat/testcreator");
  });

  it("only loads once (prevents multiple instances)", () => {
    loadEmbed();
    const firstContainer = document.getElementById("creatoros-widget");
    loadEmbed();
    const containers = document.querySelectorAll("#creatoros-widget");
    expect(containers.length).toBe(1);
    expect(firstContainer).toBe(containers[0]);
  });

  it("logs error when data-creator is missing", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const script = document.createElement("script");
    script.src = "https://creatoros.com/embed.js";
    document.body.appendChild(script);
    Object.defineProperty(document, "currentScript", {
      value: script,
      configurable: true,
    });
    eval(embedScript);

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("Missing data-creator")
    );
    errorSpy.mockRestore();
  });
});
