"""Saving uploaded files (task 1.12).

Files are kept on local disk under UPLOAD_DIRECTORY (robo for now; Azure private
storage before go-live, task 4.5), each under a random name so nothing a visitor
types ends up in a path. Only images and PDFs are accepted, up to 50 MB each, and
the file's own first bytes decide its type, not its name or what the browser says.
"""
import hashlib
import os
import uuid
from dataclasses import dataclass
from typing import BinaryIO, Optional

from ..config import get_settings

settings = get_settings()

MAX_UPLOAD_BYTES = 50 * 1024 * 1024
CHUNK = 1024 * 1024


@dataclass
class FileKind:
    ext: str
    content_type: str


def detect_kind(head: bytes) -> Optional[FileKind]:
    """Recognise a PDF or an image from its first bytes. None for anything else."""
    if head.startswith(b"%PDF-"):
        return FileKind(".pdf", "application/pdf")
    if head.startswith(b"\xff\xd8\xff"):
        return FileKind(".jpg", "image/jpeg")
    if head.startswith(b"\x89PNG\r\n\x1a\n"):
        return FileKind(".png", "image/png")
    if head[:6] in (b"GIF87a", b"GIF89a"):
        return FileKind(".gif", "image/gif")
    if head[:4] == b"RIFF" and head[8:12] == b"WEBP":
        return FileKind(".webp", "image/webp")
    if head[:4] in (b"II*\x00", b"MM\x00*"):
        return FileKind(".tif", "image/tiff")
    if head[:2] == b"BM":
        return FileKind(".bmp", "image/bmp")
    if head[4:8] == b"ftyp" and head[8:12] in (b"heic", b"heix", b"hevc", b"heim", b"heis", b"mif1", b"msf1"):
        return FileKind(".heic", "image/heic")  # iPhone photos
    if head[4:8] == b"ftyp" and head[8:12] in (b"avif", b"avis"):
        return FileKind(".avif", "image/avif")
    return None


class UploadRejected(Exception):
    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.message, self.status = message, status


@dataclass
class SavedFile:
    path: str
    kind: FileKind
    size: int
    sha256: str


def save_request_upload(stream: BinaryIO, request_id: int) -> SavedFile:
    """Check and store one upload. Raises UploadRejected with a message for the uploader."""
    head = stream.read(32)
    kind = detect_kind(head)
    if kind is None:
        raise UploadRejected("Only photos and PDF files can be uploaded.")
    folder = os.path.join(settings.upload_directory, "file_requests", str(request_id))
    os.makedirs(folder, exist_ok=True)
    path = os.path.join(folder, f"{uuid.uuid4().hex}{kind.ext}")
    digest = hashlib.sha256(head)
    size = len(head)
    try:
        with open(path, "wb") as out:
            out.write(head)
            while True:
                chunk = stream.read(CHUNK)
                if not chunk:
                    break
                size += len(chunk)
                if size > MAX_UPLOAD_BYTES:
                    raise UploadRejected("That file is over 50 MB. Try a smaller photo or a shorter PDF.", 413)
                digest.update(chunk)
                out.write(chunk)
    except UploadRejected:
        os.remove(path)
        raise
    if size == 0:
        os.remove(path)
        raise UploadRejected("That file is empty.")
    return SavedFile(path=path, kind=kind, size=size, sha256=digest.hexdigest())
