# Hermes Journal iOS macOS/Xcode handoff

The shared TypeScript work is buildable on Linux. Apple signing, Simulator,
physical-device verification, archives, TestFlight, and App Store upload are not.
Run this handoff on a Mac with Node 22.12+ and the current App Store-required
Xcode installed.

## Branch reconciliation record

The divergent histories were reconciled without force on 2026-07-12 by merge
`4ac0a5f`: first parent `b700ec0` is the reviewed blueprint/manual-capture
milestone and second parent `da7ad61` is the formerly unique `origin/main`
merge. No branch was deleted and neither history was rewritten.

Before native acceptance, update the checkout from the canonical branch and
confirm that the shipped `origin/main` descends from the recorded merge:

```bash
git fetch origin
git switch main
git pull --ff-only origin main
git log --oneline --decorate -8
git merge-base --is-ancestor 4ac0a5f origin/main
git status --short
```

Stop if that ancestry check fails, if `main` does not contain the reviewed
mobile foundation/manual capture, or if the working tree contains unexplained
changes.

## Reproduce the native project

```bash
cd mobile
npm ci
npx playwright install chromium
npm run typecheck
npm test
npm run test:e2e
npm run ios:sync
cd ios/App
pod install
cd ../..
npm run ios:open
```

`ios:sync` rebuilds the local bundle before copying it into Xcode. The production
Capacitor configuration deliberately has no remote `server.url`. Linux cannot
run CocoaPods, so the first reviewed Mac run must generate `Podfile.lock` and
`App.xcworkspace`; review and commit both plus any CocoaPods project-phase
changes before treating native dependency resolution as reproducible.

## Xcode setup

1. Run `pod install`, then open `mobile/ios/App/App.xcworkspace` through
   `npm run ios:open`. Do not build the `.xcodeproj` directly.
2. Select the `App` target and the project's Apple development team.
3. Confirm display name `Hermes Journal`, marketing version `1.0`, build `1`,
   automatic signing, iPhone-only device family, and iOS 16 minimum.
4. Confirm provisional bundle ID `app.hermesjournal.mobile`. Do not register the
   final App Store record or upload a build until name and identifier ownership
   are cleared; Apple does not permit changing the bundle ID after build upload.
5. Confirm `Podfile.lock` resolves Capacitor/CapacitorCordova 8.4.1 and
   CapacitorCommunitySqlite 8.1.0. The project intentionally uses CocoaPods:
   the plugin's current Swift-package manifest can resolve a different Capacitor
   patch line than the app. Confirm CocoaPods generated every framework and
   resource-copy phase, then commit the lockfile, workspace, and reviewed project
   changes; never commit `Pods/`.
6. Replace the generated Capacitor icon and splash assets before distribution.
7. Run on Simulator and at least one physical supported iPhone.

Do not add network, tracking, credential, background, or entitlement capabilities
to silence a warning. Each capability must correspond to reviewed product behavior
and an App Store disclosure.

## Execution-ledger device acceptance

- Delete/reinstall and launch in airplane mode.
- Complete all three welcome pages; force quit and confirm completion persists.
- Choose **Start my journal** and confirm the empty journal is primary. Separately
  choose the demo and confirm `DEMO` remains visible and every result is fictional.
- Import a two-fill CSV, confirm the preview/mapping/receipt, force quit, relaunch,
  and reconcile the closed-trade P&L including both fees.
- Re-import the same file and confirm no duplicate execution or performance.
- In a fresh journal, manually enter an opening and closing fill with fees.
  Confirm the review step shows the canonical values, the result reconciles,
  no import receipt is manufactured, and force quit/relaunch preserves both
  immutable manual sources and their projection.
- Retry the same manual submission during an interrupted/double-tap scenario and
  confirm only one execution and one projection generation are created. Enter a
  genuinely identical second fill separately and confirm it is retained.
- Simulate a committed SQLite transaction whose bridge response never reaches
  the WebView, terminate the app, and relaunch. Confirm startup reports the
  already-saved fill, acknowledges its encrypted v2 command record only after
  reading the active ledger, and never creates a second execution.
