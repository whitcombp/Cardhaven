import random

attack_modifiers = [
    "Natural whiff"
    ,"-2"
    ,*["-1"] * 5
    ,*["+0"] * 6
    ,*["+1"] * 5
    ,"+2"
    ,"Double damage"
]
drawn_modifiers = []
def reshuffle():
    attack_modifiers.extend(drawn_modifiers)
    drawn_modifiers.clear()
def draw_modifier():
    card = attack_modifiers.pop(random.randint(0, len(attack_modifiers) - 1))
    if card != 'Curse' and card != 'Bless':
        drawn_modifiers.append(card)
    if card == 'Natural whiff' or card == 'Double damage':
        reshuffle()
    return card

user_input = ""
while "q" not in user_input:
    user_input = input("Press Q to (Q)uit, B to (B)less, C to (C)urse, R to (R)eshuffle, or P to (P)rint deck\n"\
          "Press any other key to flip! ").strip().lower()
    if "b" in user_input:
        attack_modifiers.append("Bless")
        reshuffle()
    elif "c" in user_input:
        attack_modifiers.append("Curse")
        reshuffle()
    elif "r" in user_input:
        reshuffle()
    elif "p" in user_input:
        print(attack_modifiers)
    elif "q" not in user_input:
        print(draw_modifier())
    
