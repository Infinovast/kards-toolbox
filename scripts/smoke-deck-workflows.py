"""Deck creation, country confirmation, clipboard persistence and shared rows; no screenshots."""
import json
import sys
from pathlib import Path

from playwright.sync_api import expect, sync_playwright
from select_helpers import select_value

sys.stdout.reconfigure(encoding='utf-8')
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'test-results/deck-workflows'
OUT.mkdir(parents=True, exist_ok=True)
ORIGIN = 'http://127.0.0.1:5173'
CODES = [
    '%%26|191a2H2i2yDQDSsRtXyE;DTwcyGyNyOySzB;DDDRDVtTyH;',
    '%%38|6C6y7dE7E8EaflihtCtyu2uywXzi;E5g3iDiwtGtKu9x0zm;it;E9',
    '%%49|919aDZE0ngthwm;8UDWn8rMsjtlyQz4;7HDUDXz0;wo',
]
NAMES = ['守序中立', '汝即军团', '冬日游戏']

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context(viewport={'width': 1280, 'height': 820})

    def setup(ctx):
        ctx.add_init_script('''
          Object.defineProperty(document, 'hasFocus', {value: () => true});
          window.__clipboardReads = 0;
          window.kardsDesktop = {
            readClipboardText: async () => { window.__clipboardReads++; return localStorage.getItem('__testClipboard') || ''; },
            setTheme: async () => true
          };
        ''')
        ctx.route('**/*', lambda route: route.continue_() if route.request.url.startswith((ORIGIN, 'ws://127.0.0.1:5173', 'data:', 'blob:')) else route.abort())

    setup(context)
    page = context.new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(ORIGIN)
    page.wait_for_load_state('networkidle')
    modal = page.locator('[role="dialog"][aria-modal="true"]')
    details = page.get_by_role('dialog', name='卡组详情', exact=True)

    def data():
        return page.evaluate('''async () => (await import('/node_modules/.vite/deps/localforage.js')).default.getItem('kards_decks')''')

    def new_options():
        page.get_by_role('button', name='新卡组', exact=True).click()
        expect(page.get_by_role('dialog', name='新卡组', exact=True)).to_be_visible()

    # All three built-ins preserve the exact supplied code, with 39 playable cards.
    for name, code in zip(NAMES, CODES):
        new_options()
        for choice in ['新建卡组', '战备卡组', '导入卡组']:
            expect(modal.get_by_role('button', name=choice, exact=False)).to_be_visible()
        modal.get_by_role('button', name='战备卡组', exact=False).click()
        modal.get_by_role('button', name=name, exact=True).click()
        expect(modal.get_by_role('heading', name=name, exact=True)).to_be_visible()
        expect(modal.get_by_text(code, exact=True)).to_be_visible()
        assert len(modal.locator('p').first.text_content()) > 100
        modal.focus()
        modal.press('Enter')
        expect(details).to_be_visible()
        expect(details.get_by_label('管理卡组名称', exact=True)).to_have_value(name)
        expect(details.get_by_label('卡组备注', exact=True)).to_have_count(0)
        page.wait_for_function('name => document.querySelector(`[aria-label="管理卡组名称"]`)?.value === name', arg=name)
        saved = data()[-1]
        assert saved['name'] == name and saved['code'] == code and saved['totalCards'] == 39, saved
        assert 'notes' not in saved and 'cards' not in saved
        details.get_by_role('button', name='关闭卡组详情', exact=True).click()

    # Blank construction must not load a previous deck/draft and does not save until requested.
    new_options()
    modal.get_by_role('button', name='新建卡组', exact=False).click()
    expect(page.get_by_label('卡组名称', exact=True)).to_have_value('新卡组')
    expect(page.get_by_role('button', name='保存更改', exact=True)).to_be_disabled()
    expect(page.get_by_text('从左侧选择卡牌开始构筑', exact=True)).to_be_visible()
    tile = page.get_by_test_id('builder-grid').get_by_role('button').first
    tile.click()
    expect(page.locator('[aria-label="构筑卡牌列表"] .deck-card-strip')).to_have_count(1)
    page.get_by_label('卡组名称', exact=True).fill('从空白创建')
    page.get_by_role('button', name='保存更改', exact=True).click()
    expect(details.get_by_label('管理卡组名称', exact=True)).to_have_value('从空白创建')
    details.get_by_role('button', name='关闭卡组详情', exact=True).click()

    # Existing import, including unknown IDs, remains available through the third option.
    new_options()
    modal.get_by_role('button', name='导入卡组', exact=False).click()
    modal.get_by_role('textbox').first.fill('未知卡导入')
    modal.get_by_role('textbox').last.fill('%%12|ZZ;;;')
    page.get_by_role('button', name='确认导入', exact=True).click()
    expect(details.get_by_text('未知卡牌 ZZ', exact=True)).to_be_visible()
    expect(details.locator('.deck-card-count')).to_have_text('1')
    details.get_by_role('button', name='关闭卡组详情', exact=True).click()

    # Seed one card per nation, an unknown card and an old note to verify compatibility.
    seed = page.evaluate('''async () => {
      const {default: store} = await import('/node_modules/.vite/deps/localforage.js');
      const {encodeDeckCode} = await import('/src/lib/deckCode.ts');
      const {cards} = await (await fetch('./data/cards-v54.json')).json();
      const chosen = [...new Set(cards.map(c=>c.json.faction))].map(n=>cards.find(c=>c.json.faction===n && c.json.image));
      const counts = new Map(chosen.map(c=>[c.importId, 1])); counts.set('ZZ', 2);
      const code = encodeDeckCode('Germany','Soviet',counts);
      const decks = await store.getItem('kards_decks');
      decks.push({id:'strips',name:'国家卡牌条验证',code,mainNation:'Germany',allyNation:'Soviet',isFavorite:false,isArena:false,totalCards:chosen.length+2,warnings:[],notes:'旧版备注'});
      await store.setItem('kards_decks',decks);
      for(const c of chosen) await store.setItem(`kards_card_image_v1_54_zh-Hans_${c.importId}`, 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l1sAAAAASUVORK5CYII=');
      return {code, count:chosen.length+1};
    }''')
    page.reload()
    page.wait_for_load_state('networkidle')
    page.get_by_role('button', name='选择卡组 国家卡牌条验证', exact=True).click()
    rows = details.locator('.deck-card-strip')
    expect(rows).to_have_count(seed['count'])
    expect(details.get_by_label('卡组备注', exact=True)).to_have_count(0)
    expected_colors = {'Germany':'#5e6b66','Britain':'#968c6f','Japan':'#9e8041','Soviet':'#655541','USA':'#656d4f','France':'#515a78','Italy':'#6a6969','Poland':'#676452','Finland':'#bbbaaa','Neutral':'#3c3d41'}
    for nation, color in expected_colors.items():
        row = details.locator(f'.deck-card-strip[data-nation="{nation}"]')
        expect(row).to_have_count(1)
        assert row.evaluate('el=>el.style.getPropertyValue("--strip-color")') == color
        expect(row.locator('.deck-card-thumbnail img')).to_have_count(1)
        assert row.locator('.deck-card-thumbnail').evaluate('el=>el.clientWidth===el.clientHeight')
        assert row.locator('.deck-card-count').bounding_box()['x'] > row.locator('.deck-card-thumbnail').bounding_box()['x']
        assert page.evaluate('async src => (await fetch(src)).ok', row.locator('.deck-card-nation').get_attribute('src'))
    preview_colors = rows.evaluate_all('els=>els.map(el=>({nation:el.dataset.nation,color:el.style.getPropertyValue("--strip-color")}))')

    # Cancel and IME leave country, cards, and card pool unchanged; confirm applies together.
    details.get_by_role('button', name='编辑卡组', exact=True).click()
    builder_rows = page.locator('[aria-label="构筑卡牌列表"] .deck-card-strip')
    expect(builder_rows).to_have_count(seed['count'])
    assert builder_rows.evaluate_all('els=>els.map(el=>({nation:el.dataset.nation,color:el.style.getPropertyValue("--strip-color")}))') == preview_colors
    original_pool = page.get_by_test_id('builder-grid').get_by_role('button').all_text_contents()
    select_value(page, '主国', 'Japan')
    confirm = page.get_by_role('dialog', name='确认更换国家', exact=True)
    expect(page.get_by_role('combobox', name='主国', exact=True)).to_have_attribute('data-value', 'Germany')
    assert page.get_by_test_id('builder-grid').get_by_role('button').all_text_contents() == original_pool
    confirm.dispatch_event('keydown', {'key':'Enter','isComposing':True,'bubbles':True})
    expect(confirm).to_be_visible()
    confirm.press('Escape')
    expect(confirm).to_have_count(0)
    expect(page.get_by_role('combobox', name='主国', exact=True)).to_be_focused()
    select_value(page, '主国', 'Japan')
    confirm.focus(); confirm.press('Enter')
    expect(page.get_by_role('combobox', name='主国', exact=True)).to_have_attribute('data-value', 'Japan')
    expect(builder_rows).to_have_count(seed['count'])
    select_value(page, '盟国', 'France')
    confirm.get_by_role('button', name='取消', exact=True).click()
    expect(page.get_by_role('combobox', name='盟国', exact=True)).to_have_attribute('data-value', 'Soviet')
    select_value(page, '盟国', 'France')
    confirm.get_by_role('button', name='确认更换', exact=True).click()
    expect(page.get_by_role('combobox', name='盟国', exact=True)).to_have_attribute('data-value', 'France')
    first_count = builder_rows.first.locator('.deck-card-count')
    before = int(first_count.text_content())
    builder_rows.first.get_by_role('button', name='增加', exact=False).click()
    expect(first_count).to_have_text(str(before+1))
    builder_rows.first.get_by_role('button', name='减少', exact=False).click()
    expect(first_count).to_have_text(str(before))
    page.get_by_role('button', name='保存更改', exact=True).click()

    # Same layout in both themes at the minimum window; count stays right of the square art.
    page.set_viewport_size({'width':980,'height':640})
    for theme in ['light','dark']:
        page.evaluate('theme=>document.documentElement.className=theme', theme)
        assert rows.first.evaluate('el=>el.scrollWidth===el.clientWidth')
        expect(details.get_by_role('button', name='编辑卡组', exact=True)).to_be_in_viewport()
    details.get_by_role('button', name='关闭卡组详情', exact=True).click()

    # Latest observed valid code is recorded before either importing or dismissing.
    def focus_clipboard(text):
        reads = page.evaluate('window.__clipboardReads')
        page.evaluate('text=>{localStorage.setItem("__testClipboard",text); window.dispatchEvent(new Event("focus"));}', text)
        page.wait_for_function('reads=>window.__clipboardReads>reads', arg=reads)
        # Await the async clipboard continuation, without a screenshot or fixed sleep.
        page.evaluate('()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')

    clipboard_heading = page.get_by_role('heading', name='检测到剪贴板卡组码', exact=True)
    focus_clipboard('分享标题\n'+CODES[0])
    expect(clipboard_heading).to_be_visible()
    assert page.evaluate('localStorage.getItem("kards_last_clipboard_deck_code")') == CODES[0]
    modal.press('Escape')
    expect(clipboard_heading).to_have_count(0)
    focus_clipboard('改过标题，同一个码\n'+CODES[0])
    expect(clipboard_heading).to_have_count(0)

    # Fully restart the browser with persisted local storage, then repeat detection.
    state = context.storage_state()
    context.close(); browser.close()
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context(storage_state=state, viewport={'width':980,'height':640})
    setup(context)
    page = context.new_page()
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(ORIGIN); page.wait_for_load_state('networkidle')
    modal = page.locator('[role="dialog"][aria-modal="true"]')
    clipboard_heading = page.get_by_role('heading', name='检测到剪贴板卡组码', exact=True)
    expect(clipboard_heading).to_have_count(0)
    focus_clipboard(CODES[0]); expect(clipboard_heading).to_have_count(0)
    focus_clipboard(CODES[1]); expect(clipboard_heading).to_be_visible()
    modal.get_by_role('button', name='导入', exact=True).click()
    page.get_by_role('button', name='取消', exact=True).click()
    expect(modal).to_have_count(0)
    focus_clipboard(CODES[1]); expect(clipboard_heading).to_have_count(0)
    focus_clipboard('%%12|invalid;;;')
    assert page.evaluate('localStorage.getItem("kards_last_clipboard_deck_code")') == CODES[1]
    focus_clipboard(CODES[0]); expect(clipboard_heading).to_be_visible()
    modal.press('Escape')
    assert not errors, errors
    (OUT/'result.json').write_text(json.dumps({'status':'passed','screenshots':False,'imageInspection':False,'pageErrors':errors,'checks':['three exact 39-card presets','blank construction','existing unknown-card import','legacy notes hidden','shared nation rows and square cached art','ten sampled header colors','right-aligned count and working quantity controls','country cancel/confirm/IME/focus','cards retained after country change','980x640 controls','clipboard recorded before decision','same code with changed title ignored','browser restart persistence','new code prompted','invalid code ignored','latest-code semantics']},ensure_ascii=False,indent=2),encoding='utf-8')
    context.close(); browser.close()
    print('Deck workflows passed (no screenshots or image inspection)')
