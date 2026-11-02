import pytest
import asyncio
from unittest.mock import patch, AsyncMock
import httpx
from fastapi.testclient import TestClient
from main import app, conversion_semaphore, MAX_UPLOAD_SIZE_BYTES

client = TestClient(app)

def test_health_check_requires_no_auth():
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert "gotenberg" in data

def test_unauthorized_request_rejected_without_passphrase():
    response = client.post(
        "/convert",
        files={"file": ("test.docx", b"dummy content", "application/vnd.openxmlformats-officedocument.wordprocessingml.document")}
    )
    assert response.status_code == 401
    assert "Unauthorized" in response.json()["error"]

def test_unauthorized_request_rejected_with_invalid_passphrase():
    response = client.post(
        "/convert",
        headers={"Authorization": "Bearer wrong-passphrase"},
        files={"file": ("test.docx", b"dummy content", "application/vnd.openxmlformats-officedocument.wordprocessingml.document")}
    )
    assert response.status_code == 401
    assert "Unauthorized" in response.json()["error"]

def test_disallowed_extension_rejected():
    disallowed_files = [
        ("malicious.exe", b"MZ\x90\x00", "application/x-msdownload"),
        ("script.sh", b"#!/bin/bash\necho hi", "application/x-sh"),
        ("exploit.php", b"<?php echo 1; ?>", "text/x-php")
    ]
    for filename, content, mime in disallowed_files:
        response = client.post(
            "/convert",
            headers={"Authorization": "Bearer file-toolkit-secret"},
            files={"file": (filename, content, mime)}
        )
        assert response.status_code == 400
        assert "Disallowed file extension" in response.json()["error"]

def test_oversize_file_rejected_before_buffering():
    # Simulate content-length header exceeding 25MB limit
    oversize_bytes = 26 * 1024 * 1024
    response = client.post(
        "/convert",
        headers={
            "Authorization": "Bearer file-toolkit-secret",
            "Content-Length": str(oversize_bytes)
        }
    )
    assert response.status_code == 413
    assert "Payload exceeds maximum allowed size" in response.json()["error"]

def test_cors_preflight_and_origin_verification():
    # 1. Allowed origin OPTIONS preflight
    response = client.options(
        "/convert",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "POST"
        }
    )
    assert response.status_code == 204
    assert response.headers.get("Access-Control-Allow-Origin") == "http://localhost:5173"

    # 2. Disallowed origin OPTIONS preflight
    disallowed_response = client.options(
        "/convert",
        headers={
            "Origin": "https://malicious-website.com",
            "Access-Control-Request-Method": "POST"
        }
    )
    assert disallowed_response.headers.get("Access-Control-Allow-Origin") is None

@pytest.mark.asyncio
async def test_concurrency_limit_rejects_excess_requests():
    # Simulate both semaphore slots occupied
    await conversion_semaphore.acquire()
    await conversion_semaphore.acquire()

    try:
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as ac:
            response = await ac.post(
                "/convert",
                headers={"Authorization": "Bearer file-toolkit-secret"},
                files={"file": ("test.docx", b"fake content", "application/octet-stream")}
            )
            # Should immediately be rejected with 503
            assert response.status_code == 503
            assert "Server is busy with other conversions" in response.json()["error"]
    finally:
        conversion_semaphore.release()
        conversion_semaphore.release()

@pytest.mark.asyncio
async def test_conversion_for_docx_xlsx_pptx_fixtures():
    # Mock Gotenberg endpoint returning a valid synthetic PDF with at least 1 page
    synthetic_pdf_bytes = b"%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R >>\nendobj\nxref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \ntrailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n168\n%%EOF"

    mock_resp = httpx.Response(
        status_code=200,
        content=synthetic_pdf_bytes,
        headers={"Content-Type": "application/pdf"}
    )

    with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
        mock_post.return_value = mock_resp

        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as ac:
            for ext in ["docx", "xlsx", "pptx"]:
                resp = await ac.post(
                    "/convert",
                    headers={"Authorization": "Bearer file-toolkit-secret"},
                    files={"file": (f"sample.{ext}", b"PK\x03\x04mock content", "application/octet-stream")}
                )
                assert resp.status_code == 200
                assert resp.headers["Content-Type"] == "application/pdf"
                assert resp.content.startswith(b"%PDF-")
                assert b"/Count 1" in resp.content

