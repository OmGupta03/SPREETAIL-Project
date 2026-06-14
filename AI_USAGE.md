# AI_USAGE.md — AI Tools & Correction Log

This document details the AI tools used, key prompts, and three concrete correction cases where AI-generated code or commands were incorrect, how they were caught, and what was modified to resolve them.

---

## 1. AI Tools & Key Prompts Used

* **AI Coding Companion**: Antigravity (Advanced Agentic Coding agent by Google DeepMind).
* **Key Prompts**:
  * "Please do not Write NA /NA in the Assignment Submission form... (Fresh Assignment pivot)"
  * "Analyze the CSV file content, structure, and headers."
  * "Generate database modifications for multiple currencies and negative refund amounts."
  * "Build a clean client-side CSV parser that logs all anomalies."

---

## 2. AI Corrections Log

### Case 1: Python F-String Syntax Error
* **What the AI did wrong**: The AI generated a CSV downloader scratch script (`download_csv.py`) using Python 3 f-string syntax (`print(f"{i+1}: {line}")`).
* **How it was caught**: Executing the script via the terminal failed with exit code 1:
  ```
  SyntaxError: invalid syntax on line print(f"{i+1}: {line}")
  ```
  This occurred because the local environment defaulted `python` to Python 2.x, which does not support f-strings.
* **How it was fixed**: The script was rewritten to support both Python 2 and 3:
  * Replaced f-strings with manual string conversions and concatenations (`str(i+1) + ": " + line`).
  * Used dynamic imports to select between `urllib` (Python 2) and `urllib.request` (Python 3).

---

### Case 2: POSIX Statement Separator in PowerShell Command
* **What the AI did wrong**: The AI proposed combined terminal commands using the POSIX shell logical operator `&&` to stage and commit files (e.g. `git add schema.sql && git commit -m ...`).
* **How it was caught**: The terminal execution failed with the following PowerShell error:
  ```
  At line:1 char:20
  + git add schema.sql && git commit -m ...
  +                    ~~
  The token '&&' is not a valid statement separator in this version.
  ```
  This occurred because the user's Windows shell is running PowerShell, which does not support `&&` (in older versions).
* **How it was fixed**: Changed the statement separator from `&&` to `;` (e.g., `git add schema.sql; git commit -m ...`), which runs correctly on Windows PowerShell.

---

### Case 3: Primary Key Duplicate Collision in Group Members Ingestion
* **What the AI did wrong**: The AI's initial database insertion path in `CsvImporter.js` attempted to do a bulk insert of all CSV members into the `group_members` join table.
* **How it was caught**: During code review and database constraint analysis, we realized that when creating a group, the current logged-in user is already added to the group members join table. If the CSV also contains their name (e.g. Rohan is logged in and Rohan is in the CSV), attempting to insert them a second time would cause a PostgreSQL primary key duplicate constraint collision, crashing the ingestion.
* **How it was fixed**: Modified the ingestion query to fetch existing group members first, and filter out any user UUIDs that are already members before performing the insert:
  ```javascript
  const memberInserts = Object.values(userMappings)
    .filter(uid => !existingMemberIds.has(uid))
    .map(uid => ({
      group_id: groupIdToUse,
      user_id: uid
    }));
  ```
