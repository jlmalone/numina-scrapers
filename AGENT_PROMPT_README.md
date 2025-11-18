# Claude Code Web Agent - Usage Guide

This project uses a Claude Code Web agent prompt system for automated development tasks.

## How It Works

### 1. Agent Prompt File

The main prompt is stored in **`CLAUDE_AGENT_PROMPT.md`**. This file contains:
- Task description and requirements
- Implementation instructions
- Acceptance criteria
- Deliverables checklist

### 2. Idempotency Mechanism

The agent uses a **`.agent-completed`** file to track completion status. This prevents the agent from re-running completed tasks.

#### First Run
```bash
# Agent checks for .agent-completed
# File doesn't exist → Proceeds with implementation
# On completion → Creates .agent-completed file
```

#### Subsequent Runs
```bash
# Agent checks for .agent-completed
# File exists → Reads completion status
# Responds: "✅ Task already completed on [timestamp]"
# Exits without making changes
```

### 3. File Structure

```
numina-scrapers/
├── CLAUDE_AGENT_PROMPT.md      # Agent task instructions
├── AGENT_PROMPT_README.md      # This file - explains the system
├── .agent-completed            # Completion marker (auto-generated)
└── [rest of project files]
```

## Using the Agent Prompt

### To Run the Agent

1. **First Time**: Simply provide the prompt file to Claude Code Web
   ```
   "Please read CLAUDE_AGENT_PROMPT.md and follow all instructions"
   ```

2. **Subsequent Times**: The agent will detect completion automatically
   ```
   ✅ This task has already been completed on 2025-11-18T00:00:00Z
   See README.md for details.
   ```

### To Re-Run the Agent

If you need to re-run the agent (e.g., after updating the prompt):

```bash
# Delete the completion marker
rm .agent-completed

# Then run the agent again
# It will detect no completion file and proceed with the task
```

### To Update the Prompt

1. Edit `CLAUDE_AGENT_PROMPT.md`
2. Update the version number at the top:
   ```markdown
   **Version**: 1.1.0  # Increment version
   ```
3. Delete `.agent-completed` if you want the agent to re-run
4. Run the agent

## Completion File Format

The `.agent-completed` file contains:

```
AGENT_PROMPT_VERSION: 1.0.0
COMPLETED: 2025-11-18T00:00:00Z
STATUS: SUCCESS

Summary: [Brief description of what was completed]
Providers: [List of implemented items]
Acceptance Criteria: All met ✅

Files Created: [count]
Total Lines of Code: [approximate count]

Next Steps: See TODO.md

--- DO NOT DELETE THIS FILE ---
This file marks task completion for idempotency.
```

## Best Practices

### ✅ DO
- Keep `CLAUDE_AGENT_PROMPT.md` updated with current requirements
- Increment version numbers when making significant changes
- Check `.agent-completed` before manually re-running tasks
- Commit the completion file to version control

### ❌ DON'T
- Delete `.agent-completed` unless you intend to re-run the full task
- Modify `.agent-completed` manually (it's auto-generated)
- Run the agent multiple times without checking completion status

## Troubleshooting

### Agent Says "Already Completed" But Work is Incomplete

```bash
# Solution: Delete the completion marker
rm .agent-completed

# Then re-run the agent
```

### Want to Add New Features Without Re-Running Everything

Option 1: Create a new agent prompt file
```bash
cp CLAUDE_AGENT_PROMPT.md CLAUDE_AGENT_PROMPT_V2.md
# Edit the new file with additional tasks
# Give it a new version number
```

Option 2: Update TODO.md and manually implement
```markdown
# In TODO.md, add your new features
# Implement them manually or with Claude Code's help
```

### Checking Completion Status

```bash
# Check if task is complete
cat .agent-completed

# View completion details
cat .agent-completed | head -20
```

## Version History

### Version 1.0.0 (2025-11-18)
- Initial agent prompt
- Implemented core scraping infrastructure
- 3 provider adapters (Mindbody, Equinox, ClassPass)
- SQLite database tracking
- CLI interface with scheduling

## Advanced Usage

### Multiple Agents for Same Project

You can have multiple agent prompts for different aspects:

```
CLAUDE_AGENT_PROMPT.md          → Initial infrastructure
CLAUDE_AGENT_PROMPT_TESTING.md  → Add tests
CLAUDE_AGENT_PROMPT_DEPLOY.md   → Deployment setup
```

Each would have its own `.agent-completed-[name]` file.

### Conditional Re-Running

You can add logic to the prompt to check versions:

```markdown
## Idempotency Check

1. Check if `.agent-completed` exists
2. If exists, read AGENT_PROMPT_VERSION
3. If version < 2.0.0, re-run with updates
4. If version >= 2.0.0, skip
```

---

## Support

For questions about the agent prompt system:
- Read the main `CLAUDE_AGENT_PROMPT.md` file
- Check `.agent-completed` for completion status
- Review `README.md` for project documentation
