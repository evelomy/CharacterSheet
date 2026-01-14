# CharSheet Engine (GitHub Pages + IndexedDB)

This is a **generic character sheet engine** designed to be hosted on **GitHub Pages** and store data **per device** using **IndexedDB**.

## Why this exists
- No backend. No accounts. No syncing.
- You can load a **custom ruleset JSON from your device** so the public repo doesn't contain copyrighted game content.
- It looks like an intentional app (not a sad form).

## What’s included
- Polished UI shell (sidebar + mobile topbar)
- Character list / create / edit / delete
- Portrait upload (stored as Blob in IndexedDB)
- Ruleset import / export / switch
- Level up flow driven by `ruleset.classes[classId].progression[level]`
- Export/import character JSON

## Deploy to GitHub Pages
1. Create a new GitHub repo.
2. Upload the contents of this folder (keep the structure).
3. In GitHub: **Settings → Pages**
   - Source: `Deploy from a branch`
   - Branch: `main` / root
4. Visit your Pages URL.

## Using your own ruleset
Go to **Rulesets → Import Ruleset** and load your JSON file.
The ruleset is stored locally (IndexedDB) on that device/browser.

## Backups
- **Export character** to download JSON.
- **Export ruleset** to download JSON.

## Notes
- If you clear site data, you wipe IndexedDB.
- Private browsing may not persist reliably.
