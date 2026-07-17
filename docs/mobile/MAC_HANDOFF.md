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
- Exercise **Preview CSV** with no file, a file larger than 5 MiB, an induced
  read failure, and synchronous account/time-zone/currency/preparation
  rejection. Confirm the existing status is announced, visibly outlined, and
  focused clear of safe-area/app chrome; stale preview/commit state is removed;
  authored controls and the selected file remain exact when present; and no
  receipt, SQLite, or network work occurs. Delay a read, then change options and
  the selected file: the late resolve/rejection must not replace current
  content, file ownership, or focus. Confirm ready and invalid previews focus
  their exact title, invalid mapping/issues remain open with no commit, the final
  required mapping still focuses the unchanged commit action, and ordinary
  file/input changes do not move focus. Repeat with VoiceOver, hardware keyboard,
  safe areas, background/foreground, two scenes, and 320/421-point 200% Dynamic
  Type; also verify sticky-chrome positioning at a wider layout.
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
- Before saving a manual fill, repeat **Review execution** with invalid account,
  symbol, decimal, time-zone, and UTC-offset inputs. For each failure, record
  that the unchanged field-specific inline alert is announced and visibly
  focused inside the sheet, every authored control value remains exact, the
  form and modal keep ownership, the background remains inert, and review/save
  stays unavailable. Confirm the sheet keeps its one open-time submission ID
  without creating or rotating another identity and performs no commit, SQLite,
  or network work. Correct the value and verify the unchanged review/save path;
  then separately verify Cancel, Escape, close-button, and backdrop return to
  their exact connected trigger. Repeat with VoiceOver, hardware and onscreen
  keyboards and safe areas at 320- and 421-point widths with 200% Dynamic Type.
  While the originating scene remains alive, repeat background/foreground and
  two-scene checks and preserve its exact values, modal, focus, and one identity.
  Record whether the inner sheet alone scrolls to keep the alert and adjacent
  keyboard targets visible; neither the window nor backdrop may scroll. Then
  force quit after a failed attempt and relaunch: no execution, command, or
  transient form/modal/alert/focus/identity state may return. Opening Manual
  Entry must create a fresh sheet with a fresh open-time identity.
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
- Apply asset-class, direction, position-state, review-state, Setup, Mistake,
  Emotion, and Tag facets in combination with normalized search and account/
  date/day scope. Confirm all eight AND against exact current trade fields,
  change visible cards only, expose the asset-class chip, and leave exact scope
  P&L/counts, the
  calendar, Dashboard, Review Session Coverage, Direction Mix, Opening Weekday
  Mix, Plan Check, Mistake Patterns, Emotion Patterns, Tag Patterns, and Setup
  Breakdown unchanged.
  For duplicate symbols, confirm each heading and review action announces enough
  asset-class/account/session context to identify the intended trade.
- Confirm the exact-filter disclosure starts collapsed with **none active**,
  leaves all eight selects out of the keyboard/VoiceOver order, and keeps the
  search description plus **Clear search and filters** reachable. A query or
  account/date/day scope alone must not open or increment it. Toggle with
  pointer, VoiceOver, Enter, and Space; then activate each facet and confirm the
  exact count reaches eight. Reset the final facet and use the combined clear
  action separately: each must collapse and return visible focus to the
  summary while preserving the documented scope boundary. Repeat a rerender
  with a retained stale Setup, Mistake, Emotion, and Tag; each must count and
  open.
- Assign review labels inside and outside the active account/date/day scope.
  Confirm Setup, Mistake, Emotion, and Tag choices come from current
  `TradePreview` assignments across the whole workspace—not unused vocabulary—use stable
  code-unit order, and preserve saved-review normalization and limits. Confirm
  Setup includes only `hasClassifiedSetup: true` assignments, keeps an explicitly
  saved **Unclassified** value distinct from the absent placeholder, and that
  multi-valued mistake and tag assignments match any exact selected member.
- With VoiceOver and a hardware keyboard, retain a well-formed Setup, Mistake,
  Emotion, or Tag selection while another review removes its last current
  assignment and refresh the Trades view. The selected option must remain visible as **not
  currently assigned**, focus and the exact value must remain understandable,
  and the result must contain zero cards without broadening account/date/day
  evidence, totals, or calendar state. Repeat separately for all four selects.
