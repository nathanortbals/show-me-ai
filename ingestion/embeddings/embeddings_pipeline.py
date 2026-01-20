"""
Embeddings pipeline for bill documents using LangChain SDK.

Extracts text from PDFs, chunks them, generates embeddings, and stores in Supabase.
"""
import os
from typing import Optional
from pypdf import PdfReader
from dotenv import load_dotenv
from langchain_openai import OpenAIEmbeddings
from langchain_community.vectorstores import SupabaseVectorStore
from langchain_core.documents import Document
from ingestion.db_utils import Database
from ingestion.embeddings.chunking import clean_legislative_text, chunk_document, count_tokens

# Load environment variables
load_dotenv()


class EmbeddingsPipeline:
    """Pipeline for processing bill documents into embeddings using LangChain."""

    def __init__(
        self,
        db: Optional[Database] = None,
        openai_api_key: Optional[str] = None,
        embedding_model: str = "text-embedding-3-small"
    ):
        """
        Initialize the embeddings pipeline.

        Args:
            db: Database instance (defaults to new instance)
            openai_api_key: OpenAI API key (defaults to OPENAI_API_KEY env var)
            embedding_model: OpenAI embedding model to use
        """
        self.db = db or Database()

        # Get OpenAI API key (ensure it's a string, not a callable)
        api_key = openai_api_key or os.getenv('OPENAI_API_KEY')
        if not api_key:
            raise RuntimeError("OpenAI API key not found. Set OPENAI_API_KEY environment variable or pass as argument.")

        # Initialize LangChain embeddings
        self.embeddings = OpenAIEmbeddings(
            model=embedding_model,
            openai_api_key=api_key
        )

        # Initialize Supabase vector store
        self.vector_store = SupabaseVectorStore(
            client=self.db.client,
            embedding=self.embeddings,
            table_name="bill_embeddings",
            query_name="match_bill_embeddings"
        )

    def extract_text_from_pdf(self, pdf_path: str) -> str:
        """Extract all text from a PDF file."""
        reader = PdfReader(pdf_path)
        full_text = ""
        for page in reader.pages:
            full_text += page.extract_text() + "\n"
        return full_text

    def extract_text_from_storage(self, storage_path: str, bucket: str = "bill-pdfs") -> str:
        """
        Extract text from a PDF in Supabase Storage.

        Args:
            storage_path: Path within the storage bucket
            bucket: Storage bucket name

        Returns:
            Extracted text
        """
        # Download PDF from storage
        response = self.db.download_from_storage(storage_path, bucket_name=bucket)

        # Write to temp file and extract
        import tempfile
        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
            tmp.write(response)
            tmp_path = tmp.name

        try:
            text = self.extract_text_from_pdf(tmp_path)
            return text
        finally:
            os.unlink(tmp_path)

    def process_document(
        self,
        bill_id: str,
        document_id: Optional[str],
        storage_path: str,
        content_type: str,
        bill_metadata: dict,
        target_tokens: int = 800,
        overlap_tokens: int = 100
    ) -> int:
        """
        Process a single document: extract, chunk, embed, and store.

        Args:
            bill_id: Bill UUID
            document_id: Document UUID (if this is from bill_documents table)
            storage_path: Path to PDF in Supabase Storage
            content_type: Type of content (e.g., "Introduced", "Committee", "Summary")
            bill_metadata: Dictionary with bill metadata (session, sponsors, committees)
            target_tokens: Target tokens per chunk
            overlap_tokens: Overlap tokens for sentence-based chunking

        Returns:
            Number of embeddings created
        """
        print(f"  Processing: {storage_path}")

        # Extract text from storage
        try:
            raw_text = self.extract_text_from_storage(storage_path)
        except Exception as e:
            print(f"    Error extracting text: {e}")
            return 0

        # Clean text
        clean_text = clean_legislative_text(raw_text)
        print(f"    Tokens: {count_tokens(clean_text)}")

        # Chunk document
        chunks, doc_type = chunk_document(clean_text, target_tokens, overlap_tokens)
        print(f"    Document type: {doc_type}")
        print(f"    Chunks: {len(chunks)}")

        # Create LangChain Documents with metadata
        documents = []
        for i, chunk in enumerate(chunks):
            # Build metadata dictionary
            metadata = {
                'bill_id': bill_id,
                'bill_number': bill_metadata['bill_number'],
                'document_id': document_id,
                'content_type': content_type,
                'chunk_index': i,
                'doc_type': doc_type,
                'token_count': count_tokens(chunk),
                'session_year': bill_metadata.get('session_year'),
                'session_code': bill_metadata.get('session_code')
            }

            # Add primary sponsor
            if bill_metadata.get('primary_sponsor'):
                metadata['primary_sponsor_id'] = bill_metadata['primary_sponsor']['id']
                metadata['primary_sponsor_name'] = bill_metadata['primary_sponsor']['name']

            # Add co-sponsors (as lists)
            if bill_metadata.get('cosponsors'):
                metadata['cosponsor_ids'] = [cs['id'] for cs in bill_metadata['cosponsors']]
                metadata['cosponsor_names'] = [cs['name'] for cs in bill_metadata['cosponsors']]

            # Add committees (as lists)
            if bill_metadata.get('committees'):
                metadata['committee_ids'] = [c['id'] for c in bill_metadata['committees']]
                metadata['committee_names'] = [c['name'] for c in bill_metadata['committees']]

            doc = Document(
                page_content=chunk,
                metadata=metadata
            )
            documents.append(doc)

        # Store embeddings using LangChain vector store
        try:
            self.vector_store.add_documents(documents)
            print(f"    ✓ Created {len(documents)} embeddings")
            return len(documents)
        except Exception as e:
            print(f"    Error storing embeddings: {e}")
            return 0

    def process_bill(self, bill_id: str) -> int:
        """
        Process embeddable documents for a bill.

        Only processes "Introduced" and the most recent version (if different).
        Automatically excludes fiscal notes.

        Args:
            bill_id: Bill UUID

        Returns:
            Total number of embeddings created
        """
        # Get bill metadata (session, sponsors, committees)
        bill_metadata = self.db.get_bill_metadata_for_embeddings(bill_id)
        if not bill_metadata:
            print(f"  Could not fetch metadata for bill {bill_id}")
            return 0

        # Get embeddable documents for this bill (Introduced + most recent, excluding fiscal notes)
        documents = self.db.get_embeddable_bill_documents(bill_id)

        if not documents:
            print(f"  No embeddable documents found for bill {bill_id}")
            return 0

        total_embeddings = 0

        for doc in documents:
            if not doc.get('storage_path'):
                print(f"  Skipping document {doc['id']} - no storage path")
                continue

            embeddings = self.process_document(
                bill_id=bill_id,
                document_id=doc['id'],
                storage_path=doc['storage_path'],
                content_type=doc['document_type'],
                bill_metadata=bill_metadata
            )
            total_embeddings += embeddings

        return total_embeddings

    def process_session(self, session_id: str, limit: Optional[int] = None) -> tuple[int, int]:
        """
        Process all bills in a session.

        Args:
            session_id: Session UUID
            limit: Optional limit on number of bills to process

        Returns:
            Tuple of (bills_processed, total_embeddings_created)
        """
        # Get all bills for session
        bills = self.db.get_bills_for_session(session_id, limit=limit)

        if not bills:
            print("No bills found for session")
            return 0, 0

        bills_processed = 0
        total_embeddings = 0

        for bill in bills:
            print(f"\nProcessing bill {bill['bill_number']} ({bill['id']})...")
            embeddings = self.process_bill(bill['id'])
            if embeddings > 0:
                bills_processed += 1
                total_embeddings += embeddings

        return bills_processed, total_embeddings


def main():
    """CLI entry point for running embeddings pipeline."""
    import argparse

    parser = argparse.ArgumentParser(description='Generate embeddings for bill documents')
    parser.add_argument('--year', type=int, required=True, help='Legislative year')
    parser.add_argument('--session-code', default='R', help='Session code (R, S1, S2)')
    parser.add_argument('--limit', type=int, help='Limit number of bills to process')
    args = parser.parse_args()

    # Initialize
    db = Database()
    pipeline = EmbeddingsPipeline(db=db)

    # Get session
    session_id = db.get_or_create_session(args.year, args.session_code)
    print(f"Processing session: {args.year} {args.session_code} (ID: {session_id})")

    # Process bills
    bills_processed, total_embeddings = pipeline.process_session(
        session_id=session_id,
        limit=args.limit
    )

    print(f"\n{'='*80}")
    print(f"SUMMARY")
    print(f"{'='*80}")
    print(f"Bills processed: {bills_processed}")
    print(f"Total embeddings created: {total_embeddings}")
    print(f"Average embeddings per bill: {total_embeddings / bills_processed if bills_processed else 0:.1f}")


if __name__ == '__main__':
    main()
