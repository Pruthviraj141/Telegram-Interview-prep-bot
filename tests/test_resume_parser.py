import io
import pytest
import docx
import fitz
from app.resume_parser import (
    validate_resume_file,
    extract_resume_text,
    ResumeExtractionError,
    extract_text_from_pdf,
    extract_text_from_docx,
)


def create_minimal_pdf_bytes(text: str = "Alice Smith - Backend Engineer with Python and Docker") -> bytes:
    doc = fitz.open()
    page = doc.new_page()
    page.insert_text((50, 72), text)
    data = doc.tobytes()
    doc.close()
    return data


def create_minimal_docx_bytes(text: str = "Bob Jones - Frontend Engineer with React and TypeScript") -> bytes:
    doc = docx.Document()
    doc.add_paragraph(text)
    stream = io.BytesIO()
    doc.save(stream)
    return stream.getvalue()


def test_resume_valid_pdf_extraction():
    pdf_bytes = create_minimal_pdf_bytes("Alice Smith Senior Engineer")
    text, file_type = extract_resume_text(pdf_bytes, "alice_resume.pdf", 5 * 1024 * 1024)
    assert file_type == "pdf"
    assert "Alice Smith Senior Engineer" in text


def test_resume_valid_docx_extraction():
    docx_bytes = create_minimal_docx_bytes("Bob Jones Staff Architect")
    text, file_type = extract_resume_text(docx_bytes, "resume.docx", 5 * 1024 * 1024)
    assert file_type == "docx"
    assert "Bob Jones Staff Architect" in text


def test_resume_size_limit_enforced():
    pdf_bytes = create_minimal_pdf_bytes()
    with pytest.raises(ResumeExtractionError, match="exceeds maximum allowed limit"):
        extract_resume_text(pdf_bytes, "resume.pdf", max_size_bytes=10)


def test_resume_invalid_file_type():
    fake_exe = b"MZ\x90\x00\x03\x00\x00\x00"
    with pytest.raises(ResumeExtractionError, match="Invalid file type"):
        extract_resume_text(fake_exe, "resume.pdf", 5 * 1024 * 1024)


def test_resume_empty_file():
    with pytest.raises(ResumeExtractionError, match="File is empty"):
        extract_resume_text(b"", "resume.pdf", 5 * 1024 * 1024)


def test_resume_malformed_pdf():
    corrupted_pdf = b"%PDF-1.4\ncorrupted content that cannot be parsed by pymupdf\n%%EOF"
    with pytest.raises(ResumeExtractionError):
        extract_text_from_pdf(corrupted_pdf)
