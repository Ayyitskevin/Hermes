import type { TradeAllocation, TradeProjection } from "../../core/ledger";
import { sha256Hex } from "./schema";

export function stableTradeSubjectHash(
  trade: TradeProjection,
  allocations: readonly TradeAllocation[],
): string {
  const openingAllocation = allocations.find((allocation) => (
    allocation.tradeId === trade.id && allocation.effect === "ENTRY"
  ));
  if (openingAllocation === undefined) {
    throw new Error(`Trade ${trade.id} has no immutable opening allocation.`);
  }
  return sha256Hex(JSON.stringify({
    accountId: trade.accountId,
    instrumentId: trade.instrumentId,
    openingAllocationId: openingAllocation.id,
  }));
}
