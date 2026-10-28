"""Navigation/folder regression against the running Vite server, in an isolated profile."""
import json
import sys
from pathlib import Path
import os
from select_helpers import select_value
from playwright.sync_api import expect, sync_playwright

sys.stdout.reconfigure(encoding="utf-8")
SKIP_VISUAL = os.environ.get("KARDS_SKIP_VISUAL_TESTS") == "1"
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "test-results/navigation"
OUT.mkdir(parents=True, exist_ok=True)
CODE = "%%31|3X5C6BhHm6qCqDrktFvhwJx5;66nwx0x3;3f4p6x7e7l;5Z"

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    context = browser.new_context(viewport={"width": 1280, "height": 820})
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.route("**/*", lambda route: route.continue_() if route.request.url.startswith(
        ("http://127.0.0.1:5173", "ws://127.0.0.1:5173", "data:", "blob:")) else route.abort())
    page.goto("http://127.0.0.1:5173")
    page.wait_for_load_state("networkidle")
    expect(page).to_have_title("KARDS 工具箱")
    nav = page.get_by_role("complementary", name="主导航")
    expect(nav.get_by_role("button")).to_have_count(4)
    expect(nav.get_by_role("button", name="卡组", exact=True)).to_be_visible()
    expect(nav.get_by_role("button", name="卡牌", exact=True)).to_be_visible()
    toggle = page.get_by_role("button", name="显示收藏夹")
    expect(toggle).to_have_attribute("aria-pressed", "false")
    expect(page.get_by_test_id("builder-grid")).to_have_count(0)
    # Old collection records become folders without any data rewrite.
    page.evaluate("""async code => {
      const { default: store } = await import('/node_modules/.vite/deps/localforage.js');
      const base = { code, mainNation: 'Japan', allyNation: 'Germany', totalCards: 39, warnings: [], isArena: false, isFavorite: false };
      await store.setItem('kards_decks', [
        { ...base, id: 'one', name: '旧卡组一' }, { ...base, id: 'two', name: '旧卡组二' }, { ...base, id: 'loose', name: '未归类卡组' },
      ]);
      await store.setItem('kards_collections', [{ id: 'legacy', name: '旧收藏夹', deckIds: ['one', 'two', 'missing'], isFavorite: false, createdAt: 1 }]);
    }""", CODE)
    page.reload(); page.wait_for_load_state("networkidle")
    expect(toggle).to_have_attribute("aria-pressed", "false")
    expect(page.get_by_role("button", name="选择卡组 旧卡组一", exact=True)).to_be_visible()
    toggle.click()
    expect(page.get_by_role("region", name="卡组收藏夹")).to_be_visible()
    folder = page.get_by_role("button", name="旧收藏夹 2 个卡组", exact=True)
    expect(folder).to_have_attribute("aria-expanded", "false")
    folder.press("Enter")
    group = page.get_by_role("group", name="旧收藏夹", exact=True)
    group.get_by_role("button", name="选择卡组 旧卡组一", exact=True).click()
    expect(page.get_by_role("list", name="卡组紧凑列表")).to_be_visible()
    expect(page.get_by_test_id("builder-grid")).to_have_count(0)
    page.wait_for_timeout(350)  # allow the existing navigation/selection animation to settle
    if not SKIP_VISUAL: page.screenshot(path=str(OUT / "folders-desktop.png"))
    group.get_by_role("button", name="选择卡组 旧卡组一", exact=True).dblclick()
    expect(page.get_by_label("卡组名称", exact=True)).to_have_value("旧卡组一")
    page.get_by_label("卡组名称", exact=True).fill("编辑后的卡组")
    page.get_by_role("button", name="保存更改", exact=True).click()
    expect(page.get_by_label("管理卡组名称", exact=True)).to_have_value("编辑后的卡组")
    expect(page.get_by_test_id("builder-grid")).to_have_count(0)
    expect(toggle).to_have_attribute("aria-pressed", "true")
    page.get_by_placeholder("搜索卡组...", exact=True).fill("旧卡组二")
    expect(page.get_by_role("button", name="旧收藏夹 1 个卡组", exact=True)).to_be_visible()
    expect(page.get_by_role("button", name="选择卡组 编辑后的卡组", exact=True)).to_have_count(0)
    page.get_by_placeholder("搜索卡组...", exact=True).fill("")
    page.get_by_role("button", name="关闭卡组详情", exact=True).click()
    page.get_by_role("button", name="新建收藏夹", exact=True).click()
    page.get_by_placeholder("请输入收藏夹名称...", exact=True).fill("新收藏夹")
    page.get_by_placeholder("请输入收藏夹名称...", exact=True).press("Enter")
    expect(page.get_by_role("heading", name="创建新收藏夹", exact=True)).to_have_count(0)
    page.get_by_role("button", name="添加卡组到新收藏夹", exact=True).click()
    page.locator('[role="dialog"][aria-modal="true"]').get_by_role("button", name="未归类卡组", exact=False).click()
    page.get_by_role("button", name="新收藏夹 1 个卡组", exact=True).click()
    expect(page.get_by_role("group", name="新收藏夹", exact=True).get_by_role("button", name="选择卡组 未归类卡组", exact=True)).to_be_visible()
    page.get_by_role("button", name="重命名新收藏夹", exact=True).click()
    page.get_by_placeholder("请输入新的收藏夹名称...", exact=True).fill("改名后的收藏夹")
    page.get_by_placeholder("请输入新的收藏夹名称...", exact=True).press("Enter")
    page.get_by_role("button", name="将未归类卡组移出改名后的收藏夹", exact=True).click()
    expect(page.get_by_role("group", name="未归类", exact=True).get_by_role("button", name="选择卡组 未归类卡组", exact=True)).to_be_visible()
    page.get_by_role("button", name="删除改名后的收藏夹", exact=True).click()
    page.get_by_role("button", name="确认删除", exact=True).click()
    expect(page.get_by_role("button", name="改名后的收藏夹 0 个卡组", exact=True)).to_have_count(0)
    # The enabled preference survives reload, and grid view retains every deck.
    page.reload(); page.wait_for_load_state("networkidle")
    expect(toggle).to_have_attribute("aria-pressed", "true")
    toggle.click()
    expect(page.get_by_role("button", name="选择卡组 编辑后的卡组", exact=True)).to_be_visible()
    expect(page.get_by_role("button", name="选择卡组 旧卡组二", exact=True)).to_be_visible()
    expect(page.get_by_role("button", name="选择卡组 未归类卡组", exact=True)).to_be_visible()
    page.reload(); page.wait_for_load_state("networkidle")
    expect(toggle).to_have_attribute("aria-pressed", "false")
    # About replaces the inert profile button; Back restores its source page.
    page.get_by_role("button", name="卡牌", exact=True).click()
    page.get_by_role("button", name="关于", exact=True).click()
    expect(page.get_by_role("heading", name="KARDS Toolbox", exact=True)).to_be_visible()
    expect(page.get_by_text("KARDS 工具箱", exact=True)).to_be_visible()
    version = json.loads((ROOT / 'package.json').read_text(encoding='utf-8'))['version']
    expect(page.get_by_text("版本 " + version, exact=False)).to_be_visible()
    page.wait_for_timeout(350)  # allow the existing navigation/selection animation to settle
    if not SKIP_VISUAL: page.screenshot(path=str(OUT / "about-desktop.png"))
    page.get_by_role("button", name="返回", exact=True).click()
    grid = page.get_by_test_id("library-grid")
    expect(grid).to_be_visible()
    assert grid.evaluate("el => getComputedStyle(el).scrollbarWidth") == "thin"
    grid.get_by_role("button").first.click()
    detail = page.get_by_role("dialog", name="卡牌详情")
    assert detail.evaluate("el => getComputedStyle(el).scrollbarWidth") == "thin"
    page.keyboard.press("Escape")
    # Minimum desktop size keeps top actions and editor save button reachable.
    page.set_viewport_size({"width": 980, "height": 640})
    page.get_by_role("button", name="卡组", exact=True).click()
    for name in ["桌布", "关于", "设置"]:
        box = page.get_by_role("button", name=name, exact=True).bounding_box()
        assert box["x"] + box["width"] <= 980, (name, box)
    page.wait_for_timeout(350)  # allow the existing navigation/selection animation to settle
    if not SKIP_VISUAL: page.screenshot(path=str(OUT / "decks-min.png"))
    page.get_by_role("button", name="选择卡组 编辑后的卡组", exact=True).dblclick()
    assert page.get_by_test_id("builder-grid").evaluate("el => getComputedStyle(el).scrollbarWidth") == "thin"
    button = page.get_by_role("button", name="保存更改", exact=True)
    assert button.bounding_box()["y"] + button.bounding_box()["height"] <= 640
    page.wait_for_timeout(350)  # allow the existing navigation/selection animation to settle
    if not SKIP_VISUAL: page.screenshot(path=str(OUT / "editor-min.png"))
    button.click()
    expect(page.get_by_label("管理卡组名称", exact=True)).to_have_value("编辑后的卡组")
    toggle.click()
    page.get_by_role("button", name="旧收藏夹 2 个卡组", exact=True).click()
    page.wait_for_timeout(350)
    if not SKIP_VISUAL: page.screenshot(path=str(OUT / "folders-min.png"))
    assert page.evaluate("document.documentElement.scrollWidth") == 980
    page.get_by_role("button", name="关于", exact=True).click()
    page.get_by_role("button", name="设置", exact=True).click()
    select_value(page, "显示模式", "light")
    page.get_by_role("button", name="保存并返回", exact=True).click()
    expect(page.get_by_alt_text("KARDS Logo", exact=True)).to_have_attribute("src", "/assets/kards_logos/Common/KardsLogoBlack.png")
    page.wait_for_timeout(350)
    if not SKIP_VISUAL: page.screenshot(path=str(OUT / "about-light-min.png"))
    assert page.evaluate("document.documentElement.scrollWidth") == 980
    assert not errors, errors
    (OUT / "result.json").write_text(json.dumps({"status": "passed", "pageErrors": errors,
      "checks": ["renamed title", "two-entry navigation", "editor only from decks", "save exits editor", "folder default off and persistence", "legacy folders", "folder CRUD/membership", "folder filtering", "unfiled decks", "About and Back", "custom scrollbars", "980x640 controls"]}, ensure_ascii=False, indent=2), encoding="utf-8")
    context.close(); browser.close()
    print("KARDS Toolbox navigation smoke passed")
