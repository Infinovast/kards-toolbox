"""Deterministic browser coverage for manual card-data preview, apply and rollback."""
import copy
import json
import sys
from pathlib import Path
from playwright.sync_api import expect, sync_playwright

sys.stdout.reconfigure(encoding="utf-8")
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "test-results/card-sync"
OUT.mkdir(parents=True, exist_ok=True)
KEY = "kards_card_database_v1"
records = json.loads((ROOT / "public/data/cards-v54.json").read_text(encoding="utf-8"))["cards"]
baseline = copy.deepcopy(records[:6])
remote = copy.deepcopy(baseline)
remote[0]["json"]["kredits"] += 1
remote[0]["json"]["title"]["zh-Hans"] += "（更新测试）"
remote[0]["json"]["text"]["en-EN"] = "Changed English rules for the sync fixture."
remote[0]["reserved"] = True
remote[-1] = copy.deepcopy(records[6])


def store(page, expression, value=None):
    return page.evaluate("""async value => {
      const {default: store} = await import('/node_modules/.vite/deps/localforage.js');
      """ + expression + "}", value)


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    context = browser.new_context(viewport={"width": 1280, "height": 820})
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    mode = ["ok"]
    requests = []
    held_routes = []

    def api(route):
        request = route.request.post_data_json
        requests.append(request)
        assert request["variables"]["showReserved"] and request["variables"]["showExiles"] and request["variables"]["showSpawnables"]
        assert "image(" not in request["query"]
        if mode[0] == "error":
            route.fulfill(status=503, body="offline")
        elif mode[0] == "malformed":
            route.fulfill(json={"errors": [{"message": "fixture GraphQL failure"}]})
        elif mode[0] == "held":
            held_routes.append(route)
        else:
            cards = baseline if mode[0] == "same" else remote
            total = len(cards) + (1 if mode[0] == "partial" else 0)
            route.fulfill(json={"data": {"cards": {"edges": [{"node": c} for c in cards], "pageInfo": {"count": total, "hasNextPage": False}}}})

    def route_request(route):
        if route.request.url == "https://herokuapi.kards.com/graphql":
            api(route)
        elif route.request.url.startswith(("http://127.0.0.1:5173", "ws://127.0.0.1:5173", "data:", "blob:")):
            route.continue_()
        else:
            route.abort()

    page.route("**/*", route_request)
    page.goto("http://127.0.0.1:5173"); page.wait_for_load_state("networkidle")
    # A small real-card fixture replaces only this test's isolated IndexedDB catalogue.
    store(page, "await store.setItem(value.key, value.data);", {"key": KEY, "data": {"schemaVersion": 1, "active": {"source": "bundled", "fetchedAt": None, "cards": baseline}}})
    sentinel = "data:image/png;base64,test-image-cache-preserved"
    store(page, "await store.setItem('kards_card_image_v1_54_zh-Hans_keep', value);", sentinel)
    saved_deck = {"id": "keep", "name": "保留卡组", "code": "%%16|" + baseline[0]["importId"] + ";;;", "mainNation": "Germany", "allyNation": "France", "totalCards": 1, "warnings": [], "isArena": False, "isFavorite": True, "notes": "更新不修改用户备注", "tags": ["sync"]}
    store(page, "await store.setItem('kards_decks', [value]);", saved_deck)
    page.reload(); page.wait_for_load_state("networkidle")
    nav = page.get_by_role("complementary", name="主导航")
    tools = nav.locator('[aria-label="应用工具"]')
    buttons = tools.get_by_role("button")
    expect(buttons).to_have_count(2)
    expect(buttons.nth(0)).to_have_text("桌布")
    expect(buttons.nth(1)).to_have_text("设置")
    assert buttons.nth(0).bounding_box()["y"] < buttons.nth(1).bounding_box()["y"]
    assert buttons.nth(1).bounding_box()["y"] > 650
    assert page.locator("header").get_by_role("button").count() == 1
    page.get_by_role("button", name="设置", exact=True).click()
    settings = page.get_by_test_id("settings-page")
    expect(settings).to_be_visible()
    expect(page.get_by_role("dialog")).to_have_count(0)
    assert settings.bounding_box()["width"] == 1184
    assert requests == [], "opening settings must not contact the official API"
    page.get_by_role("button", name="获取最新卡牌数据", exact=True).click()
    expect(page.get_by_text("新旧数据对比", exact=True)).to_be_visible()
    expect(page.get_by_text("当前 6 张 → 待更新 6 张 · 新增 1 / 修改 1 / 移除 1", exact=True)).to_be_visible()
    assert store(page, "return (await store.getItem(value)).active.cards;", KEY) == baseline
    page.get_by_label("数据对比类型").select_option("changed")
    page.locator("details summary").first.click()
    expect(page.get_by_role("cell", name="Changed English rules for the sync fixture.", exact=True)).to_be_visible()
    expect(page.get_by_role("rowheader", name="费用", exact=True)).to_be_visible()
    page.wait_for_timeout(250)
    page.screenshot(path=str(OUT / "comparison-desktop.png"))
    page.get_by_role("button", name="卡牌", exact=True).click()
    expect(page.get_by_role("button", name="查看" + baseline[0]["json"]["title"]["zh-Hans"], exact=True)).to_be_visible()
    page.get_by_role("button", name="设置", exact=True).click()
    expect(page.get_by_text("新旧数据对比", exact=True)).to_be_visible()
    # Dismissing the removal confirmation leaves the active catalogue untouched.
    page.once("dialog", lambda dialog: dialog.dismiss())
    page.get_by_role("button", name="应用更新", exact=True).click()
    assert store(page, "return (await store.getItem(value)).active.cards;", KEY) == baseline
    # Simulate an IndexedDB quota/write failure; active + rollback must remain atomic.
    page.evaluate("""() => {
      window.__put = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function(value, key) {
        if (key === 'kards_card_database_v1') throw new DOMException('fixture write failure', 'QuotaExceededError');
        return window.__put.call(this, value, key);
      };
    }""")
    page.once("dialog", lambda dialog: dialog.accept())
    page.get_by_role("button", name="应用更新", exact=True).click()
    expect(page.get_by_role("alert")).to_contain_text("fixture write failure")
    page.evaluate("() => { IDBObjectStore.prototype.put = window.__put; }")
    assert store(page, "return (await store.getItem(value)).active.cards;", KEY) == baseline
    page.once("dialog", lambda dialog: dialog.accept())
    page.get_by_role("button", name="应用更新", exact=True).click()
    expect(page.get_by_text("更新已应用，卡牌库和构筑已使用新数据。卡图缓存未改变。", exact=True)).to_be_visible()
    applied = store(page, "return await store.getItem(value);", KEY)
    assert applied["active"]["cards"] == remote and applied["previous"]["cards"] == baseline and not applied.get("pending")
    assert store(page, "return await store.getItem('kards_card_image_v1_54_zh-Hans_keep');") == sentinel
    backup = page.evaluate("""async () => (await import('/src/lib/backup.ts')).createBackup()""")
    assert KEY not in backup["data"]
    assert not any(key.startswith("kards_card_image_") for key in backup["data"])
    page.get_by_role("button", name="卡牌", exact=True).click()
    expect(page.get_by_role("button", name="查看" + remote[0]["json"]["title"]["zh-Hans"], exact=True)).to_be_visible()
    preserved = store(page, "return (await store.getItem('kards_decks'))[0];")
    for field in ["id", "name", "code", "notes", "tags", "isFavorite", "totalCards"]:
        assert preserved[field] == saved_deck[field]
    assert any("预备卡" in warning for warning in preserved["warnings"]), "saved deck checks must use the updated card data"
    page.reload(); page.wait_for_load_state("networkidle")
    page.get_by_role("button", name="卡牌", exact=True).click()
    expect(page.get_by_role("button", name="查看" + remote[0]["json"]["title"]["zh-Hans"], exact=True)).to_be_visible()
    page.get_by_role("button", name="设置", exact=True).click()
    page.once("dialog", lambda dialog: dialog.accept())
    page.get_by_role("button", name="回退上次数据", exact=True).click()
    expect(page.get_by_text("已回退至上次卡牌数据，用户卡组和卡图缓存未改变。", exact=True)).to_be_visible()
    assert store(page, "return (await store.getItem(value)).active.cards;", KEY) == baseline
    for test_mode, message in [("error", "HTTP 503"), ("malformed", "fixture GraphQL failure"), ("partial", "只获取到 6/7")]:
        mode[0] = test_mode
        page.get_by_role("button", name="获取最新卡牌数据", exact=True).click()
        expect(page.get_by_role("alert")).to_contain_text(message)
        assert store(page, "return (await store.getItem(value)).active.cards;", KEY) == baseline
    # The pending network request outlives the settings page; cancellation must
    # also ignore a response that arrives after navigating away and returning.
    mode[0] = "held"
    page.get_by_role("button", name="获取最新卡牌数据", exact=True).click()
    expect(page.get_by_role("button", name="取消获取", exact=True)).to_be_visible()
    page.get_by_role("button", name="卡组", exact=True).click()
    page.get_by_role("button", name="设置", exact=True).click()
    expect(page.get_by_role("button", name="取消获取", exact=True)).to_be_visible()
    page.get_by_role("button", name="取消获取", exact=True).click()
    expect(page.get_by_text("已取消获取，当前卡牌数据未改变。", exact=True)).to_be_visible()
    assert len(held_routes) == 1
    held_routes.pop().fulfill(json={"data": {"cards": {"edges": [{"node": c} for c in remote], "pageInfo": {"count": len(remote), "hasNextPage": False}}}})
    assert store(page, "return (await store.getItem(value)).active.cards;", KEY) == baseline
    assert not store(page, "return (await store.getItem(value)).pending;", KEY)
    mode[0] = "same"
    page.get_by_role("button", name="获取最新卡牌数据", exact=True).click()
    expect(page.get_by_text("当前数据与官方数据一致，无需更新。", exact=True)).to_be_visible()
    expect(page.get_by_role("button", name="应用更新", exact=True)).to_be_disabled()
    page.set_viewport_size({"width": 980, "height": 640})
    page.get_by_label("显示模式", exact=True).select_option("light")
    settings.scroll_into_view_if_needed()
    page.wait_for_timeout(400)
    page.screenshot(path=str(OUT / "settings-light-min.png"))
    assert settings.bounding_box()["width"] == 884
    assert page.evaluate("document.documentElement.scrollWidth") == 980
    assert not errors, errors
    (OUT / "result.json").write_text(json.dumps({"status": "passed", "pageErrors": errors, "checks": ["sidebar tool order", "full-width settings", "manual only", "same-count diff", "multilingual field comparison", "preview doesn't apply", "removal confirmation", "atomic write failure", "apply and cold reload", "rollback", "no artwork mutation", "backup boundary", "HTTP/GraphQL/partial failures", "fetch survives navigation", "cancel ignores late response", "unchanged no-op", "980x640 light theme"]}, ensure_ascii=False, indent=2), encoding="utf-8")
    context.close(); browser.close()
    print("Card-data settings smoke passed")
