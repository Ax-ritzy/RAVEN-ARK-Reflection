import io
import re
from typing import Tuple, Optional

class ExtractionError(Exception):
    pass

class CharacterLimitExceededError(ExtractionError):
    def __init__(self, char_count: int, max_allowed: int):
        super().__init__(f"Reflection length ({char_count} chars) exceeds the maximum allowed limit of {max_allowed} characters.")
        self.char_count = char_count
        self.max_allowed = max_allowed

def extract_text_from_txt(file_bytes: bytes) -> str:
    """Extract plain text from bytes, trying UTF-8 then Latin-1."""
    try:
        return file_bytes.decode("utf-8").strip()
    except UnicodeDecodeError:
        try:
            return file_bytes.decode("latin-1").strip()
        except Exception as e:
            raise ExtractionError(f"Failed to decode TXT file: {str(e)}")

def extract_text_from_docx(file_bytes: bytes) -> str:
    """Extract text from DOCX paragraphs and tables."""
    try:
        import docx
        doc = docx.Document(io.BytesIO(file_bytes))
        paragraphs = [p.text for p in doc.paragraphs if p.text.strip()]
        for table in doc.tables:
            for row in table.rows:
                for cell in row.cells:
                    if cell.text.strip():
                        paragraphs.append(cell.text.strip())
        return "\n".join(paragraphs).strip()
    except Exception as e:
        raise ExtractionError(f"Failed to read DOCX file: {str(e)}")

def extract_text_from_pdf(file_bytes: bytes) -> str:
    """Extract text from PDF pages."""
    try:
        import pypdf
        reader = pypdf.PdfReader(io.BytesIO(file_bytes))
        text_parts = []
        for i, page in enumerate(reader.pages):
            page_text = page.extract_text()
            if page_text and page_text.strip():
                text_parts.append(page_text.strip())
        return "\n".join(text_parts).strip()
    except Exception as e:
        raise ExtractionError(f"Failed to read PDF file: {str(e)}")

def extract_document_text(filename: str, file_bytes: bytes) -> str:
    """
    Extracts complete authoritative text from reference materials (no character count ceiling).
    Supports .pdf, .docx, .txt, .ocr, .md, and other readable text documents.
    """
    if not file_bytes:
        raise ExtractionError("Uploaded document is empty (0 bytes).")

    ext = filename.lower().split(".")[-1] if "." in filename else ""

    if ext in ["txt", "text", "ocr", "md", "markdown", "log", "rtf", ""]:
        text = extract_text_from_txt(file_bytes)
    elif ext == "docx":
        text = extract_text_from_docx(file_bytes)
    elif ext == "pdf":
        text = extract_text_from_pdf(file_bytes)
    else:
        # Graceful fallback: attempt plain text decoding
        try:
            text = file_bytes.decode("utf-8").strip()
        except Exception:
            try:
                text = file_bytes.decode("latin-1").strip()
            except Exception:
                raise ExtractionError(f"Unsupported document format '.{ext}'. Supported formats are: .pdf, .docx, .txt, .ocr, .md")

    cleaned_text = re.sub(r'\s+', ' ', text).strip()
    if not cleaned_text:
        raise ExtractionError("No readable text could be extracted from this document.")

    return cleaned_text

def extract_and_validate_reflection(
    filename: str, 
    file_bytes: bytes, 
    max_characters: int = 500
) -> Tuple[str, int]:
    """
    Extracts text from TXT, DOCX, or PDF, removes metadata/filename bias,
    and strictly validates that non-empty text <= max_characters.
    """
    if not file_bytes:
        raise ExtractionError("Uploaded file is empty (0 bytes).")

    ext = filename.lower().split(".")[-1] if "." in filename else ""
    
    if ext == "txt":
        text = extract_text_from_txt(file_bytes)
    elif ext == "docx":
        text = extract_text_from_docx(file_bytes)
    elif ext == "pdf":
        text = extract_text_from_pdf(file_bytes)
    else:
        raise ExtractionError(f"Unsupported file format '.{ext}'. Supported formats are: .txt, .docx, .pdf")

    # Clean superfluous multi-newlines and leading/trailing whitespace
    cleaned_body = re.sub(r'\s+', ' ', text).strip()
    
    if not cleaned_body:
        raise ExtractionError("No readable text found in document. Scanned or blank documents cannot be accepted.")

    char_count = len(cleaned_body)
    if char_count > max_characters:
        raise CharacterLimitExceededError(char_count=char_count, max_allowed=max_characters)

    return cleaned_body, char_count

def check_identity_conflict(extracted_text: str, expected_usn: str) -> Tuple[bool, Optional[str]]:
    """
    Scans text for USN-like identifiers. If an identifier is found that differs
    from the expected student USN, flag as potential identity mismatch.
    Returns: (has_conflict, detected_conflicting_usn)
    """
    if not expected_usn:
        return False, None

    # Matches alphanumeric strings typically matching student IDs / USNs (e.g. 1RV21CS001, USN12345)
    potential_usns = re.findall(r'\b[0-9]{1,2}[A-Za-z]{2,3}[0-9]{2}[A-Za-z]{2}[0-9]{3}\b', extracted_text, re.IGNORECASE)
    
    clean_expected = expected_usn.strip().upper()
    for found in potential_usns:
        if found.upper() != clean_expected:
            return True, found.upper()
            
    return False, None
