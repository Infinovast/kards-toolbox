"""Regression coverage for the nine requested 0.2.0 improvements.
Artwork HTTP is mocked; all storage is in an isolated browser context.
"""
import base64, json, re, sys
from pathlib import Path
from urllib.parse import unquote
from select_helpers import select_value
from playwright.sync_api import expect, sync_playwright
sys.stdout.reconfigure(encoding="utf-8")
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "test-results/improvements"
OUT.mkdir(parents=True, exist_ok=True)
cards = json.loads((ROOT / "public/data/cards.json").read_text(encoding="utf-8"))["cards"]
art = (ROOT / "public/assets/headquarters/Britain/alam_el_halfa/headquarter.png").read_bytes()
CODE = "%%31|3X5C6BhHm6qCqDrktFvhwJx5;66nwx0x3;3f4p6x7e7l;5Z"

def store(page, expression, argument=None):
    return page.evaluate("""async arg => {
      const { default: store } = await import('/node_modules/.vite/deps/localforage.js');
      """ + expression + "}" , argument)

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    context = browser.new_context(viewport={"width": 1280, "height": 820})
    page = context.new_page()
    errors = []; page.on("pageerror", lambda error: errors.append(str(error)))
    # Slow deterministic responses make navigation and cancellation observable.
    failing = set()
    def respond(route):
        url = unquote(route.request.url)
        page.wait_for_timeout(25)
        if any(name in url for name in failing): route.fulfill(status=503, body="offline")
        else: route.fulfill(status=200, content_type="image/png", body=art)
    page.route("https://images.weserv.nl/**", respond)
    page.goto("http://127.0.0.1:5173")
    page.wait_for_load_state("networkidle")
    page.get_by_role("button", name="卡牌", exact=True).click()
    expect(page.locator('[data-testid="library-grid"] img').first).to_be_visible()
    page.wait_for_load_state("networkidle")
    grid = page.get_by_test_id("library-grid")
    before = grid.bounding_box()
    grid.get_by_role("button").first.click()
    expect(page.get_by_role("dialog", name="卡牌详情")).to_be_visible()
    assert grid.bounding_box() == before, "details must not reflow the library"
    assert grid.locator("img").first.evaluate("el => getComputedStyle(el).objectFit") == "contain"
    assert grid.locator("img").first.evaluate("el => getComputedStyle(el).borderRadius") == "0px"
    page.keyboard.press("Escape")
    expect(page.get_by_role("dialog", name="卡牌详情")).to_have_count(0)
    # Download 276 filtered cards (not just the visible 36); reject once, then accept.
    select_value(page, "阵营筛选", "Germany")
    dialogs = []
    def reject(dialog): dialogs.append(dialog.message); dialog.dismiss()
    page.on("dialog", reject)
    page.get_by_role("button", name="缓存筛选结果（276 张）", exact=True).click()
    expect(page.get_by_role("region", name="卡图缓存下载进度")).to_have_count(0)
    page.remove_listener("dialog", reject)
    page.on("dialog", lambda dialog: dialog.accept())
    page.get_by_role("button", name="缓存筛选结果（276 张）", exact=True).click()
    panel = page.get_by_role("region", name="卡图缓存下载进度")
    expect(panel).to_be_visible()
    page.get_by_role("button", name="卡组", exact=True).click()
    expect(panel).to_be_visible()
    expect(panel.get_by_text("缓存完成", exact=True)).to_be_visible(timeout=60000)
    german = [c["importId"] for c in cards if c["json"]["faction"] == "Germany"]
    assert store(page, "return (await store.keys()).filter(k => arg.some(id => k === 'kards_card_image_v1_54_zh-Hans_' + id)).length;", german) == 276
    assert "276" in dialogs[0]
    page.screenshot(path=str(OUT / "background-complete.png"))
    panel.get_by_role("button", name="关闭下载进度").click()
    # Language/version snapshot, failures, retry, and all-cache skip.
    page.get_by_role("button", name="卡牌", exact=True).click()
    select_value(page, "阵营筛选", "France")
    select_value(page, "卡牌文字语言", "en-EN")
    failed_card = next(c for c in cards if c["json"]["faction"] == "France")
    failing.add(failed_card["json"]["image"])
    page.wait_for_load_state("networkidle")
    store(page, "await store.removeItem(arg);", 'kards_card_image_v1_54_zh-Hans_' + failed_card["importId"])
    page.get_by_role("button", name="缓存筛选结果（64 张）", exact=True).click()
    expect(panel.get_by_text("缓存完成", exact=True)).to_be_visible(timeout=30000)
    expect(panel.get_by_role("button", name="重试失败卡图")).to_be_visible()
    failing.clear()
    panel.get_by_role("button", name="重试失败卡图").click()
    expect(panel.get_by_text("缓存完成", exact=True)).to_be_visible(timeout=30000)
    expect(panel.get_by_role("button", name="重试失败卡图")).to_have_count(0)
    panel.get_by_role("button", name="关闭下载进度").click()
    page.get_by_role("button", name="缓存筛选结果（64 张）", exact=True).click()
    expect(panel.get_by_text("缓存完成", exact=True)).to_be_visible(timeout=30000)
    expect(panel.get_by_role("status")).to_contain_text("下载 0 · 已缓存 64 · 失败 0")
    panel.get_by_role("button", name="关闭下载进度").click()
    # Cache bundled fixture artwork to exercise both grid sizes offline.
    data = "data:image/png;base64," + base64.b64encode(art).decode()
    seed = {'kards_card_image_v1_54_zh-Hans_' + c["importId"]: data for c in cards[:36]}
    store(page, "await Promise.all(Object.entries(arg).map(([k,v]) => store.setItem(k,v)));", seed)
    page.get_by_role("button", name="重置筛选", exact=True).click()
    select_value(page, "卡牌文字语言", "zh-Hans")
    page.wait_for_load_state("networkidle")
    page.screenshot(path=str(OUT / "library-full.png"))
    page.get_by_role("button", name="卡组", exact=True).click()
    page.get_by_role("button", name="导入新卡组", exact=True).click()
    page.locator('[role="dialog"][aria-modal="true"]').get_by_role("textbox").last.fill(CODE)
    page.get_by_role("button", name="确认导入", exact=True).click()
    page.get_by_role("button", name="编辑卡组", exact=True).click()
    page.get_by_label("导入卡组码", exact=True).fill(CODE)
    page.get_by_label("导入卡组码", exact=True).press("Control+Enter")
    expect(page.get_by_text("40 / 40", exact=True)).to_be_visible()
    # Standard card starts with four solid slots, then one diagonal half slot.
    visible_names = page.get_by_test_id("builder-grid").get_by_role("button").evaluate_all("els => els.map(el => el.getAttribute('aria-label').slice(2))")
    card = next(c for c in cards if c["json"].get("rarity") == "Standard" and c["json"]["title"]["zh-Hans"] in visible_names)
    tile = page.get_by_role("button", name="添加" + card["json"]["title"]["zh-Hans"], exact=True).locator("..")
    before_count = tile.locator('[data-half="true"]').count()
    tile.get_by_role("button").click()
    assert tile.locator('[data-half="true"]').count() == before_count + 1
    assert tile.locator('.rarity-slots > span').count() == 4
    page.screenshot(path=str(OUT / "builder-full.png"))
    page.get_by_label("卡组名称", exact=True).fill("Interactive preview")
    page.get_by_label("卡组名称", exact=True).press("Enter")
    expect(page.get_by_label("管理卡组名称", exact=True)).to_have_value("Interactive preview")
    saved = page.get_by_role("button", name="选择卡组 Interactive preview", exact=True)
    saved.click()
    expect(page.get_by_role("list", name="卡组紧凑列表")).to_be_visible()
    assert page.get_by_role("list", name="卡组紧凑列表").get_by_role("listitem").count() > 10
    page.screenshot(path=str(OUT / "deck-preview.png"))
    saved.dblclick()
    expect(page.get_by_role("heading", name="编辑卡组", exact=True)).to_be_visible()
    # All modal panels expose frosted glass, Escape, and focus restoration.
    settings = page.get_by_role("button", name="设置", exact=True)
    settings.click()
    expect(page.get_by_test_id("settings-page")).to_be_visible()
    expect(page.locator('[role="dialog"][aria-modal="true"]')).to_have_count(0)
    page.keyboard.press("Escape")
    expect(page.locator('[role="dialog"][aria-modal="true"]')).to_have_count(0)
    expect(settings).to_be_focused()
    page.get_by_role("button", name="卡组", exact=True).click()
    page.get_by_role("button", name="导入新卡组", exact=True).click()
    modal = page.locator('[role="dialog"][aria-modal="true"]').last
    modal.get_by_role("textbox").last.fill("%%12|ZZ;;;")
    modal.get_by_role("textbox").last.press("Control+Enter")
    expect(page.locator('[role="dialog"][aria-modal="true"]')).to_have_count(0)
    # Wallpaper spans the entire work area including both sidebars.
    store(page, "await store.setItem('kards_selected_tablecloth', '/assets/tablecloths/tablecloth (1).jpeg');")
    page.reload(); page.wait_for_load_state("networkidle")
    work = page.get_by_test_id("workspace")
    assert "tablecloth" in work.evaluate("el => getComputedStyle(el).backgroundImage")
    assert work.bounding_box()["width"] == 1280
    assert work.locator(":scope > aside").first.evaluate("el => getComputedStyle(el).backdropFilter") != "none"
    page.screenshot(path=str(OUT / "wallpaper-sidebar.png"))
    assert not errors, errors
    (OUT / "result.json").write_text(json.dumps({"status":"passed", "checks":["full filtered download", "large confirmation", "cross-page completion", "cache skip", "single Chinese image cache", "failure retry", "full artwork", "overlay no reflow", "rarity slots", "single/double click", "Enter/Escape", "focus restoration", "wallpaper and glass"], "pageErrors":errors}, ensure_ascii=False, indent=2), encoding="utf-8")
    context.close(); browser.close()
    print("0.2.0 improvement smoke passed")
