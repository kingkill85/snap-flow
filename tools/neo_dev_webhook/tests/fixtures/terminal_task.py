#!/usr/bin/env python3
"""Fixture matching task.py's immutable terminal-idempotency behavior."""
import argparse
import json
import pathlib

parser = argparse.ArgumentParser()
parser.add_argument("title", nargs="?")
parser.add_argument("--body")
parser.add_argument("--max-runtime")
parser.add_argument("--workspace")
parser.add_argument("--idempotency-key")
args = parser.parse_args()

path = pathlib.Path(__file__).with_name(".terminal-cards.json")
cards = json.loads(path.read_text()) if path.exists() else {}
card = cards.get(args.idempotency_key)
if card is None:
    card = {"task_id": f"task-{len(cards) + 1}", "body": args.body, "status": "terminal"}
    cards[args.idempotency_key] = card
    path.write_text(json.dumps(cards, sort_keys=True))
print(json.dumps({"task_id": card["task_id"], "durable": True}))
