const { JSDOM } = require('jsdom');
const fs = require('fs');

const html = fs.readFileSync('index.html', 'utf8');
let code = fs.readFileSync('game.js', 'utf8');

// Test-only patches: instant timers via built-in simMode, all seats AI-driven, export internals, instrument play.
code = code.replace(
  "let simMode = false;",
  "let simMode = true;"
);
code = code.replace("isHuman: true,", "isHuman: false,");
code = code.replace(
  "applyScores(results);",
  "applyScores(results); window.__roundLog = window.__roundLog || []; window.__roundLog.push({round: game.round, bid: game.contractBid, made: results.made, tricksSum: game.players.reduce((s,p)=>s+p.tricksWonCount,0), declarerIndex: game.declarerIndex, discardCount: game.discardPile.length, numPlayers: game.players.length});"
);
code = code.replace(
  "game.currentTrick = { leaderIndex: leader, leadSuit: null, plays: [] };\n    update();\n    await sleep(200);",
  "game.currentTrick = { leaderIndex: leader, leadSuit: null, plays: [] };\n    if (t === 0) { window.__firstLeaderLog = window.__firstLeaderLog || []; window.__firstLeaderLog.push({ round: game.round, leader, declarerIndex: game.declarerIndex, numPlayers: game.players.length, firstLeader: game.config.firstLeader }); }\n    update();\n    await sleep(200);"
);
code = code.replace(
  "        card = aiChooseCard(player, legal);\n      }\n      player.hand = player.hand.filter((c) => c.id !== card.id);",
  "        card = aiChooseCard(player, legal);\n      }\n      window.__playLog = window.__playLog || [];\n      window.__playLog.push({ legalIds: legal.map(c=>c.id), playedId: card.id, isLead: game.currentTrick.plays.length===0, trumpBreakingEnabled: !!game.config.trumpBreaking, trumpBrokenAtTime: game.trumpBroken, trumpSuit: game.trumpSuit, cardSuit: card.suit });\n      player.hand = player.hand.filter((c) => c.id !== card.id);"
);
code += `
window.__test = {
  startGame, game, buildDeck, shuffled, scaleValue, getLegalMoves, getTrickWinner,
  cardPower, estimateHandStrength, checkEndCondition, computeRoundScoring, ALL_CARDS, SUITS, BOT_POOL,
  runMonteCarloBatch, aggregateMonteCarloResults, simulateOneGame
};
`;

// verify every patch above actually took effect (String.replace fails silently otherwise)
if (code.includes('isHuman: true,')) {
  throw new Error('test harness patch failed to apply — human seat still marked isHuman: true');
}
for (const marker of ['let simMode = true;', '__roundLog', '__firstLeaderLog', '__playLog', 'window.__test =']) {
  if (!code.includes(marker)) {
    throw new Error(`test harness patch failed to apply — missing marker: ${marker}`);
  }
}

