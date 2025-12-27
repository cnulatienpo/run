
**Save to:** `/workspaces/run/docs/architecture.md`

---

## 5. Deletion Script

```bash
#!/bin/bash
# cleanup-redundant.sh - Remove redundant backends and bridges

echo "🗑️  Removing redundant components..."

echo "Deleting /runnyvision/ (duplicate backend + unused frontend)..."
rm -rf /workspaces/run/runnyvision/

echo "Deleting /googlefit-bridge/ (replaced by step-bridge)..."
rm -rf /workspaces/run/googlefit-bridge/

echo "✅ Cleanup complete!"
echo ""
echo "Deleted:"
echo "  - /runnyvision/ (port 4000 conflict)"
echo "  - /googlefit-bridge/ (replaced by step-bridge)"