- Start once from a retained schema-v2 database and interrupt the v2-to-v3
  migration at the statement/user-version boundary. Relaunch and confirm the
  migration receipt replays safely, every execution remains intact, and review
  reads and writes work only after schema v3 is fully acknowledged.
- Exercise a daylight-saving gap and repeated clock hour. The gap must fail;
  the repeated hour must require the explicit UTC-offset field and save the
  intended instant.
- Reuse the same external execution ID with a changed symbol or price and
  confirm the entire batch is rejected without partial state. A generic no-ID
  export cannot prove that a changed row is a correction.
- Roll back the receipt; confirm projections disappear while the source rows,
  receipt, and rollback audit remain.
- Combine a manual opening fill with an imported closing fill, roll back the
  import receipt, and confirm the manual fill remains active and outside import
  occurrence ownership.
- Import that exact file again; confirm a new committed receipt restores the
  executions while the first receipt remains visibly rolled back.
- Import overlapping files A(shared fill) and B(shared fill + new fill). Roll
  back A and confirm both B fills remain active; then roll back B and confirm
  fills for which B was the final active reference are deactivated.
- Import equal-timestamp entry and exit fills across separate batches, then
  repeat rollback/restore with reversed CSV rows. Confirm the original stable
  ledger order and P&L remain unchanged.
- With two accounts, confirm every receipt retains its own account label and
  every new/restore import requires explicit account selection.
- Inspect the native database with an approved debug procedure and confirm it is
  SQLCipher-encrypted; no passphrase may appear in logs, preferences, or files.
- Exercise a missing/corrupt Keychain secret and a corrupt/interrupted database
  migration. Both must fail visibly without silently creating a replacement
  journal over existing data.
- Visit Dashboard, Trades, Journal, Reports, and More with VoiceOver.
- Search trades by symbol, setup, side, and tag; verify the empty search state.
- Open a closed trade's review sheet, save both a draft and a completed
  successor, and verify note, setup, mistakes, emotion, tags, playbook rules,
  risk, stop, exact R-multiple, exact percentage return, and their formula
  versions survive force quit/relaunch. Edit it again and confirm a new review
  version is appended while every execution fact remains unchanged.
- Batch-tag two trades atomically. Retry the exact submission after a simulated
  lost response and confirm no duplicate review version is created; combine one
  already-saved submission with one fresh submission and confirm the mixed
  batch is rejected without partial state.
- With VoiceOver and a hardware keyboard, confirm focus remains inside the
  review sheet through rule removal and returns to its trigger on close.
  While a save is pending, confirm every editable control is disabled.
- At 320 CSS pixels and 200% accessibility text, confirm the review sheet has no
  horizontal overflow. Confirm any metric derived from an open trade is visibly
  labeled partial, and edited draft inputs do not relabel saved-version metric
  evidence as newly persisted facts.
- Build a local journal containing CSV source rows, an independent manual fill,
  a rolled-back receipt, and at least two immutable versions of one trade review.
  In More, confirm export warns that JSON is unencrypted, restore is blocked
  while the journal is nonempty, and Delete All Data remains unavailable.
- In airplane mode, activate **Prepare export**. Confirm no destination opens
  during preparation, focus stays on the same control when it becomes
  **Share or save export**, and no Hermes/network request occurs.
- With VoiceOver, activate the second step. If file-capable Web Share is
  available, cancel the iOS share sheet and confirm cancellation is announced
  without fallback. On success, verify the UI says the export was handed to the
  selected destination; for download fallback, verify it says Download
  requested—never saved or completed.
- Confirm the plaintext warning before handoff, then reopen the saved file from
  Files with an approved diagnostic tool. Confirm the filename, custom JSON
  media type/fallback behavior, format
  v1, all schema-v3 table/column signatures, raw CSV/manual provenance,
  historical/current reviews, formula definitions, stable subjects, empty
  attachment catalog, and outer checksum. Do not log journal content.
