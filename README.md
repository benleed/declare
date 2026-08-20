# Declare

A modern take on a classic trick-taking card game. Play against computer opponents in this engaging 2–4 player bidding and trick-taking game with customizable rules.

## Overview

**Declare** is a bidding trick-taking card game where players compete to win enough tricks to make their bid. The player who wins the bidding becomes the declarer and plays alone against the defenders. Scoring is based on how many tricks the declarer takes relative to their bid.

- **Players:** 2–4 (you + computer opponents)
- **Cards:** Standard 52-card deck
- **Deck Colors:** Spades (black), Hearts (red), Diamonds (blue), Clubs (green)
- **Hand Size:** 12 cards per player
- **Tricks per Round:** 12
- **Kitty Size:** 1 card per player (2–4 cards depending on player count)

## How to Play

### Setup & Deal

1. Each player receives 12 cards dealt one at a time
2. A kitty (N cards, where N = player count) is dealt face-down in the center
3. Each player examines their hand

### Bidding (Auction)

1. Players bid on how many tricks they can win, starting from 1 and going up to 12
2. Bids must strictly increase (each new bid must be higher than the previous)
3. Players can pass to exit the bidding
4. A forced bid ensures someone always opens if bidding gets down to one active player
5. The highest bidder becomes the **declarer** and must win at least their bid amount

**Bidding Tips:**
- Computer opponents bid based on their hand strength and a personality-based aggression level
- Higher bids score more but are harder to make
- You must make your bid to score points; falling short results in a penalty

### Kitty Exchange (Declarer Only)

After bidding ends:

1. The declarer exchanges with the kitty:
   - Picks up all N kitty cards
   - Chooses N cards to discard back
2. The declarer then **chooses the trump suit**
3. Cards from the kitty are highlighted so you can easily identify which ones you picked up

### Trick Play

1. The declarer leads the first trick (or left of declarer, depending on settings)
2. Players play one card per trick in turn order
3. **Follow-suit rule:** If you can follow the led suit, you must. Otherwise, play any card
4. **Trump rule:** Trump beats any other suit. If multiple trumps are played, the highest trump wins
5. The player who plays the highest card of the led suit (or highest trump) wins the trick
6. The trick winner leads the next trick

**Trump-Breaking Rule** (optional):
- If enabled, the trump suit cannot be led until it has been played in an earlier trick
- Exception: You may lead trump if it's the only suit you have left

### Scoring

#### Declarer's Score

**If contract is made (tricks won ≥ bid):**
```
score = (success_scale(bid) × success_multiplier) + overtricks
```

**If contract fails (tricks won < bid):**
```
score = -(failure_scale(bid) × failure_multiplier)
```

**Scoring Scales:**
- **Linear:** scale(n) = n
- **Triangular:** scale(n) = n(n+1)/2
- **Quadratic:** scale(n) = n²

**Examples (Quadratic/Triangular, 1× multiplier):**
- Bid 6, win 7 tricks → 6² + 1 overtrick = **37 points**
- Bid 6, win 5 tricks → -6(7)/2 = **-21 points**

**Special 2-Player Adjustment:**
- When playing with 2 players and quadratic success scoring, the bid is reduced by 2 for scoring purposes to flatten the curve (since 2-player bids tend to be higher)

#### Defenders' Score

Depending on the "Defenders' Points" setting:
- **Always:** Each defender scores 1 point per trick won
- **Only if Declarer Fails:** Defenders only score if the contract fails
- **Never:** Defenders don't score

### End of Round

1. All tricks are played and scored
2. The winner of each trick is recorded with their score delta
3. Round summary shows each player's role, tricks won, and point change

### Game End

The game ends when either:
- A set number of rounds are completed (configurable: 3–24)
- A target score is reached (configurable: 20–400)

Players are ranked by final score, highest first.

## Game Features

### Computer Opponents

Eight distinct bot personalities, each with a unique bidding strategy:

| Bot | Personality | Aggression |
|-----|-------------|-----------|
| Old Man Fitz | Timid | 0.78× |
| Marlowe | Cautious | 0.88× |
| Steady Sam | Steady | 0.96× |
| Odette | Balanced | 1.04× |
| Prof. Byte | Calculated | 1.10× |
| Judge | Confident | 1.16× |
| Countess Vale | Bold | 1.24× |
| Reckless Rhea | Reckless | 1.34× |

