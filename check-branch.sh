#!/bin/bash

# Branch check script - Run this before starting work
# Usage: ./check-branch.sh

echo "🔍 Checking git branch status..."
echo ""

CURRENT_BRANCH=$(git branch --show-current)

echo "Current branch: $CURRENT_BRANCH"
echo ""

if [ "$CURRENT_BRANCH" = "main" ] || [ "$CURRENT_BRANCH" = "master" ]; then
    echo "🛑 STOP! You are on main branch."
    echo ""
    echo "You MUST create a feature branch first:"
    echo "  git checkout -b feature/description"
    echo ""
    echo "❌ DO NOT proceed with changes on main branch!"
    exit 1
else
    echo "✅ Good! You are on feature branch: $CURRENT_BRANCH"
    echo "✅ You can proceed with work."
    exit 0
fi
