# Project Nexus (Lightweight)

Dead-simple, Git-native project memory tool with a minimal CLI, a tiny API + dashboard for repo chat via OpenRouter, and a few GitHub Actions to keep projects active and in-sync with your PRD.

## Requirements
- Python 3.11+
- Git installed and repository initialized (`.git` present)
- pip packages from `requirements.txt`:
  - click, GitPython, PyYAML
  - fastapi, uvicorn, httpx, jinja2
- Optional (for chat): `OPENROUTER_API_KEY` environment variable

## Install
```bash
# From repo root
pip install -r requirements.txt
```

## CLI Quick Start
The CLI lives in `nexus.py`.

```bash
# Initialize directories and hooks in the current repo
python nexus.py init

# Import an AI conversation export (ChatGPT/Claude/Gemini JSON)
python nexus.py import-conv ~/Downloads/chatgpt-export.json

# Show quick status summary
python nexus.py status

# Analyze PRD vs code drift and write reports/drift.md
python nexus.py analyze

# Update conversations timeline (conversations/index.md)
python nexus.py timeline
```

Recommended: symlink to your PATH for the convenience command `nexus`.
```bash
sudo cp nexus.py /usr/local/bin/nexus && sudo chmod +x /usr/local/bin/nexus
nexus init
```

## API + Dashboard (Repo Chat via OpenRouter)
A tiny FastAPI server provides:
- GET `/` – simple dashboard UI
- GET `/api/status` – last commit info
- GET `/api/models` – available model list
- POST `/api/chat` – send a question with optional model and repo path

### Run the server
```bash
# Set your OpenRouter API key
export OPENROUTER_API_KEY=YOUR_KEY
# Optional branding (helps OpenRouter telemetry)
export OPENROUTER_HTTP_REFERER=http://localhost:8000
export OPENROUTER_APP_NAME=Nexus

# Start the API server
uvicorn server:app --reload --port 8000
# Open http://localhost:8000
```

### Chat request payload
```json
{
  "message": "What endpoints are implemented vs PRD?",
  "model": "openrouter/auto",             // optional
  "repo_path": "."                         // optional, defaults to current repo
}
```

### Notes
- Context includes `PRD.md` (truncated) + last ~10 commits.
- No code is uploaded; only the PRD and commit metadata are used for the prompt context.

## GitHub Actions and Cron Jobs
This repo includes minimal but useful workflows under `.github/workflows/`:

- `analyze.yml` (on push + manual):
  - Installs the CLI and runs `nexus analyze`
  - Commits `reports/drift.md` if there are changes

- `reminder.yml` (daily 09:00 UTC + manual):
  - Detects inactivity (≥5 days)
  - Opens a reminder issue with PRD "Next Steps" if present

- `weekly-summary.yml` (Mondays 08:00 UTC + manual):
  - Generates `reports/weekly-summary.md` with recent commits, conversations, and drift snapshot
  - Opens a summary issue

- `nightly-health.yml` (daily 03:00 UTC + manual):
  - Optional quick `nexus analyze`
  - Opens a drift issue if high-level drift is detected

- `stale-branches.yml` (Sundays 06:00 UTC + manual):
  - Lists remote branches with no commits in 30+ days
  - Opens a maintenance issue to review/clean up

## Roadmap (from PRD2, adapted for lightweight scope)
- MVP hardening
  - Improve PRD change summarization in commit messages
  - Expand endpoint detection beyond simple Express patterns
  - Add TypeScript/Python AST checks for better drift reports
- Conversation intelligence
  - Decision extraction with richer patterns and confidence scoring
  - Optional import of Markdown transcripts
- Repo chat enhancements
  - Model list fetched from OpenRouter dynamically
  - Add file/dir scoping and “include snippet” support in prompts
  - Persist Q&A to `conversations/` as JSONL
- Automation
  - Auto-close inactivity issues when new commits land
  - Weekly trend charts in summaries (issues, commits, drift count)
- Reuse scout (post-MVP)
  - TF-IDF + AST signatures for module similarity
  - Update `PRD.md` with reuse suggestions and copy commands

## Implemented PRD2 elements in this repo
- Git-native design: conversations, reports, PRD live in the repo
- CLI: `init`, `import-conv`, `status`, `analyze`, `timeline`, `prd-summary`
- Hooks: pre-commit enhancement for PRD summaries (idempotent)
- Actions: analyzer, inactivity reminder, weekly summary, nightly health, stale-branches
- Web: simple dashboard + OpenRouter-powered chat about the current repo

## Configuration
- `.nexus/config.yml` (auto-created on `init`):
```yaml
reminder_days: 5
auto_commit: true
analyze_on_push: true
ignore_patterns:
  - node_modules
  - .env
  - build/
```

## Security & Privacy
- The server never uploads your codebase; it includes only `PRD.md` text and commit metadata as context for chat.
- You control the OpenRouter API key via environment variable.

## Troubleshooting
- CLI cannot find git repository: run `git init` first.
- Drift report empty: ensure `PRD.md` contains an “API Endpoints” section or endpoint-like patterns, and your code defines endpoints supported by the simple scanner.
- Chat 400 error: set `OPENROUTER_API_KEY` in your shell before starting the server.

## License
MIT
