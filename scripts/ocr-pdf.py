# OCR a PDF whose text layer is unreadable (Ford TSBs embed a scrambled font).
# Renders each page with PyMuPDF and reads it with RapidOCR; prints plain text.
# Optional helper for scripts/check-citations.js:
#   pip install pymupdf rapidocr-onnxruntime
#   python scripts/ocr-pdf.py some.pdf
import sys

import pymupdf
from rapidocr_onnxruntime import RapidOCR

ocr = RapidOCR()
doc = pymupdf.open(sys.argv[1])
out = []
for page in doc:
    png = page.get_pixmap(dpi=220).tobytes("png")
    result, _ = ocr(png)
    # Each line: [box, text, score]. Sort top-to-bottom, then left-to-right.
    lines = sorted(result or [], key=lambda r: (round(r[0][0][1] / 12), r[0][0][0]))
    out.append("\n".join(r[1] for r in lines))
sys.stdout.reconfigure(encoding="utf-8")
print("\n\f\n".join(out))
