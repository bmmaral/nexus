import os
from pathlib import Path
from datetime import datetime
from typing import Optional, List, Dict, Any

import httpx
from fastapi import FastAPI, Request, HTTPException, UploadFile, File, Form
from fastapi.responses import HTMLResponse, JSONResponse, PlainTextResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
import tempfile
import tarfile
from io import BytesIO

import git
from nexus import Nexus

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "")
OPENROUTER_BASE_URL = os.getenv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1")
DEFAULT_MODELS = [
    "google/gemini-1.5-flash",  # very large context, low cost
    "anthropic/claude-3.5-haiku",  # ~200k context, low cost
    "openai/gpt-4o-mini",
    "openrouter/auto",
]

def load_env(env_path: Path) -> None:
    """Minimal .env loader (KEY=VALUE lines)."""
    p = env_path / ".env"
    if not p.exists():
        return
    try:
        for raw in p.read_text(encoding="utf-8", errors="ignore").splitlines():
            line = raw.strip()
            if not line or line.startswith("#"):
                continue
            if "=" in line:
                k, v = line.split("=", 1)
                k = k.strip()
                v = v.strip().strip('"').strip("'")
                # Do not overwrite an explicitly provided env var
                if not os.getenv(k):
                    os.environ[k] = v
    except Exception:
        pass

app = FastAPI(title="Nexus API")

# Static and templates
BASE_DIR = Path(__file__).parent
load_env(BASE_DIR)
TEMPLATES_DIR = BASE_DIR / "web" / "templates"
STATIC_DIR = BASE_DIR / "web" / "static"

app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")
templates = Jinja2Templates(directory=str(TEMPLATES_DIR))
CONVERSATIONS_DIR = Path(os.getenv("NEXUS_CONVERSATIONS_DIR", str(BASE_DIR / "conversations"))).expanduser()
REPORTS_DIR = BASE_DIR / "reports"
os.makedirs(CONVERSATIONS_DIR, exist_ok=True)
os.makedirs(REPORTS_DIR, exist_ok=True)


def get_repo_context(repo_path: str = ".") -> Dict[str, Any]:
    repo = git.Repo(repo_path)
    prd_path = Path(repo_path) / "PRD.md"
    # Always read PRD as UTF-8 to avoid Windows 'charmap' codec errors
    prd = prd_path.read_text(encoding="utf-8", errors="ignore") if prd_path.exists() else ""

    commits: List[Dict[str, str]] = []
    for c in list(repo.iter_commits("HEAD", max_count=10)):
        commits.append({
            "sha": c.hexsha[:7],
            "message": c.message.split("\n")[0],
            "author": c.author.name,
            "date": datetime.fromtimestamp(c.committed_date).strftime("%Y-%m-%d %H:%M"),
        })

    return {"prd": prd, "commits": commits}


# -----------------------------
# GitHub Integration Utilities
# -----------------------------
GITHUB_API_BASE = "https://api.github.com"


def _load_github_token() -> str:
    token = os.getenv("GITHUB_TOKEN", "")
    if token:
        return token
    token_file = BASE_DIR / ".nexus" / "github_token.txt"
    if token_file.exists():
        try:
            return token_file.read_text(encoding="utf-8").strip()
        except Exception:
            return ""
    return ""


def _gh_headers() -> dict:
    token = _load_github_token()
    headers = {
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "Nexus-App",
    }
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return headers


async def _gh_get(url: str, client: httpx.AsyncClient):
    r = await client.get(url, headers=_gh_headers(), follow_redirects=True)
    if r.status_code >= 400:
        raise HTTPException(status_code=r.status_code, detail=r.text)
    return r


def _safe_text(b: bytes) -> str:
    try:
        return b.decode("utf-8", errors="ignore")
    except Exception:
        return b.decode("latin-1", errors="ignore")


