import sys
from playwright.sync_api import sync_playwright

n_players = int(sys.argv[1])
viewport = {"width": 390, "height": 844} if sys.argv[2] == "mobile" else {"width": 1280, "height": 800}
trials = int(sys.argv[3]) if len(sys.argv) > 3 else 5

def check_once(page):
    page.goto("http://localhost:8826/index.html")
    page.wait_for_timeout(150)
    page.click(f'[data-group="numPlayers"] [data-value="{n_players}"]')
    page.click('#startBtn')
    page.wait_for_selector('#tableScreen.active', timeout=5000)
    page.wait_for_timeout(2200 if n_players <= 2 else 2600)
    for _ in range(40):
        modal = page.query_selector('.modal:has-text("bid")')
        if modal:
            btns = page.query_selector_all('.modal .prompt-row button')
            if btns:
                page.evaluate('(b) => b.click()', btns[0])
                page.wait_for_timeout(180)
        if page.query_selector('.ledger') and "Contract:" in (page.text_content('.ledger') or ""):
            break
        page.wait_for_timeout(200)
    page.wait_for_timeout(800)
    kitty_modal = page.query_selector('.modal:has-text("The Kitty")')
    if kitty_modal:
        btn_text = page.text_content('.modal-actions .btn')
        need = int(btn_text.split('/')[-1])
        for _ in range(need):
            card = page.query_selector('.mini-card:not(.picked)')
            if card:
                page.evaluate('(c) => c.click()', card)
                page.wait_for_timeout(70)
        page.wait_for_timeout(120)
        page.evaluate('document.querySelector(".modal-actions .btn").click()')
        page.wait_for_timeout(350)
    page.wait_for_timeout(300)

    # check every seat plate against every currently-rendered (opacity!=0) card for bbox overlap
    result = page.evaluate('''() => {
      const seats = Array.from(document.querySelectorAll('.seat'));
      const cards = Array.from(document.querySelectorAll('.card')).filter(c => getComputedStyle(c).opacity !== '0');
      const overlaps = [];
      for (const s of seats) {
        const plate = s.querySelector('.plate');
        const pr = plate.getBoundingClientRect();
        for (const c of cards) {
          const r = c.getBoundingClientRect();
          const ix = Math.max(0, Math.min(pr.right, r.right) - Math.max(pr.left, r.left));
          const iy = Math.max(0, Math.min(pr.bottom, r.bottom) - Math.max(pr.top, r.top));
          const area = ix * iy;
          if (area > 40) {  // small tolerance for shadow/border anti-aliasing
            overlaps.push({ name: plate.querySelector('.name').textContent, cardId: c.dataset.id, area: Math.round(area) });
          }
        }
      }
      return overlaps;
    }''')
    return result

with sync_playwright() as p:
    browser = p.chromium.launch()
    total_overlaps = 0
    for t in range(trials):
        page = browser.new_page(viewport=viewport)
        overlaps = check_once(page)
        if overlaps:
            total_overlaps += len(overlaps)
            print(f"trial {t+1}: OVERLAPS FOUND: {overlaps}")
            page.screenshot(path=f"/home/claude/declare2/overlap_fail_{n_players}p_{sys.argv[2]}_{t+1}.png")
        else:
            print(f"trial {t+1}: clean")
        page.close()
    browser.close()
    print(f"\nTotal overlaps across {trials} trials: {total_overlaps}")