async function runOne(config, label) {
  const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'http://localhost/' });
  const { window } = dom;

  // auto-click any modal's primary button (round summary / game over / bid) as it appears
  const observer = new window.MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (node.nodeType === 1 && node.classList && node.classList.contains('modal-overlay')) {
          const btn = node.querySelector('.modal-actions .btn:not(:disabled)') || node.querySelector('.prompt-row .btn');
          if (btn) setTimeout(() => btn.dispatchEvent(new window.Event('click', { bubbles: true })), 0);
        }
      }
    }
  });
  observer.observe(window.document.body, { childList: true, subtree: true });

  window.eval(code);
  window.document.dispatchEvent(new window.Event('DOMContentLoaded', { bubbles: true, cancelable: true }));

  const T = window.__test;

  const deck = T.buildDeck();
  console.assert(deck.length === 52, `${label}: deck should have 52 cards`);
  console.assert(new Set(deck.map(c => c.id)).size === 52, `${label}: card ids must be unique`);
  console.assert(T.scaleValue('quadratic', 6) + 1 === 37, `${label}: quadratic success example`);
  console.assert(T.scaleValue('triangular', 6) === 21, `${label}: triangular failure example`);

  await T.startGame(config);

  const g = T.game;
  let ok = true;
  const errors = [];
  if (!g.gameOver) { ok = false; errors.push('game did not end'); }
  for (const p of g.players) {
    if (typeof p.score !== 'number' || Number.isNaN(p.score)) { ok = false; errors.push(`bad score for ${p.name}`); }
  }
  if (config.endMode === 'rounds' && g.round !== config.numRounds) {
    ok = false; errors.push(`expected round to stop at ${config.numRounds}, got ${g.round}`);
  }
  if (config.endMode === 'score' && !g.players.some(p => p.score >= config.targetScore)) {
    ok = false; errors.push('score endMode ended without reaching target');
  }

  // bot roster: distinct personalities, aggression present
  const aiPlayers = g.players.filter(p => p.index !== 0);
  const names = new Set(aiPlayers.map(p => p.name));
  if (names.size !== aiPlayers.length) { ok = false; errors.push('duplicate bot personalities in one game'); }
  for (const p of aiPlayers) {
    if (typeof p.aggression !== 'number') { ok = false; errors.push(`bot ${p.name} missing aggression`); }
  }

  const roundLog = window.__roundLog || [];
  for (const r of roundLog) {
    if (r.tricksSum !== 12) { ok = false; errors.push(`round ${r.round}: tricks summed to ${r.tricksSum}, expected 12`); }
    if (r.bid < 1 || r.bid > 12) { ok = false; errors.push(`round ${r.round}: bid ${r.bid} out of range`); }
    const expectedKitty = r.numPlayers;
    if (r.discardCount !== expectedKitty) { ok = false; errors.push(`round ${r.round}: discard/kitty count ${r.discardCount}, expected ${expectedKitty} for ${r.numPlayers} players`); }
  }
  if (roundLog.length === 0) { ok = false; errors.push('no rounds were logged'); }

  const madeCount = roundLog.filter(r => r.made).length;
  const madeRate = roundLog.length ? (madeCount / roundLog.length) : 0;

  const leaderLog = window.__firstLeaderLog || [];
  for (const l of leaderLog) {
    const expected = l.firstLeader === 'left' ? (l.declarerIndex + 1) % l.numPlayers : l.declarerIndex;
    if (l.leader !== expected) { ok = false; errors.push(`round ${l.round}: first trick led by ${l.leader}, expected ${expected} (firstLeader=${l.firstLeader})`); }
  }
  if (leaderLog.length === 0) { ok = false; errors.push('no first-trick leader entries were logged'); }

  // every play must come from the legal set computed for that turn (general correctness net)
  const playLog = window.__playLog || [];
  let illegalPlays = 0, illegalTrumpLeads = 0;
  const cardById = id => T.ALL_CARDS.find(c => c.id === id);
  for (const p of playLog) {
    if (!p.legalIds.includes(p.playedId)) illegalPlays++;
    if (p.isLead && p.trumpBreakingEnabled && !p.trumpBrokenAtTime && p.cardSuit === p.trumpSuit) {
      // only legal if every option in the legal set was also trump (forced, hand was all-trump)
      const allTrump = p.legalIds.every(id => cardById(id).suit === p.trumpSuit);
      if (!allTrump) illegalTrumpLeads++;
    }
  }
  if (illegalPlays > 0) { ok = false; errors.push(`${illegalPlays} plays were not in their computed legal set`); }
  if (illegalTrumpLeads > 0) { ok = false; errors.push(`${illegalTrumpLeads} leads broke the trump-breaking rule`); }
  if (playLog.length === 0) { ok = false; errors.push('no plays were logged'); }

  // scoreHistory should have one entry per completed round, consistent with roundLog
  if (g.scoreHistory.length !== roundLog.length) {
    ok = false; errors.push(`scoreHistory has ${g.scoreHistory.length} entries, expected ${roundLog.length}`);
  } else {
    for (let i = 0; i < roundLog.length; i++) {
      if (g.scoreHistory[i].bid !== roundLog[i].bid || g.scoreHistory[i].made !== roundLog[i].made) {
        ok = false; errors.push(`scoreHistory[${i}] doesn't match roundLog[${i}]`);
      }
    }
  }

  console.log(`[${label}] ${ok ? 'PASS' : 'FAIL'} — rounds: ${g.round}, made-rate: ${(madeRate*100).toFixed(0)}%, avg bid: ${(roundLog.reduce((s,r)=>s+r.bid,0)/Math.max(roundLog.length,1)).toFixed(1)}, scores: ${g.players.map(p => p.name + '=' + p.score).join(', ')}`);
  if (!ok) console.log('   errors:', errors);
  observer.disconnect();
  return ok;
}

