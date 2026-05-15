export type Market = "SOL/USDC" | "BTC/USDC" | "ETH/USDC" | "JTO/USDC";
export type OrderType = "Market" | "Limit";
export type PositionSide = "Long" | "Short";
export type PositionStatus = "open" | "closed" | "liquidated";
export type TabView = "trade" | "positions" | "pnl" | "history";

// SDK-aligned types (match entity definitions exactly)
export interface Position {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  createdByUserId: string | null;
  market: string;
  side: string;
  orderType: string;
  leverage: number;
  amount: number;
  entryPrice: number;
  liquidationPrice: number;
  pnl?: number;
  pnlRevealed: boolean;
  status: string;
}

export interface WalletBalance {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  createdByUserId: string | null;
  usdc: number;
  protocol: number;
}

export interface TradingStats {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  createdByUserId: string | null;
  totalVolume: number;
  totalSpent: number;
  netPnl: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  statsRevealed: boolean;
}

export interface MarketData {
  market: Market;
  price: number;
  change24h: number;
  volume24h: number;
  fundingRate: number;
  openInterest: number;
}

export interface TradeFormData {
  market: Market;
  orderType: OrderType;
  side: PositionSide;
  leverage: number;
  amount: string;
  limitPrice?: string;
}

export interface Toast {
  id: string;
  type: "success" | "error" | "info" | "warning";
  title: string;
  message: string;
  timestamp: number;
}
