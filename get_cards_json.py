import os
import json

character = "spellweaver"

cards_json = []

# Read in favorites (if they exist)
favorites = set()
if os.path.exists("favorites.txt"):
    with open("favorites.txt", "r") as file:
        [favorites.add(f.strip().lower()) for f in file]
print("favorites:", favorites)

path = os.path.join("images", character, "ability_cards")
dir_walk = os.walk(path)  # dirpath (str), dirnames (list), filenames (list)
levels = next(dir_walk)[1]
for dir, level in zip(dir_walk, levels):
    for filename in dir[2]:
        name = filename.split(".")[0].replace("-", " ")
        card = {
            "filename": os.path.join(dir[0], filename),  # full file name
            "name": name.__add__(level),  # add for level filtering
            "level": level,
            "favorite": name in favorites,
        }
        cards_json.append(card)

with open("cards.json", "w") as file:
    json.dump(cards_json, file, indent=4)
