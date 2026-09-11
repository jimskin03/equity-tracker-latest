"""Seed reference.instruments from JerBouma/FinanceDatabase equities CSVs.

Runs locally: downloads the upstream CSVs, parses them with the csv module
(quoted summaries contain commas), and pushes chunked upserts to the Supabase
project through the Composio MCP SQL tool. No database credential is stored or
printed; the project credential stays bound to the Composio connection.

Usage:
    python3 scripts/seed_reference_instruments.py [--files A,B] [--chunk 800]
"""
from __future__ import annotations

import argparse
import csv
import io
import json
import os
import pathlib
import sys
import time
import urllib.request

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import mcp_sql  # noqa: E402

RAW = "https://raw.githubusercontent.com/JerBouma/FinanceDatabase/main"
CACHE = pathlib.Path("/tmp/fdb")
COLUMNS = [
    "asset_type", "symbol", "name", "currency_code", "exchange_code", "exchange_name",
    "country", "sector", "industry_group", "industry", "isin", "cusip", "figi",
    "composite_figi", "shareclass_figi", "source", "source_key",
]


def discover_files() -> list[str]:
    req = urllib.request.Request(
        "https://api.github.com/repos/JerBouma/FinanceDatabase/contents/database/equities",
        headers={"User-Agent": "equity-tracker-seed"},
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        entries = json.load(resp)
    return [e["name"] for e in entries if e["type"] == "file" and e["name"].endswith(".csv")]


def download(name: str) -> bytes:
    CACHE.mkdir(parents=True, exist_ok=True)
    target = CACHE / name
    if target.exists() and target.stat().st_size > 0:
        return target.read_bytes()
    url = f"{RAW}/database/equities/{name}"
    for attempt in range(3):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "equity-tracker-seed"})
            with urllib.request.urlopen(req, timeout=180) as resp:
                blob = resp.read()
            target.write_bytes(blob)
            return blob
        except Exception as exc:  # noqa: BLE001
            if attempt == 2:
                raise
            print(f"  retry {name}: {exc}", flush=True)
            time.sleep(3)
    return b""


def parse_rows(blob: bytes, rows: dict[str, list[str | None]]) -> int:
    text = blob.decode("utf-8-sig", errors="replace")
    reader = csv.reader(io.StringIO(text))
    try:
        header = [h.strip().lower() for h in next(reader)]
    except StopIteration:
        return 0
    index = {name: i for i, name in enumerate(header)}
    added = 0
    for raw in reader:
        if not raw:
            continue

        def get(*names: str) -> str | None:
            for n in names:
                i = index.get(n)
                if i is not None and i < len(raw):
                    value = raw[i].strip()
                    if value:
                        return value
            return None

        symbol = get("symbol")
        name = get("name")
        if not symbol or not name:
            continue
        isin = get("isin")
        exchange = get("exchange", "exchange_code")
        source_key = f"{isin or ''}|{exchange or ''}|{symbol}"
        rows[source_key] = [
            get("asset_type") or "equity",
            symbol,
            name,
            get("currency", "currency_code"),
            exchange,
            get("exchange_name") or get("market"),
            get("country"),
            get("sector"),
            get("industry_group"),
            get("industry"),
            isin,
            get("cusip"),
            get("figi"),
            get("composite_figi"),
            get("shareclass_figi"),
            "financedatabase",
            source_key,
        ]
        added += 1
    return added


def sql_literal(value: str | None) -> str:
    if value is None:
        return "null"
    return "'" + value.replace("'", "''").replace("\\", "\\\\") + "'"


def build_statement(chunk: list[list[str | None]]) -> str:
    values = ",\n".join(
        "(" + ", ".join(sql_literal(v) for v in row) + ")" for row in chunk
    )
    columns = ", ".join(COLUMNS)
    return (
        f"insert into reference.instruments ({columns}) values\n{values}\n"
        "on conflict (source, source_key) do update set\n"
        "  name = excluded.name, symbol = excluded.symbol,"
        " currency_code = excluded.currency_code, exchange_code = excluded.exchange_code,"
        " exchange_name = excluded.exchange_name, country = excluded.country,"
        " sector = excluded.sector, industry_group = excluded.industry_group,"
        " industry = excluded.industry, isin = excluded.isin, cusip = excluded.cusip,"
        " figi = excluded.figi, composite_figi = excluded.composite_figi,"
        " shareclass_figi = excluded.shareclass_figi, asset_type = excluded.asset_type,"
        " source_updated_at = now(), updated_at = now()"
    )


def _check(payload) -> None:
    try:
        results = payload["data"]["results"]
    except Exception:  # noqa: BLE001
        raise RuntimeError(json.dumps(payload)[:400])
    for item in results:
        if "error" in item:
            raise RuntimeError(str(item["error"])[:400])
        response = item.get("response", {})
        if not response.get("successful", True):
            raise RuntimeError(str(response)[:400])


def push(chunk: list[list[str | None]], label: str) -> None:
    statement = build_statement(chunk)
    for attempt in range(4):
        try:
            payload = mcp_sql.run_sql(statement)
            _check(payload)
            return
        except Exception as exc:  # noqa: BLE001
            wait = 3 * (attempt + 1)
            print(f"    {label}: attempt {attempt + 1} failed ({str(exc)[:160]}) — retry in {wait}s", flush=True)
            time.sleep(wait)
            mcp_sql.connect()
    raise SystemExit(f"giving up on chunk {label}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--files", default="")
    parser.add_argument("--chunk", type=int, default=800)
    parser.add_argument("--limit-files", type=int, default=0)
    args = parser.parse_args()

    names = [n.strip() for n in args.files.split(",") if n.strip()] or discover_files()
    if args.limit_files:
        names = names[: args.limit_files]
    print(f"downloading {len(names)} upstream CSVs", flush=True)

    rows: dict[str, list[str | None]] = {}
    for i, name in enumerate(names, 1):
        parsed = parse_rows(download(name), rows)
        print(f"  [{i}/{len(names)}] {name}: {parsed} listings (unique so far {len(rows)})", flush=True)

    print(f"unique listings: {len(rows)}", flush=True)
    mcp_sql.connect()

    items = list(rows.values())
    total = 0
    for start in range(0, len(items), args.chunk):
        chunk = items[start:start + args.chunk]
        push(chunk, f"rows {start}-{start + len(chunk)}")
        total += len(chunk)
        print(f"  pushed {total}/{len(items)}", flush=True)
    print(f"DONE pushed {total} rows", flush=True)


if __name__ == "__main__":
    main()
