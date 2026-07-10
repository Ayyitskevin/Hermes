import { describe, expect, it } from "vitest";

import capacitorConfig from "../../capacitor.config";
import sourceHtml from "../../index.html?raw";
import xcodeProject from "../../ios/App/App.xcodeproj/project.pbxproj?raw";
import infoPlist from "../../ios/App/App/Info.plist?raw";

const APP_ID = "app.hermesjournal.mobile";
const APP_NAME = "Hermes Journal";

describe("native application identity", () => {
  it("keeps Capacitor and both Xcode configurations on the provisional app ID", () => {
    expect(capacitorConfig.appId).toBe(APP_ID);
    expect(xcodeProject.split(`PRODUCT_BUNDLE_IDENTIFIER = ${APP_ID};`)).toHaveLength(3);
  });

  it("keeps the web and native display names aligned", () => {
    expect(capacitorConfig.appName).toBe(APP_NAME);
    expect(sourceHtml).toContain(`<title>${APP_NAME}</title>`);
    expect(infoPlist).toContain(`<string>${APP_NAME}</string>`);
  });

  it("ships a local bundle with network connections blocked in the demo", () => {
    expect(capacitorConfig.server).toBeUndefined();
    expect(sourceHtml).toContain("connect-src 'none'");
  });
});
