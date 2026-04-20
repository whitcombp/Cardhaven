from flask import Flask, send_from_directory, jsonify, request
import os
import json
import sys

app = Flask(__name__, static_folder=".", static_url_path="")

# ===============================
# STATIC FILES
# ===============================


@app.route("/")
def index():
    return send_from_directory(".", "index.html")


@app.route("/card_pages/<path:filename>")
def card_pages(filename):
    return send_from_directory("card_pages", filename)


@app.route("/images/<path:filename>")
def images(filename):
    return send_from_directory("images", filename)


# ===============================
# API ROUTES
# ===============================


@app.route("/characters")
def characters():
    path = os.path.join("images", "character_images")
    chars = [d for d in os.listdir(path) if os.path.isdir(os.path.join(path, d))]
    return jsonify(sorted(chars))


@app.route("/cards")
def cards():
    character = request.args.get("character", "plagueherald")

    favorites = set()
    if os.path.exists("favorites.txt"):
        with open("favorites.txt", "r") as f:
            [favorites.add(line.strip().lower()) for line in f]

    path = os.path.join("images", "character_images", character, "ability_cards")
    cards_json = []

    dir_walk = os.walk(path)
    levels = next(dir_walk)[1]
    for dir, level in zip(dir_walk, levels):
        for filename in dir[2]:
            name = filename.split(".")[0].replace("-", " ")
            cards_json.append(
                {
                    "filename": os.path.join(dir[0], filename).replace("\\", "/"),
                    "name": name + level,
                    "level": level,
                    "favorite": name in favorites,
                }
            )

    return jsonify(cards_json)


@app.route("/flips")
def flips():
    character = request.args.get("character", "plagueherald")

    modifiers_path = os.path.join(
        "images", "character_images", character, "attack_modifiers"
    )
    modifiers = [
        os.path.join(modifiers_path, m).replace("\\", "/")
        for m in os.listdir(modifiers_path)
    ]
    flips_json = [{"card": m, "reshuffle": "x2" in m or "x0" in m} for m in modifiers]

    return jsonify(flips_json)


@app.route("/flip_deck")
def flip_deck():
    return send_from_directory("flip_deck", "index.html")


@app.route("/flip_deck/<path:filename>")
def flip_deck_static(filename):
    return send_from_directory("flip_deck", filename)


# ===============================
# INIT
# ===============================

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=False)
