import json
import pathlib
import unittest

from neo_dev_webhook.codex_runtime import (
    build_exec_argv, continuation_prompt, parse_exec_event, run_exec_worker,
)
from neo_dev_webhook.project_control import GovernedTarget


SESSION_ID = "019fdb44-c3df-7ff0-8879-a8f98e2728f6"
TARGET = GovernedTarget(
    repository="kingkill85/snap-flow",
    issue_number=13,
    project="snapflow-dev",
    session="snapflow-dev",
    window="issue-13",
    worktree="/workspace/snap-flow-issue-13",
    branch="feature/issue-13",
    worker="Codex",
)


class CodexExecRuntimeTest(unittest.TestCase):
    def test_label_resume_continues_full_spec_work_instead_of_only_rechecking_gate(self):
        prompt = continuation_prompt("kingkill85/snap-flow", 13, "label")
        self.assertIn("Create ONLY the issue-scoped OpenSpec proposal", prompt)
        self.assertIn("create/update the Draft PR", prompt)
        self.assertIn("clean-main baseline exception", prompt)
        self.assertNotIn("enforce only that current gate", prompt)

    def test_start_is_bound_to_governed_worktree_without_interactive_approval(self):
        argv = build_exec_argv("start", TARGET, None, pathlib.Path("/tmp/schema.json"), "PROMPT")
        self.assertEqual(argv, (
            "/usr/local/bin/codex", "exec", "--json",
            "--dangerously-bypass-approvals-and-sandbox",
            "-C", "/workspace/snap-flow-issue-13",
            "--output-schema", "/tmp/schema.json", "PROMPT",
        ))

    def test_resume_uses_exact_persisted_session(self):
        argv = build_exec_argv("resume", TARGET, SESSION_ID, pathlib.Path("/tmp/schema.json"), "CONTINUE")
        self.assertEqual(argv, (
            "/usr/local/bin/codex", "exec", "resume", "--json",
            "--dangerously-bypass-approvals-and-sandbox",
            "--output-schema", "/tmp/schema.json", SESSION_ID, "CONTINUE",
        ))

    def test_jsonl_events_expose_session_completion_and_terminal(self):
        self.assertEqual(
            parse_exec_event(json.dumps({"type": "thread.started", "thread_id": SESSION_ID})),
            ("session", SESSION_ID),
        )
        completion = {"semantic_outcome": "correctable", "resumable": True, "summary": "Spec ready"}
        self.assertEqual(
            parse_exec_event(json.dumps({
                "type": "item.completed",
                "item": {"type": "agent_message", "text": json.dumps(completion)},
            })),
            ("completion", completion),
        )
        self.assertEqual(
            parse_exec_event(json.dumps({"type": "turn.completed", "usage": {}})),
            ("terminal", 0),
        )

    def test_worker_reports_real_session_and_structured_completion(self):
        completion = {"semantic_outcome": "correctable", "resumable": True, "summary": "Spec ready"}

        class Process:
            stdout = iter((
                json.dumps({"type": "thread.started", "thread_id": SESSION_ID}) + "\n",
                json.dumps({"type": "item.completed", "item": {
                    "type": "agent_message", "text": json.dumps(completion),
                }}) + "\n",
                json.dumps({"type": "turn.completed", "usage": {}}) + "\n",
            ))

            def wait(self):
                return 0

        calls = []

        def factory(argv, **kwargs):
            calls.append((tuple(argv), kwargs))
            return Process()

        sessions = []
        observed_session, observed_completion, exit_code = run_exec_worker(
            "start", TARGET, None, pathlib.Path("/tmp/schema.json"), "PROMPT",
            sessions.append, process_factory=factory,
        )
        self.assertEqual(observed_session, SESSION_ID)
        self.assertEqual(sessions, [SESSION_ID])
        self.assertEqual(observed_completion, completion)
        self.assertEqual(exit_code, 0)
        self.assertEqual(calls[0][0][:5], (
            "/usr/bin/timeout", "--signal=TERM", "--kill-after=10", "1800",
            "/usr/local/bin/codex",
        ))
        self.assertEqual(calls[0][1]["cwd"], TARGET.worktree)


if __name__ == "__main__":
    unittest.main()
