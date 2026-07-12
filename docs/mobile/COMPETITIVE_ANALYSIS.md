# Hermes Journal competitive analysis

Status: product research snapshot · verified 2026-07-12

This report separates sourced product facts from Hermes strategy. Prices,
entitlements, integration counts, and store availability change; reverify them
before public comparison or App Store metadata.

## Bottom line

TradeZella is a strong, broad web-first trading journal spanning imports,
analytics, replay, backtesting, AI, prop-firm tools, education, mentors, and
communities. Hermes should not attempt to reproduce that suite in version one.

The defensible opening is narrower:

> Make post-trade review dramatically faster and more trustworthy for people
> who trade and journal from their phone.

Mobile alone is not a moat: several competitors already ship iOS/Android apps.
Hermes must combine mobile speed, behavioral review, inspectable import
provenance, private local ownership, and unusually clear pricing.

## TradeZella facts

| Area | Current official evidence |
|---|---|
| Product boundary | A journal/analytics product; users execute through a broker and transfer records afterward |
| Pricing | Essential $29 monthly or $288 yearly; Premium/Pro $49 monthly or $399 yearly |
| Capture | Auto-sync, broker files, generic CSV, and manual entry |
| Coverage | Advertises 500+ brokers/platforms collectively across direct sync, file formats, MT4 aliases, and generic import |
| Markets | Stocks, options, futures, forex, and crypto |
| Journal | Notes/templates, tags/categories, screenshots, playbooks, rules, sharing |
| Analytics | Dashboard, automatic execution charts, running P&L, MAE/MFE, exit analysis, and 50+ reports |
| Expansion suite | Replay, backtesting, AI, mentors/spaces, education, and prop-firm tracking |
| Audience | Beginner through advanced, prop, mentor, and community segments; not explicitly age-positioned |

Official pricing materials currently disagree on some tier names and limits,
including replay availability and account counts. Hermes should compare stable
product-wide capabilities and public price points, not repeat an unstable
tier-by-tier claim.

Sources:

