"""Tests for PAT encryption/decryption service."""

import pytest
from sync.services.crypto import decrypt_pat, encrypt_pat


def test_encrypt_decrypt_roundtrip() -> None:
    pat = "ghp_testtoken123456789"
    assert decrypt_pat(encrypt_pat(pat)) == pat


def test_encrypted_value_differs_from_plaintext() -> None:
    pat = "ghp_testtoken123456789"
    assert encrypt_pat(pat) != pat


def test_encrypted_value_is_string() -> None:
    result = encrypt_pat("ghp_abc")
    assert isinstance(result, str)
    assert len(result) > 0


def test_same_plaintext_produces_different_ciphertext() -> None:
    pat = "ghp_testtoken123456789"
    # Fernet uses a random IV so each encryption is unique
    assert encrypt_pat(pat) != encrypt_pat(pat)


def test_decrypt_invalid_raises() -> None:
    with pytest.raises(Exception):
        decrypt_pat("not-valid-fernet-token")
