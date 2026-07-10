import { describe, expect, it } from "vitest";

import { escapeHtml } from "./html";

describe("HTML escaping", () => {
  it("neutralizes markup from future imported or provider-backed fields", () => {
    expect(escapeHtml(`<script data-note="'">a & b</script>`)).toBe(
      "&lt;script data-note=&quot;&#039;&quot;&gt;a &amp; b&lt;/script&gt;",
    );
  });
});
