#!/usr/bin/env python3
"""Genera js/excluded-videos.js con los IDs de todas las playlists ev3c."""

import json
import urllib.request
from pathlib import Path

PLAYLISTS = [
    "PLngPtibRb2iFrta4peXN3qV5yD9yIEQcq",
    "PLngPtibRb2iHHBR67jrxkjuU5T0M578UA",
    "PLngPtibRb2iHWqOO2qhH6a5FlM_uCY2Mn",
    "PLngPtibRb2iEPBnv6M4dfZR6Ms-ERn0Yr",
    "PLngPtibRb2iH9afV1MSjMAyWvRMe9wA_x",
]

OUT = Path(__file__).resolve().parent.parent / "js" / "excluded-videos.js"
INSTANCES = [
    "https://inv.nadeko.net",
    "https://invidious.f5.si",
    "https://inv.zoomerville.com",
]


def fetch_playlist_ids(pl_id, instances):
    seen = set()
    all_ids = []
    total_expected = None

    for base in instances:
        page = 1
        all_ids = []
        seen = set()
        total_expected = None
        try:
            while page <= 30:
                url = f"{base.rstrip('/')}/api/v1/playlists/{pl_id}?page={page}"
                req = urllib.request.Request(url, headers={"User-Agent": "ev3c-music-build"})
                with urllib.request.urlopen(req, timeout=25) as resp:
                    data = json.load(resp)
                if total_expected is None:
                    total_expected = data.get("videoCount") or 0
                batch = []
                for video in data.get("videos") or []:
                    vid = video.get("videoId")
                    if vid and vid not in seen:
                        seen.add(vid)
                        batch.append(vid)
                if not batch:
                    break
                all_ids.extend(batch)
                if total_expected and len(all_ids) >= total_expected:
                    break
                page += 1
            if all_ids:
                return all_ids, total_expected or len(all_ids)
        except Exception:
            continue
    return [], 0


def main():
    all_ids = set()
    for pl_id in PLAYLISTS:
        ids, total = fetch_playlist_ids(pl_id, INSTANCES)
        all_ids.update(ids)
        print(f"  {pl_id}: {len(ids)} videos (total {total})")

    OUT.write_text(
        "window.EV3C_EXCLUDED = " + json.dumps(sorted(all_ids)) + ";\n",
        encoding="utf-8",
    )
    print(f"Total excluidos: {len(all_ids)} -> {OUT}")


if __name__ == "__main__":
    main()
