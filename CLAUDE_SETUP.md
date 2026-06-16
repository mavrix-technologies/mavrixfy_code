# Claude CLI Setup

This document explains how to install and configure the `claude` CLI and safely store your Anthropic API key on Windows (PowerShell) and other environments.

1) Prerequisites
- Node.js and npm installed. Verify with:

```powershell
node -v
npm -v
```

2) Install the CLI (global)

```powershell
npm install -g @anthropic-ai/claude-code
```

3) Add your API key (do NOT commit your key)

PowerShell (current session):

```powershell
$env:ANTHROPIC_API_KEY = "YOUR_API_KEY_HERE"
```

PowerShell (persist across logins):

```powershell
setx ANTHROPIC_API_KEY "YOUR_API_KEY_HERE"
```

macOS / Linux (bash/zsh):

```bash
export ANTHROPIC_API_KEY="YOUR_API_KEY_HERE"
```

4) Use a local `.env` for projects
- Copy the provided `.env.example` to `.env` and replace `REPLACE_ME` with your real key.
- The repo already ignores `.env` so it won't be committed.

5) Initialize / Launch the `claude` CLI

Run:

```powershell
claude
```

Follow any prompts. The CLI will read the `ANTHROPIC_API_KEY` environment variable.

6) Security and rotation
- If you pasted a key into a public place (e.g. an issue, PR, or chat), consider it compromised and rotate it immediately from your account dashboard.
- Store long-lived credentials in a secure secrets manager where possible.

7) Troubleshooting
- If `claude` is not found after install, ensure your global npm bin is on `PATH`. Check with `npm bin -g` and add that folder to your `PATH` if needed.
- If the CLI still can't authenticate, confirm `ANTHROPIC_API_KEY` is visible in the environment: `echo $env:ANTHROPIC_API_KEY` (PowerShell) or `echo $ANTHROPIC_API_KEY` (bash).

8) Quick checklist
- [ ] Verify `node -v` and `npm -v`
- [ ] `npm install -g @anthropic-ai/claude-code` completed
- [ ] Created `.env` from `.env.example` and set `ANTHROPIC_API_KEY`
- [ ] Run `claude` and confirm interactive access to desired models