(async () => {
  // ---- pure unit tests for rule-critical functions ----
  {
    const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'http://localhost/' });
    const { window } = dom;
    window.eval(code);
    window.document.dispatchEvent(new window.Event('DOMContentLoaded', { bubbles: true, cancelable: true }));
    const T = window.__test;
    const c = (id) => T.ALL_CARDS.find((x) => x.id === id);

    let hand = [c('H2'), c('H9'), c('SA')];
    let trick = { leadSuit: 'hearts', plays: [{ playerIndex: 1, card: c('HK') }] };
    let legal = T.getLegalMoves(hand, trick, 'clubs', false, false);
    console.assert(legal.length === 2 && legal.every((x) => x.suit === 'hearts'), 'must follow suit when holding it');

    hand = [c('SA'), c('C5'), c('D9')];
    trick = { leadSuit: 'hearts', plays: [{ playerIndex: 1, card: c('HK') }] };
    legal = T.getLegalMoves(hand, trick, 'clubs', false, false);
    console.assert(legal.length === 3, 'may play any card when void in led suit');

    trick = { leadSuit: 'hearts', plays: [{ playerIndex: 0, card: c('HA') }, { playerIndex: 1, card: c('C2') }] };
    console.assert(T.getTrickWinner(trick, 'clubs') === 1, 'trump should beat led-suit ace');

    trick = { leadSuit: 'hearts', plays: [{ playerIndex: 0, card: c('H9') }, { playerIndex: 1, card: c('HK') }, { playerIndex: 2, card: c('D5') }] };
    console.assert(T.getTrickWinner(trick, 'clubs') === 1, 'highest of led suit should win with no trump in trick');

    trick = { leadSuit: 'clubs', plays: [{ playerIndex: 0, card: c('C4') }, { playerIndex: 1, card: c('CK') }, { playerIndex: 2, card: c('CA') }] };
    console.assert(T.getTrickWinner(trick, 'clubs') === 2, 'higher trump should win among trumps');

    // trump-breaking: leading trump not allowed until broken (unless forced)
    hand = [c('CA'), c('C5'), c('D9')];
    trick = { leadSuit: null, plays: [] };
    legal = T.getLegalMoves(hand, trick, 'clubs', false, true); // trump=clubs, not broken, breaking enabled
    console.assert(legal.length === 1 && legal[0].id === 'D9', `trump-breaking should exclude trump leads, got ${legal.map(c=>c.id)}`);

    // trump-breaking: once broken, trump lead is fine
    legal = T.getLegalMoves(hand, trick, 'clubs', true, true);
    console.assert(legal.length === 3, 'trump lead allowed once broken');

    // trump-breaking: forced to lead trump when hand is all-trump
    hand = [c('CA'), c('C5')];
    legal = T.getLegalMoves(hand, trick, 'clubs', false, true);
    console.assert(legal.length === 2, 'forced trump lead when hand has no side suits');

    // trump-breaking disabled: trump lead always fine
    hand = [c('CA'), c('C5'), c('D9')];
    legal = T.getLegalMoves(hand, trick, 'clubs', false, false);
    console.assert(legal.length === 3, 'trump lead allowed when breaking rule is off');

    // bot roster sanity
    console.assert(T.BOT_POOL.length >= 6, `expected a roster of several bots, got ${T.BOT_POOL.length}`);
    console.assert(new Set(T.BOT_POOL.map(b => b.name)).size === T.BOT_POOL.length, 'bot names must be unique');
    console.assert(T.BOT_POOL.every(b => typeof b.aggression === 'number'), 'every bot needs an aggression number');

    console.log('[unit tests] done (see any assertion failures above)');
  }

  // ---- scoring multiplier formula check (independent made/fail multipliers) ----
  {
    const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'http://localhost/' });
    const { window } = dom;
    window.eval(code);
    window.document.dispatchEvent(new window.Event('DOMContentLoaded', { bubbles: true, cancelable: true }));
    const T = window.__test;
    T.game.config = { successScale: 'linear', failScale: 'linear', successMultiplier: 3, failMultiplier: 2, defenderMode: 'always' };
    T.game.players = [
      { tricksWonCount: 6, score: 0 },
      { tricksWonCount: 3, score: 0 },
      { tricksWonCount: 3, score: 0 },
    ];
    T.game.declarerIndex = 0;
    T.game.contractBid = 5;
    // made: 6 tricks vs bid 5 -> 1 overtrick. score = madeMult(3) * linear(5) + 1 = 16
    let r = T.computeRoundScoring();
    console.assert(r.perPlayer[0].delta === 16, `independent multiplier success case expected 16, got ${r.perPlayer[0].delta}`);
    console.log(`[multiplier] made 6/5 linear x3(made) -> ${r.perPlayer[0].delta} (expect 16)`);

    T.game.players[0].tricksWonCount = 4; // fails a bid of 5
    r = T.computeRoundScoring();
    // fail: -failMult(2) * linear(5) = -10
    console.assert(r.perPlayer[0].delta === -10, `independent multiplier failure case expected -10, got ${r.perPlayer[0].delta}`);
    console.log(`[multiplier] failed 4/5 linear x2(fail) -> ${r.perPlayer[0].delta} (expect -10, independent of made x3)`);
  }

  // ---- Monte Carlo engine: correctness + performance ----
  let mcOk = true;
  {
    const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'http://localhost/' });
    const { window } = dom;
    window.eval(code);
    window.document.dispatchEvent(new window.Event('DOMContentLoaded', { bubbles: true, cancelable: true }));
    const T = window.__test;

    const mcConfig = { numPlayers: 4, kittyOpen: false, firstLeader: 'declarer', trumpBreaking: false, successScale: 'quadratic', failScale: 'triangular', successMultiplier: 1, failMultiplier: 1, defenderMode: 'always', endMode: 'rounds', numRounds: 6, targetScore: 100 };
    const botNames = ['Marlowe', 'Odette', 'Judge', 'Rowdy Rhea'];
    const numGames = 80;
    const t0 = Date.now();
    let lastProgress = 0;
    const results = await T.runMonteCarloBatch(mcConfig, botNames, numGames, (done) => { lastProgress = done; });
    const elapsed = Date.now() - t0;
    console.log(`[montecarlo] ${numGames} games in ${elapsed}ms (${(elapsed / numGames).toFixed(1)}ms/game)`);

    if (results.length !== numGames) { mcOk = false; console.log(`  expected ${numGames} results, got ${results.length}`); }
    if (lastProgress !== numGames) { mcOk = false; console.log(`  progress callback stalled at ${lastProgress}`); }
    if (elapsed > 30000) { mcOk = false; console.log(`  too slow: ${elapsed}ms for ${numGames} games`); }

    for (const g of results) {
      const names = g.finalScores.map((p) => p.name).sort();
      if (JSON.stringify(names) !== JSON.stringify(botNames.slice().sort())) { mcOk = false; console.log('  player set mismatch', names); }
      for (const p of g.finalScores) if (typeof p.score !== 'number' || Number.isNaN(p.score)) { mcOk = false; console.log('  bad score', p); }
      if (g.rounds.length !== mcConfig.numRounds) { mcOk = false; console.log(`  expected ${mcConfig.numRounds} rounds, got ${g.rounds.length}`); }
      for (const r of g.rounds) {
        if (!botNames.includes(r.declarerName)) { mcOk = false; console.log('  unknown declarer', r.declarerName); }
        if (r.bid < 1 || r.bid > 12) { mcOk = false; console.log('  bid out of range', r.bid); }
      }
    }

    const stats = T.aggregateMonteCarloResults(botNames, results);
    if (stats.length !== 4) { mcOk = false; console.log(`  expected 4 bot stats, got ${stats.length}`); }
    let totalWins = 0;
    for (const s of stats) {
      if (s.gamesPlayed !== numGames) { mcOk = false; console.log(`  ${s.name} gamesPlayed=${s.gamesPlayed}, expected ${numGames}`); }
      totalWins += s.wins;
      const bucketGamesSum = Object.values(s.declarerBuckets).reduce((sum, b) => sum + b.games, 0);
      if (bucketGamesSum !== numGames) { mcOk = false; console.log(`  ${s.name} declarer-bucket games sum ${bucketGamesSum} != ${numGames}`); }
      for (const [amt, h] of Object.entries(s.bidHistogram)) {
        if (h.made + h.failed !== h.count) { mcOk = false; console.log(`  ${s.name} bid ${amt}: made+failed != count`); }
      }
    }
    if (totalWins < numGames) { mcOk = false; console.log(`  total wins ${totalWins} < numGames ${numGames} (ties should only ever add, never subtract)`); }

    console.log(`[montecarlo] ${mcOk ? 'PASS' : 'FAIL'}`);
  }

  const configs = [
    { numPlayers: 4, kittyOpen: false, firstLeader: 'declarer', trumpBreaking: false, successScale: 'quadratic', failScale: 'triangular', successMultiplier: 1, failMultiplier: 1, defenderMode: 'always', endMode: 'rounds', numRounds: 4, targetScore: 100 },
    { numPlayers: 2, kittyOpen: true, firstLeader: 'left', trumpBreaking: true, successScale: 'linear', failScale: 'linear', successMultiplier: 2, failMultiplier: 3, defenderMode: 'none', endMode: 'rounds', numRounds: 3, targetScore: 100 },
    { numPlayers: 3, kittyOpen: false, firstLeader: 'declarer', trumpBreaking: true, successScale: 'triangular', failScale: 'quadratic', successMultiplier: 1, failMultiplier: 4, defenderMode: 'onFailOnly', endMode: 'score', numRounds: 8, targetScore: 40 },
    { numPlayers: 4, kittyOpen: true, firstLeader: 'left', trumpBreaking: false, successScale: 'quadratic', failScale: 'triangular', successMultiplier: 5, failMultiplier: 1, defenderMode: 'always', endMode: 'score', numRounds: 8, targetScore: 50 },
  ];
  let allOk = mcOk;
  for (let i = 0; i < configs.length; i++) {
    try {
      const ok = await runOne(configs[i], `config${i + 1}`);
      allOk = allOk && ok;
    } catch (e) {
      allOk = false;
      console.error(`[config${i + 1}] THREW:`, e);
    }
  }
  console.log(allOk ? '\nALL TESTS PASSED' : '\nSOME TESTS FAILED');
  process.exit(allOk ? 0 : 1);
})();
