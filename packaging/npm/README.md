# nexus-cli (npm)

Thin wrapper: on first run it downloads the matching GitHub Release binary for your OS/arch into `~/.cache/nexus-cli/<version>/` and executes it. This is **not** a JavaScript implementation of Nexus.

```bash
npm install -g ./packaging/npm   # from a clone
# or, after publish:
npm install -g nexus-cli
nexus --version
```

Bump `version` in `package.json` to match a published GitHub tag (`v0.1.0` → release assets `nexus-v0.1.0-…`).

Supported: macOS (arm64, x64), Linux x86_64 (musl build), Windows x64.