- With VoiceOver and a hardware keyboard, confirm account/range/day/search/facet
  state survives tab navigation and valid ledger refreshes. Clearing a selected
  day must retain account/range and card filters; Clear search and filters must
  retain account/range/day while clearing search/facets; Clear all must reset
  both layers. Switching local/demo mode or reloading must reset session-only
  state. If an account or day disappears after refresh, confirm Hermes announces
  the recovery instead of silently broadening or trapping the app.
- Confirm Dashboard headline P&L, equity, and review progress plus Direction
  Mix, Opening Weekday Mix, Review Session Coverage, Plan Check, Mistake
  Patterns, Emotion Patterns, Tag Patterns, and Setup Breakdown remain whole
  workspace while only Trades and the Dashboard calendar are scoped.
- At 320 CSS pixels and 200% accessibility text, confirm account select, date
  inputs, eight facet selects, month controls, day tiles, scope summary,
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
  saved/fresh atomic rejection. After a positively resolved result, lose the
  redraw response and confirm the modal exposes only **Retry journal refresh**,
  keeps background/focus contained, creates no identity, and performs no store
  call. For a reconciled duplicate, confirm copy withholds atomic batch
  identity. Do not mark ambiguous-save recovery PASS: an unknown result before
  resolution still lacks a durable batch receipt and remains an explicit HIGH
  hold.
- Build a Journal queue containing interleaved current closed drafts and
  not-started trades plus open and completed controls, including duplicate
  symbols with distinct stable subject IDs. Confirm only the closed unfinished
  current-head trades appear; invalid or duplicate identities and incoherent
  waiting/draft/completed counts fail closed. Confirm nonempty **Drafts** then
  **Not started** groups preserve canonical snapshot order and reconcile the
  queue summary exactly. Save a draft, complete reviews until one group and then
  the whole queue disappears, and apply a resolved batch tag; after each fresh
  redraw, visible focus must move to the first surviving group heading or, for
  the empty queue, the stable **Trade review queue** title. During a stale,
  uncertain, blocked, or committed-but-not-redrawn result, focus must stay with
  the existing sheet/recovery surface; a refresh retry must not repeat a review
  or batch write. Inspect export and storage evidence to confirm no queue,
  grouping, or focus state exists beyond the established review successors.
  Schema v4, five primary tabs, ten report targets, eight governed reports, and
  their digests/formulas must remain unchanged. Repeat with VoiceOver, hardware
  keyboard, background/foreground, force quit/relaunch, and 200% Dynamic Type at
  320 and 421 CSS pixels before marking Review Queue Focus native acceptance
  PASS.
- On Dashboard, build interleaved closed drafts and not-started reviews and
  confirm Weekly Review Rhythm chooses the first exact draft, then the first
  not-started trade, in canonical Review Queue order. Its heading must show the
  reconciled all-unfinished count and eventually **Review queue clear**.
  Ordinary Cancel/Escape/backdrop dismissal must return to the exact connected
  CTA. After a direct draft/completion, exact-command replay, and known-commit
  refresh-only retry, confirm the result announcement precedes focus on the
  unique rebuilt rhythm heading without opening the next trade automatically.
  Remove or duplicate the rebuilt heading and confirm focus falls to the screen
  without another store call. Remove the origin marker, alter the exact subject,
  duplicate the card/action, and add a conflicting source; each must expose one
  fully visible focused generic error before modal markup, random identity,
  background inerting, or persistence. Uncertain, stale, blocked, and
  committed-but-not-refreshed states must retain modal ownership. Dashboard
  recent-trade, Reports, Trades, and Journal queue return behavior must remain
  unchanged. Repeat with VoiceOver, hardware keyboard, safe areas,
  background/foreground, force-quit/relaunch, two scenes, and 200% Dynamic Type
  at 320 and 421 CSS pixels before marking Dashboard Review Return Focus native
  acceptance PASS.
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
- In Journal, repeat a direct create, direct edit, exact-command replay, and
  known-commit refresh-only recovery. After each confirmed refresh, focus must
  return to the one rebuilt reflection heading whose canonical date equals the
  prepared command, not to the top of the screen. For generic creation, change
  the editable date before preparation and confirm the saved date—not the
  pre-open default—owns focus. Remove or duplicate the exact rebuilt heading in
  an instrumented candidate and confirm focus falls to **Daily notes**, then the
  screen if that stable heading is also unavailable, without another write.
  Ordinary Cancel/Escape/backdrop dismissal must return to the connected trigger;
  uncertain, stale, blocked, and committed-but-not-refreshed states must retain
  modal focus. Repeat with VoiceOver, a hardware keyboard, background/foreground,
  force quit/relaunch, and 200% Dynamic Type at 320 and 421 CSS pixels before
  marking Daily Reflection Return Focus native acceptance PASS.
