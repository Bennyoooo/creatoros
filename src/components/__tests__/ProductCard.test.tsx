import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ProductCard } from "../ProductCard";
import { Product } from "@/lib/types";

const mockProduct: Product = {
  id: "prod-1",
  name: "Morning Stack",
  category: "supplements",
  description: "Daily morning supplement stack",
  price: "$45/mo",
  imageUrl: "https://placehold.co/200x200",
  affiliateUrl: "https://example.com/morning-stack",
};

describe("ProductCard", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
    vi.stubGlobal("open", vi.fn());
  });

  it("renders product name, description, and price", () => {
    render(
      <ProductCard product={mockProduct} creatorSlug="demo" sessionId="sess-1" />
    );
    expect(screen.getByText("Morning Stack")).toBeInTheDocument();
    expect(screen.getByText("Daily morning supplement stack")).toBeInTheDocument();
    expect(screen.getByText("$45/mo")).toBeInTheDocument();
  });

  it("renders product image", () => {
    render(
      <ProductCard product={mockProduct} creatorSlug="demo" sessionId="sess-1" />
    );
    const img = screen.getByAltText("Morning Stack");
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute("src", "https://placehold.co/200x200");
  });

  it("renders CTA button", () => {
    render(
      <ProductCard product={mockProduct} creatorSlug="demo" sessionId="sess-1" />
    );
    expect(screen.getByText("View Product →")).toBeInTheDocument();
  });

  it("tracks click and opens affiliate URL on CTA click", () => {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchSpy);
    const openSpy = vi.fn();
    vi.stubGlobal("open", openSpy);

    render(
      <ProductCard product={mockProduct} creatorSlug="demo" sessionId="sess-1" />
    );
    fireEvent.click(screen.getByText("View Product →"));

    expect(fetchSpy).toHaveBeenCalledWith("/api/track", expect.objectContaining({
      method: "POST",
    }));

    expect(openSpy).toHaveBeenCalledWith(
      expect.stringContaining("ref=creatoros"),
      "_blank",
      "noopener"
    );
  });

  it("includes creator and session params in affiliate URL", () => {
    const openSpy = vi.fn();
    vi.stubGlobal("open", openSpy);

    render(
      <ProductCard product={mockProduct} creatorSlug="testcreator" sessionId="sess-xyz" />
    );
    fireEvent.click(screen.getByText("View Product →"));

    const url = openSpy.mock.calls[0][0];
    expect(url).toContain("creator=testcreator");
    expect(url).toContain("session=sess-xyz");
  });
});
