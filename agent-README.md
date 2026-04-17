# Auto-Changelog Generator (`jsalsman~repo-change-summarizer-withcontext`)

Log summaries of each GitHub repo push to GUILDAI_CHANGELOG.md with LLM-generated summaries of each file modification and addition.

A Guild.ai agent that listens to GitHub `push` webhooks and automatically maintains a running `GUILDAI_CHANGELOG.md` file in your repository. 

Whenever any changes are pushed to your repo, this agent parses the commit payload, formats a clean Markdown entry with the author, timestamp, and changed, added, or deleted files, and commits it into to the changelog. For modified and new files, an LLM summary of the change or contents is included, respectively.

## ⚠️ Prerequisites: GitHub Permissions

For this agent to work, your Guild.ai workspace **must** have a GitHub Integration configured with the correct permissions in the "Credentials" tab, including access to all the repos you want to make changelogs in.

Because this agent uses the `github_repos_create_or_update_file_contents` tool to save the changelog, your GitHub App integration requires **Read & Write access to Repository Contents**. 
* *Note: If you receive a `403 Forbidden` error indicating "Resource not accessible by integration," you need to accept the Guild.ai Platform integration's updated App permissions in Github's user settings / Applications to allow content writes.*

## 🚀 Setup Instructions

### 1. Deploy the Agent
Add this agent to any of your Guild.ai workspaces. The agent dynamically extracts the repository owner and name directly from the incoming webhook payload.

### 2. Configure the Webhook Trigger
To make the agent run automatically, you need to set up an Event Trigger in the Guild.ai UI:
1. Add the agent to a workspace.
2. Click on the **Triggers** tab.
3. Push the **Add Trigger** button.
4. Choose the **Event** trigger type.
5. Set **Service** to: `GitHub`
6. Set **Event Type** to: `push`
7. Set **Action** to: `All actions`
8. Select the `repo-change-summarizer-withcontext` agent.
3. Click **Create Trigger**.

### 3. Test It Out
Make a commit to your repository (e.g., add or modify a test file) and push it to your default branch. Wait a few seconds, and you should see a new commit authored by the integration creating or updating `GUILDAI_CHANGELOG.md`!

## 🧠 Implementation Notes
This agent is built to be safe and resilient:
* **AST-Compiler Safe:** The codebase uses a flattened state object and ES5-style logic to ensure high compatibility with strict Babel execution environments.
* **Dynamic Routing:** It doesn't use hardcoded repository names. It routes the file update exactly to the repo that triggered the webhook.
* **Infinite Loop Protection:** The agent explicitly ignores changes made to `GUILDAI_CHANGELOG.md`. If a push event *only* contains changes to the changelog, the agent will gracefully exit without calling the GitHub API, preventing an endless loop of self-triggering webhook events.