- From Dashboard, open an exact activity date into Trades. Confirm the nested
  **Daily reflection** region states that the record belongs to the whole
  workspace date, remains separate from trade reviews, and does not mark the
  session reviewed. A local past/current date with no head must open that exact
  read-only date—not the generic newest unused date—while a draft or completed
  head must continue its unique current version. Demo and future activity dates
  must show read-only explanations with no write action. Mutate and separately
  remove the action's calendar-date attribute before opening; each attempt must
  expose a focused generic error before modal, random identity, inert state, or
  SQLite work. Programmatically alter the readonly input after a valid open and
  confirm the prepared save still targets the captured selected date. After
  direct save, exact replay, and known-commit refresh retry, confirm Trades
  redraws with account/date/day scope, query, and all eight exact facets intact,
  then focuses the same date's reflection heading. Concurrently invalidate the
  selected day and confirm focus falls to the screen without reconstructing it.
  Review Session Coverage, all governed reports, export/restore facts, and one
  head per date must remain unchanged except for the explicit new Daily Journal
  version. Repeat at 320 and 421 CSS pixels with 200% Dynamic Type, VoiceOver,
  hardware keyboard, background/foreground, force-quit/relaunch, and two scenes
  before marking Calendar-Day Reflection Continuation native acceptance PASS.
- With a selected Trades activity day, confirm **Previous activity day** and
  **Next activity day** follow only adjacent account/date-scoped activity
  sessions, skip empty dates, cross month boundaries, and show the exact
  position/count. Apply a query plus all eight exact facets before stepping in
  both directions; confirm every filter and date bound survives, the destination
  month/day is selected on Dashboard, the matching whole-workspace reflection
  continuation redraws, and the reconciled announcement precedes focus on the
  unique date-qualified heading. First, last, and single-day cohorts must keep
  unavailable controls present and natively disabled. Tamper a valid target to
  a nonadjacent date and separately duplicate a direction control/card; each
  attempt must focus one fully visible generic error with the old day, storage,
  reports, and background interaction unchanged. Repeat with VoiceOver, a
  hardware keyboard, 320/421-width 200% Dynamic Type, sticky chrome,
  background/foreground, force quit/relaunch, and two scenes before marking
  Exact Scoped Activity-Day Stepper native acceptance PASS.
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
- Verify Dashboard Recent trades contains exactly QQQ, META, SPY, then AMD in
  the fictional demo, with correct asset-class, account, full-session context,
  and one **Open trade** action per row. The demo sheet must remain read-only
  and omit report-origin copy. With duplicate symbols across local sessions or
  accounts, confirm each action opens only its stable-ID trade. Close, Cancel,
  Escape, and backdrop dismissal must restore the exact connected trigger; a
  confirmed local save must persist through a Dashboard redraw, announce the
  result, and focus the stable screen. Tamper one ID and confirm a focused error
  appears before inert state or a store call. Repeat offline with VoiceOver,
  hardware keyboard, 44-point targets, 320/421px at 200% Dynamic Type,
  background/foreground, force quit, and relaunch. This native row remains NOT
  RUN until recorded on the Mac/iPhone candidate.
- In Reports, verify Review Session Coverage shows
  `review-session-coverage-report-v1`, checksum
  `8fafa15893363476f1d0433c8fbb70d3db000b6c4a75bfd9a621862c52244113`, exactly
  6/6 reviewed demo sessions, 0 unreviewed sessions, current streak 6, 8
  session–trade assignments, and all 3 fixed groups in `current_streak`,
  `reviewed_before_streak`, then `unreviewed` order. Confirm both zero-count
  groups remain visible. Reconcile every session exactly once, every
  session–trade contribution exactly once, and total/reviewed/current-streak
  counts against Dashboard review progress.
