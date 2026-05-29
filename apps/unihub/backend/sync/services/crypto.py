"""PAT encryption/decryption using Fernet symmetric encryption.

The Fernet key is derived from Django's SECRET_KEY via SHA-256, so the PAT
is unreadable without the application secret.
"""

from __future__ import annotations

import base64
import hashlib

from cryptography.fernet import Fernet, InvalidToken
from django.conf import settings


def _get_fernet() -> Fernet:
    """Derive a Fernet instance from settings.SECRET_KEY."""
    raw = hashlib.sha256(settings.SECRET_KEY.encode()).digest()
    key = base64.urlsafe_b64encode(raw)
    return Fernet(key)


def encrypt_pat(pat: str) -> str:
    """Encrypt a plaintext PAT string. Returns a URL-safe base64 token."""
    return _get_fernet().encrypt(pat.encode()).decode()


def decrypt_pat(encrypted: str) -> str:
    """Decrypt a Fernet-encrypted PAT token back to plaintext.

    Raises:
        cryptography.fernet.InvalidToken: if the token is invalid or tampered.
    """
    try:
        return _get_fernet().decrypt(encrypted.encode()).decode()
    except Exception as exc:
        raise InvalidToken("Invalid or tampered PAT token.") from exc
