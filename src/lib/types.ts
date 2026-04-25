export interface CreatorConfig {
  slug: string;
  name: string;
  assistantId: string;
  bio: string;
  products: Product[];
  rateLimits: {
    messagesPerHourPerIp: number;
    dailySpendCapUsd: number;
  };
  socialLinks?: {
    instagram?: string;
    twitter?: string;
    website?: string;
  };
}

export interface Product {
  id: string;
  name: string;
  category: string;
  description: string;
  price: string;
  imageUrl: string;
  affiliateUrl: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  productCards?: Product[];
  timestamp: number;
}

export interface TrackEvent {
  creatorSlug: string;
  productId: string;
  sessionId: string;
  timestamp: number;
}
