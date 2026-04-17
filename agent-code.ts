"use agent";
import { type Task, agent, consoleTools } from "@guildai/agents-sdk";
import { z } from "zod";
import { gitHubTools } from "@guildai-services/guildai~github";

// ------------------------------------------------------------------
// CONFIGURATION
// ------------------------------------------------------------------
const FILE_PATH = "GUILDAI_CHANGELOG.md";

// ------------------------------------------------------------------
// AGENT DEFINITION
// ------------------------------------------------------------------
const inputSchema = z.record(z.string(), z.any());
type Input = z.infer<typeof inputSchema>;

const outputSchema = z.object({
  message: z.string(),
  entriesAdded: z.number()
});
type Output = z.infer<typeof outputSchema>;

const tools = { ...gitHubTools, ...consoleTools };
type Tools = typeof tools;

export default agent({
  identifier: "changelog-generator",
  description: "Maintains a changelog using a 2-stage Agentic LLM loop for both Added and Modified files.",
  inputSchema,
  outputSchema,
  tools,
  run: async (input: Input, task: Task<Tools>): Promise<Output> => {

    // The scorched-earth state object to outsmart the AST Compiler
    const state = {
      message: "",
      entriesAdded: 0,
      extractedJsonStr: "",
      webhookData: undefined as any,
      repoOwner: "",
      repoName: "",
      pusherName: "",
      newLogText: "",
      existingContent: "",
      existingSha: undefined as string | undefined,
      filePresent: false,
      rawDirResponse: undefined as any,
      dirResponse: undefined as any,
      rawGetResponse: undefined as any,
      getResponse: undefined as any,
      cleanBase64: "",
      i: 0, j: 0, k: 0, deps_i: 0,
      commit: undefined as any,
      author: "", username: "", timestamp: "", commitHash: "", commitMsg: "", commitChanges: "",

      // Context & Agentic Loop Variables
      readmeContent: "",
      fileTreeStr: "",
      currentFile: "",
      summary: "",
      promptStr: "",
      llmResponse: undefined as any,
      extractedLlmText: "",
      commitDetailsParams: undefined as any,
      rawCommitDetails: undefined as any,
      commitDetails: undefined as any,
      filePatch: "",
      requestedFilesStr: "",
      requestedFilesList: [] as string[],
      fetchCount: 0,
      dependencyContext: "",
      depFile: "",
      depRaw: undefined as any,
      depParsed: undefined as any,

      // INSTRUMENTATION: Log for debugging
      debugLog: "" as string
    };

    const t = task as any;

    try {
      if (!t.tools) throw new Error("task.tools is unavailable.");
      const availableTools = t.tools;

      // 1. Extract JSON
      const inputText = typeof input.text === "string" ? input.text : "";
      const jsonMatch = inputText.match(/```json\n([\s\S]*?)\n```/);
      if (!jsonMatch || !jsonMatch[1]) return { message: "No JSON payload found.", entriesAdded: 0 };

      state.extractedJsonStr = jsonMatch[1];
      state.webhookData = JSON.parse(state.extractedJsonStr);

      // 2. Extract Repo
      if (state.webhookData && state.webhookData.repository) {
        state.repoName = state.webhookData.repository.name || "";
        if (state.webhookData.repository.owner) state.repoOwner = state.webhookData.repository.owner.login || "";
      }
      if (state.webhookData && state.webhookData.sender && state.webhookData.sender.login) {
        state.pusherName = state.webhookData.sender.login;
      } else {
        state.pusherName = "an unknown user";
      }

      if (!state.repoName || !state.repoOwner) return { message: "Could not find repo info.", entriesAdded: 0 };

      // 3. FETCH GLOBAL CONTEXT (README & Root File Tree)
      try {
        state.rawDirResponse = await availableTools.github_repos_get_content({ owner: state.repoOwner, repo: state.repoName, path: "" });
        state.dirResponse = typeof state.rawDirResponse === "string" ? JSON.parse(state.rawDirResponse) : state.rawDirResponse;
        if (Array.isArray(state.dirResponse)) {
          for (state.i = 0; state.i < state.dirResponse.length; state.i++) {
            state.fileTreeStr += "- " + state.dirResponse[state.i].name + "\n";
            if (state.dirResponse[state.i].name.toLowerCase() === "readme.md") {
              try {
                state.rawGetResponse = await availableTools.github_repos_get_content({ owner: state.repoOwner, repo: state.repoName, path: state.dirResponse[state.i].name });
                state.getResponse = typeof state.rawGetResponse === "string" ? JSON.parse(state.rawGetResponse) : state.rawGetResponse;
                if (state.getResponse && state.getResponse.content) {
                  // Fetch whole, uncut README
                  state.readmeContent = atob(state.getResponse.content.replace(/\n/g, ""));
                }
              } catch (e) { }
            }
          }
        }
      } catch (e) {
        state.fileTreeStr = "Unavailable";
      }
      if (!state.readmeContent) state.readmeContent = "No README found.";

      // 4. Parse commits
      if (state.webhookData.commits && Array.isArray(state.webhookData.commits)) {
        for (state.i = 0; state.i < state.webhookData.commits.length; state.i++) {

          state.commit = state.webhookData.commits[state.i];
          state.author = "Unknown Author";
          state.username = "";

          if (state.commit && state.commit.author) {
            if (state.commit.author.name) state.author = state.commit.author.name;
            if (state.commit.author.username) state.username = state.commit.author.username;
          }
          if (!state.username && state.pusherName !== "an unknown user") state.username = state.pusherName;

          state.timestamp = (state.commit && state.commit.timestamp) ? state.commit.timestamp : "unknown time";
          state.commitHash = (state.commit && state.commit.id) ? state.commit.id : "unknown";
          state.commitMsg = (state.commit && state.commit.message) ? state.commit.message : "No message";
          state.commitChanges = "";

          state.commitDetails = undefined;
          if (state.commitHash !== "unknown") {
            try {
              state.rawCommitDetails = await availableTools.github_repos_get_commit({ owner: state.repoOwner, repo: state.repoName, ref: state.commitHash });
              state.commitDetails = typeof state.rawCommitDetails === "string" ? JSON.parse(state.rawCommitDetails) : state.rawCommitDetails;
            } catch (err) { }
          }

          if (state.commit) {

            // --- LOOP FIX: Applied full agentic context loop to BOTH Modified AND Added Files ---

            // --- PROCESS MODIFIED FILES ---
            if (Array.isArray(state.commit.modified)) {
              for (state.j = 0; state.j < state.commit.modified.length; state.j++) {
                state.currentFile = state.commit.modified[state.j];
                if (state.currentFile !== FILE_PATH) {
                  state.summary = ""; state.filePatch = ""; state.dependencyContext = "";

                  if (state.commitDetails && Array.isArray(state.commitDetails.files)) {
                    for (state.k = 0; state.k < state.commitDetails.files.length; state.k++) {
                      if (state.commitDetails.files[state.k].filename === state.currentFile) {
                        state.filePatch = state.commitDetails.files[state.k].patch || "";
                        break;
                      }
                    }
                  }

                  if (state.filePatch && t.llm && typeof t.llm.generateText === "function") {

                    // Stage 1: Planning
                    state.promptStr = "You are a senior engineer reviewing changes.\n\n" +
                      "PROJECT README:\n" + state.readmeContent + "\n\n" +
                      "ROOT FILE TREE:\n" + state.fileTreeStr + "\n\n" +
                      "FILE CHANGED: " + state.currentFile + "\n" +
                      "DIFF:\n" + state.filePatch.substring(0, 3000) + "\n\n" +
                      "Task: Which files MUST you read to understand these changes? " +
                      "Reply ONLY with a comma-separated list of exact file names (e.g. 'src/utils.ts'). Do not request more than 5 files. If none are needed, reply ONLY with 'NONE'.";

                    state.requestedFilesStr = "NONE";
                    try {
                      state.llmResponse = await t.llm.generateText({ prompt: state.promptStr });
                      if (state.llmResponse && Array.isArray(state.llmResponse.steps) && state.llmResponse.steps.length > 0) {
                        if (Array.isArray(state.llmResponse.steps[0].content) && state.llmResponse.steps[0].content.length > 0) {
                          state.extractedLlmText = state.llmResponse.steps[0].content[0].text || "";
                          // Instrumentation Log
                          state.debugLog += `Modified Stage 1 for ${state.currentFile}: ${state.extractedLlmText}\n`;
                          if (state.extractedLlmText && state.extractedLlmText.toUpperCase().indexOf("NONE") === -1) {
                            state.requestedFilesStr = state.extractedLlmText;
                          }
                        }
                      }
                    } catch (e) { }

                    // Fetch Dependencies
                    if (state.requestedFilesStr !== "NONE") {
                      state.requestedFilesList = state.requestedFilesStr.split(",");
                      state.fetchCount = state.requestedFilesList.length > 5 ? 5 : state.requestedFilesList.length;
                      for (state.deps_i = 0; state.deps_i < state.fetchCount; state.deps_i++) {
                        state.depFile = state.requestedFilesList[state.deps_i].replace(/^\s+|\s+$/g, '');
                        if (state.depFile && state.depFile !== state.currentFile) {
                          try {
                            state.depRaw = await availableTools.github_repos_get_content({ owner: state.repoOwner, repo: state.repoName, path: state.depFile });
                            state.depParsed = typeof state.depRaw === "string" ? JSON.parse(state.depRaw) : state.depRaw;
                            if (state.depParsed && state.depParsed.content) {
                              state.dependencyContext += "\n--- FILE: " + state.depFile + " ---\n";
                              state.dependencyContext += atob(state.depParsed.content.replace(/\n/g, "")) + "\n";
                            }
                          } catch (e) { }
                        }
                      }
                    }

                    // Stage 2: Summary
                    state.promptStr = "PROJECT README:\n" + state.readmeContent + "\n\n" +
                      "EXTRA CONTEXT FILES:\n" + (state.dependencyContext || "None.") + "\n\n" +
                      "DIFF:\n" + state.filePatch.substring(0, 3000) + "\n\n" +
                      "Task: Summarize the changes in `image_0.png` in exactly one short sentence. Do not use markdown quotes.";

                    try {
                      state.llmResponse = await t.llm.generateText({ prompt: state.promptStr });
                      state.extractedLlmText = "";
                      if (state.llmResponse && Array.isArray(state.llmResponse.steps) && state.llmResponse.steps.length > 0) {
                        if (Array.isArray(state.llmResponse.steps[0].content) && state.llmResponse.steps[0].content.length > 0) {
                          state.extractedLlmText = state.llmResponse.steps[0].content[0].text || "";
                        }
                      }
                      if (state.extractedLlmText) {
                        state.summary = " - *" + state.extractedLlmText.trim() + "*";
                      } else {
                        // Fallback text
                        state.summary = " - *[LLM could not generate a summary]*";
                      }
                    } catch (llmErr) {
                      state.summary = " - *[Summary generation failed]*";
                    }
                  }
                  state.commitChanges += `- **Modified**: \`${state.currentFile}\`${state.summary}\n`;
                }
              }
            }

            // --- PROCESS ADDED FILES --- (Now Agentic V5!)
            if (Array.isArray(state.commit.added)) {
              for (state.j = 0; state.j < state.commit.added.length; state.j++) {
                state.currentFile = state.commit.added[state.j];
                if (state.currentFile !== FILE_PATH) {
                  state.summary = ""; state.filePatch = ""; state.dependencyContext = "";

                  // In Added files, the 'patch' is the full file contents. We use it once.
                  if (state.commitDetails && Array.isArray(state.commitDetails.files)) {
                    for (state.k = 0; state.k < state.commitDetails.files.length; state.k++) {
                      if (state.commitDetails.files[state.k].filename === state.currentFile) {
                        state.filePatch = state.commitDetails.files[state.k].patch || "";
                        break;
                      }
                    }
                  }

                  if (state.filePatch && t.llm && typeof t.llm.generateText === "function") {

                    // Stage 1: Planning (Slightly reworded for NEW files)
                    state.promptStr = "You are a senior engineer reviewing a NEW file.\n\n" +
                      "PROJECT README:\n" + state.readmeContent + "\n\n" +
                      "ROOT FILE TREE:\n" + state.fileTreeStr + "\n\n" +
                      "FILE ADDED: " + state.currentFile + "\n" +
                      "CONTENTS:\n" + state.filePatch.substring(0, 3000) + "\n\n" +
                      "Task: Which files MUST you read to understand what this new file is for? " +
                      "Reply ONLY with a comma-separated list of exact file names (e.g. 'src/existing.ts'). Do not request more than 5 files. If none are needed, reply ONLY with 'NONE'.";

                    state.requestedFilesStr = "NONE";
                    try {
                      state.llmResponse = await t.llm.generateText({ prompt: state.promptStr });
                      if (state.llmResponse && Array.isArray(state.llmResponse.steps) && state.llmResponse.steps.length > 0) {
                        if (Array.isArray(state.llmResponse.steps[0].content) && state.llmResponse.steps[0].content.length > 0) {
                          state.extractedLlmText = state.llmResponse.steps[0].content[0].text || "";
                          // Instrumentation Log
                          state.debugLog += `Added Stage 1 for ${state.currentFile}: ${state.extractedLlmText}\n`;
                          if (state.extractedLlmText && state.extractedLlmText.toUpperCase().indexOf("NONE") === -1) {
                            state.requestedFilesStr = state.extractedLlmText;
                          }
                        }
                      }
                    } catch (e) { }

                    // Fetch Dependencies
                    if (state.requestedFilesStr !== "NONE") {
                      state.requestedFilesList = state.requestedFilesStr.split(",");
                      state.fetchCount = state.requestedFilesList.length > 5 ? 5 : state.requestedFilesList.length;
                      for (state.deps_i = 0; state.deps_i < state.fetchCount; state.deps_i++) {
                        state.depFile = state.requestedFilesList[state.deps_i].replace(/^\s+|\s+$/g, '');
                        if (state.depFile && state.depFile !== state.currentFile) {
                          try {
                            state.depRaw = await availableTools.github_repos_get_content({ owner: state.repoOwner, repo: state.repoName, path: state.depFile });
                            state.depParsed = typeof state.depRaw === "string" ? JSON.parse(state.depRaw) : state.depRaw;
                            if (state.depParsed && state.depParsed.content) {
                              state.dependencyContext += "\n--- FILE: " + state.depFile + " ---\n";
                              state.dependencyContext += atob(state.depParsed.content.replace(/\n/g, "")) + "\n";
                            }
                          } catch (e) { }
                        }
                      }
                    }

                    // Stage 2: Summary (Summarizing purpose of a NEW file)
                    state.promptStr = "PROJECT README:\n" + state.readmeContent + "\n\n" +
                      "EXTRA CONTEXT FILES:\n" + (state.dependencyContext || "None.") + "\n\n" +
                      "FILE ADDED: " + state.currentFile + "\n" +
                      "CONTENTS:\n" + state.filePatch.substring(0, 3000) + "\n\n" +
                      "Task: Summarize the purpose of this NEW file in `image_0.png` in exactly one short sentence. Do not use markdown quotes.";

                    try {
                      state.llmResponse = await t.llm.generateText({ prompt: state.promptStr });
                      state.extractedLlmText = "";
                      if (state.llmResponse && Array.isArray(state.llmResponse.steps) && state.llmResponse.steps.length > 0) {
                        if (Array.isArray(state.llmResponse.steps[0].content) && state.llmResponse.steps[0].content.length > 0) {
                          state.extractedLlmText = state.llmResponse.steps[0].content[0].text || "";
                        }
                      }
                      if (state.extractedLlmText) {
                        state.summary = " - *" + state.extractedLlmText.trim() + "*";
                      } else {
                        // Fallback text
                        state.summary = " - *[LLM could not generate a summary]*";
                      }
                    } catch (llmErr) {
                      state.summary = " - *[Summary generation failed]*";
                    }
                  }
                  state.commitChanges += `- **Added**: \`${state.currentFile}\`${state.summary}\n`;
                }
              }
            }

            // --- REMOVED FILES --- (Simplified, no context needed)
            if (Array.isArray(state.commit.removed)) {
              for (state.j = 0; state.j < state.commit.removed.length; state.j++) {
                if (state.commit.removed[state.j] !== FILE_PATH) {
                  state.commitChanges += `- **Removed**: \`${state.commit.removed[state.j]}\`\n`;
                }
              }
            }
          }

          if (state.commitChanges.length > 0) {
            state.newLogText += `### Commit \`${state.commitHash.substring(0, 7)}\` by ${state.author} (${state.username}) at ${state.timestamp}\n`;
            state.newLogText += `*Message: "${state.commitMsg}"*\n`;
            state.newLogText += state.commitChanges + "\n";
            state.entriesAdded++;
          }
        }
      }

      if (state.entriesAdded === 0) return { message: "No relevant files changed.", entriesAdded: 0 };

      // 5. Update Changelog
      state.rawDirResponse = await availableTools.github_repos_get_content({ owner: state.repoOwner, repo: state.repoName, path: "" });
      state.dirResponse = typeof state.rawDirResponse === "string" ? JSON.parse(state.rawDirResponse) : state.rawDirResponse;
      if (Array.isArray(state.dirResponse)) {
        for (state.i = 0; state.i < state.dirResponse.length; state.i++) {
          if (state.dirResponse[state.i].name === FILE_PATH) { state.filePresent = true; break; }
        }
      }

      if (state.filePresent) {
        state.rawGetResponse = await availableTools.github_repos_get_content({ owner: state.repoOwner, repo: state.repoName, path: FILE_PATH });
        state.getResponse = typeof state.rawGetResponse === "string" ? JSON.parse(state.rawGetResponse) : state.rawGetResponse;
        if (state.getResponse && state.getResponse.content) {
          state.existingSha = state.getResponse.sha;
          state.existingContent = atob(state.getResponse.content.replace(/\n/g, "")) + "\n\n";
        }
      } else {
        state.existingContent = "# Auto-Generated Changelog\n\n";
      }

      const updateParams: Record<string, string> = {
        owner: state.repoOwner, repo: state.repoName, path: FILE_PATH,
        message: `Update changelog for push by ${state.pusherName}`,
        content: btoa(state.existingContent + state.newLogText)
      };
      if (state.existingSha) updateParams.sha = state.existingSha;

      await availableTools.github_repos_create_or_update_file_contents(updateParams);
      state.message = `Successfully appended ${state.entriesAdded} commit(s) with full Agentic AI summaries!`;
      // Log debugging info to main platform task output
      t.consoleTools.log(`DEBUG: Agentic reasoning for this push:\n${state.debugLog}`);

    } catch (err) {
      state.message = `Process failed: ${String(err)}`;
      t.consoleTools.error(`FATAL ERROR: ${String(err)}`);
    }

    return { message: state.message, entriesAdded: state.entriesAdded };
  },
});