- With a mixed local fixture, confirm a session becomes reviewed when one exact
  contributor has a current saved draft or completed review covering that date,
  even when another contributor remains pending or uncovered. Confirm the
  current streak is the maximal reviewed suffix ending at the latest trading
  session and crosses weekends or no-trade gaps. Inject duplicate/noncanonical/
  impossible dates, duplicate or unresolved contribution identities, mismatched
  or unsafe trade counts, malformed/duplicate current subject IDs, unordered or
  out-of-contribution covered dates, incoherent saved heads, pending coverage,
  unsupported asset/review/coverage states, and negative, unsafe, or mismatched
  review progress separately; each must fail visibly without repairing,
  dropping, or defaulting evidence.
- Change Daily Journal notes, scores, emotions, and tags, then exercise every
  Trade Browser account/date/day/search/facet combination. Review Session
  Coverage must remain whole-workspace and bit-for-bit equal. Confirm it exposes
  no P&L, currency, risk, outcome, rate, ranking, prediction, or advice. Repeat
  offline and inspect the WebView network log.
- With at least 56 assignments in one Review Session Coverage group, reveal
  contributors 26 and 51 and confirm each action adds at most 25, reports exact
  live status, and moves focus to newly revealed content. Open a
  duplicate-symbol contributor and prove stable-ID selection; ordinary close,
  Cancel, Escape, and backdrop dismissal must restore the exact trigger. Save a
  review that changes coverage and confirm the rebuilt report is announced with
  focus on the Review Session Coverage heading. Repeat with VoiceOver, hardware
  keyboard, 44-point controls, 320 and 421 CSS pixels, 200% Dynamic Type, Reduce
  Motion, background/foreground, and force quit/relaunch. These native rows
  remain NOT RUN until observed on the Mac/iPhone candidate.
- In Reports, verify Direction Mix shows `direction-mix-report-v1`, checksum
  `0a55af9905699cc62746c99b5b4e7dd664588d8b526eefb207e9fb2bb77b3ab2`,
  eight current trades, and the fixed Long/Short counts 6/2. Reconcile every
  trade exactly once in traded-date-descending then stable-subject-ID order.
  Confirm position/review status remain evidence only; open/closed and
  pending/draft/completed fixtures must not change inclusion or grouping.
  Confirm there is no currency, result, P&L, win, R, expectancy, percentage,
  rate, rank, causal, predictive, or advisory output. With at least 56 trades in
  one direction, verify each evidence action adds at most 25 contributors,
  status and focus remain exact, controls remain 44 points, and 200% Dynamic
  Type reflows without clipping.
- In Reports, verify Opening Weekday Mix shows
  `opening-weekday-mix-report-v1`, checksum
  `6f205c00826d547f1f0640bec0acceac836e707c4a95287d2e35f4ae62e01cf8`,
  eight current trades, all seven fixed weekday groups, and Monday-through-
  Sunday counts 1/1/3/3/0/0/0. Reconcile every trade exactly once in opening-
  date-descending then stable-subject-ID order. Confirm the opening date comes
  from the ledger's first entry in the workspace time zone, including a UTC/
  local-date crossover fixture, and that later allocations, exits, and reviews
  never regroup it. Confirm there is no currency, result, P&L, win, R,
  expectancy, percentage, rate, comparison, rank, frequency reward, target,
  causal, predictive, or advisory output. With at least 56 trades on one
  weekday, verify each evidence action adds at most 25 contributors, exact-ID
  continuation and save-return focus remain correct, controls remain 44 points,
  and VoiceOver, hardware keyboard, and 200% Dynamic Type work without clipping.
- From Dashboard, open Plan Check and verify
  `plan-adherence-report-v1`, checksum
  `0f092c3bdd6c5051e97f5be0f1c7758a01e3159875adf660b1b0ea00f970ae85`,
  an 8-of-8 cohort, five followed trades at +106 USD cash expectancy, three
  broken trades at -73.333333333333 USD cash expectancy, and the
  +179.333333333333 USD followed-minus-broken observational difference.
