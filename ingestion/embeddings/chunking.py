"""
Text chunking strategies for legislative documents and bill summaries.
"""
import re
import tiktoken


def count_tokens(text: str, model: str = "text-embedding-3-small") -> int:
    """Count tokens using tiktoken."""
    encoding = tiktoken.encoding_for_model(model)
    return len(encoding.encode(text))


def clean_legislative_text(text: str) -> str:
    """
    Clean legislative document formatting artifacts.

    Removes:
    - Null bytes (Unicode \u0000 characters that break PostgreSQL)
    - Line numbers at the start of lines (e.g., "2 ", "3 ", "10 ")
    - Page headers (e.g., "SCS HCS HBs 1366 & 1878 2")
    - Hyphenated line breaks (e.g., "pharma-\ncist" → "pharmacist")
    - Excessive whitespace
    """
    # Remove null bytes (causes PostgreSQL errors)
    text = text.replace('\x00', '')

    # Fix hyphenated words split across lines
    text = re.sub(r'(\w+)-\s*\n\s*(\w+)', r'\1\2', text)

    # Remove page headers
    # Pattern: bill type codes followed by bill numbers and page number
    text = re.sub(
        r'^[A-Z]{2,}\s+(?:[A-Z]{2,}\s+)*(?:HBs?|SBs?)\s+[\d\s&]+\s+\d+\s*$',
        '',
        text,
        flags=re.MULTILINE
    )

    # Remove line numbers at start of lines
    text = re.sub(r'^\s*\d+\s+', '', text, flags=re.MULTILINE)

    # Normalize whitespace (multiple spaces to single space)
    text = re.sub(r' +', ' ', text)

    # Remove excessive newlines (more than 2 consecutive)
    text = re.sub(r'\n{3,}', '\n\n', text)

    return text.strip()


def chunk_by_sentences(text: str, target_tokens: int = 800, overlap_tokens: int = 100) -> list[str]:
    """
    Chunk by sentences, respecting semantic boundaries.

    Args:
        text: Text to chunk
        target_tokens: Target tokens per chunk
        overlap_tokens: Number of overlapping tokens between chunks
    """
    # Split into sentences
    sentences = re.split(r'(?<=[.!?])\s+', text)

    chunks = []
    current_chunk = []
    current_tokens = 0

    for sentence in sentences:
        sentence_tokens = count_tokens(sentence)

        # If adding this sentence would exceed target, start new chunk
        if current_tokens + sentence_tokens > target_tokens and current_chunk:
            chunks.append(" ".join(current_chunk))

            # Keep last few sentences for overlap
            overlap_sentences = []
            overlap_count = 0

            # Work backwards to get overlap
            for s in reversed(current_chunk):
                s_tokens = count_tokens(s)
                if overlap_count + s_tokens <= overlap_tokens:
                    overlap_sentences.insert(0, s)
                    overlap_count += s_tokens
                else:
                    break

            current_chunk = overlap_sentences
            current_tokens = overlap_count

        current_chunk.append(sentence)
        current_tokens += sentence_tokens

    # Add final chunk
    if current_chunk:
        chunks.append(" ".join(current_chunk))

    return chunks


def chunk_by_sections(text: str, target_tokens: int = 800, overlap_tokens: int = 100) -> list[str]:
    """
    Chunk by major legislative sections, keeping subsections together.

    Splits on patterns like:
    - "Section A."
    - "338.056. 1." (statute numbers)

    Does NOT split on subsections like "1.", "2.", "8." within sections.

    Args:
        text: Text to chunk
        target_tokens: Target tokens per chunk
        overlap_tokens: Overlap tokens (not used for section-based, sections stay clean)
    """
    # Match major section boundaries
    section_pattern = r'(?:Section\s+[A-Z\d]+\.|(?:^|\n)(?:\d{3}\.\d{3}\.\s+1\.))'

    # Find all section boundaries
    matches = list(re.finditer(section_pattern, text, flags=re.MULTILINE))

    if not matches:
        # No sections found, return whole text
        return [text]

    sections = []

    # Extract text from start to first section
    if matches[0].start() > 0:
        sections.append(text[:matches[0].start()])

    # Extract each section (from section marker to next section marker)
    for i, match in enumerate(matches):
        start = match.start()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
        sections.append(text[start:end])

    # Combine sections into chunks respecting target size
    chunks = []
    current_chunk = []
    current_tokens = 0

    for section in sections:
        if not section.strip():
            continue

        section_tokens = count_tokens(section)

        # If section is too large, return it as its own chunk (allow 20% overage)
        if section_tokens > target_tokens * 1.2:
            if current_chunk:
                chunks.append(" ".join(current_chunk))
                current_chunk = []
                current_tokens = 0
            chunks.append(section)

        # If adding this section would exceed target, start new chunk
        elif current_tokens + section_tokens > target_tokens and current_chunk:
            chunks.append(" ".join(current_chunk))
            current_chunk = [section]
            current_tokens = section_tokens

        else:
            current_chunk.append(section)
            current_tokens += section_tokens

    # Add final chunk
    if current_chunk:
        chunks.append(" ".join(current_chunk))

    return chunks


def chunk_document(text: str, target_tokens: int = 800, overlap_tokens: int = 100) -> tuple[list[str], str]:
    """
    Auto-detect document type and apply appropriate chunking strategy.

    Args:
        text: Cleaned text to chunk
        target_tokens: Target tokens per chunk
        overlap_tokens: Number of overlapping tokens (for sentence-based only)

    Returns:
        Tuple of (chunks, document_type) where document_type is one of:
        - "legislative_text": Has statutory sections (Section A., 338.056. 1., etc.)
        - "summary": Narrative text without section markers
    """
    # Detect if it's legislative text (has Section markers or statute sections)
    has_sections = bool(re.search(
        r'(?:Section\s+[A-Z\d]+\.|(?:\d{3}\.\d{3}\.\s+1\.))',
        text,
        flags=re.MULTILINE
    ))

    if has_sections:
        # Legislative text - use section-based chunking
        return chunk_by_sections(text, target_tokens, overlap_tokens), "legislative_text"
    else:
        # Bill summary - check size
        token_count = count_tokens(text)
        if token_count <= target_tokens:
            # Keep short summaries as single chunk
            return [text], "summary"
        else:
            # Long summary - use sentence-based chunking
            return chunk_by_sentences(text, target_tokens, overlap_tokens), "summary"
