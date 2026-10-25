"""Builder/filter/keyboard/hover regression. No screenshots or image inspection."""
import copy
import json
import sys
from pathlib import Path
from playwright.sync_api import expect, sync_playwright

sys.stdout.reconfigure(encoding="utf-8")
sys.stderr.reconfigure(encoding="utf-8")
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "test-results/builder-interactions"
OUT.mkdir(parents=True, exist_ok=True)
records = json.loads((ROOT / "public/data/cards-v54.json").read_text(encoding="utf-8"))["cards"]
cards = copy.deepcopy(records[:12])
specs = [
    ("主国步兵", "Germany", "Standard", "Base", "infantry", 1, False),
    ("主国精英", "Germany", "Elite", "Frontier", "tank", 8, False),
    ("盟国指令", "Soviet", "Standard", "Base", "order", 1, False),
    ("盟国精英", "Soviet", "Elite", "Base", "fighter", 3, False),
    ("其他国家", "Japan", "Standard", "Base", "infantry", 1, False),
    ("主国衍生", "Germany", "Standard", "OnlySpawnable", "infantry", 1, False),
    ("盟国特殊形态", "Soviet", "Standard", "Special", "infantry", 1, False),
    ("主国特殊稀有度", "Germany", "Special", "Base", "artillery", 4, False),
    ("主国预备", "Germany", "Standard", "Base", "infantry", 0, True),
    ("中立牌", "Neutral", "Standard", "Base", "order", 1, False),
    ("主国描述回退", "Germany", "Limited", "Base", "infantry", 2, False),
    ("主国七费", "Germany", "Standard", "Base", "infantry", 7, False),
]
for card, (name, nation, rarity, expansion, kind, cost, reserved) in zip(cards, specs):
    card["json"] = {"title": {"zh-Hans": name, "en-EN": "English " + name}, "description": {"en-EN": "fallback keyword"}, "faction": nation, "rarity": rarity, "set": expansion, "type": kind, "kredits": cost}
    card["reserved"] = reserved


