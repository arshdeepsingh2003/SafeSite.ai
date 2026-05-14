import os
import re
import traceback
import logging
import sys
import urllib.parse
from fastapi import APIRouter, Query, Request
from fastapi.responses import StreamingResponse, Response, JSONResponse
import httpx

logger = logging.getLogger("hls-proxy")
logger.setLevel(logging.INFO)
if not logger.handlers:
    _h = logging.StreamHandler(sys.stdout)
    _h.setLevel(logging.INFO)
    _h.setFormatter(logging.Formatter("[hls-proxy] %(levelname)s: %(message)s"))
    logger.addHandler(_h)

router = APIRouter(prefix="/proxy", tags=["proxy"])

BASE_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "Accept": "*/*",
    "Accept-Language": "en-US,en;q=0.9",
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "cross-site",
    "Connection": "keep-alive",
}

CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Expose-Headers": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "*",
}

_client: httpx.AsyncClient | None = None


def get_client() -> httpx.AsyncClient:
    global _client
    if _client is None:
        _client = httpx.AsyncClient(
            http2=True,
            follow_redirects=True,
            timeout=30.0,
            limits=httpx.Limits(max_keepalive_connections=20, max_connections=50),
        )
    return _client


async def close_client():
    global _client
    if _client:
        await _client.aclose()
        _client = None


NON_PLAYLIST_EXTS = {".ts", ".key", ".aac", ".mp4", ".m4s", ".mp3", ".ac3", ".ec3", ".vtt"}

def _is_hls_playlist(content_type: str | None, url: str = "") -> bool:
    parsed = urllib.parse.urlparse(url)
    path_lower = parsed.path.lower()
    if path_lower.endswith(".m3u8"):
        return True
    if content_type and "mpegurl" in content_type.lower():
        _, ext = os.path.splitext(path_lower)
        if ext not in NON_PLAYLIST_EXTS:
            return True
    return False


URI_ATTR_RE = re.compile(r'URI="([^"]*)"')
URI_ATTR_SQ_RE = re.compile(r"URI='([^']*)'")


def _resolve_url(relative_url: str, manifest_url: str) -> str:
    resolved = urllib.parse.urljoin(manifest_url, relative_url)
    parsed_manifest = urllib.parse.urlparse(manifest_url)
    if parsed_manifest.query:
        if "?" not in resolved:
            resolved += "?" + parsed_manifest.query
    return resolved


def _rewrite_m3u8(content: str, manifest_url: str, request: Request) -> str:
    proxy_base = str(request.base_url).rstrip("/")
    proxy_hls = f"{proxy_base}/proxy/hls"

    def _replace_uri(m: re.Match) -> str:
        original = m.group(1)
        resolved = _resolve_url(original, manifest_url)
        return f'URI="{proxy_hls}?{urllib.parse.urlencode({"url": resolved})}"'

    def _replace_uri_sq(m: re.Match) -> str:
        original = m.group(1)
        resolved = _resolve_url(original, manifest_url)
        return f"URI='{proxy_hls}?{urllib.parse.urlencode({'url': resolved})}'"

    out = []
    for line in content.split("\n"):
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            line = URI_ATTR_RE.sub(_replace_uri, line)
            line = URI_ATTR_SQ_RE.sub(_replace_uri_sq, line)
            out.append(line)
        else:
            resolved = _resolve_url(stripped, manifest_url)
            out.append(f"{proxy_hls}?{urllib.parse.urlencode({'url': resolved})}")
    return "\n".join(out)


def _build_headers(url: str, request: Request) -> dict:
    parsed = urllib.parse.urlparse(url)
    origin = f"{parsed.scheme}://{parsed.netloc}"
    headers = dict(BASE_HEADERS)
    headers["Origin"] = origin
    headers["Referer"] = origin + "/"
    range_header = request.headers.get("range")
    if range_header:
        headers["Range"] = range_header
    return headers


@router.options("/hls")
async def proxy_hls_options():
    return Response(status_code=204, headers=CORS_HEADERS)


@router.get("/hls")
async def proxy_hls(
    request: Request,
    url: str = Query(..., description="Target HLS URL to proxy"),
):
    response: httpx.Response | None = None
    close_in_finally = True
    try:
        logger.info("Proxying: %s", url)

        if not url or not url.startswith(("http://", "https://")):
            return JSONResponse(
                status_code=400,
                content={"error": "Invalid URL"},
                headers=CORS_HEADERS,
            )

        headers = _build_headers(url, request)

        client = get_client()
        response = await client.get(url, headers=headers)

        effective_url = str(response.url)
        content_type = response.headers.get("content-type", "application/octet-stream")
        logger.info("Status: %s  CT: %s  Effective URL: %s", response.status_code, content_type, effective_url)

        if response.status_code >= 400:
            body = await response.aread()
            status_code = response.status_code
            logger.error("Upstream error %d for %s — body: %s", status_code, effective_url, body[:500].decode("utf-8", errors="replace"))
            await response.aclose()
            response = None
            return JSONResponse(
                status_code=status_code,
                content={"error": f"Upstream returned {status_code}", "url": url},
                headers=CORS_HEADERS,
            )

        resp_headers = dict(CORS_HEADERS)
        resp_headers["Cache-Control"] = "no-cache, no-store, must-revalidate"

        is_playlist = _is_hls_playlist(content_type, effective_url)

        if is_playlist:
            raw = await response.aread()
            await response.aclose()
            response = None
            text = raw.decode("utf-8")
            text = _rewrite_m3u8(text, effective_url, request)
            logger.info("Rewrote playlist (%d chars) for: %s", len(text), url)
            return Response(
                content=text.encode("utf-8"),
                media_type="application/vnd.apple.mpegurl",
                headers=resp_headers,
            )

        async def _stream(resp: httpx.Response):
            try:
                async for chunk in resp.aiter_bytes():
                    yield chunk
            except Exception:
                pass
            finally:
                await resp.aclose()

        close_in_finally = False
        return StreamingResponse(
            _stream(response),
            media_type=content_type,
            headers=resp_headers,
        )

    except Exception as e:
        tb = traceback.format_exc()
        logger.error("HLS Proxy Error for %s: %s\n%s", url, str(e), tb)
        print(f"[hls-proxy] ERROR: {url} — {e}", flush=True)
        return JSONResponse(
            status_code=500,
            content={"error": str(e), "detail": tb},
            headers=CORS_HEADERS,
        )
    finally:
        if response is not None and close_in_finally:
            try:
                await response.aclose()
            except Exception:
                pass
