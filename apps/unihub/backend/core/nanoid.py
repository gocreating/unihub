import string
from nanoid import generate

ALPHABET = string.ascii_letters + string.digits  # A-Za-z0-9, 62 chars, no _ or -
ID_LENGTH = 12


def generate_id() -> str:
    return generate(ALPHABET, ID_LENGTH)
