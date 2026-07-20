import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { classifyCoreInstrumentSymbol } from "./instrument-support";

const FIXTURE_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "../fixtures/journal-integrity",
);

describe("classifyCoreInstrumentSymbol", () => {
  it.each([
    "AAPL",
    "BRK.B",
    "BRK/B",
    "SPY",
    "QQQ",
    "BF.A",
    "RDS.A",
    "V",
    "F",
  ])("accepts equity-compatible ticker %s", (symbol) => {
    expect(classifyCoreInstrumentSymbol(symbol)).toEqual({
      ok: true,
      kind: "equity_compatible",
    });
  });

  it.each([
    ["AAPL250117C00150000", "option_contract"],
    ["TSLA250620P00250000", "option_contract"],
    ["SPY260116C00500000", "option_contract"],
  ] as const)("rejects OCC option symbol %s", (symbol, kind) => {
    const result = classifyCoreInstrumentSymbol(symbol);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe(kind);
      expect(result.code).toBe("unsupported_instrument");
      expect(result.message).toMatch(/option/i);
    }
  });

  it.each([
    ["ES=F", "futures_contract"],
    ["NQ=F", "futures_contract"],
    ["ESZ25", "futures_contract"],
    ["CLF6", "futures_contract"],
  ] as const)("rejects futures symbol %s", (symbol, kind) => {
    const result = classifyCoreInstrumentSymbol(symbol);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe(kind);
      expect(result.message).toMatch(/futures/i);
    }
  });

  it.each([
    ["BTC-USD", "crypto_pair"],
    ["ETH/USD", "crypto_pair"],
    ["SOL:USDT", "crypto_pair"],
    ["BTCUSD", "crypto_pair"],
    ["ETHUSDT", "crypto_pair"],
  ] as const)("rejects crypto pair %s", (symbol, kind) => {
    const result = classifyCoreInstrumentSymbol(symbol);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe(kind);
      expect(result.message).toMatch(/crypto/i);
    }
  });

  it("is case-insensitive and trims whitespace", () => {
    expect(classifyCoreInstrumentSymbol("  aapl  ")).toEqual({
      ok: true,
      kind: "equity_compatible",
    });
    expect(classifyCoreInstrumentSymbol("  aapl250117c00150000  ").ok).toBe(false);
  });

  it("classifies every unsupported symbol from the golden fixture", () => {
    const csv = readFileSync(join(FIXTURE_DIR, "unsupported-instruments.csv"), "utf8");
    const symbols = csv
      .trim()
      .split("\n")
      .slice(1)
      .map((line) => line.split(",")[0] ?? "")
      .filter((symbol) => symbol.length > 0);
    const outcomes = symbols.map((symbol) => ({
      symbol,
      ok: classifyCoreInstrumentSymbol(symbol).ok,
    }));
    expect(outcomes).toEqual([
      { symbol: "AAPL250117C00150000", ok: false },
      { symbol: "ES=F", ok: false },
      { symbol: "ESZ25", ok: false },
      { symbol: "BTC-USD", ok: false },
      { symbol: "ETHUSDT", ok: false },
      { symbol: "AAPL", ok: true },
    ]);
  });
});