- [TradeZella pricing](https://www.tradezella.com/pricing)
- [TradeZella pricing help](https://help.tradezella.com/en/articles/8911582-our-pricing)
- [TradeZella getting started](https://help.tradezella.com/en/articles/13863136-getting-started-with-tradezella)
- [Supported brokers](https://www.tradezella.com/brokersupport)
- [Current broker/platform list](https://help.tradezella.com/en/articles/10055421-list-of-supported-brokers-and-platforms)

## Mobile opening

Evidence strongly suggests TradeZella remains a responsive web product rather
than an official native iOS/Android application:

- Its public feedback board describes requested capabilities that are not
  currently native, and “Mobile App with Web Version Features” was its top
  feature request with 31 votes when checked.
- Its changelog describes mobile UI and mobile notebook UI improvements,
  consistent with responsive-web work.
- No official TradeZella App Store or Google Play listing was found or linked
  from its product site during this review.

This is evidence, not proof that no private or region-limited build exists.

Sources:

- [TradeZella feature requests](https://tradezella.canny.io/feature-requests?sort=top)
- [TradeZella changelog](https://tradezella.canny.io/changelog)

## Competitive set

| Product | Current price signal | Mobile signal | Primary angle |
|---|---|---|---|
| [TradeZella](https://www.tradezella.com/pricing) | $29/$49 monthly; $288/$399 yearly | Responsive web; no official native listing found | Polished broad suite |
| [TradesViz](https://www.tradesviz.com/pricing/) | Free; Pro about $19.99/month or $179/year | Official [iOS](https://apps.apple.com/us/app/tradesviz-trading-journal/id1643338387) and Android apps | Maximum analytics/options breadth |
| [TraderSync](https://tradersync.com/pricing/) | About $29.95/$49.95/$79.95 monthly | Official iOS and Android apps; some workflows still point users to web | Incumbent journal/replay/AI suite |
| [Tradervue](https://app.tradervue.com/signup?plan=1) | Free option; paid around $29.95/month | Web-first | Established professional reports and sharing |
| [Edgewonk](https://edgewonk.com/pricing) | Roughly $197 per 16 months | Phone-accessible cloud web | Psychology, discipline, mistake analysis |
| [Kinfo](https://kinfo.com/) | Free start; paid tiers not clearly public | Official native apps | Verified performance and social leaderboard |
| [Trader Journal](https://traderjournal.app/) | Free; roughly $1.99/$4.99 monthly | Claims native iOS/Android | Very-low-price forex/mobile wedge |
| [TradeZap](https://tradezap.app/) | Limited free use; paid subscription | Claims native iOS/Android | Mobile AI, emotions, options |
| [Tradely](https://apps.apple.com/us/app/tradely/id6767981980) | Limited free use; roughly $9.99/month or $79/year | Native iPhone/Watch | Fast entry, widgets, Siri, streaks |

The emerging products have limited public scale evidence. They validate demand
for mobile speed and behavioral capture; they do not prove durable retention or
economics.

## User pain signals

| Signal | Evidence level | Hermes response |
|---|---|---|
| Native phone workflow gap | Strong first-party feature request | One-thumb capture/review, Files/Share Sheet, photos, reminders, biometrics |
| High entry price | Stable public price fact; affordability is an inference | Complete local Core at one transparent upfront price |
| Import reliability anxiety | First-party changelog repeatedly fixes parser, sync, duplicate, timeout, and time-zone defects | Preview, row evidence, dedupe, receipts, rollback, reconciliation |
| Review busywork | Official workflow requires repeated notes, tags, strategy/rule checks, rating, and review state | A guided sub-60-second review and batch follow-up |
| Notes/image loss anxiety | First-party fixes plus anecdotal feedback | Versioned durable annotations, explicit save state, export/restore |
| Feature/plan confusion | Conflicting official entitlements | One Core contract; optional Connect features priced separately and plainly |

TradeZella also has strong public sentiment and frequently praised support.
Hermes should not market isolated complaints as the majority experience.

## Capability strategy

### Beat in Core

- Time from open to saved manual fill/review.
- Offline and no-account usefulness.
- Import preview, provenance, deterministic deduplication, receipt, and rollback.
- User-controlled export/restore/deletion.
- Price clarity and absence of broker-write permissions.
- Mobile capture with accessible one-thumb controls.

### Reach credible parity for the core loop

- Manual and generic CSV capture.
- Accounts, partial fills, fees, long/short records, and currency P&L; percent
  return and R only with versioned, inspectable denominators.
- Trade details, daily/trade notes, tags, emotions, mistakes, playbooks/rules.
- Dashboard, calendar, curve, expectancy, profit factor, drawdown, streak, and
  setup/tag/time reports with drill-down.
- Screenshots, filters, versioned export, restore, and Delete All Data.

### Defer deliberately

- Hundreds of recurring broker connections.
- Licensed price charts, tick replay, and backtesting.
- Multi-device hosted sync.
- Recurring AI credits.
- Mentor/community collaboration and moderation.
- Prop-firm financial monitoring.

Those are separate cost, rights, privacy, security, and support products. They
must not leak into the proposed one-time Core or any unapproved price hypothesis.

## Recommended wedge

1. **Capture:** Files/Share Sheet CSV or exact manual fill.
2. **Trust:** show exactly what changed and why.
3. **Review:** setup, emotion, mistake, rule adherence, note, screenshot.
4. **Insight:** one plain-language pattern linked to the underlying trades.
5. **Habit:** reward completed reviews and process adherence, never trade count
   or profit.

The public positioning should remain:

> The mobile trading journal that turns every session into a better habit—fast,
> private, read-only, and affordable.

“Read-only” means Hermes cannot touch a brokerage order; it is a trust baseline,
not a claim that competitors execute trades. “Direct competitor” means
competing for the core mobile journaling/review job, not claiming full feature
parity with every hosted TradeZella service.
