# Daiku v2: five-person usability test kit

## Who
Five indie builders who already use Claude or another AI to build software and gather research first
(links, PDFs, notes). Screen out designers who have seen Daiku, and anyone who has never pasted a brief into an AI.

## Setup
- A fresh install with the ESP32 sample project on first launch. Tools list closed (the default now).
- 45 minutes: 5 min warm-up, 30 min tasks, 10 min wrap-up. Record the screen with consent.
- The moderator only reads the tasks aloud and asks "what are you thinking?". No hints.

## Tasks (from the concept doc's Gate 1)
| # | Task | Pass if | Watch for |
|---|---|---|---|
| 1 | Add two sources and make a claim from one | Done in under 3 min, no help | Do they select text, or hunt for a button? |
| 2 | Build a pack for this goal: "a pin-checker for the ESP32 editor" | Pack copied with the brief filled in | Do they understand Pinned, Included and Left out? |
| 3 | Tell me what the AI will receive | Can describe it from the preview | Do they trust the token meter? |
| 4 | Find out why one item was left out | Finds the reason on the item | Is the reason visible enough? |
| 5 | Paste this sample answer back and check it against the brief | Marks each must-have | Do they find Review at all? |

## Note sheet (one per person)
| Task | Time | Pass / fail | Hesitations over 5 s (where) | Quote | Screens opened |
|---|---|---|---|---|---|

"Screens opened" is the input for step 5. Daiku counts it for you: before each session open **Settings → Screen use** and
press **Reset**; afterwards press **Show** and copy the table into this sheet. The counts stay on that computer and
are never sent anywhere. Still note *why* they opened a screen. The count can't tell a purposeful visit from a lost one.

## After each session
Spend 10 minutes putting each observation on a sticky note, then group them by theme (affinity mapping).

## What to delete: the rule
After all five sessions, for each screen outside Board, Library, Decide and Handoff:
- **Nobody opened it, and no task needed it:** archive it. Start with Requirements, BOM, Simulate and the CAD viewer.
- **1 or 2 people opened it, then left without using it:** move it behind Ctrl+K only.
- **3 or more used it to finish a task:** keep it, and consider promoting it.

Five people are enough to find the big usability problems, but not to show that a screen is useless.
So archive screens (to `design/archive/`), never delete them outright, and fix the top problems before running a second round of five.
