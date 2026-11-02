import json

with open("dataset/candidates/dashboard4_candidates.json", encoding="utf-8") as f:
    d = json.load(f)

ids = {
    "1:123", "1:382", "1:398", "1:399",
    "1:469", "1:493",
    "1:649", "1:652", "1:655", "1:656",
    "1:18", "1:25", "1:32", "1:39"
}

for c in d["candidates"]:
    if c["candidate_id"] in ids:
        print(
            c["candidate_id"],
            "| parent =", c.get("parent_id"),
            "|", c["name"],
            "| size =", str(c["width"]) + "x" + str(c["height"]),
            "| children =", c.get("child_count"),
            "| text =", c.get("text_preview", [])[:4]
        )
