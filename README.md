<div align="center">
  <img src="docs/assets/logo.svg" alt="UniHub" width="80" />
  <h1>UniHub</h1>
  <p><em>Your personal life OS — one dashboard to capture, organise, and browse everything that matters.</em></p>

  [![CI](https://github.com/gocreating/unihub/actions/workflows/ci.yml/badge.svg)](https://github.com/gocreating/unihub/actions/workflows/ci.yml)
  [![GitHub Release](https://img.shields.io/github/v/release/gocreating/unihub)](https://github.com/gocreating/unihub/releases)
  [![License](https://img.shields.io/github/license/gocreating/unihub)](LICENSE)
</div>

---

## What is UniHub?

Most productivity tools solve one problem. UniHub brings all of them under one roof.

Add a new area of your life — finance, vocabulary, places, people — and it appears in the same familiar dashboard. No app-switching, no data scattered across five different services. As new areas of your life become worth tracking, a new domain is connected to the hub.

## Domains

| Domain | What it tracks |
|--------|----------------|
| **Finance** | Accounts, balances, exchange rates, and net worth over time |
| **Visiting** | Places you've been and want to visit next |
| **Language** | Vocabulary cards and grammar sheets for languages you're learning |
| **People** | Personal contacts and relationship network |
| **Music** | Your song collection |
| More... | New domains are added over time — the interface stays the same |

## Screenshots

<div align="center">
  <img src="docs/assets/screenshot-finance.png" alt="Finance — accounts and net worth overview (illustrative)" width="700" />
  <p><em>Finance — accounts, balances, and net worth across currencies</em></p>
</div>

<div align="center">
  <img src="docs/assets/screenshot-language.png" alt="Language — vocabulary word cards (illustrative)" width="700" />
  <p><em>Language — personal vocabulary library with translations and examples</em></p>
</div>

<div align="center">
  <img src="docs/assets/screenshot-visiting.png" alt="Visiting — places log (illustrative)" width="700" />
  <p><em>Visiting — places you've been and want to go next</em></p>
</div>

## Getting Started

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and Docker Compose v2+
- Git

No other tooling needed — Docker handles the rest.

### Run Locally

```bash
git clone https://github.com/gocreating/unihub.git
cd unihub
docker compose -f apps/unihub/docker-compose.local.yml up
```

Once running:

- **App** → [http://localhost:3001](http://localhost:3001)
- **API docs** → [http://localhost:8001/api/docs/](http://localhost:8001/api/docs/)

Default login: username `root`, password `root`.

### Troubleshooting

- **Port already in use**: Edit the port mappings in `apps/unihub/docker-compose.local.yml`.
- **Services not starting**: Ensure Docker has at least 2 GB of memory available (Docker Desktop → Settings → Resources).

## Contributing

Pull requests are welcome. For significant changes, open an issue first to discuss what you'd like to change.

## License

[MIT](LICENSE)
