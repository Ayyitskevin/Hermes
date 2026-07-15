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
npm run test:boundary
npm test
npm run test:ios-sync
npm run test:e2e
npm run ios:copy
npm run verify:ios-sync
npm run ios:sync
npm run ios:open
```

`ios:copy` rebuilds the local bundle and copies web/config artifacts without a
native dependency update. Run verify:ios-sync immediately after that copy, while
tracked native/lockfile state is still clean. It proves every production file
copied byte-for-byte and validates the selected generated app identity/SQLite
registration contract. Those PASS rows are pre-native handoff evidence only;
they leave every CocoaPods, Xcode, Simulator, iPhone, SQLCipher/Keychain,
lifecycle, and accessibility row NOT RUN.

Only after that report, run `ios:sync`. With the pinned Capacitor CocoaPods
project on a Mac, this repeats the copy, updates native plugin files, and invokes
CocoaPods. The production configuration deliberately has no remote `server.url`.
The first reviewed Mac run must generate `Podfile.lock` and `App.xcworkspace`;
review and commit both plus any CocoaPods project-phase changes before treating
native dependency resolution as reproducible. Record the Pod command/output in
the separate native evidence rows; do not revise the earlier pre-native report.

## Xcode setup

1. After `npm run ios:sync` completes its CocoaPods update, open
   `mobile/ios/App/App.xcworkspace` through `npm run ios:open`. If the Podfile is
   changed separately, rerun `pod install` first. Do not build the `.xcodeproj`
   directly.
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
- Hold a native database open long enough to observe the semantic **Opening
  Hermes Journal** status with VoiceOver. Inject Keychain-missing, integrity,
  initial-ledger-read, and teardown failures separately. Confirm the recovery
  heading is focused, raw plugin/path detail is absent, no demo/browser or
  replacement journal opens, and no reset/delete action appears. After a clean
  teardown, **Try opening again** must perform one full reload and reopen the
  same retained journal; after teardown failure, no retry control may appear
  and the copy must require a full app close/reopen. Repeat at 320 CSS pixels
  and 200% Dynamic Type.
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
- Repeat from a retained schema-v3 database while interrupting v3-to-v4 at the
  statement/user-version boundary. Relaunch and confirm all ledger/review facts
  remain intact, the checksum-pinned receipt replays safely, and Daily Journal
  reads/writes begin only after schema v4 is fully acknowledged.
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
- With the same symbol in two accounts, select each stable account in turn and
  confirm no result crosses accounts even when labels or symbols match. Every
  card must expose its account label.
- Apply inclusive allocation/activity date boundaries across a multi-day trade,
  including a zero-P&L allocation. Reconcile the exact scoped P&L, contributing
  trade, allocation, and activity-day counts. Confirm the scoped contribution
  label remains separate from each card's whole-trade realized-to-date result.
- Page backward and forward only through months containing scoped activity.
  Confirm the month heading and announcement, selected-day pressed state, focus
  visibility, 44-point controls, and no invented empty calendar sessions.
- Search scoped trades by symbol, account, setup, side, status, review state,
  mistake, emotion, or tag. Confirm search changes visible cards only and never
  the exact scope summary.
- Apply asset-class, direction, position-state, and review-state facets in
  combination with search. Confirm they AND against canonical trade fields,
  change visible cards only, expose the asset-class chip, and leave exact scope
  P&L/counts, the calendar, Dashboard, Plan Check, and Setup Breakdown unchanged.
  For duplicate symbols, confirm each heading and review action announces enough
  asset-class/account/session context to identify the intended trade.
- With VoiceOver and a hardware keyboard, confirm account/range/day/search/facet
  state survives tab navigation and valid ledger refreshes. Clearing a selected
  day must retain account/range and card filters; Clear search and filters must
  retain account/range/day while clearing search/facets; Clear all must reset
  both layers. Switching local/demo mode or reloading must reset session-only state.
  If an account or day disappears after refresh, confirm Hermes announces the
  recovery instead of silently broadening or trapping the app.
- Confirm Dashboard headline P&L, equity, and review progress plus Plan Check
  and Setup Breakdown remain whole-workspace while only Trades and the
  Dashboard calendar are scoped.
- At 320 CSS pixels and 200% accessibility text, confirm account select, date
  inputs, four facet selects, month controls, day tiles, scope summary,
  contribution evidence, and focused destinations have no horizontal overflow
  or clipping.
- Open a closed trade's review sheet, save both a draft and a completed
  successor, and verify note, setup, mistakes, emotion, tags, playbook rules,
  risk, stop, exact R-multiple, exact percentage return, and their formula
  versions survive force quit/relaunch. Edit it again and confirm a new review
  version is appended while every execution fact remains unchanged.
- For the individual review sheet, simulate bridge loss before and after
  commit. Confirm the same frozen batch/member submission is replayed without
  rereading authored controls or generating an ID, historical receipt recovery
  returns the original version after a newer head, non-head ambiguity stays
  frozen, and a proven commit with render failure exposes refresh only. Repeat
  through background/foreground, force quit/relaunch, a second real scene,
  VoiceOver, hardware keyboard, and 200% Dynamic Type before marking native
  acceptance PASS.
- For a deterministic individual-review stale head, keep every raw static field
  and ordered rule row in scene one while scene two saves a successor. Confirm
  dismissal stays locked until one fresh snapshot proves and displays exactly
  one coherent newer review; no review/submission/revision IDs or native errors
  may render. Consent must say the entire local form is the next version, not a
  merge, rotate identity once, and require a separate save. If the winner is
  completed, only a completed successor may remain. Advance the head again
  between evidence and save and confirm scene one rejects, clears old evidence,
  and requires fresh evidence plus second consent before appending. Repeat
  evidence failure, background/foreground, force quit/relaunch, VoiceOver,
  hardware keyboard, 200% Dynamic Type, and two real scenes before marking
  native acceptance PASS.
- Batch-tag two trades atomically and confirm ordinary success plus mixed
  saved/fresh atomic rejection. Do not mark ambiguous-save recovery PASS:
  current batch-tag UI recreates member and batch identities on a new action and
  is an explicit HIGH hold until it retains one exact prepared batch.
- With VoiceOver and a hardware keyboard, confirm focus remains inside the
  review sheet through rule removal and returns to its trigger on close.
  While a save is pending, confirm every editable control is disabled.
- At 320 CSS pixels and 200% accessibility text, confirm the review sheet has no
  horizontal overflow. Confirm any metric derived from an open trade is visibly
  labeled partial, and edited draft inputs do not relabel saved-version metric
  evidence as newly persisted facts.
- In Journal, save a draft daily reflection for today, then use **Write another
  date** to save a no-trade-day reflection. Confirm the create date defaults to
  the newest unused date, an edited entry's date is immutable, and each explicit
  draft/completed save appends one version while one current head remains per
  date. No autosave may occur after accepting discard.
- Retry an exact Daily Journal submission after simulated bridge loss before
  and after commit. Confirm the sheet retains the same submission ID,
  predecessor, normalized content, and revision; exposes no close or second
  save path; and creates no duplicate version. Repeat the unknown result, then
  commit a later head from a second scene and confirm exact replay either
  returns the original receipt or enters deterministic stale recovery—matching
  authored text under a different submission is never proof. A known committed
  save followed by refresh failure must remain labeled saved and expose refresh
  only. Exercise a changed submission and confirm it fails without partial
  vocabulary/version/head state.
- For a stale head, leave every authored field and the intended draft/completed
  action in the first scene, commit a different successor from a second scene,
  and confirm the first scene says nothing was overwritten, blocks both old
  save actions, and keeps Cancel/Escape behind dirty-discard confirmation.
  **Review latest saved version** must load and visibly compare the exact newer
  head without replacing the local form. Only
  **Continue with my unsaved changes** may enable saving against that head, and
  a separate save must append one successor with a new receipt. Repeat with
  another intervening head and
  with reload failure; both must fail closed with the writing retained.
- With VoiceOver, a hardware keyboard, 320 CSS pixels, and 200% Dynamic Type,
  verify heading focus, reverse/forward focus containment, background inerting,
  dirty-close confirmation, all-controls-disabled busy state, character-count
  feedback, 44-point targets, long-token wrapping, and truthful reconcile copy.
  Demo and empty workspaces must expose no Daily Journal write control.
- Chromium already proves deterministic stale and unknown-outcome retained-
  editor races in one application/store offline. Exact replay does not reread
  form values or generate an ID, repeated ambiguity stays locked, a later head
  enters stale recovery, and a proven commit/render failure exposes refresh
  only. Export proves one receipt per accepted immutable version alongside
  focus, inerting, 44-point actions, long-token wrapping, and 320px/200%
  reflow. Treat this only as a browser analogue: repeat it with native SQLite,
  two real scenes/screens, VoiceOver, Dynamic Type, background/foreground,
  bridge loss, and force-quit behavior.
- Linux/Chromium Recovery Continuity now composes a UI-authored draft through
  export, offline empty-session restore, continued writing, re-export, and a
  second restore. It also delays one browser `File.text()`, replaces the file,
  and proves stale evidence never becomes approvable. This is a test analogue,
  not completion of the native Files, adapter-latency, WKWebView, lifecycle, or
  device-accessibility checks below.
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
  v1, all schema-v4 table/column signatures, raw CSV/manual provenance,
  historical/current trade and daily-review chains, formula definitions, stable
  subjects, empty attachment catalog, and outer checksum. Do not log journal
  content.
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
  verifies all 35 tables and 280 ordered columns, shows recomputed workspace,
  count, and digest claims alongside checksum-verified export time and
  adapter-validated payload metadata, and leaves the empty journal unchanged
  after the trial transaction rolls back.
- Before confirmation, inspect the destination through an approved diagnostic
  path: only current migration receipts and metric definitions may remain.
  `foreign_key_check` must be empty and `quick_check` must be `ok`.
- Cancel preview and confirm the prepared approval is invalidated and focus
  returns to the file chooser. Change the file during an asynchronous preview
  and confirm stale results never enable restore.
- Try a browser `browser-session-state` v2 file, browser v1 file, wrong payload
  version, stale
  migration set, changed table/column shape, noncanonical/out-of-range integer,
  row/table/state/report/summary tamper, and an attachment-bearing fixture.
  Every case must fail visibly without changing the destination; do not log
  journal contents.
- Confirm the final checkbox is required, then restore the valid native archive
  in airplane mode. Force quit/relaunch and reconcile raw provenance, inactive
  history, trade-review and Daily Journal chains/heads/ordered vocabulary,
  metric definitions, stable subjects, ledger, report digest, and state digest
  against the source. Save another reflection after restore, export again, and
  restore that file into a second empty container to prove continued writes.
  After each successful restore refresh, confirm focus lands on the stable
  rendered screen rather than the removed commit control or browser chrome.
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

## Native evidence record

File one record per commit/device run in the downstream handoff. Use only
PASS, FAIL, NOT RUN, or BLOCKED; a blank row is not a pass.

    commit: <full SHA>
    recorded_at: <ISO-8601 with timezone>
    operator: <name>
    macos: <version>
    xcode: <version and build>
    simulator: <model + iOS, or NOT RUN>
    device: <model + iOS, or NOT RUN>
    configuration: <Debug/Release; signing team redacted>

| Gate | Status | Re-runnable evidence / artifact |
|---|---|---|
| npm ci + TypeScript/unit/browser gates | status | commands + result |
| verify:ios-sync bundle/config/copy/drift | status | digest + output |
| pod install + reviewed Podfile.lock/workspace | status | command + diff |
| xcodebuild compile/test | status | exact command + result bundle |
| Simulator startup/recovery/lifecycle | status | fixture + screenshot/log |
| Physical iPhone startup/recovery/lifecycle | status | fixture + screenshot/log |
| SQLCipher/Keychain/backup/migration | status | diagnostic evidence |
| VoiceOver/Dynamic Type/keyboard/layout | status | settings + observed result |
| Files export/restore/continued writes | status | archive digests + result |

    open: <every skipped, blocked, failed, or ambiguous item>

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
- Chromium proves the generic Startup Recovery v1 alert/focus/reload and
  teardown ownership contract only. Native Keychain/integrity/connection
  failure injection, same-journal retry, close-failure relaunch, VoiceOver, and
  Dynamic Type remain unobserved.
- Native plugin diagnostics and error logging have not been audited on device.
  Do not claim that journal paths or technical failure details stay out of the
  Xcode/device console until that dependency/runtime audit has recorded evidence.
- Browser Daily Journal exact-command recovery is implemented and covered, but
  native acceptance is NOT RUN. Record lost responses before/after commit,
  confirmed-not-saved ambiguity, repeated unknown results, stale-after-unknown,
  successor receipt lookup, refresh failure after proven commit, multi-scene
  lifecycle, relaunch, and accessibility before accepting this path on iOS.
- Browser Single-Trade Review exact-command recovery is implemented and
  covered, but native acceptance is NOT RUN. Record bridge loss before/after
  commit, repeated ambiguity, historical receipt recovery, competing-head and
  submission-collision behavior, refresh-only post-proof recovery,
  multi-scene/lifecycle/relaunch, VoiceOver, hardware keyboard, and Dynamic
  Type. Browser Individual Trade Review stale-head recovery is also implemented:
  Chromium proves a failed evidence refresh, exact v2 comparison, complete-form
  consent, a hidden v3 race, second proof/consent, completed-state monotonicity,
  and final v4/one-head/four-receipt state; SQLite proves the exact chain and
  stale no-mutation. Native multi-scene/lifecycle/accessibility acceptance is
  still NOT RUN and must not inherit these results. Atomic batch ambiguous
  recovery remains a human-gated HIGH pending a durable batch-receipt schema.
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
  Trade Browser Scope v1, export generation, and Slice C-B local restore still
  need persistence, response-loss, migration, accessibility, and lifecycle
  checks above. Native Web Share/Files cancellation, save, reopen, custom MIME
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
