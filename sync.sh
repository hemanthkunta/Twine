#!/bin/bash

set -e

echo ""
echo "============================================================"
echo "       AETHER MESSAGING PROJECT - AUTO SYNC"
echo "============================================================"
echo ""

BRANCH=$(git branch --show-current)

if [ -z "$BRANCH" ]; then
    echo "ERROR: Could not determine current branch."
    exit 1
fi

echo "Current branch: $BRANCH"
echo ""

echo "[1/7] Fetching latest changes..."
git fetch origin

echo ""
echo "[2/7] Checking local changes..."

if [ -n "$(git status --porcelain)" ]; then

    git status --short

    echo ""
    echo "Creating automatic checkpoint..."

    git add -A

    TIMESTAMP=$(date "+%Y-%m-%d %H:%M:%S")

    git commit -m "sync: automatic checkpoint $TIMESTAMP"

else

    echo "No local changes."

fi

echo ""
echo "[3/7] Synchronizing with origin/$BRANCH..."

if ! git pull --rebase origin "$BRANCH"; then

    echo ""
    echo "============================================================"
    echo "SYNC STOPPED - MERGE CONFLICT"
    echo "============================================================"
    echo ""
    echo "Run:"
    echo ""
    echo "    git status"
    echo ""
    echo "Resolve the conflicts."
    echo ""
    echo "Then:"
    echo ""
    echo "    git add ."
    echo "    git rebase --continue"
    echo ""
    exit 1
fi

echo ""
echo "[4/7] Pushing changes..."

if ! git push origin "$BRANCH"; then

    echo ""
    echo "Push failed."
    echo "Run ./sync.sh again."
    exit 1
fi

echo ""
echo "[5/7] Verifying remote..."

git fetch origin

echo ""
echo "[6/7] Checking working tree..."

git status --short

echo ""
echo "[7/7] SYNC COMPLETE"
echo ""

git log -1 --oneline

echo ""
