"""Run a read-only SQL query against the finance project and print the rows.

Usage: python3 scripts/finance_query.py "select ..."
"""
import json
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import mcp_sql  # noqa: E402


def main() -> None:
    args = [a for a in sys.argv[1:] if a != "--write"]
    query = args[0]
    read_only = "--write" not in sys.argv
    mcp_sql.connect()
    payload = mcp_sql.run_sql(query, read_only=read_only)
    if isinstance(payload, str):
        print(payload[:3000])
        return
    for item in payload["data"]["results"]:
        if "error" in item:
            print("ERROR:", str(item["error"])[:1000])
            continue
        data = item["response"].get("data", {})
        print(json.dumps(data.get("result", data), indent=1)[:6000])


if __name__ == "__main__":
    main()