def simple_analyze_dir(root: Path) -> str:
    """Lightweight analysis without git: read PRD.md and scan source files for endpoints."""
    prd_path = root / "PRD.md"
    prd_content = prd_path.read_text(encoding="utf-8", errors="ignore") if prd_path.exists() else ""

    import re

    report_lines: list[str] = []
    report_lines.append("# Code-PRD Drift Report\n\n")
    report_lines.append(f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M')}\n\n")

    prd_endpoints = set(re.findall(r'(?:GET|POST|PUT|DELETE)\s+(/api/\S+)', prd_content, flags=re.IGNORECASE))
    prd_endpoints |= set(re.findall(r'(/api/\S+)', prd_content))

    code_endpoints: list[tuple[str, str, str]] = []  # (method, endpoint, file)
    for file in root.rglob("*.js"):
        try:
            content = file.read_text(encoding="utf-8", errors="ignore")
        except Exception:
            continue
        for match in re.findall(r'app\.(get|post|put|delete)\([\'\"](\S+)[\'\"]', content, flags=re.IGNORECASE):
            method, endpoint = match
            code_endpoints.append((method.upper(), endpoint, str(file.relative_to(root))))

    undocumented = [(m, e, f) for (m, e, f) in code_endpoints if e not in prd_endpoints]

    if undocumented:
        report_lines.append("## 🔴 Undocumented Endpoints\n\n")
        for method, endpoint, file in undocumented:
            report_lines.append(f"- `{method} {endpoint}` in `{file}`\n")

    if not undocumented:
        report_lines.append("✅ No drift detected between PRD and code (basic scan).\n")

    return ''.join(report_lines)


def collect_repo_snapshot(root: Path, max_chars: int = 180_000) -> str:
    """Collect a concise snapshot of a repository for LLM diagnosis.
    Prioritizes PRD, README, requirements/manifests, server entry points, and workflows.
    """
    parts: list[str] = []

    def add(title: str, content: str):
        nonlocal parts, max_chars
        if not content:
            return
        remaining = max_chars - sum(len(p) for p in parts)
        if remaining <= 0:
            return
        snippet = content[:remaining]
        parts.append(f"\n===== {title} =====\n{snippet}\n")

    # PRD / README
    for name in ["PRD.md", "README.md", "readme.md"]:
        p = (root / name)
        if p.exists():
            add(name, p.read_text(encoding="utf-8", errors="ignore"))

    # Manifests
    for name in ["package.json", "requirements.txt", "pyproject.toml", "package-lock.json", "yarn.lock"]:
        p = (root / name)
        if p.exists():
            add(name, p.read_text(encoding="utf-8", errors="ignore"))

    # Likely entry points
    for rel in [
        "server.py", "nexus.py", "cli/src/index.ts", "cli/package.json",
        "web/templates/index.html", "web/static/styles.css",
        ".github/workflows", "scripts",
    ]:
        p = root / rel
        if p.is_file():
            add(rel, p.read_text(encoding="utf-8", errors="ignore"))
        elif p.is_dir():
            # Concatenate small files
            for fp in sorted(p.rglob("*")):
                if fp.is_file() and fp.stat().st_size < 40_000 and fp.suffix in {".yml", ".yaml", ".py", ".ts", ".js", ".json", ".md", ".html", ".css"}:
                    add(str(fp.relative_to(root)), fp.read_text(encoding="utf-8", errors="ignore"))

    # Directory tree
    tree_lines: list[str] = []
    for path in sorted(root.rglob("*")):
        if any(seg in {".git", "node_modules", "dist", "build", "__pycache__"} for seg in path.parts):
            continue
        depth = len(path.relative_to(root).parts)
        if depth <= 6:
            tree_lines.append("  " * (depth - 1) + ("- " + path.name))
        if len(tree_lines) > 2000:
            break
    add("TREE", "\n".join(tree_lines))

    # Simple analysis
    add("BASIC_ANALYSIS", simple_analyze_dir(root))

    return "\n".join(parts)


@app.get("/", response_class=HTMLResponse)
async def dashboard(request: Request):
    return templates.TemplateResponse("index.html", {"request": request, "models": DEFAULT_MODELS})


@app.get("/api/status")
async def status():
    try:
        repo = git.Repo(".")
        last_commit = repo.head.commit
        days_ago = (datetime.now() - datetime.fromtimestamp(last_commit.committed_date)).days
        conv_count = len(list((CONVERSATIONS_DIR).glob("*.json"))) if CONVERSATIONS_DIR.exists() else 0
        drift_path = REPORTS_DIR / "drift.md"
        drift_exists = drift_path.exists()
        recent = []
        for c in list(repo.iter_commits("HEAD", max_count=5)):
            recent.append({
                "sha": c.hexsha[:7],
                "message": c.message.split("\n")[0],
                "author": c.author.name,
                "date": datetime.fromtimestamp(c.committed_date).strftime("%Y-%m-%d %H:%M"),
            })
        return {
            "last_commit": last_commit.message.split("\n")[0],
            "days_since_last_commit": days_ago,
            "conversations": conv_count,
            "drift_report": drift_exists,
            "recent_commits": recent,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/models")
async def list_models():
    # OpenRouter has a models endpoint, but for simplicity we return defaults
    return {"models": DEFAULT_MODELS}


@app.post("/api/chat")
async def chat(payload: Dict[str, Any]):
    if not OPENROUTER_API_KEY:
        raise HTTPException(status_code=400, detail="Missing OPENROUTER_API_KEY env var")

    message: str = payload.get("message", "").strip()
    model: str = payload.get("model") or DEFAULT_MODELS[0]
    repo_path: str = payload.get("repo_path", ".")

    if not message:
        raise HTTPException(status_code=400, detail="message is required")

    context = get_repo_context(repo_path)

    system_prompt = (
        "You are an expert code assistant. Use the PRD and recent commits to answer questions about this repo. "
        "If the answer is not in the context, say so and suggest next steps."
    )

    context_block = (
        f"PRD.md (truncated to 4000 chars):\n{context['prd'][:4000]}\n\n"  # keep lightweight
        f"Recent commits:\n" + "\n".join([f"- {c['date']} {c['sha']} {c['author']}: {c['message']}" for c in context["commits"]])
    )

    body = {
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f"Context:\n{context_block}\n\nUser question: {message}"},
        ],
        "temperature": 0.3,
    }

    headers = {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "HTTP-Referer": os.getenv("OPENROUTER_HTTP_REFERER", "http://localhost"),
        "X-Title": os.getenv("OPENROUTER_APP_NAME", "Nexus"),
    }

    url = f"{OPENROUTER_BASE_URL}/chat/completions"
    try:
        async with httpx.AsyncClient(timeout=60) as client:
            r = await client.post(url, json=body, headers=headers)
            if r.status_code >= 400:
                raise HTTPException(status_code=r.status_code, detail=r.text)
            data = r.json()
    except httpx.RequestError as e:
        raise HTTPException(status_code=502, detail=str(e))

    content = (
        data.get("choices", [{}])[0]
        .get("message", {})
        .get("content", "")
    )

    return {"answer": content}


