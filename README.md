# Expense Claims Demo

A full-stack expense claims application for a company with three user roles: Staff, Manager, and Finance.

## How to Run

1. Open a terminal in the project folder.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the app in development mode:
   ```bash
   npm run dev
   ```
4. Open the frontend in the browser at:
   ```text
   http://localhost:5173
   ```

### Production mode

1. Build the frontend bundle:
   ```bash
   npm run build
   ```
2. Start the Express server:
   ```bash
   npm run start
   ```
3. Open the app at:
   ```text
   http://localhost:5000
   ```

### Demo login

Use the user selector in the top-right of the app to switch between roles for demo purposes. The backend enforces access restrictions server-side.

## Decisions and Assumptions

### Monthly limit is tracked per person, not per category

The company monthly limit is applied to each employee as an individual allowance. This keeps the model simple and matches the requirement that finance can flag users who go over their monthly limit, regardless of which category the spending falls into.

### Duplicate detection uses a 30-day window and fuzzy vendor matching, and warns rather than blocking

Before a new claim is finalized, the app checks prior claims for the same user and looks for a likely duplicate based on:
- same amount
- similar vendor name after normalization
- expense date within 30 days

This is intentionally a warning flow, not a hard block, because legitimate repeat expenses can happen in real life and the user may be submitting a different transaction that happens to share similar details.

### Receipt parsing is rule-based, not an LLM-based

The app parses raw free-text receipt notes using regex and keyword matching rather than calling an external LLM API. This keeps the project lightweight, fast, and free to run locally without extra API keys or dependency overhead.

### Categories are fixed

Claims are restricted to a fixed category list:
- Travel
- Meals
- Supplies
- Taxi
- Other

This keeps the data model predictable and makes reporting and finance totals easier to calculate.

### A manager cannot approve their own claim

The UI hides self-approval actions where appropriate, but the backend also enforces this independently. Even if someone sends a direct API request or manipulates the UI, the server blocks a manager from approving or rejecting their own claim.

## AI Tools Used

- Claude (Anthropic) was used to break down the brief, plan the data model and business rules, and help shape the implementation approach.
- OpenAI Codex (in VS Code) was used to generate the full-stack implementation with a Node/Express backend and SQLite database.

## What I'd Do Next With Another Week

- Replace rule-based receipt parsing with a real LLM call for more flexible extraction
- Add photo/screenshot upload support for receipts
- Add proper authentication instead of the demo role-switching dropdown
- Add an audit log tracking every status change, who made it, and when
- Add email notifications on approval, rejection, or payment

## Repository Notes

This project is intended as a working local demo for expense claim workflows, role-based approvals, and finance reporting.
