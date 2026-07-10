# C-tier expansions

These features are deliberately secondary to the A/B desk loop. They expand
surface area without crossing the no-order boundary.

| ID | Feature | How to use |
|----|---------|------------|
| C1 | Databento multi-schema + failover chain | `data.failover = ["databento"]`, `GET /api/failover` |
| C2 | Multi-timeframe regime | `market.timeframes = ["1Day","4Hour","1Week"]`, `GET /api/regime/multi-tf` |
| C3 | Pair screener + options posture | `GET /api/pairs`, `GET /api/options/posture/{sym}` |
| C4 | Crypto public data | `data.provider = "binance"` (or coinbase/kraken) |
| C5 | Single-user polish | `Dockerfile`, `docker-compose.yml` (localhost bind) |
| C6 | Mobile PWA | installable shell; `/api/*` never cached |
| C7 | Fills → journal proposals | `broker_ro.enabled = true`, `POST /api/book/import-fills` |
| C8 | dual-ma-v1 classifier | `regime.classifier = "dual-ma-v1"` or Regime Lab third opinion |

Still true: no order paths, no dollar account figures, human places every trade.
