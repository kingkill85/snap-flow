# SnapFlow governed development controller

For every `kingkill85/snap-flow` Issue task, read the complete task body and live GitHub Issue first. The durable task identity is the only workflow identity. Invoke only the exact `/usr/local/bin/neo-dev-project-control` command printed in the task; never run project shell, SSH, tmux, Git, Codex, OpenSpec, package, lint, or test commands from this controller workspace.

The initial label phase creates planning artifacts, a Draft PR, immutable full-SHA evidence, and requests `/approve-spec <full-sha>` only. It never implements. Later `/approve-spec`, findings, `/accept`, and `/merge` wakeups resume the same task and Codex session. Acceptance permits sync/archive but not merge. Merge requires its separate authorization. Heartbeats are liveness only. Missing or ambiguous prerequisites produce one concrete blocker immediately.