- From Dashboard, activate **View session evidence** and confirm focus lands on
  the visible Review Session Coverage heading; separately activate **Open plan
  check** from Dashboard and confirm focus lands on Plan Check rather than the
  generic Reports container. In the Report sections landmark, verify
  VoiceOver and hardware-keyboard order is Performance Summary, Journal Curve,
  Review Session Coverage, Direction Mix, Opening Weekday Mix, Plan Check,
  Mistake Patterns, Emotion Patterns, Tag Patterns, then Setup Breakdown. Open a
  Review Session Coverage, Direction, Opening Weekday, Plan, Mistake, Emotion,
  Tag, and Setup disclosure, visit all ten targets, and use every **Back to report
  menu** link; focus must remain visible and all eight governed disclosures must
  stay open. At
  320 CSS pixels and again in the 421–440 CSS-pixel device class with
  200% Dynamic Type, confirm the top bar scrolls
  away, the fixed primary tabs remain available, every menu/return/summary
  control is at least 44 points and can be fully visible between viewport edges
  and the tab bar, and there is no internal or document overflow. Repeat with
  Reduce Motion and inspect the network log. This native row remains NOT RUN
  until observed on the Mac/iPhone candidate.
- With VoiceOver and a hardware keyboard, open **Open trade** from a Review
  Session Coverage, Direction Mix, Opening Weekday Mix, Plan Check, Mistake
  Patterns, Emotion Patterns, Tag Patterns, or Setup Breakdown contributor.
  Confirm the action and sheet
  heading announce symbol, asset class, account, and session; duplicate symbols
  in different accounts/sessions open the stable-ID-matched trade, never the
  first symbol match. Close, Cancel, Escape, and backdrop dismissal must return
  visible focus to the exact trigger without changing the opened disclosures,
  loaded contributor/group pages, scroll, report evidence, or retained Trades
  account/date/day/search/facets.
- Repeat after revealing Review Session Coverage, Direction, Opening Weekday,
  and Plan contributors 26 and 51; Mistake, Emotion, Tag, and Setup contributors
  26 and 51; and a Mistake, Emotion, Tag, or Setup
  group appended after the initial five. Activate nested button content with
  pointer, keyboard, and VoiceOver. Unknown/tampered identity or
  source data must show a focused error without opening a sheet or making the
  background inert.
- In a local journal, save a review from Review Session Coverage, Direction, and
  Opening Weekday evidence, then save changes that move session coverage, a Plan
  classification, a Setup group, exact Mistake assignments, the exact Emotion
  assignment, and exact Tag assignments. Confirm
  Direction and Opening Weekday membership stay fixed and every rebuilt report
  is announced with focus on the originating report heading, not a disconnected
  row. Repeat at 320 and 421 CSS pixels with 200% Dynamic Type, offline, and
  during lifecycle changes.
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
- In Reports, verify Mistake Patterns shows `mistake-patterns-report-v1` and
  checksum
  `f94fc896308348f55a665aeafba665f0f3d4ee50fc225c4dba1087bc2babad3c`,
  two unique demo trades, two assignments, six completed reviews without an
  assignment, and code-unit-ordered Chased entry/Early entry groups. Confirm it
  has no currency, P&L, win, R, expectancy, rate, or rank metric. With a local
  multi-label fixture, reconcile unique trades separately from summed
  assignments, exact-ID continuation, and focus return after a saved edit.
- With at least six exact mistake labels and one group containing at least 26
  contributors, verify each group action adds at most five groups and each
  evidence action at most 25 contributors, with exact live status, visible
  focus, 44-point controls, VoiceOver labels, and 200% Dynamic Type reflow.
- In Reports, verify Emotion Patterns shows `emotion-patterns-report-v1` and
  checksum
  `d674eceb0d641512f106f9f1c6b37e23fe1a2ecd0d43e54b7e48865fa594adb4`,
  eight included demo trades, eight assignments, and no incomplete-review or
  missing-emotion exclusions. Reconcile code-unit-ordered Calm/Focused/Hesitant/
  Impatient/Patient groups with respective counts 3/1/1/2/1. Confirm the report
  has no currency, P&L, win, R, expectancy, rate, intensity, or rank metric.
  With a local fixture, verify current-head movement, exact-ID continuation,
  ordinary-close trigger focus, and post-save Emotion Patterns heading focus.
- With at least six exact emotions and one group containing at least 26
  contributors, verify each action adds at most five groups or 25 contributors,
  live status stays exact, focus moves to the newly revealed content, controls
  remain 44 points, and 200% text reflows without clipping.
