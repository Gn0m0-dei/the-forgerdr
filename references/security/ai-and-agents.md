# AI, LLM and agent tooling

Use for code that builds prompts, calls models, gives a model tools, runs agents or MCP servers, or stores model memory.

- **Untrusted content in the prompt**: pages, files, tickets, emails, tool results and retrieved documents are data, not instructions. Find where they enter the prompt and whether any instruction in them can reach a tool call.
- **Tools and actions**: what a tool can do with the user's identity (write, delete, publish, pay, send); whether a human approves before the action; whether arguments the model builds are validated as strictly as user input.
- **Scope of the model's identity**: the credentials the agent runs with versus what the task needs; tokens visible to the model or echoed into its context.
- **Memory and retrieval**: content saved from one user or one source and later read into another user's context; poisoned memory steering later sessions.
- **MCP and sub-agents**: servers and agents trusted because they are local; tool descriptions that change behaviour; results passed between agents without being treated as untrusted.
- **Output**: model output rendered as HTML or run as code or commands without the same checks as user input; secrets or other users' data leaking into answers.
