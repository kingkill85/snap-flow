#!/usr/bin/env python3
import argparse
import time

from neo_dev_webhook.automation import Consumer, ProjectDispatcher, ProjectFinalizer, PublicGitHubAdapter, Store, TaskRunner


def main():
    parser = argparse.ArgumentParser(description="Consume durable SnapFlow Neo Dev webhook work")
    parser.add_argument("database")
    parser.add_argument("--poll-seconds", type=float, default=2)
    parser.add_argument("--max-runtime", default="2h")
    parser.add_argument("--max-attempts", type=int, default=5)
    args = parser.parse_args()
    consumer = Consumer(
        Store(args.database), TaskRunner(max_runtime=args.max_runtime),
        PublicGitHubAdapter(), max_attempts=args.max_attempts, finalizer=ProjectFinalizer(),
        dispatcher=ProjectDispatcher(),
    )
    while True:
        if not consumer.run_one():
            time.sleep(args.poll_seconds)


if __name__ == "__main__":
    main()
