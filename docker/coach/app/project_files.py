"""File che i comandi di coach-tools scrivono nella cartella del progetto, montata in /project."""

import contextlib
import os
from pathlib import Path


def give_to_folder_owner(path: Path) -> None:
    """Il container gira come root: senza questo, il file resterebbe di root anche sul
    computer, e lì non si potrebbe cambiare senza sudo. Dove il proprietario non si può
    cambiare, il file resta com'è."""
    owner = path.parent.stat()
    with contextlib.suppress(OSError):
        os.chown(path, owner.st_uid, owner.st_gid)


def replace_file(path: Path, text: str) -> None:
    """Il file nuovo intero o quello di prima, mai uno a metà: file temporaneo, poi rename."""
    tmp = path.with_name(path.name + ".tmp")
    try:
        tmp.write_text(text, encoding="utf-8")
        give_to_folder_owner(tmp)
        os.replace(tmp, path)
    finally:
        tmp.unlink(missing_ok=True)
