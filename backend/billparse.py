"""Best-effort OCR / text extraction for supplier purchase bills (no AI).

Supports digital-text PDFs, scanned PDFs (OCR fallback) and photos/images.
Parsing is heuristic — the caller should treat results as a draft.
"""
import io
import re
import calendar
from datetime import date


def extract_text(filename: str, content: bytes) -> str:
    ext = (filename or "").lower().rsplit(".", 1)[-1]
    text = ""
    if ext == "pdf":
        try:
            import pdfplumber
            with pdfplumber.open(io.BytesIO(content)) as pdf:
                for page in pdf.pages:
                    text += (page.extract_text() or "") + "\n"
        except Exception:
            text = ""
        if len(text.strip()) < 25:  # likely scanned -> OCR each page
            try:
                from pdf2image import convert_from_bytes
                import pytesseract
                for img in convert_from_bytes(content, dpi=200):
                    text += pytesseract.image_to_string(img) + "\n"
            except Exception:
                pass
    else:  # image
        try:
            from PIL import Image
            import pytesseract
            text = pytesseract.image_to_string(Image.open(io.BytesIO(content)))
        except Exception:
            text = ""
    return text


def _norm_expiry(tok: str):
    tok = tok.strip()
    m = re.match(r"^(\d{4})-(\d{1,2})-(\d{1,2})$", tok)
    if m:
        return tok
    m = re.match(r"^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$", tok)  # dd/mm/yyyy
    if m:
        d, mm, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
        if y < 100:
            y += 2000
        if not (1 <= mm <= 12 and 1 <= d <= 31):
            return None
        try:
            return date(y, mm, d).isoformat()
        except ValueError:
            return None
    m = re.match(r"^(\d{1,2})[/-](\d{2,4})$", tok)  # mm/yy or mm/yyyy expiry
    if m:
        mm, y = int(m.group(1)), int(m.group(2))
        if y < 100:
            y += 2000
        if 1 <= mm <= 12:
            last = calendar.monthrange(y, mm)[1]
            return date(y, mm, last).isoformat()
    return None


def parse_rows(text: str):
    rows = []
    date_pat = re.compile(r"^\d{1,4}[/-]\d{1,4}(?:[/-]\d{2,4})?$")
    for raw in text.splitlines():
        line = raw.strip()
        if not line or len(line) < 4:
            continue
        low = line.lower()
        if any(h in low for h in ("invoice", "gstin", "total", "hsn", "amount payable",
                                  "product", "particulars", "description")) and \
                not re.search(r"\d[/-]\d", line):
            continue
        tokens = line.split()
        # locate expiry token
        exp = None
        exp_idx = None
        for i, t in enumerate(tokens):
            if date_pat.match(t):
                e = _norm_expiry(t)
                if e:
                    exp, exp_idx = e, i
                    break
        if exp is None:
            continue
        # batch = alphanumeric (letters+digits) token, not the expiry, prefer just before expiry
        batch, batch_idx = "NA", exp_idx
        for i in range(exp_idx - 1, -1, -1):
            t = tokens[i]
            if re.search(r"[A-Za-z]", t) and re.search(r"\d", t) and not date_pat.match(t):
                batch, batch_idx = t, i
                break
        # name = tokens before batch/expiry, keep only alpha-ish tokens
        name_end = min(batch_idx, exp_idx)
        name = " ".join(tokens[:name_end]).strip()
        name = re.sub(r"^\d+[\).]?\s*", "", name).strip()
        if not name:
            name = "Unknown Item"
        # numeric columns AFTER expiry: qty, mrp, rate, ...
        after = tokens[exp_idx + 1:]
        vals = []
        for t in after:
            t2 = t.replace(",", "")
            if re.fullmatch(r"\d+(?:\.\d+)?", t2):
                vals.append(float(t2))
        if not vals:
            continue
        qty = int(vals[0]) if vals[0] and vals[0] < 100000 else 1
        mrp = vals[1] if len(vals) > 1 else 0.0
        rate = vals[2] if len(vals) > 2 else round(mrp * 0.75, 2)
        # sanity: rate should not exceed mrp; if so swap
        if rate and mrp and rate > mrp:
            mrp, rate = rate, mrp
        rows.append({
            "product": name[:60], "batch": batch, "expiry": exp,
            "qty": max(qty, 1), "free_qty": 0, "mrp": round(mrp, 2), "rate": round(rate, 2),
            "discount": 0, "gst": 12, "hsn": "", "manufacturer": "",
        })
    return rows
