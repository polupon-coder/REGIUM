# REGIUM — Rules

Card game for 2 to 5 players. Each player is the regent of a kingdom and races to build
**7 cities** before anyone else. This is the English translation of docs/REGLAMENTO.md (the Spanish
rulebook is the source of truth); it includes the author's clarifications.

## Components

| Component | Quantity |
|---|---|
| Regents (portrait, with a wooden shield on the back) | 5, one per kingdom |
| Troops (values 1 to 10) | 50, ten per kingdom |
| Lands (territory on one side, city on the other) | 35, seven per kingdom |

Kingdoms: **Red** (dragon), **Green** (eagle), **Yellow** (serpent), **Blue** (horned skull) and
**Purple** (elephant). Only the troops of the kingdoms in play are used.

On the table, players tracked the current war and their bid with scroll markers; in the digital
version the screen always shows them.

## Setup

- Each player chooses a kingdom and starts with **1 territory** in play. Their other 6 lands are their reserve.
- The first **Emperor** is chosen by lot. In each following war the throne passes to the player on the left.
- The troops of the Emperor's kingdom are **imperial** during that war: they are trumps.

## The wars

The game has 10 wars. The 1st has 1 battle, the 2nd 2 battles… and the 10th, 10 battles. In each war every player is dealt as many troops as there are battles.

### 1. Strategy (bid)

Starting with the Emperor and going left, each player announces how many battles they will win
(from 0 to the number of battles). Anyone may bid whatever they like.

### 2. Battles

- The Emperor leads the first battle; whoever wins a battle leads the next.
- The leader plays any troop. The others, in order:
  - Must play a troop of the **leading kingdom** and, **whenever they can, beat** the one currently winning.
    If an imperial is already winning (and the leading kingdom is not the imperial one), any troop of the leading kingdom will do.
  - If they have none of the leading kingdom, they must play an **imperial**, beating the winning imperial if they can.
  - If they have neither the leading kingdom nor imperials, they play any troop (and lose).
- The highest imperial wins the battle; if there are no imperials, the highest troop of the leading kingdom.

### 3. Result

Resolved in order, starting with the Emperor. Whoever **meets** their bid:

1. Gains **1 territory** (from their reserve, if any is left). Bidding 0 and meeting it also counts.
2. May use their **victories** (battles won), in any combination:
   - **1 victory**: turn one of their territories into a city (including the one just gained).
   - **1 victory**: raze a rival's city, which becomes a territory again.
   - **2 victories**: conquer a rival's territory, which goes back to their reserve.

Victories that cannot or are not used are lost. Whoever **misses** their bid gains nothing.

## End

- Whoever builds their **7th city** wins at that very moment (even if others have not resolved yet).
- If nobody does by the end of the 10th war, whoever has the most cities wins; on a tie, whoever has
  the most territories. If still tied, they share the victory.

## Digital modes

- **Online**: each player on their own device; share the game link. Free kingdoms can be
  taken by bots.
- **Play here**: against bots, taking turns among several people on the same device
  (the screen is hidden when the turn passes so nobody sees the others' cards), or mixing both.
- **Bots**: two levels, easy and hard (switch by tapping their regent while setting up the game). The hard bot imagines possible deals of the cards it cannot see (it never looks at other players' cards) to choose its strategy and each troop; when spending victories it builds cities and holds back whoever is close to winning. The easy bot calculates less and sometimes makes mistakes.