def _diagnosis_prompt(repo_summary: str) -> list[dict]:
    system = (
        "You are a senior tech lead. Given a repository snapshot, diagnose the project's state. "
        "Be concise and actionable. Identify blockers preventing the app or server from running successfully. "
        "Suggest exact next steps, commands, and a prioritized TODO list. Assume cost-sensitive, use pragmatic fixes."
    )
    user = (
        "Provide output with these sections:\n\n"
        "1) High-level summary (3-5 bullets)\n"
        "2) Run blockers (missing env, missing services, scripts, ports, migrations, build steps)\n"
        "3) What’s missing to make it work (files, configs, endpoints)\n"
        "4) Exact commands to run locally (Windows-friendly)\n"
        "5) Prioritized TODO list (10 items max)\n"
        "6) Risks and assumptions\n\n"
        "Snapshot:\n" + repo_summary
    )
    return [
        {"role": "system", "content": system},
        {"role": "user", "content": user},
    ]


async def _call_openrouter(messages: list[dict], model: str) -> str:
    if not OPENROUTER_API_KEY:
        raise HTTPException(status_code=400, detail="Missing OPENROUTER_API_KEY env var")
    body = {"model": model or DEFAULT_MODELS[0], "messages": messages, "temperature": 0.2}
    headers = {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "HTTP-Referer": os.getenv("OPENROUTER_HTTP_REFERER", "http://localhost"),
        "X-Title": os.getenv("OPENROUTER_APP_NAME", "Nexus"),
    }
    url = f"{OPENROUTER_BASE_URL}/chat/completions"
    async with httpx.AsyncClient(timeout=120) as client:
        r = await client.post(url, json=body, headers=headers)
        if r.status_code >= 400:
            raise HTTPException(status_code=r.status_code, detail=r.text)
        data = r.json()
    return (
        data.get("choices", [{}])[0]
        .get("message", {})
        .get("content", "")
    )


