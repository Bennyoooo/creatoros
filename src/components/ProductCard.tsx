"use client";

import { Product } from "@/lib/types";

interface ProductCardProps {
  product: Product;
  creatorSlug: string;
  sessionId: string;
}

export function ProductCard({ product, creatorSlug, sessionId }: ProductCardProps) {
  const handleClick = () => {
    fetch("/api/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        creatorSlug,
        productId: product.id,
        sessionId,
      }),
    }).catch(() => {});

    const url = new URL(product.affiliateUrl);
    url.searchParams.set("ref", "creatoros");
    url.searchParams.set("creator", creatorSlug);
    url.searchParams.set("session", sessionId);
    window.open(url.toString(), "_blank", "noopener");
  };

  return (
    <div className="my-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex gap-3">
        {product.imageUrl && (
          <img
            src={product.imageUrl}
            alt={product.name}
            className="h-16 w-16 rounded-lg object-cover"
          />
        )}
        <div className="flex-1 min-w-0">
          <h4 className="font-semibold text-gray-900 text-sm">{product.name}</h4>
          <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{product.description}</p>
          <div className="flex items-center justify-between mt-2">
            <span className="text-sm font-medium text-gray-900">{product.price}</span>
            <button
              onClick={handleClick}
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 transition-colors"
            >
              View Product →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
