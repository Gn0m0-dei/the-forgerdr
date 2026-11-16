# Providers

Pull requests, work items and repositories are reached through the provider CLI. The provider is the host of the URL, or of `git remote get-url origin` when there is no URL. A remote host that is an alias of `~/.ssh/config` (`git@<alias>:v3/<org>/<project>/<repo>`) is resolved first: `ssh -G <alias> | awk '$1 == "hostname" { print $2 }'`. Every command below was run for real; a flag that does not exist fails loudly, so read the output.

| Provider | CLI | Sign-in |
|---|---|---|
| Azure DevOps (`dev.azure.com`, `ssh.dev.azure.com`, `<org>.visualstudio.com`) | `az` with the `azure-devops` extension | `az login`; an organization reachable only with a personal access token (a guest account): `az devops login --organization https://dev.azure.com/<org>` |
| GitHub (`github.com`) | `gh` | `gh auth login` |
| GitLab (`gitlab.com` or self-hosted) | `glab` | `glab auth login` |

## URL shapes

| Thing | Azure DevOps | GitHub | GitLab |
|---|---|---|---|
| Pull request | `https://dev.azure.com/<org>/<project>/_git/<repo>/pullrequest/<id>` | `https://github.com/<owner>/<repo>/pull/<n>` | `https://gitlab.com/<group>/<repo>/-/merge_requests/<n>` |
| Work item | `https://dev.azure.com/<org>/<project>/_workitems/edit/<id>` | `https://github.com/<owner>/<repo>/issues/<n>` | `https://gitlab.com/<group>/<repo>/-/issues/<n>` |
| Remote (ssh) | `git@ssh.dev.azure.com:v3/<org>/<project>/<repo>` | `git@github.com:<owner>/<repo>.git` | `git@gitlab.com:<group>/<repo>.git` |

`ORG=https://dev.azure.com/<org>` below.

## Azure DevOps

```bash
# Pull request: metadata, branches, linked work items, repository id
az repos pr show --id <id> --organization $ORG \
  --query "{title:title,description:description,status:status,source:sourceRefName,target:targetRefName,repo:repository.name,repoId:repository.id,project:repository.project.name,workItems:workItemRefs[].id,createdBy:createdBy.displayName}" -o json

# What the extension has no command for goes through `az devops invoke`: the same REST API, signed in like any other
# az devops command (az login, or the organization's personal access token). A request body goes in a temporary JSON file.

# Existing threads. The API also lists deleted ones: keep the !isDeleted filter
az devops invoke --organization $ORG --area git --resource pullRequestThreads --api-version 7.1 \
  --route-parameters project="<project>" repositoryId=<repoId> pullRequestId=<id> \
  --query "value[?status!='closed' && !isDeleted].{id:id,status:status,path:threadContext.filePath,line:threadContext.rightFileStart.line,comments:comments[?!isDeleted].content}" -o json

# New thread on a line of the source branch. Offsets are mandatory: start offset 1, end offset = length of that line + 1
# (compute it with: git show origin/<source>:<path> | sed -n '<line>p' | awk '{print length($0)+1}')
# <thread.json>: {"status":"active","comments":[{"parentCommentId":0,"commentType":"text","content":"<markdown>"}],
#                 "threadContext":{"filePath":"/<path>","rightFileStart":{"line":<n>,"offset":1},"rightFileEnd":{"line":<n>,"offset":<len+1>}}}
az devops invoke --organization $ORG --area git --resource pullRequestThreads --api-version 7.1 \
  --route-parameters project="<project>" repositoryId=<repoId> pullRequestId=<id> --http-method POST --in-file <thread.json> --query id -o tsv

# General thread (no file): drop threadContext.

# Reply in a thread, <reply.json>: {"parentCommentId":1,"commentType":"text","content":"<markdown>"}
az devops invoke --organization $ORG --area git --resource pullRequestThreadComments --api-version 7.1 \
  --route-parameters project="<project>" repositoryId=<repoId> pullRequestId=<id> threadId=<threadId> --http-method POST --in-file <reply.json>
# Resolve it, <status.json>: {"status":"fixed"} (fixed | closed | wontFix | active)
az devops invoke --organization $ORG --area git --resource pullRequestThreads --api-version 7.1 \
  --route-parameters project="<project>" repositoryId=<repoId> pullRequestId=<id> threadId=<threadId> --http-method PATCH --in-file <status.json>

# Work item: title, type, state, description, acceptance criteria, repro steps
az boards work-item show --id <id> --organization $ORG \
  --query "{title:fields.\"System.Title\",type:fields.\"System.WorkItemType\",state:fields.\"System.State\",assigned:fields.\"System.AssignedTo\".displayName,description:fields.\"System.Description\",acceptance:fields.\"Microsoft.VSTS.Common.AcceptanceCriteria\",repro:fields.\"Microsoft.VSTS.TCM.ReproSteps\",relations:relations[].{rel:rel,url:url}}" -o json

# Work item comments (a preview API: invoke takes 7.1-preview, not 7.1-preview.4)
az devops invoke --organization $ORG --area wit --resource comments --api-version 7.1-preview \
  --route-parameters project="<project>" workItemId=<id> --query "comments[].{by:createdBy.displayName,text:text}" -o json

# Comment, state, assignment (HTML in --discussion)
az boards work-item update --id <id> --organization $ORG --discussion "<p>...</p>"
az boards work-item update --id <id> --organization $ORG --state "Committed"
az boards work-item update --id <id> --organization $ORG --assigned-to "<email>"

# Create work items (spec mode azure without azdospec). Types depend on the process:
# backlog item = "Product Backlog Item" (Scrum), "User Story" (Agile), "Requirement" (CMMI), "Issue" (Basic). Check first:
az devops invoke --organization $ORG --area wit --resource workItemTypes --api-version 7.1 \
  --route-parameters project="<project>" --query "value[].name" -o tsv
az boards work-item create --organization $ORG --project <project> --type Feature --title "<title>" --description "<html>" --area "<area path>"
az boards work-item create --organization $ORG --project <project> --type "<backlog item type>" --title "<title>" \
  --description "<html>" --fields "Microsoft.VSTS.Common.AcceptanceCriteria=<html with the Gherkin scenarios>" --area "<area path>" --iteration "<iteration path>"
az boards work-item create --organization $ORG --project <project> --type Task --title "<title>" --description "<html>"
az boards work-item relation add --organization $ORG --id <child> --relation-type parent --target-id <parent>
# A spike is a backlog item titled "Spike: <question>" with the timebox in the description; "Spike" is not an Azure DevOps type.

# Pull request to the base branch, linking the work item
az repos pr create --organization $ORG --project <project> --repository <repo> \
  --source-branch <branch> --target-branch <base> --title "#<id> <slug>" --description "<markdown>" --work-items <id>
# A work item of an external backlog (items reference): title "EXT-<id> <slug>", EXT-<id> in the description, no --work-items.
```

