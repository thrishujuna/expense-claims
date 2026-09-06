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

### Receipt parsing now uses Gemini

The app parses raw free-text receipt notes by calling the Google Gemini API. This allows more flexible extraction of vendor names, amounts, categories, and dates without brittle regex rules.

Gemini is attempted first for flexible parsing, and the app automatically falls back to rule-based extraction if the AI call fails, so the user experience is never interrupted.

Gemini API integration required significant debugging - the correct configuration turned out to be the gemini-3.6-flash model with the X-goog-api-key header, since newer/older model names and query-parameter auth both failed. This is documented in case it's useful for future reference.

Set the API key before starting the app:
```bash
set GEMINI_API_KEY=your_key_here
```

On macOS/Linux, use:
```bash
export GEMINI_API_KEY=your_key_here
```

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

### Audit history is implemented

The `claim_history` table records an audit entry for every claim status change, including submission, approval, rejection, and payment.

## AI Tools Used

- Claude (Anthropic) was used to break down the brief, plan the data model and business rules, and help shape the implementation approach.
- OpenAI Codex (in VS Code) was used to generate the full-stack implementation with a Node/Express backend and SQLite database.

## What I'd Do Next

Text-based receipt parsing now uses Gemini AI (gemini-3.6-flash) successfully, with automatic fallback to rule-based extraction if the API call fails. Photo/screenshot upload is implemented end-to-end, but the Gemini vision call for images currently fails with an API rejection I wasn't able to fully diagnose in the available time - photo uploads currently fall back to manual entry. With more time, I'd resolve the image-specific API issue and add proper authentication in place of the demo role-switcher.

## Repository Notes

This project is intended as a working local demo for expense claim workflows, role-based approvals, and finance reporting.