@app.post("/api/diagnose")
async def diagnose(payload: Dict[str, Any]):
    repo_path = (payload or {}).get("repo_path", ".")
    model = (payload or {}).get("model") or os.getenv("NEXUS_DIAG_MODEL", DEFAULT_MODELS[0])
    root = Path(repo_path)
    if not root.exists():
        raise HTTPException(status_code=400, detail="repo_path not found")
    summary = collect_repo_snapshot(root)
    messages = _diagnosis_prompt(summary)
    answer = await _call_openrouter(messages, model)
    return {"model": model, "answer": answer}


# -----------------------------
# GitHub API Endpoints (Remote)
# -----------------------------


@app.post("/api/github/connect")
async def github_connect(payload: Dict[str, Any]):
    token = (payload or {}).get("token", "").strip()
    if not token:
        raise HTTPException(status_code=400, detail="token is required")
    token_dir = BASE_DIR / ".nexus"
    os.makedirs(token_dir, exist_ok=True)
    (token_dir / "github_token.txt").write_text(token, encoding="utf-8")
    return {"ok": True}


@app.get("/api/github/token-status")
async def github_token_status():
    return {"has_token": bool(_load_github_token())}


@app.get("/api/github/repos")
async def github_repos():
    if not _load_github_token():
        raise HTTPException(status_code=400, detail="Missing GitHub token. POST /api/github/connect first.")
    async with httpx.AsyncClient(timeout=60) as client:
        r = await _gh_get(f"{GITHUB_API_BASE}/user/repos?per_page=100&sort=updated", client)
        data = r.json()
        items = [
            {
                "full_name": it.get("full_name"),
                "private": it.get("private"),
                "default_branch": it.get("default_branch"),
                "pushed_at": it.get("pushed_at"),
            }
            for it in data
        ]
        return {"count": len(items), "items": items}


@app.get("/api/github/repo/{owner}/{repo}/context")
async def github_repo_context(owner: str, repo: str, ref: Optional[str] = None):
    if not _load_github_token():
        raise HTTPException(status_code=400, detail="Missing GitHub token. POST /api/github/connect first.")
    async with httpx.AsyncClient(timeout=60) as client:
        # PRD.md
        prd_url = f"{GITHUB_API_BASE}/repos/{owner}/{repo}/contents/PRD.md" + (f"?ref={ref}" if ref else "")
        prd_text = ""
        prd_res = await client.get(prd_url, headers=_gh_headers())
        if prd_res.status_code == 200:
            prd_json = prd_res.json()
            if prd_json.get("encoding") == "base64":
                import base64
                prd_text = _safe_text(base64.b64decode(prd_json.get("content", "")))
        # Commits
        commits_url = f"{GITHUB_API_BASE}/repos/{owner}/{repo}/commits?per_page=10" + (f"&sha={ref}" if ref else "")
        commits_res = await _gh_get(commits_url, client)
        commits = []
        for c in commits_res.json():
            commit = c.get("commit", {})
            author = commit.get("author", {})
            commits.append({
                "sha": c.get("sha", "")[:7],
                "message": (commit.get("message") or "").split("\n")[0],
                "author": author.get("name") or "",
                "date": (author.get("date") or "")[:16].replace("T", " "),
            })
        return {"prd": prd_text, "commits": commits}


@app.post("/api/github/repo/{owner}/{repo}/analyze", response_class=PlainTextResponse)
async def github_repo_analyze(owner: str, repo: str, ref: Optional[str] = None):
    if not _load_github_token():
        raise HTTPException(status_code=400, detail="Missing GitHub token. POST /api/github/connect first.")
    tar_url = f"{GITHUB_API_BASE}/repos/{owner}/{repo}/tarball" + (f"/{ref}" if ref else "")
    async with httpx.AsyncClient(timeout=120) as client:
        tar_res = await _gh_get(tar_url, client)
        with tempfile.TemporaryDirectory() as tmp:
            bio = BytesIO(tar_res.content)
            try:
                with tarfile.open(fileobj=bio, mode="r:gz") as tf:
                    tf.extractall(tmp)
            except tarfile.ReadError:
                raise HTTPException(status_code=500, detail="Failed to extract repository tarball")
            # Find root directory inside tarball
            root_entries = list(Path(tmp).iterdir())
            if not root_entries:
                raise HTTPException(status_code=500, detail="Empty repository archive")
            root = root_entries[0]
            report = simple_analyze_dir(root)
            return report


