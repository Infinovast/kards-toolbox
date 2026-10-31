"""Integration smoke test against a running Vite dev server.

Requires Python playwright + Chromium. Run: python scripts/smoke-ui.py
Uses an isolated browser profile and blocks all external network requests.
"""
import base64
import json
import re
import struct
import sys
from pathlib import Path

from select_helpers import select_value
from playwright.sync_api import expect, sync_playwright

sys.stdout.reconfigure(encoding="utf-8")
sys.stderr.reconfigure(encoding="utf-8")
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "test-results" / "smoke"
SHOTS = ROOT / ".impeccable" / "review"
CODE = "%%31|3X5C6BhHm6qCqDrktFvhwJx5;66nwx0x3;3f4p6x7e7l;5Z"
OUT.mkdir(parents=True, exist_ok=True)
SHOTS.mkdir(parents=True, exist_ok=True)
cards = json.loads((ROOT / "public/data/cards.json").read_text(encoding="utf-8"))["cards"]


def storage(page, key):
    return page.evaluate("""async key => {
      const {default: store} = await import('/node_modules/.vite/deps/localforage.js');
      return store.getItem(key);
    }""", key)


def settle(page):
    page.wait_for_timeout(400)  # incumbent motion + debounced draft persistence


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    context = browser.new_context(viewport={"width": 1280, "height": 820}, accept_downloads=True)
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.on("dialog", lambda dialog: dialog.accept())
    page.route("**/*", lambda route: route.continue_() if route.request.url.startswith(
        ("http://127.0.0.1:5173", "ws://127.0.0.1:5173", "data:", "blob:")) else route.abort())
    page.goto("http://127.0.0.1:5173")
    page.wait_for_load_state("networkidle")
    expect(page.get_by_text("请选择一个卡组", exact=True)).to_be_visible()

    # Bundled fixture artwork stays in the isolated browser cache.
    fixture_art = ROOT / "assets-private/static/assets/headquarters/Britain_Alam_el_Halfa.png"
    if fixture_art.exists():
        data = "data:image/png;base64," + base64.b64encode(fixture_art.read_bytes()).decode()
        page.evaluate("""async data => {
          const {default: store} = await import('/node_modules/.vite/deps/localforage.js');
          await store.setItem('kards_card_image_v1_54_zh-Hans_3L', data);
        }""", data)

    page.get_by_role("button", name="卡牌", exact=True).click()
    expect(page.get_by_text("本地目录 1,646 张 · 当前结果 1,646 张", exact=True)).to_be_visible()
    select_value(page, "费用筛选", "7")
    expected = sum(c["json"].get("kredits", 0) >= 7 for c in cards)
    expect(page.get_by_text(f"本地目录 1,646 张 · 当前结果 {expected:,} 张", exact=True)).to_be_visible()
    page.get_by_role("button", name="重置筛选").click()
    page.get_by_label("搜索卡牌", exact=True).fill("105 毫米轻型榴弹炮")
    page.get_by_role("button", name=re.compile("105 毫米轻型榴弹炮")).first.click()
    expect(page.get_by_role("heading", name="105 毫米轻型榴弹炮", exact=True)).to_be_visible()
    if fixture_art.exists():
        expect(page.locator('aside img[alt="105 毫米轻型榴弹炮"]')).to_be_visible()
    settle(page)
    page.screenshot(path=str(SHOTS / "library-desktop.png"), full_page=True)
    select_value(page, "卡牌文字语言", "en-EN")
    english_title = next(c for c in cards if c["importId"] == "3L")["json"]["title"]["en-EN"]
    expect(page.get_by_role("heading", name=english_title, exact=True)).to_be_visible()
    expect(page.get_by_role("heading", name=english_title, exact=True)).to_be_visible()
    page.get_by_label("关闭卡牌详情").click()
    page.get_by_label("搜索卡牌", exact=True).fill("__no_such_card__")
    expect(page.get_by_text("没有找到匹配的卡牌", exact=True)).to_be_visible()
    page.get_by_role("button", name="重置筛选").click()
    page.set_viewport_size({"width": 980, "height": 640})
    settle(page)
    page.screenshot(path=str(SHOTS / "library-min.png"), full_page=True)

    page.get_by_role("button", name="卡组", exact=True).click()
    page.get_by_role("button", name="导入新卡组", exact=True).click()
    page.locator('[role="dialog"][aria-modal="true"]').get_by_role("textbox").last.fill(CODE)
    page.locator('[role="dialog"][aria-modal="true"]').get_by_role("textbox").first.fill("Smoke deck")
    page.get_by_role("button", name="确认导入", exact=True).click()
    page.get_by_role("button", name="编辑卡组", exact=True).click()
    page.get_by_label("导入卡组码", exact=True).fill("Smoke deck\nMajor power: japan\n" + CODE)
    page.get_by_role("button", name="导入", exact=True).click()
    expect(page.get_by_label("卡组名称", exact=True)).to_have_value("Smoke deck")
    expect(page.get_by_text("40 / 40", exact=True)).to_be_visible()
    select_value(page, "构筑规则", "custom")
    page.get_by_role("spinbutton", name="卡组总张数（含总部）", exact=True).fill("41")
    expect(page.get_by_text("冲突", exact=True)).to_be_visible()
    settle(page)
    page.screenshot(path=str(SHOTS / "builder-min.png"), full_page=True)
    # Contrast correction: inspect the actual status color in the light theme.
    page.evaluate("""() => [document.documentElement, document.body].forEach(el => {
        el.classList.remove('dark'); el.classList.add('light');
    })""")
    settle(page)
    light_color = page.get_by_text("40 / 41", exact=True).evaluate("el => getComputedStyle(el).color")
    assert light_color == "rgb(120, 90, 36)", light_color
    page.screenshot(path=str(SHOTS / "builder-light-min.png"), full_page=True)
    page.evaluate("""() => [document.documentElement, document.body].forEach(el => {
        el.classList.remove('light'); el.classList.add('dark');
    })""")
    page.set_viewport_size({"width": 1280, "height": 820})
    settle(page)
    page.screenshot(path=str(SHOTS / "builder-desktop.png"), full_page=True)
    page.get_by_role("button", name="保存更改", exact=True).click()
    expect(page.get_by_label("管理卡组名称", exact=True)).to_have_value("Smoke deck")
    page.get_by_label("卡组备注", exact=True).fill("离线测试备注：优先保留前线单位。")
    assert page.get_by_label("卡组备注", exact=True).evaluate("el => getComputedStyle(el).resize") == "none"
    page.get_by_role("button", name="收藏卡组", exact=True).click()
    page.get_by_role("button", name="添加标签", exact=True).click()
    page.get_by_placeholder("输入标签...").fill("测试")
    page.get_by_placeholder("输入标签...").press("Enter")
    settle(page)
    page.set_viewport_size({"width": 980, "height": 640})
    settle(page)
    page.screenshot(path=str(SHOTS / "manager-min.png"), full_page=True)
    assert page.get_by_role("button", name="编辑卡组", exact=True).bounding_box()["y"] < 640
    page.get_by_role("button", name="编辑卡组", exact=True).click()
    expect(page.get_by_label("卡组名称", exact=True)).to_have_value("Smoke deck")
    first_increase = page.get_by_role("button", name=re.compile("^增加")).first
    first_increase.click()
    expect(page.get_by_text("40 / 40", exact=True)).to_be_visible()
    page.get_by_label("卡组名称", exact=True).fill("Smoke edited")
    page.get_by_role("button", name="保存更改", exact=True).click()
    settle(page)
    saved = storage(page, "kards_decks")
    assert len(saved) == 1 and saved[0]["name"] == "Smoke edited"
    assert saved[0]["notes"].startswith("离线测试备注") and saved[0]["isFavorite"] and saved[0]["tags"] == ["测试"]

    # No external requests are allowed: export must work entirely offline.
    page.get_by_role("button", name="生成本地卡组图片", exact=True).click()
    expect(page.get_by_role("button", name="下载 PNG 图片", exact=True)).to_be_visible()
    with page.expect_download() as download:
        page.get_by_role("button", name="下载 PNG 图片", exact=True).click()
    png_path = OUT / "offline-deck.png"
    download.value.save_as(png_path)
    png = png_path.read_bytes()
    assert png[:8] == b"\x89PNG\r\n\x1a\n" and struct.unpack(">II", png[16:24])[0] == 2304
    page.reload()
    page.wait_for_load_state("networkidle")
    saved_deck = page.get_by_role("button", name="选择卡组 Smoke edited", exact=True)
    saved_deck.focus()
    saved_deck.press("Enter")
    expect(saved_deck).to_have_attribute("aria-pressed", "true")
    expect(page.get_by_label("管理卡组名称", exact=True)).to_have_value("Smoke edited")
    page.get_by_role("button", name="设置", exact=True).click()
    with page.expect_download() as download:
        page.get_by_role("button", name="导出备份", exact=True).click()
    backup_path = OUT / "backup.json"
    download.value.save_as(backup_path)
    backup = json.loads(backup_path.read_text(encoding="utf-8"))
    assert backup["app"] == "kards-toolbox"
    assert any(key.startswith("deck_img_local_v1_") for key in backup["data"])
    assert not any(key.startswith("kards_card_image_") for key in backup["data"])
    assert backup["data"]["kards_decks"][0]["notes"].startswith("离线测试备注")
    page.get_by_role("button", name="保存并返回", exact=True).click()
    page.get_by_role("button", name="编辑卡组", exact=True).click()
    page.get_by_label("导入卡组码", exact=True).fill("%%12|ZZ;;;")
    page.get_by_role("button", name="导入", exact=True).click()
    expect(page.get_by_text("未知卡牌 ZZ", exact=True)).to_be_visible()
    expect(page.get_by_role("status")).to_contain_text("请手动更新牌库")
    page.get_by_label("卡组名称", exact=True).fill("Unknown draft")
    settle(page)
    page.reload()
    page.wait_for_load_state("networkidle")
    assert storage(page, "kards_builder_draft")["deckName"] == "Unknown draft"
    page.get_by_role("button", name="选择卡组 Smoke edited", exact=True).click()
    page.get_by_role("button", name="编辑卡组", exact=True).click()
    expect(page.get_by_label("卡组名称", exact=True)).to_have_value("Smoke edited")

    # UI restore must also replace an already-mounted builder's draft.
    page.get_by_role("button", name="设置", exact=True).click()
    with page.expect_file_chooser() as chooser:
        page.get_by_role("button", name="导入备份", exact=True).click()
    chooser.value.set_files(backup_path)
    expect(page.get_by_text("备份已导入，卡组、设置和构筑草稿已恢复。", exact=True)).to_be_visible()
    page.get_by_role("button", name="保存并返回", exact=True).click()
    expect(page.get_by_label("管理卡组名称", exact=True)).to_have_value("Smoke edited")
    expect(page.get_by_test_id("builder-grid")).to_have_count(0)
    assert not errors, errors
    (OUT / "result.json").write_text(json.dumps({"status": "passed", "records": len(cards), "pageErrors": errors,
        "checks": ["offline snapshot", "cost 7+", "details", "text language independent of Chinese images", "empty state", "code import",
        "custom rule warnings", "save/edit", "notes/tags/favorite", "draft reload/unknown cards",
        "offline PNG", "backup boundary/restore", "980x640 and 1280x820"]}, ensure_ascii=False, indent=2), encoding="utf-8")
    context.close()
    browser.close()
    print("UI smoke passed; screenshots in .impeccable/review; artifacts in test-results/smoke")

