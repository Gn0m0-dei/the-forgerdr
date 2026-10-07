---
name: help
description: "Prints the forgerdr cheat sheet: commands, the manual and auto flows, settings and herdr keys. Answered by a hook without reaching the model. Use on /forgerdr:help."
---

# Help

A `UserPromptSubmit` hook answers `/forgerdr:help` with `${CLAUDE_PLUGIN_ROOT}/references/cheatsheet.txt` before the prompt reaches the model. If this skill runs anyway, print that file exactly, inside one code block, and nothing else.
