---
summary: "CLI reference for `vora reset` (reset local state/config)"
read_when:
  - You want to wipe local state while keeping the CLI installed
  - You want a dry-run of what would be removed
title: "reset"
---

# `vora reset`

Reset local config/state (keeps the CLI installed).

```bash
vora backup create
vora reset
vora reset --dry-run
vora reset --scope config+creds+sessions --yes --non-interactive
```

Run `vora backup create` first if you want a restorable snapshot before removing local state.
