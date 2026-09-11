"""Minimal MCP (streamable HTTP) client for the Composio endpoint.

Reads the endpoint + consumer key straight out of the active profile's
config.yaml, so no secret is ever echoed to stdout.
"""
import json
import re
import sys
import urllib.request

CONFIG = "/home/jimskin03/.hermes/profiles/aixin/config.yaml"


def _load_endpoint():
    text = open(CONFIG).read()
    m = re.search(r"composio:\s*\n\s*url:\s*(\S+)\s*\n\s*headers:\s*\n\s*x-consumer-api-key:\s*(\S+)", text)
    if not m:
        raise SystemExit("could not locate composio mcp endpoint in config.yaml")
    return m.group(1), m.group(2)


URL, KEY = _load_endpoint()
_session = {"id": None, "_next": 1}


def _post(payload, expect_json=True):
    data = json.dumps(payload).encode()
    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream",
        "x-consumer-api-key": KEY,
    }
    if _session["id"]:
        headers["mcp-session-id"] = _session["id"]
    req = urllib.request.Request(URL, data=data, headers=headers, method="POST")
    with urllib.request.urlopen(req, timeout=180) as resp:
        sid = resp.headers.get("mcp-session-id")
        if sid:
            _session["id"] = sid
        body = resp.read().decode()
    if not body.strip():
        return None
    if body.lstrip().startswith("event:") or "\ndata: " in body or body.startswith("data: "):
        out = []
        for line in body.splitlines():
            if line.startswith("data: "):
                out.append(json.loads(line[6:]))
        return out[-1] if out else None
    return json.loads(body)


def connect():
    _post({
        "jsonrpc": "2.0", "id": _session["_next"], "method": "initialize",
        "params": {"protocolVersion": "2024-11-05", "capabilities": {},
                   "clientInfo": {"name": "aixin-seed", "version": "1.0"}},
    })
    _session["_next"] += 1
    _post({"jsonrpc": "2.0", "method": "notifications/initialized"})


def call_tool(name, arguments):
    payload = {"jsonrpc": "2.0", "id": _session["_next"], "method": "tools/call",
               "params": {"name": name, "arguments": arguments}}
    _session["_next"] += 1
    res = _post(payload)
    if res is None:
        return None
    if "error" in res:
        raise RuntimeError(json.dumps(res["error"])[:500])
    result = res.get("result", {})
    texts = [c.get("text", "") for c in result.get("content", []) if isinstance(c, dict)]
    joined = "\n".join(texts)
    try:
        return json.loads(joined)
    except Exception:
        return joined


def run_sql(query, ref="vlnocfdiexkqcnfbjhqt", read_only=False):
    """Execute SQL through the Supabase management tool and return parsed JSON."""
    out = call_tool("COMPOSIO_MULTI_EXECUTE_TOOL", {
        "tools": [{"tool_slug": "SUPABASE_BETA_RUN_SQL_QUERY",
                   "arguments": {"ref": ref, "query": query, "read_only": read_only}}],
        "sync_response_to_workbench": False,
    })
    if isinstance(out, str):
        raise RuntimeError(out[:500])
    return out


if __name__ == "__main__":
    connect()
    q = sys.argv[1] if len(sys.argv) > 1 else "select 1 as ok"
    print(json.dumps(run_sql(q), default=str)[:1500])
