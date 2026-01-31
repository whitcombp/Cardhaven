import os
import json

character = "spellweaver"

flips_json = []

# Read in the modifiers for selected character
modifiers_path = os.path.join("images", character, "attack_modifiers")
modifiers = [os.path.join(modifiers_path, m) for m in os.listdir(modifiers_path)]

# Update for if the modifier needs a reshuffle (natural whiff or double damage)
modifiers = [{"card": m, "reshuffle": "x2" in m or "x0" in m} for m in modifiers]

with open("flips.json", "w") as file:
    json.dump(modifiers, file, indent=4)
