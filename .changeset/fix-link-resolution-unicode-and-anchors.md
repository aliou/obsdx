---
"@aliou/obsdx-cli": patch
---

Fix link resolution for NFC/NFD Unicode mismatches and self-referencing anchor links

- Normalize all link resolution indexes and lookups to NFC, so wikilinks written in NFC resolve correctly against files stored as NFD (e.g., macOS APFS).
- Self-referencing anchor links (`[text](#fragment)`, `[[#heading]]`) now resolve to their source file instead of being marked unresolved.
