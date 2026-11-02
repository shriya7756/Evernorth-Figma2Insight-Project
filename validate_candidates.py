import json
from pathlib import Path

files = [
    "dataset/candidates/dashbaord2_candidates.json",
    "dataset/candidates/dashboard16_candidates.json",
    "dataset/candidates/dashboard17_candidates.json",
    "dataset/candidates/dashboard1_candidates.json",
]

for name in files:
    data = json.loads(Path(name).read_text(encoding="utf-8-sig"))
    actual = len(data["candidates"])
    declared = data["candidate_count"]
    print(f"{name}: valid JSON | actual={actual} | declared={declared}")
    if actual != declared:
        raise ValueError(f"Candidate count mismatch: {name}")

print("All four files passed validation.")
