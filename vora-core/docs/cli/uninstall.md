---
summary: "CLI reference for `vora uninstall` (remove gateway service + local data)"
read_when:
  - You want to remove the gateway service and/or local state
  - You want a dry-run first
title: "uninstall"
---

# `vora uninstall`

Uninstall the gateway service + local data (CLI remains).

```bash
vora backup create
vora uninstall
vora uninstall --all --yes
vora uninstall --dry-run
```

Run `vora backup create` first if you want a restorable snapshot before removing state or workspaces.
