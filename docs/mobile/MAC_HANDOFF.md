# Hermes iOS macOS/Xcode handoff

The shared web/TypeScript work is buildable on Linux. Apple signing, Simulator,
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
npm run build
npm run test:e2e
npm run ios:sync
npm run ios:open
```

`ios:sync` rebuilds the local bundle before copying it into the Xcode project.
The production Capacitor config deliberately has no remote `server.url`.

## Xcode setup

1. Open `mobile/ios/App/App.xcodeproj` through `npm run ios:open`.
2. Select the `App` target and the owner's Apple development team.
3. Confirm bundle ID `com.kleephotography.hermes`, marketing version `1.0`,
   build `1`, automatic signing, iPhone-only device family, and iOS 16 minimum.
4. Resolve the local Swift package; Capacitor is locked to 8.4.1.
5. Replace the generated Capacitor icon and splash assets before distribution.
6. Run on Simulator and at least one physical supported iPhone.

Do not add network, tracking, credential, background, or entitlement capabilities
just to silence a warning. Each capability must correspond to a reviewed feature
and App Store disclosure.

## Device acceptance pass

- Delete/reinstall and launch in airplane mode.
- Complete all three onboarding pages; force quit and confirm they stay complete.
- Confirm `SAMPLE` appears on every tab and no sample value is labeled live.
- Open/close the risk rail and settings with VoiceOver.
- Verify all five tabs at 320–430 CSS-pixel widths, portrait and landscape.
- Test larger accessibility text, reduced motion, and numeric-keyboard presentation.
- Calculate valid long and short plans; verify wrong-side stops show inline errors.
- Inspect the WebView network log: sample mode may load bundled files only.
- Confirm no journal mutation is offered as durable until the SQLite slice lands.

Record the device model, iOS version, Xcode version, commit SHA, pass/fail result,
screenshots, and any skipped checks. A clean console alone is not evidence.

## App Store Connect

1. Enroll in the Apple Developer Program and accept the Paid Apps Agreement.
2. Complete banking and tax setup.
3. Create the app record with the final name and bundle identifier.
4. Set the upfront app price to the $9.99 tier. Do not create a subscription or
   in-app lifetime unlock for this product contract.
5. Add support/privacy URLs, privacy nutrition labels, age rating, category,
   screenshots, description, keywords, and review notes explaining sample mode.
6. Archive in Xcode, validate, upload, and distribute through TestFlight first.
7. Submit only after the physical-device, privacy, provider-rights, and human
   financial-disclosure gates in `IOS_ROADMAP.md` are green.

## Known holds

- This Linux session did not run Xcode, Simulator, code signing, an archive,
  TestFlight, or a physical-iPhone test.
- The checked-in icon/splash files are generated placeholders.
- Connected market data remains intentionally locked pending written rights.
- SQLite journal persistence and parity fixtures are Phase 1, not represented by
  the current sample-only journal cards.
