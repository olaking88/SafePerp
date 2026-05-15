import { useState, useEffect, useRef, useCallback } from "react";
import { MarketData, Market } from "../types";

const FEED_IDS: Record<Market, string> = {
  "SOL/USDC":
    "0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d",
  "BTC/USDC":
    "0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43",
  "ETH/USDC":
    "0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace",
  "JTO/USDC":
    "0xb43660a5f790c69354b0729a5ef9d50d68f1df92107540210b9cccba1f947cc2",
};

const HERMES = "https://hermes.pyth.network";

const FALLBACK: Record<Market, MarketData> = {
  "SOL/USDC": {
    market: "SOL/USDC",
    price: 178.42,
    change24h: 3.21,
    volume24h: 1_240_000_000,
    fundingRate: 0.0012,
    openInterest: 450_000_000,
  },
  "BTC/USDC": {
    market: "BTC/USDC",
    price: 67842.5,
    change24h: -1.05,
    volume24h: 8_900_000_000,
    fundingRate: 0.0008,
    openInterest: 2_100_000_000,
  },
  "ETH/USDC": {
    market: "ETH/USDC",
    price: 3521.8,
    change24h: 1.87,
    volume24h: 3_200_000_000,
    fundingRate: 0.001,
    openInterest: 980_000_000,
  },
  "JTO/USDC": {
    market: "JTO/USDC",
    price: 4.21,
    change24h: -2.34,
    volume24h: 45_000_000,
    fundingRate: 0.0015,
    openInterest: 12_000_000,
  },
};

const ID_TO_MARKET: Record<string, Market> = Object.fromEntries(
  Object.entries(FEED_IDS).map(([m, id]) => [
    id.replace(/^0x/, "").toLowerCase(),
    m as Market,
  ]),
);

function parsePythItem(item: any, prev: MarketData): MarketData | null {
  const rawPrice = item?.price?.price ?? item?.ema_price?.price;
  const expo = item?.price?.expo ?? item?.ema_price?.expo;
  if (rawPrice == null || expo == null) return null;
  const price = parseFloat(
    (Number(rawPrice) * Math.pow(10, Number(expo))).toFixed(6),
  );
  if (!isFinite(price) || price <= 0) return null;

  let change24h = prev.change24h;
  const emaRaw = item?.ema_price?.price;
  const emaExp = item?.ema_price?.expo;
  if (emaRaw != null && emaExp != null) {
    const ema = Number(emaRaw) * Math.pow(10, Number(emaExp));
    if (ema > 0)
      change24h = parseFloat((((price - ema) / ema) * 100).toFixed(2));
  }

  return { ...prev, price, change24h };
}

export function usePythPrices(): Record<Market, MarketData> {
  const [prices, setPrices] = useState<Record<Market, MarketData>>(FALLBACK);
  const prevRef = useRef<Record<Market, MarketData>>(FALLBACK);
  const sseRef = useRef<EventSource | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sseLive = useRef(false);

  const applyUpdate = useCallback(
    (updates: Partial<Record<Market, MarketData>>) => {
      prevRef.current = { ...prevRef.current, ...updates };
      setPrices({ ...prevRef.current });
    },
    [],
  );

  const fetchRest = useCallback(async () => {
    try {
      const qs = Object.values(FEED_IDS)
        .map((id) => `ids[]=${encodeURIComponent(id)}`)
        .join("&");
      const res = await fetch(`${HERMES}/v2/updates/price/latest?${qs}`);
      if (!res.ok) return;
      const json = await res.json();
      const updates: Partial<Record<Market, MarketData>> = {};
      for (const item of json.parsed ?? []) {
        const market = ID_TO_MARKET[item.id?.toLowerCase()];
        if (!market) continue;
        const md = parsePythItem(item, prevRef.current[market]);
        if (md) updates[market] = md;
      }
      if (Object.keys(updates).length) applyUpdate(updates);
    } catch {}
  }, [applyUpdate]);

  const openSSE = useCallback(() => {
    if (sseRef.current) return;

    const qs = Object.values(FEED_IDS)
      .map((id) => `ids[]=${encodeURIComponent(id)}`)
      .join("&");
    const url = `${HERMES}/v2/updates/price/stream?${qs}&parsed=true`;

    const es = new EventSource(url);
    sseRef.current = es;

    es.onopen = () => {
      sseLive.current = true;
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };

    es.onmessage = (event) => {
      try {
        const json = JSON.parse(event.data);
        const updates: Partial<Record<Market, MarketData>> = {};
        for (const item of json.parsed ?? []) {
          const market = ID_TO_MARKET[item.id?.toLowerCase()];
          if (!market) continue;
          const md = parsePythItem(item, prevRef.current[market]);
          if (md) updates[market] = md;
        }
        if (Object.keys(updates).length) applyUpdate(updates);
      } catch {}
    };

    es.onerror = () => {
      es.close();
      sseRef.current = null;
      sseLive.current = false;

      if (!pollRef.current) {
        pollRef.current = setInterval(fetchRest, 3000);
      }
    };
  }, [applyUpdate, fetchRest]);

  useEffect(() => {
    fetchRest(); // one immediate fetch so prices are populated before SSE connects
    openSSE(); // SSE manages itself; polling only starts inside onerror as fallback

    return () => {
      sseRef.current?.close();
      sseRef.current = null;
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [fetchRest, openSSE]);

  return prices;
}