Each game randomly selects distinct bots based on player count. Their bidding aggression is factored into their bid estimation, accounting for hand strength and expected kitty improvement.

### Customizable Rules

**Core Options:**
- Number of players (2, 3, or 4)
- Open or concealed kitty
- Declarer leads first, or left of declarer leads first
- Whether trump must be broken before it can be led

**Scoring Options:**
- Success and failure scales (Linear, Triangular, or Quadratic) — independently configurable
- Success and failure multipliers (1–10×) — independently configurable
- Defenders' points (Always, Only on Declarer Failure, or Never)

**Game Length:**
- Fixed number of rounds (3–24)
- Play until a target score is reached (20–400)

### Statistics & History

- **Scoreboard Drawer:** Live score updates, current rules summary, and bot roster showing which personalities are playing
- **Round History Table:** Complete log of every round, showing each player's score delta, with the declarer marked with a ★
- **Game-Over Summary:** Final rankings with the full round-by-round history

### Responsive Design

- **Desktop:** Arced card fan layout for elegant play
- **Mobile/Portrait:** Flat horizontal hand layout for cramped screens (≤720px wide)
- All features accessible on phones and tablets

## Playing Tips

### Bidding Strategy

- **Conservative:** Bid only what you're confident you can make
- **Aggressive:** Higher bids score exponentially more but require more tricks
- **Kitty accounting:** Remember you get to pick N cards from the kitty—factor in the upgrade when estimating your bid
- **Mid-range sweet spot:** Bids around 6–8 tend to be safer than extreme highs or lows

### Trick Play

- **Count your winners:** Know which cards will likely win tricks before play starts
- **Preserve your control:** Save high cards for later tricks when opponents have discarded
- **Trump sparingly:** Use trump only when necessary to win a critical trick
- **Watch the discard:** Track what others have thrown away to infer their remaining cards

### Multiplier Strategy

- **Conservative scoring:** 1–2× multipliers reward solid, steady play
- **Aggressive scoring:** 3–5× or higher multipliers reward risk-taking and bold contracts
- **Asymmetric scaling:** Higher failure multiplier (e.g., 2× fail, 1× made) punishes failed contracts more

## Files

- **declare.html** – Complete, self-contained game (single file, no external dependencies)
- **game.js** – Core game engine (deal, auction, play, scoring, AI)
- **styles.css** – Visual design (emerald felt table, brass accents, card styling)
- **index.html** – HTML structure and setup screen
- **test.js** – Automated test suite (jsdom + Playwright integration tests)

## Technical

### Technology Stack

- **Frontend:** Vanilla JavaScript (no frameworks)
- **Engine:** Custom store + render architecture
- **Card Layout:** Computed positioning with CSS transitions for smooth animation
- **AI:** Heuristic-based hand evaluation and decision-making

### Browser Support

- Modern browsers (Chrome, Firefox, Safari, Edge)
- Desktop and mobile (responsive design)
- No external dependencies—everything is contained in a single HTML file

## Development

To modify or extend the game:

1. Edit `game.js` for game logic
2. Edit `styles.css` for visuals
3. Edit `index.html` for UI structure
4. Run `node test.js` to verify logic changes
5. Run Playwright QA tests for visual verification (see test scripts in repo)

### Running Tests

```bash
node test.js      # Run all automated tests (jsdom harness)
```

Tests verify:
- Core rules (follow-suit, trump logic, card validity)
- Scoring formulas (linear/triangular/quadratic with multipliers)
- Trump-breaking enforcement
- First-leader logic
- Bid range and kitty sizing
- Bot distinct personalities

## License

Open source. Feel free to use, modify, and share.

## Enjoy!

Whether you're a casual card player or a seasoned strategist, **Declare** offers endless variations through its customizable rules. Adjust the scoring, select your favorite opponent personalities, and find the perfect game balance for your style of play.

Good luck against the bots—and may your bids be bold and your trump management flawless! ♠️ ♥️ ♦️ ♣️