- In Reports, verify Tag Patterns shows `tag-patterns-report-v1` and checksum
  `ad24da67086c74558203d89b9fe27f2d8907f6170b29fa5320e0aada88405c27`,
  8 unique included demo trades, 16 assignments, 12 groups, and zero
  incomplete-review or completed-without-tag exclusions. Reconcile the stable
  ordered counts: Chased entry 1, Early entry 1, Early exit 1, Invalidation
  respected 1, Opening range 1, Patient entry 1, Plan followed 5, Protected
  remainder 1, Risk reduced 1, Stop respected 1, Stopped on plan 1, and Target
  held 1. Confirm neither saved vocabulary nor Daily Journal tags are inputs and
  the report has no currency, P&L, rate, rank, importance, outcome, reward,
  prediction, or advice. With a multi-tag fixture, reconcile unique trades
  separately from assignments, current-head movement, exact-ID continuation,
  ordinary-close trigger focus, and post-save Tag Patterns heading focus.
- With at least six exact tag groups and one group containing at least 26
  contributors, verify each action adds at most five groups or 25 contributors,
  live status stays exact, focus moves to the newly revealed content, controls
  remain 44 points, and 200% text reflows without clipping.
- With a local fixture containing at least six classified setup names and one
  setup with at least 26 included trades, verify each group action adds at most
  five groups, each evidence action adds at most 25 contributors, live status
  stays exact, focus moves to the first newly revealed group, controls remain
  44 points, and 200% text reflows at 320 CSS pixels without clipping.
- After native export → empty-container restore, verify all eight governed
  reports, their checksums, cohorts, exclusions, group/evidence order, exact
  values, and contributor identities equal the source. For Review Session
  Coverage, also prove exact equality of all session dates, classifications,
  session counts, assignment counts, and session–trade identities; no durable
  report output may be required for recomputation.
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
| Review Session Coverage/navigation/continuation/restore | status | checksum + native fixtures/screenshots/focus/equality |
| Dashboard recent-trade continuation | status | order + stable-ID duplicate fixture + focus/layout/lifecycle evidence |
| Dashboard Review Return Focus | status | exact origin + waiting/clear heading + direct/replay/refresh/fallback/lifecycle evidence |
| Manual Entry Validation Focus | status | invalid account/symbol/decimal/time-zone/offset + values/identity/modal/focus/scroll/correction/dismissal/SQLite/network evidence |
| CSV Preview Feedback Focus | status | missing/oversize/read/preparation failure + stale-read cancellation + ready/invalid title + values/file/stale-preview/mapping/focus/layout/SQLite/network evidence |
| Import Receipt Reconciliation | status | source/accepted/rejected/skipped/new-or-restored/already-present/warning conservation + demo rollback suppression + disclosure/focus/layout/SQLite/network evidence |
| Daily Reflection Rhythm | status | canonical date/head validation + completed/draft/missing/current-run/no-trade counts + demo/local continuation/layout/SQLite/network evidence |
| Guided Account Overview | status | retained/zero-trade account order + stable-ID all-activity scope + filter reset + stale-ID failure + focus/announcement/layout/SQLite/network evidence |
| Daily Reflection Return Focus | status | direct/replay/refresh exact-date focus + fallback/lifecycle evidence |
| Exact Scoped Activity-Day Stepper | status | scoped adjacency + retained filters + cross-month/tamper/focus/lifecycle evidence |

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
- Source inspection of pinned `@capacitor-community/sqlite` 8.1.0 finds an
  unused registered HTTP-download bridge backed by native `URLSession` and an
  unconditional database-path print during connection construction. No Hermes
  app-code caller of the download method was found, and on-device behavior is
  still NOT RUN. Remove, wrap, or explicitly accept those dependency surfaces
  before claiming no native network capability or console-path privacy.
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
  Browser Batch Tag Known-Commit Refresh-Only Recovery is implemented, but its
  modal/focus, bridge-loss, background/foreground, relaunch, VoiceOver,
  hardware-keyboard, and Dynamic Type behavior is still NOT RUN natively.
- Review Queue Focus v1 has only Linux/Chromium projection, focus, and reflow
  evidence. Native VoiceOver announcement/order, hardware-keyboard focus,
  measured-chrome visibility, background/foreground, force-quit/relaunch,
  multi-scene refresh, Dynamic Type, and duplicate-symbol exact-ID behavior are
  NOT RUN and must not inherit browser results. Keep native acceptance on hold
  until the device procedure above records the fixed group/order/count contract,
  first-surviving-group or queue-title focus after both queue-origin
  single-review and batch refreshes, recovery-state focus ownership, and zero
  queue-specific durable state.