- Export the unchanged journal twice. Confirm state/report digests match while
  export timestamps/archive digests differ. Then mutate one fact and confirm the
  user-state digest changes.
- Save that current-schema export in Files. On a separate fresh empty data
  container, remain in airplane mode and confirm More shows a labeled local
  restore chooser after export; demo mode must expose no restore control.
- Confirm a file larger than 64 MiB is rejected before it is read. Exercise an
  approved near-67,108,864-byte fixture while observing peak memory and low
  storage; record any termination or duplicate in-memory copies.
- Select the matching native `sqlite-table-set` v1 archive. Confirm preview
  verifies all 32 tables and 257 ordered columns, shows recomputed workspace,
  count, and digest claims alongside checksum-verified export time and
  adapter-validated payload metadata, and leaves the empty journal unchanged
  after the trial transaction rolls back.
- Before confirmation, inspect the destination through an approved diagnostic
  path: only current migration receipts and metric definitions may remain.
  `foreign_key_check` must be empty and `quick_check` must be `ok`.
- Cancel preview and confirm the prepared approval is invalidated and focus
  returns to the file chooser. Change the file during an asynchronous preview
  and confirm stale results never enable restore.
- Try a browser `browser-session-state` v1 file, wrong payload version, stale
  migration set, changed table/column shape, noncanonical/out-of-range integer,
  row/table/state/report/summary tamper, and an attachment-bearing fixture.
  Every case must fail visibly without changing the destination; do not log
  journal contents.
- Confirm the final checkbox is required, then restore the valid native archive
  in airplane mode. Force quit/relaunch and reconcile raw provenance, inactive
  history, review chains/heads, metric definitions, stable subjects, ledger,
  report digest, and state digest against the source.
- Export the restored journal again. State/report digests must equal the source
  even though export time/archive digest may differ. Confirm no archive SQL was
  executed and no live table-SQL diagnostic was treated as compatibility input.
- Simulate commit success with a lost bridge response, then retry the exact
  selected archive. Hermes must return the already-restored outcome without
  inserting duplicates. Repeat with an injected failure before commit and
  confirm the destination remains empty and the same preview can be retried.
- Change the journal after preview and confirm commit refuses it atomically.
  With any different nonempty journal, More must show the blocked explanation
  with no chooser or enabled restore action; restore never merges or overwrites.
- With VoiceOver, Dynamic Type at 200%, a hardware keyboard, and 320 CSS pixels,
  verify chooser labeling, status/error announcements and focus, confirmation,
  Cancel, uncertain-status retry guidance, 44-point targets, and no horizontal
  overflow.
- Exercise background/foreground, force quit during preview and commit, device
  restart, destination denial, low storage, and a near-limit archive. Record
  observed state after every interruption; a clean console is not evidence.
- Exercise share failure, destination denial, low storage, a near-limit journal,
  background/foreground during preparation, force quit, and relaunch. Every
  uncertain path must stay retryable and must not report a saved file falsely.
- Verify the Dashboard metric values reconcile with the eight bundled records.
- From Dashboard, open Plan Check and verify
  `plan-adherence-report-v1`, checksum
  `0f092c3bdd6c5051e97f5be0f1c7758a01e3159875adf660b1b0ea00f970ae85`,
  an 8-of-8 cohort, five followed trades at +106 USD cash expectancy, three
  broken trades at -73.333333333333 USD cash expectancy, and the
  +179.333333333333 USD followed-minus-broken observational difference.
- Open both Plan Check groups with VoiceOver and reconcile their disjoint
  trades, current saved rule evidence, exact net/win/R coverage, 44-point
  summaries, exclusion/threshold/rounding copy, and non-causal/non-advisory
  disclosure.
- In Reports, verify Setup Breakdown shows
  `setup-performance-report-v1` and checksum
  `5779276cbbc4278136f96bbaca167216c60b395cdad4a8bb4cf9c3b5f272601b`,
  an 8-of-8 cohort, and stable code-unit-ordered
  Breakout/Pullback/Reversal groups with exact cash expectancy of
  +56.666666666667/+86.666666666667/-60 USD.
