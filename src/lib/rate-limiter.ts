const ipRequestCounts = new Map<string, { count: number; resetAt: number }>();
const dailySpend = new Map<string, { amountUsd: number; resetAt: number }>();

const ESTIMATED_COST_PER_MESSAGE_USD = 0.02;

export function checkRateLimit(
  ip: string,
  creatorSlug: string,
  limits: { messagesPerHourPerIp: number; dailySpendCapUsd: number }
): { allowed: boolean; reason?: string; retryAfterSeconds?: number } {
  const now = Date.now();

  const ipKey = `${ip}:${creatorSlug}`;
  const ipEntry = ipRequestCounts.get(ipKey);

  if (ipEntry && now < ipEntry.resetAt) {
    if (ipEntry.count >= limits.messagesPerHourPerIp) {
      const retryAfter = Math.ceil((ipEntry.resetAt - now) / 1000);
      return {
        allowed: false,
        reason: "rate_limited",
        retryAfterSeconds: retryAfter,
      };
    }
    ipEntry.count++;
  } else {
    ipRequestCounts.set(ipKey, {
      count: 1,
      resetAt: now + 60 * 60 * 1000,
    });
  }

  const spendKey = creatorSlug;
  const spendEntry = dailySpend.get(spendKey);
  const dailyResetAt = now + 24 * 60 * 60 * 1000;

  if (spendEntry && now < spendEntry.resetAt) {
    if (spendEntry.amountUsd >= limits.dailySpendCapUsd) {
      return {
        allowed: false,
        reason: "daily_cap",
      };
    }
    spendEntry.amountUsd += ESTIMATED_COST_PER_MESSAGE_USD;
  } else {
    dailySpend.set(spendKey, {
      amountUsd: ESTIMATED_COST_PER_MESSAGE_USD,
      resetAt: dailyResetAt,
    });
  }

  return { allowed: true };
}
