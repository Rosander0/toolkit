import os
import time
import secrets
import hashlib
import asyncio
from typing import Dict, Tuple
from fastapi import FastAPI, Request, Response, HTTPException, status
from fastapi.responses import JSONResponse, StreamingResponse
import httpx

app = FastAPI(title="Office to PDF Gateway", docs_url=None, redoc_url=None)

# Configuration from environment
GOTENBERG_URL = os.getenv("GOTENBERG_URL", "http://127.0.0.1:3000")
SERVICE_PASSPHRASE = os.getenv("SERVICE_PASSPHRASE", "file-toolkit-secret")
SERVICE_PASSPHRASE_HASH = os.getenv("SERVICE_PASSPHRASE_HASH", "")
ALLOWED_ORIGIN = os.getenv("ALLOWED_ORIGIN", "http://localhost:5173,http://127.0.0.1:5173,https://*.vercel.app,https://*.netlify.app")
MAX_UPLOAD_SIZE_MB = int(os.getenv("MAX_UPLOAD_SIZE_MB", "25"))
MAX_UPLOAD_SIZE_BYTES = MAX_UPLOAD_SIZE_MB * 1024 * 1024
MAX_CONCURRENT_CONVERSIONS = int(os.getenv("MAX_CONCURRENT_CONVERSIONS", "2"))
CONVERSION_TIMEOUT_SECONDS = float(os.getenv("CONVERSION_TIMEOUT_SECONDS", "45.0"))
RATE_LIMIT_PER_MINUTE = int(os.getenv("RATE_LIMIT_PER_MINUTE", "15"))

ALLOWED_EXTENSIONS = {
    "docx", "doc", "pptx", "ppt", "xlsx", "xls", "odt", "ods", "odp", "rtf", "txt"
}

# Concurrency semaphore
conversion_semaphore = asyncio.Semaphore(MAX_CONCURRENT_CONVERSIONS)

# Per-IP rate limiting (sliding window: IP -> list of timestamps)
ip_rate_records: Dict[str, list] = {}

def is_rate_limited(ip: str) -> bool:
    now = time.time()
    window_start = now - 60.0
    records = ip_rate_records.get(ip, [])
    # Clean old entries
    valid_records = [t for t in records if t > window_start]
    if len(valid_records) >= RATE_LIMIT_PER_MINUTE:
        ip_rate_records[ip] = valid_records
        return True
    valid_records.append(now)
    ip_rate_records[ip] = valid_records
    return False

def check_auth(auth_header: str | None) -> bool:
    if not auth_header:
        return False
    # Strip optional 'Bearer ' prefix
    token = auth_header[7:].strip() if auth_header.startswith("Bearer ") else auth_header.strip()

    if SERVICE_PASSPHRASE_HASH:
        token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
        return secrets.compare_digest(token_hash, SERVICE_PASSPHRASE_HASH)

    if SERVICE_PASSPHRASE:
        return secrets.compare_digest(token, SERVICE_PASSPHRASE)

    return False

def get_allowed_origin(request: Request) -> str | None:
    req_origin = request.headers.get("origin")
    if not req_origin:
        return None
    allowed_list = [o.strip() for o in ALLOWED_ORIGIN.split(",") if o.strip()]
    for pattern in allowed_list:
        if pattern == "*" or pattern == req_origin:
            return req_origin
        # Basic wildcard match e.g. https://*.netlify.app
        if "*." in pattern:
            domain_part = pattern.split("*.")[1]
            if req_origin.endswith(domain_part):
                return req_origin
    return None

@app.middleware("http")
async def security_and_cors_middleware(request: Request, call_next):
    origin = request.headers.get("origin")
    allowed_origin = get_allowed_origin(request)

    # Handle OPTIONS preflight
    if request.method == "OPTIONS":
        headers = {
            "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
            "Access-Control-Allow-Headers": "Authorization, Content-Type",
            "Access-Control-Max-Age": "86400"
        }
        if allowed_origin:
            headers["Access-Control-Allow-Origin"] = allowed_origin
        return Response(status_code=204, headers=headers)

    # Minimal metadata-only logging (NO filenames, NO body contents)
    start_time = time.time()
    client_ip = request.client.host if request.client else "unknown"

    response = await call_next(request)

    duration_ms = (time.time() - start_time) * 1000
    # Safe metadata logging: Method, Path, Status, Client IP, Duration
    print(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] {request.method} {request.url.path} {response.status_code} {duration_ms:.1f}ms (IP: {client_ip})")

    if allowed_origin:
        response.headers["Access-Control-Allow-Origin"] = allowed_origin
        response.headers["Access-Control-Allow-Headers"] = "Authorization, Content-Type"

    return response