Organization and project come from the URL at hand (the work item's or the pull request's), and from the remote only when there is none: `git@ssh.dev.azure.com:v3/<org>/<project>/<repo>` (or an SSH alias with the same path) or `https://<org>@dev.azure.com/<org>/<project>/_git/<repo>`; `https://<org>.visualstudio.com/...` is the legacy form of `https://dev.azure.com/<org>/...`. A project in a URL is encoded: decode it (`%20` is a space) before `--project`. Always pass `--organization`: without it `az` detects the remote's, the wrong one for an external backlog. Where the backlog is when nothing names it: `${CLAUDE_PLUGIN_ROOT}/references/items.md`, "An item of an external backlog".

A personal access token saved with `az devops login --organization <org>` is used for that organization only and lives next to `az login`, which keeps serving the others; never `AZURE_DEVOPS_EXT_PAT`, which applies to every organization. Never `az rest` for Azure DevOps: it signs in with `az login` alone and fails in an organization reached only with a token.

## GitHub

```bash
gh pr view <url> --json number,title,body,state,headRefName,baseRefName,headRefOid,author,files,closingIssuesReferences
gh pr diff <url>
gh api repos/<owner>/<repo>/pulls/<n>/comments --jq '.[] | {id,path,line,body,user:.user.login}'
gh api repos/<owner>/<repo>/pulls/<n>/comments -f body='<markdown>' -f commit_id=<headRefOid> -f path='<path>' -F line=<n> -f side=RIGHT
gh pr comment <url> --body '<markdown>'           # general comment

# Review threads with their resolution state, reply, resolve
gh api graphql -f query='query($o:String!,$r:String!,$n:Int!){repository(owner:$o,name:$r){pullRequest(number:$n){reviewThreads(first:100){nodes{id isResolved path line comments(first:20){nodes{id databaseId author{login} body}}}}}}}' -f o=<owner> -f r=<repo> -F n=<n>
gh api repos/<owner>/<repo>/pulls/<n>/comments/<commentDatabaseId>/replies -f body='<markdown>'
gh api graphql -f query='mutation($t:ID!){resolveReviewThread(input:{threadId:$t}){thread{isResolved}}}' -f t=<threadNodeId>

gh issue view <url> --json number,title,body,labels,state,assignees,comments
gh issue comment <url> --body '<markdown>'
gh issue edit <url> --add-assignee @me --add-label '<label>'

gh pr create --base <base> --head <branch> --title "#<n> <slug>" --body "<markdown>"   # "Closes #<n>" in the body links the issue
```

## GitLab

```bash
glab mr view <n> --repo <group>/<repo> --output json
glab mr diff <n> --repo <group>/<repo>
glab api projects/:fullpath/merge_requests/<n>/discussions   # existing discussions (":fullpath" = URL-encoded group/repo)
glab api projects/:fullpath/merge_requests/<n>/discussions -f body='<markdown>' \
  -f 'position[position_type]=text' -f 'position[base_sha]=<base>' -f 'position[head_sha]=<head>' -f 'position[start_sha]=<start>' \
  -f 'position[new_path]=<path>' -F 'position[new_line]=<n>'      # shas from: glab mr view <n> --output json (.diff_refs)
glab mr note <n> -m '<markdown>'                                 # general note
glab api projects/:fullpath/merge_requests/<n>/discussions/<discussionId>/notes -f body='<markdown>'   # reply
glab api -X PUT projects/:fullpath/merge_requests/<n>/discussions/<discussionId> -F resolved=true      # resolve

glab issue view <n> --repo <group>/<repo> --output json
glab issue note <n> -m '<markdown>'
glab issue update <n> --assignee @me

glab mr create --source-branch <branch> --target-branch <base> --title "#<n> <slug>" --description "<markdown>"   # "Closes #<n>" links the issue
```

GitLab commands are written from the glab reference and not exercised on a live project yet; verify the first run and fix this file if a flag differs.

## Diff without touching the clone

Review the diff of a pull request from the local clone without a checkout: a mounted working tree may be watched by a running container, and a checkout or a stash there reloads everything.

```bash
git fetch origin <source> <target>
git diff --name-status origin/<target>...origin/<source>
git diff origin/<target>...origin/<source>
git show origin/<source>:<path>
```

If the clone is missing, read files through the provider (`az repos item show --path <path> --version <branch> --version-type branch`, `gh api repos/<owner>/<repo>/contents/<path>?ref=<branch>`, `glab api projects/:fullpath/repository/files/<url-encoded-path>/raw?ref=<branch>`).
