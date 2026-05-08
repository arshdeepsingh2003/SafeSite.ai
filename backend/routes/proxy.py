import re
import traceback
import logging
import urllib.parse
from fastapi import APIRouter, Query, Request
from fastapi.responses import StreamingResponse, Response, JSONResponse
import httpx

logger = logging.getLogger("hls-proxy")
logger.setLevel(logging.INFO)

router = APIRouter(prefix="/proxy", tags=["proxy"])

BROWSER_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "Accept": "*/*",
    "Accept-Language": "en-US,en;q=0.9",
    "Origin": "http://localhost:5173",
    "Referer": "http://localhost:5173/",
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


def _is_hls_playlist(content_type: str | None, url: str = "") -> bool:
    if content_type and "mpegurl" in content_type.lower():
        return True
    return urllib.parse.urlparse(url).path.endswith(".m3u8")


URI_ATTR_RE = re.compile(r'URI="([^"]*)"')
URI_ATTR_SQ_RE = re.compile(r"URI='([^']*)'")


def _rewrite_m3u8(content: str, manifest_url: str, request: Request) -> str:
    proxy_base = str(request.base_url).rstrip("/")
    proxy_hls = f"{proxy_base}/proxy/hls"

    def _replace_uri(m: re.Match) -> str:
        original = m.group(1)
        resolved = urllib.parse.urljoin(manifest_url, original)
        return f'URI="{proxy_hls}?{urllib.parse.urlencode({"url": resolved})}"'

    def _replace_uri_sq(m: re.Match) -> str:
        original = m.group(1)
        resolved = urllib.parse.urljoin(manifest_url, original)
        return f"URI='{proxy_hls}?{urllib.parse.urlencode({'url': resolved})}'"

    out = []
    for line in content.split("\n"):
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            line = URI_ATTR_RE.sub(_replace_uri, line)
            line = URI_ATTR_SQ_RE.sub(_replace_uri_sq, line)
            out.append(line)
        else:
            resolved = urllib.parse.urljoin(manifest_url, stripped)
            out.append(f"{proxy_hls}?{urllib.parse.urlencode({'url': resolved})}")
    return "\n".join(out)


@router.options("/hls")
async def proxy_hls_options():
    return Response(status_code=204, headers=CORS_HEADERS)


@router.get("/hls")
async def proxy_hls(
    request: Request,
    url: str = Query(..., description="Target HLS URL to proxy"),
):
    client: httpx.AsyncClient | None = None
    response: httpx.Response | None = None
    is_playlist = False
    try:
        print("Proxy URL:", url)

        if not url or not url.startswith(("http://", "https://")):
            return JSONResponse(
                status_code=400,
                content={"error": "Invalid URL"},
                headers=CORS_HEADERS,
            )

        headers = dict(BROWSER_HEADERS)
        range_header = request.headers.get("range")
        if range_header:
            headers["Range"] = range_header

        client = httpx.AsyncClient(follow_redirects=True, timeout=30)
        response = await client.get(url, headers=headers)
        response.raise_for_status()

        content_type = response.headers.get("content-type", "application/octet-stream")
        print("Status:", response.status_code)
        print("Content-Type:", content_type)

        resp_headers = dict(CORS_HEADERS)
        resp_headers["Cache-Control"] = "no-cache, no-store, must-revalidate"

        is_playlist = _is_hls_playlist(content_type, url)

        if is_playlist:
            raw = await response.aread()
            await response.aclose()
            response = None
            text = raw.decode("utf-8")
            text = _rewrite_m3u8(text, url, request)
            await client.aclose()
            client = None
            return Response(
                content=text.encode("utf-8"),
                media_type="application/vnd.apple.mpegurl",
                headers=resp_headers,
            )

        async def _stream(resp: httpx.Response, cl: httpx.AsyncClient):
            try:
                async for chunk in resp.aiter_bytes():
                    yield chunk
            except Exception:
                pass
            finally:
                await resp.aclose()
                await cl.aclose()

        return StreamingResponse(
            _stream(response, client),
            media_type=content_type,
            headers=resp_headers,
        )

    except httpx.HTTPStatusError as e:
        print("HLS Proxy Error:", str(e))
        traceback.print_exc()
        logger.error("HLS Proxy HTTP error: %s", str(e), exc_info=True)
        return JSONResponse(
            status_code=e.response.status_code,
            content={"error": str(e)},
            headers=CORS_HEADERS,
        )
    except Exception as e:
        print("HLS Proxy Error:", str(e))
        traceback.print_exc()
        logger.error("HLS Proxy Error: %s", str(e), exc_info=True)
        return JSONResponse(
            status_code=500,
            content={"error": str(e)},
            headers=CORS_HEADERS,
        )
    finally:
        if is_playlist and response is not None:
            await response.aclose()
        if is_playlist and client is not None:
            await client.aclose()