@app.get("/api/github/repo/{owner}/{repo}/timeline", response_class=PlainTextResponse)
async def github_repo_timeline(owner: str, repo: str, ref: Optional[str] = None):
    if not _load_github_token():
        raise HTTPException(status_code=400, detail="Missing GitHub token. POST /api/github/connect first.")
    async with httpx.AsyncClient(timeout=60) as client:
        commits_url = f"{GITHUB_API_BASE}/repos/{owner}/{repo}/commits?per_page=30" + (f"&sha={ref}" if ref else "")
        commits_res = await _gh_get(commits_url, client)
        lines = ["# Remote Timeline\n\n"]
        from collections import defaultdict
        by_day: dict[str, list[dict]] = defaultdict(list)
        for c in commits_res.json():
            commit = c.get("commit", {})
            author = commit.get("author", {})
            date = (author.get("date") or "")[:10]
            by_day[date].append({
                "sha": c.get("sha", "")[:7],
                "message": (commit.get("message") or "").split("\n")[0],
                "author": author.get("name") or "",
                "time": (author.get("date") or "")[11:16],
            })
        for day in sorted(by_day.keys(), reverse=True):
            lines.append(f"## {day}\n")
            for e in by_day[day]:
                lines.append(f"- 📝 [{e['sha']}] {e['author']} {e['time']}: {e['message']}\n")
            lines.append("\n")
        return ''.join(lines)


@app.post("/api/github/repo/{owner}/{repo}/diagnose")
async def github_repo_diagnose(owner: str, repo: str, ref: Optional[str] = None, payload: Dict[str, Any] | None = None):
    model = (payload or {}).get("model") or os.getenv("NEXUS_DIAG_MODEL", DEFAULT_MODELS[0])
    if not _load_github_token():
        raise HTTPException(status_code=400, detail="Missing GitHub token. POST /api/github/connect first.")
    tar_url = f"{GITHUB_API_BASE}/repos/{owner}/{repo}/tarball" + (f"/{ref}" if ref else "")
    async with httpx.AsyncClient(timeout=180) as client:
        tar_res = await _gh_get(tar_url, client)
        with tempfile.TemporaryDirectory() as tmp:
            bio = BytesIO(tar_res.content)
            with tarfile.open(fileobj=bio, mode="r:gz") as tf:
                tf.extractall(tmp)
            root_entries = list(Path(tmp).iterdir())
            if not root_entries:
                raise HTTPException(status_code=500, detail="Empty repository archive")
            root = root_entries[0]
            summary = collect_repo_snapshot(root)
            messages = _diagnosis_prompt(summary)
            answer = await _call_openrouter(messages, model)
            return {"model": model, "answer": answer}


@app.post("/api/analyze")
async def run_analyze():
    try:
        Nexus().analyze()
        drift_path = REPORTS_DIR / "drift.md"
        # Drift report can include emoji; force UTF-8
        text = drift_path.read_text(encoding="utf-8", errors="ignore") if drift_path.exists() else ""
        return {"ok": True, "report_path": "reports/drift.md", "report": text}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/reports/drift", response_class=PlainTextResponse)
async def get_drift_report():
    path = REPORTS_DIR / "drift.md"
    if not path.exists():
        raise HTTPException(status_code=404, detail="No drift report")
    return path.read_text(encoding="utf-8", errors="ignore")


@app.get("/api/timeline", response_class=PlainTextResponse)
async def get_timeline():
    try:
        Nexus().update_timeline()
        path = CONVERSATIONS_DIR / "index.md"
        return (
            path.read_text(encoding="utf-8", errors="ignore")
            if path.exists()
            else "# Conversation Timeline\n\n(no events)"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/conversations")
async def list_conversations():
    conv_dir = CONVERSATIONS_DIR
    items: list[dict[str, Any]] = []
    if conv_dir.exists():
        for p in sorted(conv_dir.glob("*.json"), key=lambda x: x.name, reverse=True)[:50]:
            items.append({"name": p.name, "size": p.stat().st_size})
    return {"count": len(items), "items": items}


@app.post("/api/conversations/import")
async def import_conversation(file: UploadFile = File(...), platform: str | None = Form(default=None)):
    try:
        # Save to a temp path and pass to Nexus importer
        tmp_path = CONVERSATIONS_DIR / (file.filename or "conversation.json")
        os.makedirs(tmp_path.parent, exist_ok=True)
        content = await file.read()
        with open(tmp_path, "wb") as f:
            f.write(content)
        Nexus().import_conversation(str(tmp_path), platform)
        return {"ok": True, "stored_as": str(tmp_path.name)}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
