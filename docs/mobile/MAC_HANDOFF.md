# Hermes Journal iOS macOS/Xcode handoff

The shared TypeScript work is buildable on Linux. Apple signing, Simulator,
physical-device verification, archives, TestFlight, and App Store upload are not.
Run this handoff on a Mac with Node 22.12+ and the current App Store-required
Xcode installed.

## Reproduce the native project

```bash
git switch codex/ios-paid-app-foundation
cd mobile
npm ci
npx playwright install chromium
npm run typecheck
npm test
npm run test:e2e
npm run ios:sync
npm run ios:open
```

`ios:sync` rebuilds the local bundle before copying it into Xcode. The production
Capacitor configuration deliberately has no remote `server.url`.

## Xcode setup

1. Open `mobile/ios/App/App.xcodeproj` through `npm run ios:open`.
2. Select the `App` target and the project's Apple development team.
3. Confirm display name `Hermes Journal`, marketing version `1.0`, build `1`,
   automatic signing, iPhone-only device family, and iOS 16 minimum.
4. Confirm provisional bundle ID `app.hermesjournal.mobile`. Do not register the
   final App Store record or upload a build until name and identifier ownership
   are cleared; Apple does not permit changing the bundle ID after build upload.
5. Resolve the local Swift package; Capacitor is locked to 8.4.1.
6. Replace the generated Capacitor icon and splash assets before distribution.
7. Run on Simulator and at least one physical supported iPhone.

Do not add network, tracking, credential, background, or entitlement capabilities
to silence a warning. Each capability must correspond to reviewed product behavior
and an App Store disclosure.

## Foundation device acceptance

- Delete/reinstall and launch in airplane mode.
- Complete all three welcome pages; force quit and confirm completion persists.
- Confirm `DEMO` remains visible and every displayed result is labeled fictional.
- Visit Dashboard, Trades, Journal, Reports, and More with VoiceOver.
- Search trades by symbol, setup, side, and tag; verify the empty search state.
- Verify the Dashboard metric values reconcile with the eight bundled records.
- Calculate valid long and short plans; verify wrong-side stops show inline errors.
- Exercise settings/welcome focus containment and focus return.
- Verify all tabs at 320–430 CSS-pixel widths, portrait and landscape.
- Test 200% accessibility text, reduced motion, and numeric keyboards.
- Inspect the WebView network log: demo mode may load bundled files only.
- Confirm the app offers no durable mutation before the SQLite slice lands.

Record device model, iOS version, Xcode version, commit SHA, result, screenshots,
and every skipped check. A clean console alone is not evidence.

## App Store Connect

1. Enroll in the Apple Developer Program and accept the Paid Apps Agreement.
2. Complete banking and tax setup.
3. Clear the final product name, bundle identifier, trademark risk, and domain.
4. Create the app record and set the upfront price to the $9.99 tier. Do not add
   a subscription or an in-app lifetime unlock.
5. Add support/privacy URLs, an in-app privacy link, privacy nutrition labels,
   age rating, category, screenshots, description, keywords, and review notes.
6. Verify the archive and every bundled SDK before claiming `Data Not Collected`.
   Device/iCloud backup behavior must be described accurately.
7. Archive, validate, upload, and distribute through TestFlight first.
8. Submit only after persistence/import, physical-device, privacy, brand, and
   human financial-disclosure gates in `IOS_ROADMAP.md` are green.

## Known holds

- This Linux work has not run Xcode, Simulator, code signing, an archive,
  TestFlight, VoiceOver on device, or a physical-iPhone test.
- The checked-in icon/splash files are generated placeholders.
- `Hermes Journal` and `app.hermesjournal.mobile` are working identifiers, not
  evidence of App Store or trademark availability.
- Durable SQLite records, manual entry, CSV import, export, restore, and deletion
  are Phase 1 and are not represented by the read-only demo.
- Direct broker/market-data connectivity is outside the launch path until rights,
  privacy, security, and recurring-cost reviews are complete.
