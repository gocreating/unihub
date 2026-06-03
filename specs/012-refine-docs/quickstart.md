# README Content Draft

**Feature**: 012-refine-docs | This document is the design blueprint for the new README.md.

---

## Proposed README Structure

```markdown
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

Most productivity tools solve one problem. UniHub solves all of them in one place.

Connect a new area of your life — finance, language learning, people, places — and it appears in the same dashboard, with the same familiar interface. No app-switching, no data silos.

## Screenshots

[3 screenshots of running app with mock data]

## Domains

| Domain | What it tracks |
|--------|---------------|
| Finance | Accounts, balances, exchange rates, net worth over time |
| Visiting | Places you've been and want to go |
| Language | Vocabulary cards and grammar sheets for languages you're learning |
| People | Personal contacts and relationship network |
| Music | Your song collection |

More domains are added over time. The interface stays the same; only the data grows.

## Getting Started

### Prerequisites

- [Docker](https://www.docker.com/) and Docker Compose
- Git

### Run locally

```bash
git clone https://github.com/gocreating/unihub.git
cd unihub

# Copy and fill in environment variables
cp .env.example apps/unihub/.env
# (Edit apps/unihub/.env with your settings)

# Start all services
docker compose -f apps/unihub/docker-compose.local.yml up
```

The app is now running at **http://localhost:5173**.

The API docs are at **http://localhost:8000/api/docs/**.

### Troubleshooting

- **Port already in use**: Change the ports in `docker-compose.local.yml`.
- **Database not starting**: Ensure Docker has enough memory (4 GB+ recommended).

## Contributing

Pull requests are welcome. For significant changes, open an issue first to discuss what you'd like to change.

## License

[MIT](LICENSE)
```

---

## Logo Design Brief

**Concept**: An abstract hub/spoke motif — a central dot with 5-6 radiating connections, representing "one place, many domains." Clean, minimal, monochrome (works in both light and dark GitHub themes).

**Specification**:
- Format: SVG
- Size: `viewBox="0 0 80 80"` (renders cleanly at width="80" in README)
- Color: Single color, suitable for both light/dark backgrounds (use `currentColor` or a neutral dark that GitHub doesn't invert)
- Style: Geometric, flat — no gradients, no shadows

**Alternative if SVG creation is out of scope**: Use a simple emoji in a `<h1>` tag as a placeholder: `<h1>🧩 UniHub</h1>` — acceptable as interim, but the spec requires a committed image file.
