import { describe, expect, it } from "vitest";

import capacitorConfig from "../../capacitor.config";
import sourceHtml from "../../index.html?raw";
import xcodeProject from "../../ios/App/App.xcodeproj/project.pbxproj?raw";
import podfile from "../../ios/App/Podfile?raw";
import infoPlist from "../../ios/App/App/Info.plist?raw";
import packageJson from "../../package.json";

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

  it("pins encrypted SQLite and wires it through CocoaPods without the drifting SPM bridge", () => {
    expect(packageJson.dependencies["@capacitor-community/sqlite"]).toBe("8.1.0");
    expect(capacitorConfig.plugins?.CapacitorSQLite).toMatchObject({
      iosDatabaseLocation: "Documents",
      iosIsEncryption: true,
      iosKeychainPrefix: APP_ID,
    });
    expect(podfile).toContain("platform :ios, '16.0'");
    expect(podfile).toContain("pod 'CapacitorCommunitySqlite', :path => '../../node_modules/@capacitor-community/sqlite'");
    expect(xcodeProject).toContain("Pods_App.framework in Frameworks");
    expect(xcodeProject).not.toContain("CapApp-SPM");
  });

  it("keeps the iOS target iPhone-only at the supported deployment floor", () => {
    expect(xcodeProject.match(/IPHONEOS_DEPLOYMENT_TARGET = 16\.0;/g)).toHaveLength(4);
    expect(xcodeProject.match(/TARGETED_DEVICE_FAMILY = 1;/g)).toHaveLength(2);
    expect(infoPlist).toContain("<string>arm64</string>");
    expect(infoPlist).not.toContain("<string>armv7</string>");
  });
});
