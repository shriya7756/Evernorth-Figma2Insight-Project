import json

with open("dataset/dashboards/dashboard4.json", encoding="utf-8") as f:
    data = json.load(f)

targets = {
    "1:123", "1:382", "1:398", "1:399",
    "1:469", "1:476", "1:477", "1:493",
    "1:649", "1:652", "1:655", "1:656"
}

for node in data["nodes"]:
    if node.get("id") in targets:
        print(
            node.get("id"),
            "| parent =", node.get("parent_id"),
            "| name =", node.get("name"),
            "| x =", node.get("x"),
            "| y =", node.get("y"),
            "| width =", node.get("width"),
            "| height =", node.get("height")
        )