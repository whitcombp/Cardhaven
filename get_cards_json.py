import os
import json

character = 'doomstalker'

cards_json = []

path = os.path.join('images', character, 'ability_cards')
dir_walk = os.walk(path) # dirpath (str), dirnames (list), filenames (list)
levels = next(dir_walk)[1]
for dir, level in zip(dir_walk, levels):
    for filename in dir[2]:
        card = {
            "filename" : os.path.join(dir[0], filename), # full file name
            "name" : filename
                .split('.')[0] # drop file type
                .replace('-', ' ') # remove path name hyphens 
                .__add__(level) # add for level filtering
                ,
            "level" : level
        }
        cards_json.append(card)

with open("cards.json", 'w') as file:
    json.dump(
        cards_json,
        file,
        indent=4
    )