- Dashboard Review Return Focus v1 has only Linux/Chromium origin, focus,
  fallback, and narrow-layout evidence. Native VoiceOver announcement/order,
  hardware-keyboard visible focus, safe-area/chrome positioning,
  background/foreground, force-quit/relaunch, multi-scene refresh, and
  320/421-width 200% Dynamic Type are NOT RUN. Keep native acceptance held
  until direct save, exact replay, known-commit refresh-only, exact-trigger
  dismissal, missing/duplicate-heading fallback, malformed-origin rejection,
  and every unresolved recovery state are observed without a repeated write.
- Manual Entry Validation Focus v1 has only Linux/Chromium focus, geometry,
  value-retention, storage/request-neutrality, correction, and dismissal
  evidence. Native VoiceOver announcement/order, hardware- and onscreen-keyboard
  focus, safe-area/chrome positioning, live-scene background/foreground and
  two-scene coordination, force-quit/relaunch, SQLite observation, and
  320/421-width 200% Dynamic Type are NOT RUN. Keep native acceptance held until
  invalid account, symbol, decimal, time-zone, and offset cases preserve every
  authored value, form/modal ownership, inert background, unavailable
  review/save, the single open-time submission identity, and exact-trigger
  return while the originating scene remains alive and the focused alert stays
  visible through inner-sheet-only scrolling. Correction must reach the
  unchanged save path without any failed-attempt commit, SQLite, or network
  work. A separate force-quit/relaunch must restore no execution, command, or
  transient UI state; reopening Manual Entry must create a fresh sheet and fresh
  open-time identity.
- CSV Preview Feedback Focus v1 has only Linux/Chromium focus, geometry,
  retained-input, stale-preview-removal, stale-read cancellation, mapping,
  local-storage/request, and narrow/sticky-layout evidence. Native VoiceOver
  announcement/order, hardware-keyboard focus, safe-area/chrome positioning,
  background/foreground, force-quit/relaunch, two-scene behavior, SQLite
  observation, and 320/421-width 200% Dynamic Type are NOT RUN. Keep native
  acceptance held until every early failure and ready/invalid preview outcome
  preserves exact input/file ownership, exposes no stale commit surface or
  failed-attempt durable work, ignores superseded asynchronous completion,
  retains existing mapping targets, and lets correction reach the unchanged
  commit path.
- Import Receipt Reconciliation v1 has only Linux/Chromium count,
  disclosure, focus, reflow, demo-boundary, and storage/request-neutrality
  evidence. Native VoiceOver announcement/order, hardware-keyboard disclosure
  and focus, safe-area/chrome visibility, SQLite observation,
  background/foreground, rollback interruption, force-quit/relaunch,
  two-scene refresh, and 320/421-width 200% Dynamic Type are NOT RUN. Keep
  native acceptance held until every displayed equation matches the immutable
  receipt, demo remains noninteractive, and rollback focuses the one rebuilt
  receipt without another write.
- Daily Reflection Rhythm v1 has only Linux/Chromium projection, local-editor
  continuation, reflow, demo-boundary, and storage/request-neutrality evidence.
  Native VoiceOver announcement/order, hardware-keyboard navigation,
  safe-area/chrome visibility, SQLite observation, background/foreground,
  force-quit/relaunch, two-scene head refresh, and 320/421-width 200% Dynamic
  Type are NOT RUN. Keep native acceptance held until canonical session/head
  validation, completed/draft/missing totals, current completed suffix,
  no-trade separation, and the non-performance copy are observed from live
  device state without new persistence.
- Guided Account Overview v1 has only Linux/Chromium projection,
  keyboard-routing, stale-ID, responsive-layout, storage, and request-neutrality
  evidence. Native VoiceOver announcement/order, hardware-keyboard focus,
  safe-area/chrome visibility, SQLite observation, background/foreground,
  force-quit/relaunch, two-scene refresh, and 320/421-width 200% Dynamic Type
  are NOT RUN. Keep native acceptance held until retained and zero-trade
  accounts reconcile from live device state, exact stable-ID routing clears
  transient filters without changing whole-workspace reports, and tampered
  identity fails visibly without a write or broadened scope.