def stored(page, key):
    return page.evaluate("""async key => {
      const {default: store} = await import('/node_modules/.vite/deps/localforage.js');
      return await store.getItem(key);
    }""", key)


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    context = browser.new_context(viewport={"width": 1280, "height": 820}, accept_downloads=True)
    context.add_init_script("""
      window.__renderRequests = [];
      window.kardsDesktop = {
        getAppInfo: async () => ({name:'KARDS Toolbox',version:'0.3.1',packaged:false,darkIcon:true}),
        setTheme: async () => true, readClipboardText: async () => '',
        renderDeckImage: async request => {
          window.__renderRequests.push(request);
          if (window.__holdRender) await new Promise(resolve => { window.__releaseRender = resolve; });
          return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l1sAAAAASUVORK5CYII=';
        }
      };
    """)
    page = context.new_page()
    errors, downloads = [], []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.on("download", lambda download: downloads.append(download))
    page.route("**/*", lambda route: route.continue_() if route.request.url.startswith(("http://127.0.0.1:5173", "ws://127.0.0.1:5173", "data:", "blob:")) else route.abort())
    page.goto("http://127.0.0.1:5173"); page.wait_for_load_state("networkidle")
    code = page.evaluate("""async cards => {
      const {default: store} = await import('/node_modules/.vite/deps/localforage.js');
      const {encodeDeckCode} = await import('/src/lib/deckCode.ts');
      const code = encodeDeckCode('Germany','Soviet',new Map([[cards[0].importId,1]]));
      await store.setItem('kards_card_database_v1',{schemaVersion:1,active:{cards,source:'bundled',fetchedAt:null}});
      await store.setItem('kards_decks',[{id:'test',name:'构筑交互测试',code,mainNation:'Germany',allyNation:'Soviet',totalCards:1,isFavorite:false,isArena:false,warnings:[]}]);
      return code;
    }""", cards)
    page.reload(); page.wait_for_load_state("networkidle")

    def open_builder(name="构筑交互测试"):
        page.get_by_role("button", name="选择卡组 " + name, exact=True).dblclick()
        expect(page.get_by_role("heading", name="编辑卡组", exact=True)).to_be_visible()
        expect(page.get_by_label("卡组名称", exact=True)).to_have_value(name)

    def names():
        return page.get_by_test_id("builder-grid").get_by_role("button").evaluate_all("els => els.map(el => el.getAttribute('aria-label').slice(2))")

    def filter_check(label, value, expected):
        page.get_by_label(label, exact=True).select_option(value)
        expect(page.get_by_test_id("builder-grid").get_by_role("button")).to_have_count(len(expected))
        assert set(names()) == set(expected), (label, value, names())
        page.get_by_label(label, exact=True).select_option("All")

    def hover_button(button):
        page.mouse.move(1, 1)
        button.hover()
        page.wait_for_function("el => getComputedStyle(el).filter.includes('brightness')", arg=button.element_handle())

    open_builder()
    filters = page.locator('[aria-label="构筑卡牌筛选"]')
    expect(filters.locator("input")).to_have_count(1)
    expect(filters.locator("select")).to_have_count(6)
    expect(page.get_by_label("构筑阵营筛选", exact=True)).to_have_count(0)
    assert set(names()) == {specs[i][0] for i in [0, 1, 2, 7, 8, 10, 11]}
    expect(page.get_by_test_id("builder-grid").locator(".card-caption")).to_have_count(0)
    expect(page.get_by_test_id("builder-grid").locator(".rarity-slots")).to_have_count(7)
    filter_check("构筑类型筛选", "order", ["盟国指令"])
    filter_check("构筑费用筛选", "7", ["主国精英", "主国七费"])
    filter_check("构筑稀有度筛选", "Elite", ["主国精英"])
    filter_check("构筑扩展包筛选", "Frontier", ["主国精英"])
    filter_check("构筑状态筛选", "reserved", ["主国预备"])
    filter_check("构筑状态筛选", "active", [specs[i][0] for i in [0, 1, 2, 7, 10, 11]])
    assert "generated" not in page.get_by_label("构筑状态筛选", exact=True).locator("option").evaluate_all("els => els.map(el=>el.value)")
    search = page.get_by_label("构筑搜索卡牌", exact=True)
    search.fill("fallback keyword")
    expect(page.get_by_test_id("builder-grid").get_by_role("button")).to_have_count(7)
    search.fill("English 主国精英")
    expect(page.get_by_test_id("builder-grid").get_by_role("button")).to_have_count(1)
    search.press("Escape")
    expect(search).to_have_value("")
    page.get_by_label("主国", exact=True).select_option("Soviet")
    page.get_by_label("盟国", exact=True).select_option("Germany")
    assert "盟国精英" in names() and "主国精英" not in names()
    page.get_by_label("盟国", exact=True).select_option("Soviet")
    assert "盟国精英" in names(), "same-country main elites must remain visible"
    page.get_by_label("主国", exact=True).select_option("Germany")
    page.get_by_label("构筑规则", exact=True).select_option("custom")
    page.get_by_label("允许导入的衍生卡", exact=True).check()
    assert "主国衍生" not in names() and "盟国精英" not in names()
    page.get_by_label("构筑规则", exact=True).select_option("standard")

    tile = page.get_by_role("button", name="添加主国步兵", exact=True)
    tile.hover()
    page.wait_for_function("el => getComputedStyle(el.querySelector('.card-face')).transform !== 'none'", arg=tile.element_handle())
    tile.focus(); tile.press("Enter")
    hover_button(page.get_by_role("button", name="增加主国步兵", exact=True))
    hover_button(page.get_by_role("button", name="保存更改", exact=True))
    page.get_by_label("卡组名称", exact=True).fill("未保存预览")
    page.get_by_label("卡组名称", exact=True).dispatch_event("keydown", {"key": "Enter", "isComposing": True, "bubbles": True})
    expect(page.get_by_role("heading", name="编辑卡组", exact=True)).to_be_visible()
    page.get_by_role("button", name="导出卡组图片", exact=True).click()
    dialog = page.get_by_role("dialog")
    expect(dialog.get_by_role("button", name="下载 PNG 图片", exact=True)).to_be_visible()
    expect(dialog.get_by_alt_text("本地卡组图片", exact=True)).to_have_attribute("src", "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l1sAAAAASUVORK5CYII=")
    assert downloads == [], "opening preview must not download automatically"
    assert stored(page, "kards_decks")[0]["name"] == "构筑交互测试"
    request = page.evaluate("window.__renderRequests.at(-1)")
    assert request["title"] == "未保存预览" and request["cards"][0]["count"] == 2
    dialog.focus()
    with page.expect_download() as download:
        dialog.press("Enter")
    assert download.value.suggested_filename == "未保存预览.png"
    dialog.press("Escape")
    expect(page.get_by_role("dialog")).to_have_count(0)
    expect(page.get_by_role("button", name="导出卡组图片", exact=True)).to_be_focused()
    page.evaluate("window.__holdRender = true")
    page.get_by_role("button", name="导出卡组图片", exact=True).click()
    expect(page.get_by_text("正在本机生成图片…", exact=True)).to_be_visible()
    page.get_by_role("dialog").press("Escape")
    expect(page.get_by_role("dialog")).to_have_count(0)
    page.evaluate("window.__releaseRender(); window.__holdRender = false")
    expect(page.get_by_role("button", name="导出卡组图片", exact=True)).to_be_enabled()
    expect(page.get_by_role("dialog")).to_have_count(0)
    importer = page.get_by_label("导入卡组码", exact=True)
    importer.fill(code); importer.press("Escape")
    expect(importer).to_have_value("")
    importer.fill(code); importer.press("Shift+Enter")
    assert "\n" in importer.input_value()
    importer.fill(code); importer.press("Enter")
    expect(page.get_by_role("status")).to_have_text("导入成功")
    page.get_by_label("卡组名称", exact=True).fill("键盘保存")
    page.locator('[aria-label="卡组构筑"]').press("Control+Enter")
    expect(page.get_by_test_id("builder-grid")).to_be_hidden()
    assert stored(page, "kards_decks")[0]["name"] == "键盘保存"
    page.get_by_role("button", name="添加标签", exact=True).click()
    tag = page.get_by_placeholder("输入标签...")
    tag.fill("键盘标签"); tag.press("Escape")
    expect(page.get_by_label("管理卡组名称", exact=True)).to_be_visible()
    page.get_by_role("button", name="添加标签", exact=True).click()
    tag.fill("键盘标签"); tag.press("Enter")
    expect(page.locator('span').filter(has_text="键盘标签").last).to_be_visible()
    page.get_by_label("管理卡组名称", exact=True).press("Escape")
    expect(page.get_by_label("管理卡组名称", exact=True)).to_have_count(0)

    open_builder("键盘保存")
    page.get_by_label("构筑搜索卡牌", exact=True).press("Escape")
    expect(page.get_by_test_id("builder-grid")).to_be_hidden()
    page.get_by_role("button", name="卡牌", exact=True).click()
    library_search = page.get_by_label("搜索卡牌", exact=True)
    library_search.fill("主国步兵"); library_search.press("Enter")
    card = page.get_by_role("button", name="查看主国步兵", exact=True)
    expect(card).to_be_focused()
    card.hover()
    page.wait_for_function("el => getComputedStyle(el.querySelector('.card-face')).transform !== 'none'", arg=card.element_handle())
    card.press("Enter")
    expect(page.get_by_role("dialog", name="卡牌详情")).to_be_visible()
    library_search.press("Escape")
    expect(page.get_by_role("dialog")).to_have_count(0)
    expect(library_search).to_have_value("主国步兵")
    library_search.press("Escape")
    expect(library_search).to_have_value("")
    hover_button(page.get_by_role("button", name="缓存筛选结果（12 张）", exact=True))
    page.get_by_role("button", name="设置", exact=True).click()
    hover_button(page.get_by_role("button", name="获取最新卡牌数据", exact=True))
    page.get_by_role("button", name="关于", exact=True).click()
    hover_button(page.get_by_role("button", name="返回", exact=True))
    page.keyboard.press("Escape")
    expect(page.get_by_test_id("settings-page")).to_be_visible()
    page.get_by_test_id("settings-page").press("Control+Enter")
    expect(page.get_by_test_id("library-grid")).to_be_visible()
    page.get_by_role("button", name="桌布", exact=True).click()
    page.keyboard.press("Escape")
    expect(page.get_by_role("dialog")).to_have_count(0)
    page.get_by_role("button", name="卡组", exact=True).click()
    page.get_by_role("switch", name="收藏夹显示").check()
    page.get_by_role("button", name="新建收藏夹", exact=True).click()
    folder_input = page.get_by_placeholder("输入收藏夹名称...")
    folder_input.fill("键盘收藏夹"); folder_input.press("Enter")
    expect(page.get_by_role("dialog")).to_have_count(0)
    assert len(stored(page, "kards_collections")) == 1
    hover_button(page.get_by_role("button", name="重命名键盘收藏夹", exact=True))
    page.get_by_role("button", name="重命名键盘收藏夹", exact=True).click()
    page.keyboard.press("Escape")
    expect(page.get_by_role("dialog")).to_have_count(0)
    page.get_by_role("switch", name="收藏夹显示").uncheck()
    open_builder("键盘保存")
    page.set_viewport_size({"width": 980, "height": 640})
    for name in ["保存更改", "导出卡组图片", "返回卡组"]:
        button = page.get_by_role("button", name=name, exact=True)
        expect(button).to_be_in_viewport()
    assert page.evaluate("document.documentElement.scrollWidth") == 980
    assert not errors, errors
    report = {"status": "passed", "screenshots": False, "imageInspection": False, "pageErrors": errors, "checks": ["shared filters", "country/ally elite/generated exclusions", "same-country elites", "custom rules don't widen pool", "no builder captions", "rarity slots retained", "card hover", "global button hover", "preview unsaved data", "preview download Enter", "late result stays closed", "IME protection", "Enter import/Shift+Enter newline", "Ctrl+Enter save", "Esc return/clear/close", "tags", "settings/about/wallpaper", "folder Enter once", "980x640 reachable actions"]}
    (OUT / "result.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    context.close(); browser.close()
    print("Builder interaction smoke passed (no screenshots or image inspection)")
