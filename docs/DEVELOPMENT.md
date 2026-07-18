# Development — Docker Environment

## Quick start

```bash
# Build the image (first time or after Dockerfile changes)
docker compose build

# Enter the dev container interactively
docker compose run --rm opencode

# Inside the container, verify the toolchain:
node --version
python3 --version
pnpm --version
git --version
npx playwright --version
which opencode
```

## Running OpenCode inside the container

```bash
docker compose run --rm opencode
# Then inside the container:
opencode
```

## Running frontend + backend

### Option A — From inside the opencode container

```bash
# Start the Next.js dev server (background)
npm run dev &

# Install Python deps and start FastAPI
pip install -r backend/requirements.txt
uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload &
```

### Option B — Dedicated Compose services

```bash
# Frontend only
docker compose up frontend

# Backend only
docker compose up backend

# Both (runs frontend on :3000, backend on :8000)
docker compose up frontend backend
```

## SSH workflow (Termius → SSH → Docker)

```bash
# SSH into the host, then:
cd /path/to/hello-ai
docker compose exec opencode bash
# or
docker compose exec frontend bash
```

## Environment variables

Copy `.env.example` to `.env.local` and fill in values. Docker Compose
reads `.env.local` automatically — or create a `.env` file at the project
root with the following vars:

| Variable | Description |
|---|---|
| `OPENAI_API_KEY` | OpenAI API key (for OpenCode) |
| `OPENROUTER_API_KEY` | Alternative to OpenAI |
| `GITHUB_TOKEN` | GitHub personal access token |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_ANON_KEY` | Supabase anon / publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service-role key (server-side) |
| `SENTRY_DSN` | Sentry DSN |
| `SENTRY_ACCESS_TOKEN` | Sentry access token (for MCP) |
| `SENTRY_AUTH_TOKEN` | Sentry auth token |
| `NEXT_PUBLIC_MOCK_ENABLED` | Enable MSW mocks (`true`/`false`) |
| `BACKEND_URL` | Backend URL (default: `http://backend:8000`) |

Docker Compose picks up these variables from `.env` in the project root
or from the shell environment.

## SSH agent forwarding (optional)

For Git operations over SSH, mount the SSH agent socket:

```yaml
# Add to docker-compose.yml under opencode > volumes:
- ${SSH_AUTH_SOCK:-}:/ssh-agent:ro

# And to opencode > environment:
- SSH_AUTH_SOCK=/ssh-agent
```

## File permissions

The container user has UID 501 (matching the macOS host). On macOS with
Docker Desktop, file permissions are handled transparently by the VM.
On Linux (e.g., Oracle VM deployment), specify the target user's UID:

```bash
docker compose build --build-arg USER_ID=$(id -u)
```

## node_modules performance

A named volume `opencode_node_modules` is used for `/workspace/node_modules`
to avoid the bind-mount performance penalty on macOS. After adding new
dependencies, run `npm install` inside the container — the volume persists
across restarts.

To reset:
```bash
docker compose down -v
docker compose run --rm opencode npm install
```

## Deploying to Oracle VM

1. Build the production backend image:
   ```bash
   docker build -f backend/Dockerfile -t hello-ai-backend:latest .
   ```

2. Push to a registry or transfer the image.

3. On the Oracle VM, run:
   ```bash
   cd ~/backend
   docker compose up -d
   ```

See `backend/Dockerfile` and `backend/docker-compose.yml` for the
production configuration.
