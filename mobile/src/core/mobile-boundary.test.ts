import { describe, expect, it } from "vitest";

import capacitorConfigSource from "../../capacitor.config.ts?raw";
import sourceHtml from "../../index.html?raw";
import infoPlist from "../../ios/App/App/Info.plist?raw";
import podfile from "../../ios/App/Podfile?raw";
import packageJson from "../../package.json";

const productionSources = import.meta.glob([
  "../**/*.ts",
  "!../**/*.test.ts",
], {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const nativeSources = import.meta.glob([
  "../../ios/App/**/*.{swift,m,mm,h,pbxproj,entitlements}",
], {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const APPROVED_RUNTIME_DEPENDENCIES = new Set([
  "@capacitor-community/sqlite",
  "@capacitor/core",
  "@capacitor/ios",
]);

describe("mobile product boundary", () => {
  it("keeps every production TypeScript module free of network transports and broker write APIs", () => {
    const prohibited = [
      { name: "HTTP fetch", pattern: /\bfetch\s*\(/ },
      { name: "XMLHttpRequest", pattern: /\bXMLHttpRequest\b/ },
      { name: "WebSocket", pattern: /\bWebSocket\b/ },
      { name: "EventSource", pattern: /\bEventSource\b/ },
      { name: "beacon transport", pattern: /\bsendBeacon\s*\(/ },
      { name: "absolute network URL", pattern: /https?:\/\//i },
      { name: "Capacitor HTTP", pattern: /@capacitor\/(?:community\/)?http/i },
      { name: "CapacitorHttp surface", pattern: /\bCapacitorHttp\b/ },
      { name: "Apple URLSession", pattern: /\b(?:NS)?URLSession\b/ },
      { name: "Apple Network framework", pattern: /\b(?:NWConnection|NWPathMonitor)\b/ },
      { name: "Alamofire", pattern: /\bAlamofire\b/ },
      { name: "order placement API", pattern: /\b(?:place|submit|cancel|replace)Order\s*\(/ },
      { name: "broker SDK", pattern: /\b(?:alpaca|snaptrade|plaid|coinbase|tradier)\b/i },
    ] as const;

    const reviewedSources = {
      ...productionSources,
      ...nativeSources,
      "../../capacitor.config.ts": capacitorConfigSource,
      "../../index.html": sourceHtml,
      "../../ios/App/Podfile": podfile,
    };
    for (const [path, source] of Object.entries(reviewedSources)) {
      for (const rule of prohibited) {
        expect(source, `${path} must not contain ${rule.name}`).not.toMatch(rule.pattern);
      }
    }
  });

  it("requires explicit review before any new runtime capability enters the app", () => {
    const dependencies = Object.keys(packageJson.dependencies);
    expect(dependencies.sort()).toEqual([...APPROVED_RUNTIME_DEPENDENCIES].sort());
    expect(sourceHtml).toContain("connect-src 'none'");
    expect(capacitorConfigSource).not.toMatch(/\bserver\s*:\s*\{/);
    expect(infoPlist).not.toContain("NSAppTransportSecurity");
    expect(Array.from(podfile.matchAll(/^\s*pod\s+'([^']+)'/gm), (match) => match[1]))
      .toEqual(["Capacitor", "CapacitorCordova", "CapacitorCommunitySqlite"]);
    expect(Object.values(nativeSources).join("\n")).not.toMatch(
      /com\.apple\.developer\.(?:networking|associated-domains)|aps-environment/,
    );
  });
});
