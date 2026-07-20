"""Digest over a preview's change list — pins a confirm to its preview.

The digest is computed over the canonical JSON encoding of the per-table
changes list returned by a preview. A confirm request echoes the digest; the
server recomputes the diff and rejects the operation when the digest no longer
matches (the remote moved, or the local database changed mid-flow), so a
confirm can only ever apply exactly what the user previewed.
"""

from __future__ import annotations

import hashlib
import json


def diff_digest(changes: list[dict]) -> str:
    """Return the hex sha256 of the canonical JSON encoding of ``changes``.

    Args:
        changes: Per-table change dicts as returned by a sync preview.

    Returns:
        A 64-character lowercase hex digest, stable under dict key order and
        sensitive to any value, row, or table difference.
    """
    canonical = json.dumps(changes, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()