@app.get("/health")
async def health_check():
    """Public health endpoint, requires no auth. Returns minimal status."""
    gotenberg_status = "unknown"
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            resp = await client.get(f"{GOTENBERG_URL}/health")
            gotenberg_status = "ready" if resp.status_code == 200 else f"degraded_{resp.status_code}"
    except Exception:
        gotenberg_status = "unreachable"

    return {"status": "ok", "gotenberg": gotenberg_status}

@app.post("/convert")
async def convert_document(request: Request):
    client_ip = request.client.host if request.client else "unknown"

    # 1. Rate Limiting per IP
    if is_rate_limited(client_ip):
        return JSONResponse(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            content={"error": "Rate limit exceeded. Please wait a minute before making more requests."}
        )

    # 2. Authentication Check
    auth_header = request.headers.get("authorization")
    if not check_auth(auth_header):
        return JSONResponse(
            status_code=status.HTTP_401_UNAUTHORIZED,
            content={"error": "Unauthorized: Invalid or missing passphrase."}
        )

    # 3. Size limit check before buffering
    content_length = request.headers.get("content-length")
    if content_length and int(content_length) > MAX_UPLOAD_SIZE_BYTES:
        return JSONResponse(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            content={"error": f"Payload exceeds maximum allowed size of {MAX_UPLOAD_SIZE_MB}MB."}
        )

    # 4. Global Concurrency Limit Check
    try:
        await asyncio.wait_for(conversion_semaphore.acquire(), timeout=0.1)
    except asyncio.TimeoutError:
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={"error": "Server is busy with other conversions. Please retry in a few moments."}
        )

    try:
        # 5. Parse multipart form stream with size enforcement
        content_type = request.headers.get("content-type", "")
        if "multipart/form-data" not in content_type:
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content={"error": "Invalid Content-Type; multipart/form-data required."}
            )

        form = await request.form()
        uploaded_file = form.get("file")
        if not uploaded_file:
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content={"error": "No file uploaded. Key 'file' is required."}
            )

        filename = getattr(uploaded_file, "filename", "document.docx") or "document.docx"
        raw_ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""

        # 6. Strict Extension Allowlist Check
        if raw_ext not in ALLOWED_EXTENSIONS:
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content={
                    "error": f"Disallowed file extension '.{raw_ext}'. Allowed formats: {', '.join(sorted(ALLOWED_EXTENSIONS))}."
                }
            )

        file_bytes = await uploaded_file.read()
        if len(file_bytes) > MAX_UPLOAD_SIZE_BYTES:
            return JSONResponse(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                content={"error": f"Uploaded file exceeds {MAX_UPLOAD_SIZE_MB}MB limit."}
            )

        # 7. Forward to Gotenberg LibreOffice route on localhost:3000
        # No shell execution, streaming forward
        gotenberg_endpoint = f"{GOTENBERG_URL}/forms/libreoffice/convert"
        files = {
            "files": (filename, file_bytes, uploaded_file.content_type or "application/octet-stream")
        }

        try:
            async with httpx.AsyncClient(timeout=CONVERSION_TIMEOUT_SECONDS) as client:
                resp = await client.post(gotenberg_endpoint, files=files)

                if resp.status_code == 200:
                    return Response(
                        content=resp.content,
                        media_type="application/pdf",
                        headers={
                            "Content-Disposition": f'attachment; filename="{filename.rsplit(".", 1)[0]}.pdf"'
                        }
                    )
                else:
                    # Clean error reporting without internal paths or stack traces
                    return JSONResponse(
                        status_code=status.HTTP_502_BAD_GATEWAY,
                        content={"error": f"Office conversion failed with status {resp.status_code}."}
                    )
        except httpx.TimeoutException:
            return JSONResponse(
                status_code=status.HTTP_504_GATEWAY_TIMEOUT,
                content={"error": "Conversion timed out. The document may be too complex or corrupt."}
            )
        except Exception as e:
            return JSONResponse(
                status_code=status.HTTP_502_BAD_GATEWAY,
                content={"error": "Unable to contact Gotenberg conversion engine."}
            )
    finally:
        conversion_semaphore.release()

