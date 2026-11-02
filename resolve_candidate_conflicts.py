import json
import subprocess
from pathlib import Path

files = [
    "dataset/candidates/dashbaord2_candidates.json",
    "dataset/candidates/dashboard16_candidates.json",
    "dataset/candidates/dashboard17_candidates.json",
    "dataset/candidates/dashboard1_candidates.json",
]

for path in files:
    def read_version(stage):
        raw = subprocess.check_output(["git", "show", f":{stage}:{path}"])
        return json.loads(raw.decode("utf-8-sig", errors="replace"))

    local = read_version(2)
    remote = read_version(3)

    remote_candidates = remote["candidates"]
    local_candidates = local["candidates"]
    remote_ids = {c.get("candidate_id") for c in remote_candidates}

    additions = [
        c for c in local_candidates
        if c.get("candidate_id") not in remote_ids
    ]

    merged = dict(remote)
    merged["candidates"] = remote_candidates + additions
    merged["candidate_count"] = len(merged["candidates"])

    ids = [c.get("candidate_id") for c in merged["candidates"]]
    if len(ids) != len(set(ids)):
        raise ValueError(f"Duplicate candidate IDs in {path}")

    Path(path).write_text(
        json.dumps(merged, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    print(f"{path}: remote={len(remote_candidates)}, added={len(additions)}, merged={len(ids)}")

print("Resolution files written.")
