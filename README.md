# Fuel Token Manager

Next.js 15 + MongoDB app to track government fuel-subsidy tokens.

## Run
```bash
cp .env.example .env.local   # set MONGODB_URI (local or MongoDB Atlas)
npm install
npm run dev
```

## Token status rules
| Status | Meaning |
|---|---|
| **Available** | Never used, or the 7-day cooldown has finished |
| **Used (cooldown)** | Used less than 7 days ago – shows when it becomes valid again |
| **Expired** | Validity from the latest SMS passed without being used |

Cooldown length: `NEXT_PUBLIC_COOLDOWN_DAYS` (default 7).

## Importing SMS
- **Paste SMS** button (floating on mobile) reads the clipboard → preview → save.
- **Ctrl/⌘+V** anywhere on the page opens the importer.
- When you return to the app, if clipboard permission is granted, a "Token SMS found in clipboard" banner appears.
- **Android share sheet**: install the app (Chrome menu → *Install app / Add to Home screen*). Then in Messages, select the SMS → **Share** → *Fuel Tokens*. (Requires HTTPS when deployed.)
- Multiple SMS can be pasted at once. Re-pasting an existing token updates its validity/amount.
- Phone number is auto-filled from other tokens with the same vehicle number.