- Open all three groups with VoiceOver and reconcile their disjoint contributing
  trades, exact net/win/R values, 44-point summaries, exclusion/rounding copy,
  and non-ranking/non-advisory disclosure.
- With a local fixture containing at least six classified setup names and one
  setup with at least 26 included trades, verify each group action adds at most
  five groups, each evidence action adds at most 25 contributors, live status
  stays exact, focus moves to the first newly revealed group, controls remain
  44 points, and 200% text reflows at 320 CSS pixels without clipping.
- After native export → empty-container restore, verify both governed reports,
  their checksums, cohorts, exclusions, group/evidence order, exact values, and
  contributor identities equal the source.
- Calculate valid long and short plans; verify wrong-side stops show inline errors.
- Exercise settings/welcome focus containment and focus return.
- Verify all tabs at 320–430 CSS-pixel widths, portrait and landscape.
- Test 200% accessibility text, reduced motion, and numeric keyboards.
- Inspect the WebView network log: demo mode may load bundled files only.
- Verify kill/relaunch, low-storage/interrupted import, device restart, app update,
  and migration behavior with positive state evidence.

Record device model, iOS version, Xcode version, commit SHA, result, screenshots,
and every skipped check. A clean console alone is not evidence.

## App Store Connect

1. Enroll in the Apple Developer Program and accept the Paid Apps Agreement.
2. Complete banking and tax setup.
3. Clear the final product name, bundle identifier, trademark risk, and domain.
4. Only after explicit owner approval, create the app record and set the
   approved upfront tier. The current $9.99 figure is an unapproved hypothesis.
   Do not add a subscription or an in-app lifetime unlock.
5. Add support/privacy URLs, an in-app privacy link, privacy nutrition labels,
   age rating, category, screenshots, description, keywords, and review notes.
6. Verify the archive and every bundled SDK before claiming `Data Not Collected`.
   Device/iCloud backup behavior must be described accurately.
   SQLCipher also requires an export-compliance determination; do not set
   `ITSAppUsesNonExemptEncryption` or answer App Store encryption questions by
   guesswork.
7. Archive, validate, upload, and distribute through TestFlight first.
8. Submit only after persistence/import, physical-device, privacy, brand, and
   human financial-disclosure gates in `IOS_ROADMAP.md` are green.

## Known holds

- This Linux work has not run Xcode, Simulator, code signing, an archive,
  TestFlight, VoiceOver on device, or a physical-iPhone test.
- The checked-in icon/splash files are generated placeholders.
- `Hermes Journal` and `app.hermesjournal.mobile` are working identifiers, not
  evidence of App Store or trademark availability.
- SQLCipher is configured and the schema/import repository is tested on Linux,
  but native encryption/Keychain behavior has not been observed on a Mac/iPhone.
- The database is configured in the app's `Documents` container so the plugin
  does not apply its custom-directory backup-exclusion flag. Actual device and
  iCloud backup inclusion—and whether the matching Keychain item restores—remain
  unresolved until measured and reflected in privacy/help copy.
- Manual entry, versioned reviews, governed Plan Check and Setup Breakdown,
  export generation, and Slice C-B local restore still need the native
  persistence, response-loss, migration, accessibility, and lifecycle checks
  above. Native Web Share/Files cancellation, save, reopen, custom MIME
  behavior, restore preview rollback, atomic commit, post-commit
  reconciliation, interruption retry, and near-64-MiB memory behavior have not
  been observed.
- Current matching-runtime archives remain incomplete native backups:
  attachment catalog v1 is empty and archives containing attachments are
  rejected. Attachments and Delete All Data remain incomplete Phase 1 work.
- `Podfile.lock`, `App.xcworkspace`, and final CocoaPods-generated build phases
  are Mac gates and are not yet present/reviewed.
- Direct broker/market-data connectivity is outside the launch path until rights,
  privacy, security, and recurring-cost reviews are complete.
