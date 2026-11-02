import json
import subprocess

files = [
    "dataset/candidates/dashbaord2_candidates.json",
    "dataset/candidates/dashboard16_candidates.json",
    "dataset/candidates/dashboard17_candidates.json",
    "dataset/candidates/dashboard1_candidates.json",
]

for path in files:
    print("\n###", path)
    for stage, label in [("2", "LOCAL"), ("3", "REMOTE")]:
        result = subprocess.check_output(
            ["git", "show", f":{stage}:{path}"]
        )
        data = json.loads(result.decode("utf-8-sig", errors="replace"))
        ids = [c.get("candidate_id") for c in data.get("candidates", [])]
        print(f"{label}: actual={len(ids)}, declared={data.get('candidate_count')}")
        print(f"{label} IDs: {ids}")
