#!/usr/bin/env sh
set -e

REPO=$WEFT_REPO
[ -n "$REPO" ] || REPO=https://github.com/czheng5/weft-agnet.git
VERSION=$WEFT_VERSION
[ -n "$VERSION" ] || VERSION=main
DEST=$WEFT_HOME
[ -n "$DEST" ] || DEST=$HOME/.weft
BIN=$WEFT_BIN
[ -n "$BIN" ] || BIN=$HOME/.local/bin
DRY=0

while [ $# -gt 0 ]; do
  case "$1" in
    --version) VERSION=$2; shift 2 ;;
    --dir) DEST=$2; shift 2 ;;
    --bin) BIN=$2; shift 2 ;;
    --dry-run) DRY=1; shift ;;
    --help|-h)
      echo "Weft installer"
      echo "  --version <ref>   branch/tag (default: main)"
      echo "  --dir <path>      install directory (default: ~/.weft)"
      echo "  --bin <path>      command directory (default: ~/.local/bin)"
      echo "  --dry-run         print plan without changes"
      exit 0 ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
done

if ! command -v node >/dev/null 2>&1; then
  echo "Weft requires Node.js >= 24." >&2
  echo "Install Node 24 from https://nodejs.org/ and retry." >&2
  exit 1
fi
MAJOR=$(node -p "process.versions.node.split('.')[0]")
if [ "$MAJOR" -lt 24 ]; then
  echo "Weft requires Node.js >= 24 (found $(node --version))." >&2
  exit 1
fi
if ! command -v npm >/dev/null 2>&1; then
  echo "npm not found; install Node.js 24 with npm." >&2
  exit 1
fi

LOCAL=0
ROOT=$DEST/app
if [ -f ./package.json ] && [ -f ./src/cli.ts ] && [ -f ./install.sh ]; then
  LOCAL=1
  ROOT=$(pwd)
fi

echo "Weft installer"
echo "  version: $VERSION"
echo "  root:    $ROOT"
echo "  bin:     $BIN"

if [ "$DRY" -eq 1 ]; then
  echo "dry-run: no changes"
  exit 0
fi

if [ "$LOCAL" -eq 0 ]; then
  if ! command -v git >/dev/null 2>&1; then
    echo "git is required to bootstrap Weft." >&2
    exit 1
  fi
  mkdir -p "$DEST"
  if [ -d "$ROOT/.git" ]; then
    echo "Updating existing checkout..."
    git -C "$ROOT" fetch --depth 1 origin "$VERSION"
    git -C "$ROOT" checkout -q FETCH_HEAD
  else
    echo "Cloning $REPO ($VERSION)..."
    git clone --depth 1 --branch "$VERSION" "$REPO" "$ROOT"
  fi
fi

cd "$ROOT"
echo "Installing Node dependencies..."
npm install --no-audit --no-fund

if [ -f .env.example ] && [ ! -f .env ]; then
  cp .env.example .env
  echo "Created .env from .env.example"
fi

mkdir -p "$BIN"
cat > "$BIN/weft" <<EOF
#!/usr/bin/env sh
exec node "$ROOT/bin/weft.mjs" "\$@"
EOF
chmod +x "$BIN/weft"

echo ""
echo "Weft installed: $BIN/weft"
case ":$PATH:" in
  *":$BIN:"*) ;;
  *) echo "Add to PATH: export PATH=$BIN:\$PATH" ;;
esac
echo "Run: weft --demo"
