# Setup guide

## Requirements

- Docker Desktop (or Docker Engine + Compose)
- An Anthropic API key — https://console.anthropic.com
- A Telegram bot token (create one with [@BotFather](https://t.me/BotFather)) and your chat id

## 1. Configure

```bash
cp .env.example .env
cp config/profile.example.md config/profile.md
cp config/feeds.example.txt config/feeds.txt
```

- `.env`: set `TELEGRAM_CHAT_ID` and adjust score threshold, model and limits.
- `config/profile.md`: describe the role you are looking for. This is what Claude scores against.
- `config/feeds.txt`: one RSS feed per line.

`.env`, `config/profile.md` and `config/feeds.txt` are git-ignored, so your personal data is never committed.

## 2. Start n8n

```bash
docker compose up -d
```

Open http://localhost:5678 and create the owner account.

## 3. Import the workflow

*Workflows → Import from file →* `workflows/job-scout.json`

## 4. Create the credentials

| Node | Credential type | Value |
|---|---|---|
| **Score with Claude** | Header Auth | Name: `x-api-key` · Value: your Anthropic API key |
| **Send Telegram digest** | Telegram API | Your bot token |

Open each node, select or create the credential and save the workflow.

## 5. Test and activate

1. Click **Execute workflow** (uses the *Run manually* trigger).
2. Check the Telegram message.
3. Toggle the workflow to **Active** to run it every day at 08:00.

## Notes

- **Deduplication** uses n8n workflow static data, which is only persisted for **production (active) executions**. Manual test runs will score the same offers again.
- Offers that fail to score are removed from the "seen" list and retried on the next run.
- If there are no new offers, no message is sent.
- Cost control: `JOBSCOUT_MAX_OFFERS` limits how many offers are scored per run.

## Troubleshooting

| Problem | Fix |
|---|---|
| `Cannot find module 'fs'` or `module not allowed` in a Code node | Make sure `NODE_FUNCTION_ALLOW_BUILTIN=fs,crypto` is set in `docker-compose.yml` and restart: `docker compose up -d --force-recreate` |
| `$env` is empty / access denied | Check `N8N_BLOCK_ENV_ACCESS_IN_NODE=false` and recreate the container |
| `ENOENT /data/config/...` | The config files were not created in step 1, or the volumes in `docker-compose.yml` were changed |
| HTTP 401 from Anthropic | The Header Auth credential name must be exactly `x-api-key` |

## Development

```bash
npm test        # unit tests + execution of every Code node with stubbed n8n globals
npm run build   # regenerate workflows/job-scout.json from src/
npm run check   # fail if the workflow JSON is out of date (used in CI)
```

The JavaScript inside the Code nodes is **generated from `src/`**. Edit `src/*.js`, run `npm run build`, and commit both.