- Calendar-Day Reflection Continuation v1 has only Linux/Chromium exact-date,
  recovery-focus, and reflow evidence. Native SQLite/SQLCipher persistence,
  two-scene stale/unknown-result behavior, relaunch, lifecycle, VoiceOver,
  hardware-keyboard, measured sticky-chrome visibility, and 320/421-width 200%
  Dynamic Type are NOT RUN. Do not inherit browser acceptance; keep the native
  row held until the procedure above proves exact selected-date ownership,
  demo/future noninteraction, scope/facet retention, structural focus, unchanged
  Review Session Coverage, and one immutable current head per date.
- Daily Reflection Return Focus v1 has only Linux/Chromium structural focus and
  fallback evidence. Native VoiceOver announcement, hardware-keyboard focus,
  measured sticky-chrome visibility, background/foreground, force-quit/relaunch,
  two-scene refresh, and 320/421-width 200% Dynamic Type are NOT RUN. Keep native
  acceptance held until direct save, exact replay, known-commit refresh-only,
  missing/ambiguous-heading fallback, cancel return, and every unresolved
  recovery state are observed without a repeated write.
- Exact Scoped Activity-Day Stepper v1 has only Linux/Chromium scoped-adjacency,
  keyboard, tamper, cross-month, filter-retention, focus, and reflow evidence.
  Native VoiceOver announcement/order, hardware-keyboard focus,
  background/foreground, force-quit/relaunch, two-scene refresh, and 320/421
  Dynamic Type are NOT RUN. Keep native acceptance held until one physical
  account/date cohort proves boundary disablement, empty-date skipping,
  cross-month selection, all-eight-facet retention, generic fail-closed error,
  exact reflection redraw, and no durable write.
- The checked-in icon/splash files are generated placeholders.
- `Hermes Journal` and `app.hermesjournal.mobile` are working identifiers, not
  evidence of App Store or trademark availability.
- SQLCipher is configured and the schema/import repository is tested on Linux,
  but native encryption/Keychain behavior has not been observed on a Mac/iPhone.
- The database is configured for the app's `Documents` container rather than a
  custom subdirectory. Actual device and iCloud backup inclusion—and whether the
  matching Keychain item restores—remain unresolved until measured and
  reflected in privacy/help copy.
- Manual entry, versioned reviews, governed Review Session Coverage, Direction
  Mix, Opening Weekday Mix, Plan Check, Mistake Patterns, Emotion Patterns, Tag
  Patterns, and Setup Breakdown, export generation, and Slice C-B local restore
  still need the persistence, response-loss, migration, accessibility, and
  lifecycle checks
  above. Trade Browser Scope v1, Structured Trades Facets v1, Dynamic Review
  Facets v1, and Exact Setup Facet v1 intentionally remain session-only;
  Compact Trades Filters v1 adds
  no persisted disclosure state. They still need native
  accessibility, refresh/lifecycle, multi-scene, stale-choice, Dynamic Type,
  and hardware-keyboard checks. Browser evidence does not prove those native
  behaviors. Review Session Coverage, Direction Mix, Opening Weekday Mix,
  Mistake Patterns, Emotion Patterns, Tag Patterns, and Report Trade
  Continuation are browser-verified only. Dashboard Recent Trade Continuation
  likewise has only browser-session evidence; native
  stable-ID duplicate-symbol targeting, VoiceOver labels, progressive-row
  activation, exact-trigger return, post-save heading/screen fallback, offline
  lifecycle, Dynamic Type, and hardware-keyboard acceptance remain NOT RUN.
  Native Web Share/Files cancellation, save, reopen, custom MIME
  behavior, restore preview rollback, atomic commit, post-commit reconciliation,
  interruption retry, and near-64-MiB memory behavior have not been observed.
- Current matching-runtime archives remain incomplete native backups:
  attachment catalog v1 is empty and archives containing attachments are
  rejected. Attachments and Delete All Data remain incomplete Phase 1 work.
- `Podfile.lock`, `App.xcworkspace`, and final CocoaPods-generated build phases
  are Mac gates and are not yet present/reviewed.
- Direct broker/market-data connectivity is outside the launch path until rights,
  privacy, security, and recurring-cost reviews are complete.
