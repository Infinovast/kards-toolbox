"""Theme, over-limit editing and both export paths; no screenshots or image inspection."""
import copy
import json
import sys
from pathlib import Path

from playwright.sync_api import expect, sync_playwright

sys.stdout.reconfigure(encoding='utf-8')
ROOT = Path(__file__).resolve().parents[1]
cards = copy.deepcopy(json.loads((ROOT / 'public/data/cards.json').read_text(encoding='utf-8'))['cards'][:4])
for card, nation, name in zip(cards, ['Germany', 'Britain', 'Neutral', 'Finland'], ['主国测试卡', '盟国测试卡', '中立测试卡', '芬兰测试卡']):
    card['json'].update(faction=nation, title={'zh-Hans': name}, rarity='Standard', type='infantry', kredits=1, set='Base')
    card['reserved'] = False

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    context = browser.new_context(viewport={'width': 1280, 'height': 820})
    context.add_init_script("""
      window.__renders = [];
      window.__themes = [];
      window.__pixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l1sAAAAASUVORK5CYII=';
      window.kardsDesktop = {
        setTheme: async theme => { window.__themes.push(theme); },
        readClipboardText: async () => '', fetchCardImage: async () => window.__pixel,
        renderDeckImage: async request => { window.__renders.push(request); return window.__pixel; }
      };
    """)
    context.route('**/*', lambda route: route.continue_() if route.request.url.startswith(('http://127.0.0.1:5173', 'ws://127.0.0.1:5173', 'data:', 'blob:')) else route.abort())
    page = context.new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto('http://127.0.0.1:5173')
    page.wait_for_load_state('networkidle')
    page.evaluate("""async cards => {
      const {default: store} = await import('/node_modules/.vite/deps/localforage.js');
      const {encodeDeckCode} = await import('/src/lib/deckCode.ts');
      await store.setItem('kards_card_database_v1',{schemaVersion:1,active:{source:'bundled',fetchedAt:null,cards}});
      const code = encodeDeckCode('Germany','Britain',new Map([[cards[0].importId,34],[cards[1].importId,3],[cards[2].importId,2]]));
      const finnishCode = encodeDeckCode('Germany','Finland',new Map([[cards[3].importId,1]]));
      await store.setItem('kards_decks',[
        {id:'counter',name:'计数器测试',code,mainNation:'Germany',allyNation:'Britain',totalCards:39,isFavorite:false,isArena:false,warnings:[]},
        {id:'finnish',name:'芬兰标志测试',code:finnishCode,mainNation:'Germany',allyNation:'Finland',totalCards:1,isFavorite:false,isArena:false,warnings:[]}
      ]);
    }""", cards)
    page.reload()
    page.wait_for_load_state('networkidle')

    page.get_by_role('button', name='卡牌', exact=True).click()
    gallery = page.get_by_test_id('library-grid')
    expect(gallery.locator('.card-caption')).to_have_count(0)
    assert gallery.evaluate('el => parseFloat(getComputedStyle(el).rowGap)') == 20
    card_tile = gallery.locator('.card-tile:not(.hq-stack-tile)').first
    assert card_tile.bounding_box()['width'] <= 168
    for selector in ['.card-tile', '.card-action', '.library-card-art', '.card-face']:
        assert all(color == 'rgba(0, 0, 0, 0)' for color in gallery.locator(selector).evaluate_all('els => els.map(el => getComputedStyle(el).backgroundColor)'))
    page.get_by_role('button', name='卡组', exact=True).click()

    expect(page.get_by_role('button', name='切换到浅色模式').locator('.lucide-moon')).to_be_visible()
    expect(page.get_by_role('button', name='卡牌', exact=True).locator('img')).to_have_attribute('src', '/assets/kards_logos/KardsLogoBeige_cards.png')
    page.get_by_role('button', name='切换到浅色模式').click()
    expect(page.get_by_role('button', name='切换到深色模式').locator('.lucide-sun')).to_be_visible()
    page.wait_for_function("window.__themes.at(-1) === 'light'")
    page.reload()
    page.wait_for_load_state('networkidle')
    expect(page.get_by_role('button', name='切换到深色模式')).to_be_visible()
    expect(page.get_by_role('button', name='卡牌', exact=True).locator('img')).to_have_attribute('src', '/assets/kards_logos/KardsLogoBlack_cards.png')
    page.get_by_role('button', name='设置', exact=True).click()
    expect(page.get_by_role('combobox', name='显示模式', exact=True)).to_have_count(0)
    expect(page.get_by_role('button', name='保存并返回', exact=True)).to_have_count(0)
    page.get_by_test_id('settings-page').press('Escape')
    expect(page.get_by_test_id('settings-page')).to_have_count(0)
    page.get_by_role('button', name='切换到深色模式').click()

    page.get_by_role('button', name='选择卡组 芬兰标志测试', exact=True).click()
    details = page.get_by_role('dialog', name='卡组详情', exact=True)
    expect(details.locator('.deck-card-nation').last).to_have_attribute('src', './assets/filters/finland.svg')
    details.get_by_role('button', name='关闭卡组详情', exact=True).click()
    page.get_by_role('button', name='选择卡组 计数器测试', exact=True).click()
    counter = details.locator('.deck-count-indicator')
    expect(counter.locator('.deck-count-value')).to_have_text('40/40')
    def check_headquarters_alignment(root):
        # Read both rows in one frame while the floating sidebar may still be entering.
        gaps = root.evaluate("""el => {
          const hq = el.querySelector('.deck-headquarters-strip .deck-card-strip-body').getBoundingClientRect();
          const row = el.querySelector('.deck-card-strip .deck-card-strip-body').getBoundingClientRect();
          return [Math.abs(hq.left - row.left), Math.abs(hq.right - row.right)];
        }""")
        assert max(gaps) < 1, gaps
    check_headquarters_alignment(details)
    normal_size = counter.locator('.deck-count-nation').first.evaluate('el => parseFloat(getComputedStyle(el).fontSize)')
    details.get_by_role('button', name='编辑卡组', exact=True).click()
    counter = page.locator('.deck-count-compact')
    check_headquarters_alignment(page.get_by_label('构筑卡牌列表', exact=True))
    for selector in ['.card-action', '.library-card-art', '.card-face']:
        assert all(color == 'rgba(0, 0, 0, 0)' for color in page.get_by_test_id('builder-grid').locator(selector).evaluate_all('els => els.map(el => getComputedStyle(el).backgroundColor)'))
    assert counter.locator('.deck-count-nation').first.evaluate('el => parseFloat(getComputedStyle(el).fontSize)') < normal_size
    tile = page.get_by_test_id('builder-grid').get_by_role('button', name='查看主国测试卡', exact=True)
    tile.dblclick()
    expect(counter.locator('.deck-count-value')).to_have_text('41/40')
    expect(page.locator('.builder-toast')).to_have_text('卡组的卡牌不能超过 40 张')
    assert counter.locator('.deck-count-value strong').evaluate('el => getComputedStyle(el).color') == 'rgb(220, 69, 69)'
    assert counter.locator('.deck-count-value span').evaluate('el => getComputedStyle(el).color') != 'rgb(220, 69, 69)'
    tile.click(button='right')
    expect(counter.locator('.deck-count-value')).to_have_text('40/40')
    page.locator('.deck-card-strip').filter(has=page.get_by_text('主国测试卡', exact=True)).dblclick()
    expect(counter.locator('.deck-count-value')).to_have_text('41/40')
    page.get_by_role('button', name='保存并退出', exact=True).click()
    expect(details.locator('.deck-count-value')).to_have_text('41/40')
    details.get_by_role('button', name='生成本地卡组图片', exact=True).click()
    page.wait_for_function('window.__renders.length === 1')
    request = page.evaluate('window.__renders[0]')
    assert request['mainNation'] == 'Germany' and request['allyNation'] == 'Britain' and request['limit'] == 40
    assert sum(card['count'] for card in request['cards']) == 40
    assert {card['faction'] for card in request['cards']} == {'Germany', 'Britain', 'Neutral'}
    svg = page.evaluate("""async () => {
      const {deckRenderCounterSvg} = await import('/src/lib/deckRenderCounter.ts');
      return deckRenderCounterSvg(window.__renders[0], {main:'main',ally:'ally',total:'total'});
    }""")
    assert '>36</text>' in svg and '>3</text>' in svg and 'fill="#dc4545">41</tspan><tspan>/40' in svg
    assert '含总部' not in svg
    assert 'font-size="48"' in svg and 'height="56"' in svg
    page.get_by_role('button', name='关闭卡组图片预览', exact=True).click()

    # Exercise the actual Canvas route with bundled resources, without inspecting its pixels.
    result = page.evaluate("""async cards => {
      delete window.kardsDesktop.renderDeckImage;
      const {renderDeckImage} = await import('/src/lib/deckRenderer.ts');
      const {encodeDeckCode} = await import('/src/lib/deckCode.ts');
      const code = encodeDeckCode('Germany','Britain',new Map([[cards[0].importId,1]]));
      const image = await renderDeckImage(code,cards,'计数器导出');
      return image.startsWith('data:image/png;base64,') && image.length > 1000;
    }""", cards)
    assert result
    page.set_viewport_size({'width': 980, 'height': 640})
    page.get_by_role('button', name='编辑卡组', exact=True).click()
    expect(page.get_by_role('button', name='保存并退出')).to_be_visible()
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    assert not errors, errors
    context.close()
    browser.close()
    print('Theme persistence, compact galleries, aligned headquarters, overflow counters, export layout and Canvas rendering passed')
