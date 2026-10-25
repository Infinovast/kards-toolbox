"""Verify floating deck details and stable grid/folder layout without screenshots."""
import json
import sys
from pathlib import Path

from playwright.sync_api import expect, sync_playwright

sys.stdout.reconfigure(encoding='utf-8')
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'test-results/deck-overlay'
OUT.mkdir(parents=True, exist_ok=True)
CODE = '%%31|3X5C6BhHm6qCqDrktFvhwJx5;66nwx0x3;3f4p6x7e7l;5Z'

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context(viewport={'width': 1280, 'height': 820})
    page = context.new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.route('**/*', lambda route: route.continue_() if route.request.url.startswith(('http://127.0.0.1:5173', 'ws://127.0.0.1:5173', 'data:', 'blob:')) else route.abort())
    page.goto('http://127.0.0.1:5173')
    page.wait_for_load_state('networkidle')
    page.evaluate('''async code => {
      const {default: store} = await import('/node_modules/.vite/deps/localforage.js');
      const decks = Array.from({length:8},(_,i)=>({id:`overlay-${i}`,name:`浮层卡组${i+1}`,code,mainNation:'Japan',allyNation:'Germany',totalCards:39,warnings:[],isFavorite:false,isArena:false}));
      await store.setItem('kards_decks',decks);
      await store.setItem('kards_collections',[{id:'overlay-folder',name:'浮层收藏夹',deckIds:['overlay-0','overlay-1'],isFavorite:false,createdAt:1}]);
    }''', CODE)
    page.reload()
    page.wait_for_load_state('networkidle')
    details = page.get_by_role('dialog', name='卡组详情', exact=True)
    modal = page.locator('[role="dialog"][aria-modal="true"]')
    card = page.get_by_role('button', name='选择卡组 浮层卡组1', exact=True)

    def geometry():
        return page.get_by_test_id('deck-grid').evaluate('''el => {
          const r=el.getBoundingClientRect();
          return {x:r.x,y:r.y,width:r.width,height:r.height,columns:getComputedStyle(el).gridTemplateColumns};
        }''')

    expect(details).to_have_count(0)
    assert page.get_by_role('main').bounding_box()['width'] == 1184
    before = geometry()
    card.click()
    expect(details).to_be_visible()
    expect(details).to_have_attribute('aria-modal', 'false')
    expect(details.get_by_role('list', name='卡组紧凑列表')).to_be_visible()
    assert details.evaluate('el=>getComputedStyle(el).position') == 'absolute'
    assert geometry() == before, (before, geometry())
    expect(page.get_by_test_id('builder-grid')).to_have_count(0)
    details.get_by_role('button', name='关闭卡组详情', exact=True).click()
    expect(details).to_have_count(0)
    expect(page.get_by_text('请选择一个卡组', exact=True)).to_have_count(0)
    expect(card).to_be_focused()
    assert geometry() == before
    card.press('Enter')
    expect(details).to_be_visible()
    details.get_by_role('button', name='关闭卡组详情', exact=True).focus()
    page.keyboard.press('Escape')
    expect(details).to_have_count(0)
    expect(card).to_be_focused()

    # Inline edits consume Esc before the surrounding non-modal panel closes.
    card.click()
    details.get_by_role('button', name='添加标签', exact=True).click()
    tag = details.get_by_placeholder('输入标签...')
    tag.fill('应取消')
    tag.press('Escape')
    expect(tag).to_have_count(0)
    expect(details).to_be_visible()
    details.get_by_label('管理卡组名称', exact=True).dispatch_event('keydown', {'key':'Escape','isComposing':True,'bubbles':True})
    expect(details).to_be_visible()
    expect(details.get_by_label('卡组备注', exact=True)).to_have_count(0)
    details.get_by_label('管理卡组名称', exact=True).press('Escape')
    expect(details).to_have_count(0)
    card.click()
    expect(details.get_by_label('卡组备注', exact=True)).to_have_count(0)
    # A true modal closes before the non-modal details underneath it.
    details.get_by_role('button', name='更换卡背', exact=True).click()
    expect(modal).to_have_count(1)
    page.keyboard.press('Escape')
    expect(modal).to_have_count(0)
    expect(details).to_be_visible()
    page.keyboard.press('Escape')
    expect(details).to_have_count(0)
    assert geometry() == before

    # Double-click still edits; saving returns to the floating preview.
    card.dblclick()
    expect(page.get_by_test_id('builder-grid')).to_be_visible()
    expect(details).to_have_count(0)
    page.get_by_role('button', name='保存更改', exact=True).click()
    expect(details).to_be_visible()
    assert geometry() == before
    details.get_by_role('button', name='关闭卡组详情', exact=True).click()

    # Expanded folders retain their dimensions while showing/closing details.
    toggle = page.get_by_role('switch', name='收藏夹显示', exact=True)
    toggle.check()
    page.get_by_role('button', name='浮层收藏夹 2 个卡组', exact=True).click()
    group = page.get_by_role('group', name='浮层收藏夹', exact=True)
    folder_bounds = group.bounding_box()
    group.get_by_role('button', name='选择卡组 浮层卡组1', exact=True).click()
    expect(details).to_be_visible()
    assert group.bounding_box() == folder_bounds
    details.get_by_role('button', name='关闭卡组详情', exact=True).click()
    assert group.bounding_box() == folder_bounds
    toggle.uncheck()

    # Minimum supported window: the preview overlays the grid and remains usable.
    page.set_viewport_size({'width': 980, 'height': 640})
    narrow = geometry()
    card.click()
    expect(details).to_be_visible()
    assert geometry() == narrow
    assert page.get_by_role('main').bounding_box()['width'] == 884
    bounds = details.bounding_box()
    assert bounds['x'] >= 96 and bounds['x']+bounds['width'] <= 980 and bounds['y']+bounds['height'] <= 640, bounds
    for name in ['关闭卡组详情', '编辑卡组', '复制卡组码', '生成本地卡组图片']:
        expect(details.get_by_role('button', name=name, exact=True)).to_be_in_viewport()
    details.get_by_role('button', name='关闭卡组详情', exact=True).click()
    assert geometry() == narrow
    assert page.evaluate('document.documentElement.scrollWidth') == 980
    assert not errors, errors
    (OUT/'result.json').write_text(json.dumps({'status':'passed','screenshots':False,'imageInspection':False,'pageErrors':errors,'checks':['initially hidden','nonmodal absolute overlay','stable grid dimensions/columns','close and reopen','keyboard focus return','inline Esc and IME','notes removed','nested modal Esc priority','double-click edit and save','stable expanded folders','980x640 full-width workspace and reachable actions']},ensure_ascii=False,indent=2),encoding='utf-8')
    context.close()
    browser.close()
    print('Deck overlay smoke passed (no screenshots or image inspection)')
