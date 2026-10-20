---
name: project-memory
description: Maintain concise project context between sessions, preserve decisions and progress, and resume work without rereading unrelated files.
---

# Project Memory Skill

## Objective
Preserve the minimum context necessary to continue development efficiently across separate Google Antigravity sessions in the `Bot-restaurantes` repository.

## Files Maintained by this Skill
- `GEMINI.md`: Permanent repository rules, stack overview, and development instructions.
- `PROJECT_STATUS.md`: Real-time verifiable status of tasks, milestones, executed tests, known bugs, and next steps.
- `docs/ARCHITECTURE.md`: Technical architecture, component communication, database models, and design decisions.
- `docs/DEVELOPMENT.md`: Environment setup, testing instructions, and operational troubleshooting.

---

## Workflow: Starting a Task
Before modifying any files or writing code:
1. **Read `GEMINI.md` and `PROJECT_STATUS.md`** to load the current operational context and pending tasks.
2. **Inspect Git status** (`git status`, `git log -n 5 --oneline`) to detect uncommitted changes or recent work.
3. **Consult `docs/ARCHITECTURE.md` and `docs/DEVELOPMENT.md`** only if the task alters system boundaries, database schemas, or runtime environments.
4. **Target file inspection:** Open only the files directly involved in the user request. Do not perform full repository scans.

---

## Workflow: Completing a Task
Before reporting completion to the user:
1. **Update `PROJECT_STATUS.md`** with:
   - **Current milestone / task:** Summary of what was accomplished.
   - **Files modified:** Explicit list of changed or created files.
   - **Tests executed & results:** Exact command executed and its exit status (never state a test passed unless run and verified).
   - **Known issues / blockers:** Any defects, configuration problems, or technical debt identified.
   - **Next recommended action:** Clear, concrete, and actionable step for the subsequent session.
2. **Update `docs/ARCHITECTURE.md`:** Only if architectural decisions, schemas, or module interactions changed.
3. **Verification:**
   - Keep summaries crisp and remove obsolete information.
   - Never record secrets, passwords, or production credentials.
