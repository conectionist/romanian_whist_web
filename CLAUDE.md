# CLAUDE.md

## Never freeze the owner's computer

The owner uses this machine while you work. A command that takes every core makes it unusable,
and that is worse than any wait. **Slower is always acceptable; a frozen desktop never is.**

- **Page tests:** `nice -n 19 npx vitest run --maxWorkers=2` and
  `nice -n 19 npm run e2e -- --workers=1`. The end-to-end tests start
  `libs/romanian_whist_server/build/server/app/whist_server`, or the server `WHIST_SERVER` names,
  so build the submodule's `default` preset first.
- **The server's build** follows the server's own `CLAUDE.md`, in `libs/romanian_whist_server`:
  never a bare `-j`, always `nice -n 19 cmake --build --preset <p> -j 2`. Its first build compiles
  Drogon too and takes several minutes: run it in the background.
- **One heavy command at a time.** Never a server build and the page's tests at once.
- **Sanitizer builds of the server, its chaos test and its load test** only when the owner asks,
  one run per command. Don't loop them.
- **Long jobs go in the background** (`run_in_background`), still under `nice`, so the owner can
  keep working and can stop them.

## Comments

- A comment says why the code is the way it is, when the code cannot say it. One to three lines.
- Never mention phases, plan sections, PR numbers, review findings, dates or who decided something.
  That is history, and history goes in the commit message.
- Never describe code that was removed or what the code used to do.
- No capitals for emphasis. Keep the warnings that prevent a crash, a deadlock or a hang, and make
  them short.
- Say a reason once, next to the code it explains. Don't send the reader to another function.

This applies to every comment you write or change. Existing comments that break it are cleaned up
in PRs of their own, one area at a time, not mixed into unrelated changes.

## Branch workflow

Branches are stacked, as in the server: `master` -> the parent branch -> `web/phase-N-<name>`.
This repository has no parent branch yet. It is made off `master` when the first phase that
changes this repository starts.

Phase branches are reviewed and PR'd against the parent branch, never `master`. When running
`/code-review` on a phase branch, diff against the parent, or pass the PR number so GitHub's base
branch is used. This repository's phases are in `docs/page-plan.md`. The review procedure, and
when a phase branch is merged, are in section 13 of the server's `docs/server-plan.md`. Read
the submodule's copy, `libs/romanian_whist_server/docs/server-plan.md`: the server's `master`
holds an older plan.

## Changing a PR: never `gh pr edit`

`gh pr edit` fails on the owner's repositories, with "GraphQL: Projects (classic) is being
deprecated …", and changes nothing. Don't try it first. Change a PR's description or title through
the REST API from the start, with the body written to a file:

```
gh api -X PATCH repos/conectionist/romanian_whist_web/pulls/<N> -F body=@<file>
gh api -X PATCH repos/conectionist/romanian_whist_web/pulls/<N> -f title='<title>'
```

`gh pr view` and `gh pr create` work as usual.
