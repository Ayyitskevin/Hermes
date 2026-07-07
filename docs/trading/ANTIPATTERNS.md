# The Anti-Patterns — How New Traders Kill Themselves On This System

### Ten ways to lose, and how to stop doing each one
**Five-Tool Confluence AIO v3.5-SHORT · Companion field notes**

> **Read this before you read anything else.** The other two docs teach you the machine. *The Hermes Playbook* is how to **play** the thesis; the *Chart Reading Guide* is how to **read** the screen. This one is different. This is the list of ways smart, motivated people blow themselves up on exactly this tool — usually while feeling productive. Every mistake below is *tempting*, which is the whole problem. None of them look like errors in the moment. They look like effort.
>
> **The house rule still holds:** this is decision-*support*, not a signal service. Nothing here promises a profit. The edge — if there is one — is something you **earn over a large sample with disciplined execution**, and it can be given back just as fast. Most of these anti-patterns are ways of *pretending* you have the edge before you've validated it.

---

## How to use this list

Each entry has three parts, always in the same order:

- **The mistake** — what it actually looks like when you do it.
- **Why it's tempting** — the honest reason you'll be pulled toward it. (You are not stupid for wanting to. You're human.)
- **The fix** — the smaller, harder, more boring thing to do instead.

If you catch yourself mid-mistake, the fix is not "feel bad." The fix is the fix. Do it and move on.

| # | The anti-pattern | The one-line tell |
|---|---|---|
| 1 | Collecting strategies instead of mastering one | "I need a bull system AND a bear system AND…" |
| 2 | Forcing shorts by stripping the guards | "I turned off the filters and it takes more trades now" |
| 3 | Treating a live default as validation | "It's the default, so it must be the good one" |
| 4 | Drawing conclusions from tiny samples | "12 trades, 75% win rate, this works" |
| 5 | Lowering thresholds to kill the `!` | "The warning is annoying, I'll just change the setting" |
| 6 | Reading longs off the Hybrid chart | "The combined chart is my main chart" |
| 7 | Chasing what the no-chase filter is vetoing | "It's clearly going, I don't want to miss it" |
| 8 | Revenge-trading through a halt | "I need to make it back right now" |
| 9 | Thinking in dollars instead of % and R | "I'm up enough to buy the thing" |
| 10 | Treating a candidate as a setup | "The screener flagged it, so I'm in" |

---

## 1 · The Strategy Collector

**The mistake.** You treat "learning to trade" as *acquiring systems*. You want a bull strategy and a bear strategy and a breakout strategy and a mean-reversion strategy, ten tabs open, before you've taken a hundred journaled reps on a single one. You mistake a bigger toolbox for more skill.

**Why it's tempting.** Collecting feels like progress and costs nothing. Reading about a new setup is a dopamine hit; grinding the same four long triggers for the hundredth time is not. Breadth *looks* like sophistication. It's actually avoidance — a way to stay in the comfortable "researching" phase forever and never be measured.

**The fix.** **One strategy · three timeframes · one side · 100 journaled reps.** The four long triggers in the Playbook (§5) *are* your "five strategies" — get reps on them instead of shopping for more. You do not need a second system until the first one is muscle memory and you can say why every gate fired. Depth before breadth. See *The Hermes Playbook* §11 for the curriculum; this anti-pattern is the thing it's built to prevent.

---

## 2 · Forcing the Short — Then Trusting the Losers

**The mistake.** The short book is *supposed* to be hard to trigger. So you turn off the no-chase filter, drop the support-room check, disable the squeeze-risk veto (`use_short_no_chase_filter` and friends → OFF), and suddenly you get lots of shorts. Then — this is the fatal second half — you **believe** the trades that show up. You treat the flood of new entries as "finally, the short side works," when all you did was remove the reasons it was saying no.

**Why it's tempting.** The veto stack is *frustrating*. You can see a downtrend, the HUD says `Short: Squeeze Risk` or `Short: No Chase`, and the trade you wanted evaporates. Stripping the guards makes the frustration disappear. It feels like unlocking the tool. It's the opposite.

**The fix.** Remember what the short side actually is: an **unvalidated experiment that ran net-negative in the reference backtest** (Playbook §7). The filters aren't in your way — they *are* the strategy. Loosening them to make trades appear is **gathering sample, not proving an edge**, and every one of those extra trades is tuition, not evidence. If you must run shorts, run them in the isolated Pure Bear config, filters ON, at the smallest size, and let the validation campaign (§9) decide — not your impatience. When the guard says no, the correct read is: *this is exactly the kind of short that gets squeezed.*

---

## 3 · Mistaking a Default for a Verdict

**The mistake.** A parameter ships at some value — `min_score = 55`, `min_validation_trades = 100`, shorts wired a particular way — and you assume the default *is* the validated, blessed, "this is the good configuration" setting. You treat "it's how it loaded" as "it's been proven."

**Why it's tempting.** Defaults *feel* authoritative. Someone chose them, so surely they're the answer. It saves you the work of validating anything yourself — the number is already there, pre-approved, no thinking required.

**The fix.** A live default is a **starting point, not a verdict.** It's a reasonable place to begin, nothing more. Running the strategy with its shipped settings is a *workflow choice*, not a validation result — the same way running the short book live is a choice, not evidence it works (Playbook §7). The only thing that earns trust is the pre-committed campaign in Playbook §9, honored out-of-sample. "It's the default" and "it's been validated" are unrelated sentences. Keep them separate.

---

## 4 · The Small-Sample Story

**The mistake.** You take 12 trades, or 20, or 37, and you draw a conclusion. A 70% win rate over 15 trades becomes "this is working." A three-loss streak over 15 trades becomes "this is broken." Either way, you've read a headline off pure noise and made a decision on it.

**Why it's tempting.** Humans are pattern-finding machines, and a small sample with a pretty number is *irresistible*. You want to know if it's working **now**, not in a hundred trades. Waiting feels like doing nothing. And the number is right there, looking meaningful.

**The fix.** **Below ~100 trades, you know nothing — keep going.** That's not a mood, it's the design: `min_validation_trades` defaults to 100 precisely because smaller samples are anecdotes, and the chart stamps a `!` on any book beneath it (Chart Reading Guide §8). A candidate is not a setup, and 15 trades is not a track record. If you feel a conclusion forming before 100 reps, the conclusion is premature by definition. Log the trades, honor the process, and let the sample grow before you let it talk.

---

## 5 · Silencing the `!` Instead of Earning It

**The mistake.** The Shorts row wears a `!` because the book has fewer than `min_validation_trades`. It bugs you. So you open the settings and drop `min_validation_trades` from 100 to 20 — and the `!` vanishes. Same trick with `min_score`: nudge it down from 55 and marginal trades suddenly "qualify." You didn't fix anything. You changed the thermometer because you didn't like the temperature.

**Why it's tempting.** The warning is a nag, and making it go away is *one click*. It feels like tidying up. Worse, it feels like you've made the system healthier — the red `!` is gone, the scary number qualifies now — when all you've done is lower the bar until the truth stopped showing.

**The fix.** **The `!` is the honesty engine, and you just tried to lie to it.** The only legitimate way to clear a low-sample flag is *more trades* — more history, more symbols, more reps (Chart Reading Guide §8). The only legitimate way to clear a below-floor score is a *better setup*, not a lower floor. Lowering `min_validation_trades` or `min_score` to hide the warning is hiding the truth **from yourself**, and you are the one person you can't afford to fool here. If a setting is protecting you, the correct response to its warning is to respect it, not to disable it.

---

## 6 · Letting the Hybrid Chart Become Your Read of the Longs

**The mistake.** The Hybrid config (both sides live) is convenient, so it quietly becomes your main chart. Now you're reading your *long* performance, your equity curve, your "is this working," off a layout where an unvalidated short book is bleeding into the numbers. Your tested workhorse gets judged on a scorecard the experiment is dragging down.

**Why it's tempting.** One chart is simpler than three. The Hybrid shows "everything," so it feels like the complete picture. Flipping between Pure Bull and Pure Bear is friction, and the Hybrid is right there, already open.

**The fix.** **Never let the Hybrid chart become your read of the longs** (Playbook §13). A shared account means shorts *reshape* long results — an unproven short book can make a healthy long book look sick, and vice versa. Judge the long side on the **Pure Bull** config and the short side on the **Pure Bear** config, each in isolation (Playbook §8). The Hybrid is a combined experiment to be read *against* Pure Bull, never a substitute for it. Keep the books separate so the truth stays separable.

---

## 7 · Chasing What the No-Chase Filter Is Warning You About

**The mistake.** Price is stretched — more than 3 ATR from the AVWAP, or four down-bars deep, or oversold — and the HUD flashes `No Chase`. You take the trade anyway, because the move is *obviously* going and you don't want to miss it. You read the filter's veto as a delay to override instead of a warning to heed.

**Why it's tempting.** Extended moves are the ones that *look* the most certain. The trend is undeniable, the candles are big, everyone can see it — which is exactly the feeling that precedes a snapback. FOMO wears the mask of conviction. The filter is quietly telling you the good entry already left; you're being invited to buy the part that's left over.

**The fix.** **The no-chase filter is naming your worst impulse out loud** — take the free warning. When the chart says `No Chase`, the entry is stretched into the zone where reversals and squeezes live (Playbook §7 veto stack; Chart Reading Guide §3). The low-risk entry is *inside* the value zone on a pullback, not three ATRs above or below it after the move already ran. If you missed the good entry, you missed it — that's a complete, honorable outcome. Chasing an extended move to feel less left-out is how you turn a missed trade into a losing one.

---

## 8 · Revenge-Trading Through a Halt

**The mistake.** The equity drawdown breaker trips, the banner reads `ENTRY HALT`, entries are paused — and you take that as a challenge. You want to make the losses back *now*, so you push through: override the halt, hunt for something to trade, size up to "get even faster." The one moment the system is explicitly telling you to stop is the moment you press hardest on the gas.

**Why it's tempting.** A halt usually arrives at the bottom of a bad streak, when you're down, frustrated, and certain the turn is due. Sitting still feels unbearable — like accepting the loss. The urge to *act your way out* is overwhelming precisely when acting is most dangerous.

**The fix.** **A halt beats a signal. Every time.** (Playbook §13.) The circuit breaker exists to pull you off the desk during exactly the streak where your judgment is worst and your impulse to overtrade is strongest — that's not a coincidence, it's the design (Chart Reading Guide §6). Risk outranks selection: the best setup in the world is a no-trade while the breaker is active. The halt is not the system failing you; it's the system doing the one job that keeps you in the game. Stand down. The market will still be there when it clears.

---

## 9 · Thinking in Dollars

**The mistake.** You start measuring trades in money. "I'm up enough to cover the trip." "I lost the price of a nice dinner." "I need one more good day." The position stops being a percentage of equity at a defined risk and becomes a **story about your life** denominated in cash — and now every decision is emotional.

**Why it's tempting.** Dollars are *real* in a way percentages aren't. You spend dollars. You feel a big dollar swing in your chest. Money is the most vivid, most human way to keep score — which is exactly why it's the most corrosive. A dollar figure smuggles your ego, your hopes, and your bills straight into the trade.

**The fix.** **% of equity and R-multiples only. Never a dollar figure.** (This is doctrine — the entire system is built on it; there are no dollar targets anywhere in it.) Risk is 1% of equity, sized by the stop. Outcomes are measured in R: a +2R win and a −1R loss are the whole vocabulary (Playbook §10). Percent and R keep the position the *right* size in your head — a data point in a large sample, not a referendum on your worth. The moment you catch yourself pricing a trade in dollars, translate it back to R and let the number get boring again.

---

## 10 · Treating a Candidate as a Setup

**The mistake.** A screener flags a name — or the regime just flipped to Bull, or a green triangle printed — and you treat that as *the trade*. You're in before you've written a thesis, before you've defined a stop, before you've checked the score floor or the halt state. A green light became a market order.

**Why it's tempting.** The screen did work, so it feels like the work is *done*. A flagged candidate has the shape of an answer — it's a specific name, right now, with a reason attached. Skipping the journaling and the stop-definition feels efficient. It's actually skipping the only part that makes it a trade instead of a gamble.

**The fix.** **A candidate is not a setup.** (Playbook §3.) A screen, a flip, a triangle — those are names worth a *look*, nothing more. It becomes a trade only when you've done the top-down pass (Weekly tide, Daily trade, 1H timing), confirmed score ≥ 55 and the book un-halted, and **journaled a thesis with a defined stop before you click** (Playbook §4–5, §12). The gap between "the screener noticed this" and "I have a defined-risk plan for this" is the entire job. Don't let a candidate walk itself into a position.

---

## The Common Thread

Read the ten back to back and the same disease runs through all of them: **impatience dressed up as effort, and the urge to feel certain before you've earned certainty.**

- Collecting strategies, chasing extended moves, revenge-trading, jumping on candidates — all *faster* than the boring correct action.
- Stripping guards, silencing the `!`, lowering the floor, calling a default a verdict — all ways of **manufacturing a green light you haven't earned.**
- Small-sample stories, dollar-thinking, reading longs off the Hybrid — all ways of **fooling yourself about what the evidence actually says.**

The antidote is the same every time, and it's in the Playbook: trade *with* the regime or don't trade; score below 55 is a no-trade; risk 1% sized by the stop; a halt beats a signal; below 100 trades you know nothing; **journal it or it didn't happen.** Honesty is the product. The system will never flatter you — the only person in the room who might is you.

None of this promises a cent. The most it can do is keep you aligned with the tape, out of low-quality trades, and honest about your own results long enough for a real edge — if you have one — to show up over a large sample and survive out-of-sample. That edge is earned, never assumed, and every anti-pattern above is a way of assuming it early. Don't.

---

*This document describes a decision-support process, not investment advice. Every figure is a percent of equity or an R-multiple — there are no dollar targets. The short side is an unvalidated, currently net-negative experiment. Past behavior does not predict future returns. You are the trader; the system is the second opinion — and the honest one.*

**— The Hermes Desk**
