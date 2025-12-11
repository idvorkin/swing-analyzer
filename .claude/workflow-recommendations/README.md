# Workflow Recommendations

This directory captures human-AI workflow improvements discovered during sessions.

## How it works

1. At session end, agent creates a timestamped file with recommendations
2. Files use format: `YYYY-MM-DD-HHMMSS-RANDOM.md` to avoid conflicts
3. Human reviews periodically, merges good ones into CLAUDE.md
4. Never edit old files - only create new ones

## To trigger review

Say "workflow review" or run the slash command at session end.

## File format

```markdown
# Session: YYYY-MM-DD (project-name)

## Recommendations

### Short title

- **Pattern**: What the agent kept getting wrong or user kept correcting
- **Recommendation**: Specific text to add to CLAUDE.md or chop-conventions
- **Target**: CLAUDE.md | chop-conventions | other
- **Status**: pending | merged | rejected
```
