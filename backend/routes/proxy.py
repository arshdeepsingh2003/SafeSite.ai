import re
import logging
import urllib.parse
from fastapi import APIRouter, Query, Request
from fastapi.responses import StreamingResponse, Response
import httpx

logger = logging.getLogger("hls-proxy")
logger.setLevel(logging.INFO)

router = APIRouter(prefix="/proxy", tags=["proxy"])

BROWSER_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "Accept": "*/*",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Origin": "http://localhost:5173",
    "Referer": "http://localhost:5173/",
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "cross-site",
    "Connection": "keep-alive",
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


HLS_MIME_PATTERNS = (
    "application/vnd.apple.mpegurl",
    "application/x-mpegurl",
    "audio/mpegurl",
    "audio/x-mpegurl",
    "mpegurl",
    "x-mpegurl",
)


def is_hls_playlist(content_type: str | None) -> bool:
    if not content_type:
        return False
    ct = content_type.lower()
    return any(p in ct for p in HLS_MIME_PATTERNS)


URI_ATTR_RE = re.compile(r'URI="([^"]*)"')
URI_ATTR_SQ_RE = re.compile(r"URI='([^']*)'")


def rewrite_m3u8(content: str, manifest_url: str, request: Request) -> str:
    proxy_base = str(request.base_url).rstrip("/")
    proxy_hls = f"{proxy_base}/proxy/hls"

    lines = content.split("\n")
    out = []

    for line in lines:
        stripped = line.strip()

        if not stripped or stripped.startswith("#"):
            def _replace_uri(m: re.Match) -> str:
                original = m.group(1)
                resolved = urllib.parse.urljoin(manifest_url, original)
                encoded = urllib.parse.quote(resolved, safe="")
                return f'URI="{proxy_hls}?url={encoded}"'

            def _replace_uri_sq(m: re.Match) -> str:
                original = m.group(1)
                resolved = urllib.parse.urljoin(manifest_url, original)
                encoded = urllib.parse.quote(resolved, safe="")
                return f"URI='{proxy_hls}?url={encoded}'"

            line = URI_ATTR_RE.sub(_replace_uri, line)
            line = URI_ATTR_SQ_RE.sub(_replace_uri_sq, line)
            out.append(line)
        else:
            resolved = urllib.parse.urljoin(manifest_url, stripped)
            encoded = urllib.parse.quote(resolved, safe="")
            out.append(f"{proxy_hls}?url={encoded}")

    return "\n".join(out)


FORWARD_HEADERS = {"content-range", "accept-ranges", "cache-control"}


@router.get("/hls")
async def proxy_hls(
    request: Request,
    url: str = Query(..., description="Target HLS URL to proxy"),
):
    if not url.startswith(("http://", "https://")):
        return Response("Invalid URL — must be http(s)", status_code=400)

    client = get_client()
    headers = dict(BROWSER_HEADERS)

    range_header = request.headers.get("range")
    if range_header:
        headers["Range"] = range_header

    parsed = urllib.parse.urlparse(url)

    logger.info(
        "HLS proxy  host=%s  status=init  url_len=%d  content_type=—",
        parsed.hostname, len(url),
    )

    req = client.build_request("GET", url, headers=headers)
    resp = await client.send(req, stream=True)

    if resp.status_code == 414:
        await resp.aclose()
        logger.warning(
            "414 from %s (url_len=%d) — retrying with minimal headers",
            parsed.hostname, len(url),
        )
        minimal = {
            "User-Agent": BROWSER_HEADERS["User-Agent"],
            "Accept": "*/*",
        }
        req = client.build_request("GET", url, headers=minimal)
        resp = await client.send(req, stream=True)

        logger.info(
            "414-retry  host=%s  status=%d  url_len=%d",
            parsed.hostname, resp.status_code, len(url),
        )

    content_type = resp.headers.get("content-type", "application/octet-stream")

    logger.info(
        "HLS proxy  host=%s  status=%d  url_len=%d  content_type=%s",
        parsed.hostname, resp.status_code, len(url), content_type,
    )

    resp_headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Expose-Headers": "*",
        "Cache-Control": "no-cache, no-store, must-revalidate",
    }
    for h in FORWARD_HEADERS:
        if h in resp.headers:
            resp_headers[h] = resp.headers[h]

    if is_hls_playlist(content_type):
        body = await resp.aread()
        await resp.aclose()
        text = body.decode("utf-8", errors="replace")
        text = rewrite_m3u8(text, url, request)
        return Response(
            content=text.encode("utf-8"),
            media_type="application/vnd.apple.mpegurl",
            status_code=resp.status_code,
            headers=resp_headers,
        )

    async def _stream():
        try:
            async for chunk in resp.aiter_bytes():
                yield chunk
        except Exception:
            pass
        finally:
            await resp.aclose()

    return StreamingResponse(
        _stream(),
        media_type=content_type,
        status_code=resp.status_code,
        headers=resp_headers,
    )
