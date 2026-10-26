"""Cache inventory and legacy strip thumbnail regression; no screenshots or image decoding."""
import copy
import json
import re
import sys
from pathlib import Path
from playwright.sync_api import expect, sync_playwright
from select_helpers import select_value

sys.stdout.reconfigure(encoding='utf-8')
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'test-results/cache-settings'
OUT.mkdir(parents=True, exist_ok=True)
cards = json.loads((ROOT / 'public/data/cards.json').read_text(encoding='utf-8'))['cards']
pair = [next(card for card in cards if card['cardId'] == name) for name in ['50_infantry_regiment', '50_infantry_regiment_vet']]
legacy = copy.deepcopy(pair)
for card in legacy:
    del card['imageUrl'], card['thumbUrl']

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    context = browser.new_context(viewport={'width': 1280, 'height': 820})
    context.add_init_script("""window.__images = [];
      window.__delay = 0;
      window.__failThumbnail = localStorage.getItem('__failThumbnail') === 'yes';
      window.__full = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l1sAAAAASUVORK5CYII=';
      window.kardsDesktop = { setTheme: async () => true, fetchCardImage: async url => {
        window.__images.push(url);
        if (window.__delay) await new Promise(resolve => setTimeout(resolve, window.__delay));
        if (url.includes('/thumb/')) {
          if (window.__failThumbnail && url.endsWith('/50_infantry_regiment.avif')) throw new Error('fixture thumbnail failure');
          return 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"></svg>');
        }
        return window.__full;
      }};
    """)
    external = []
    def route_request(route):
        if route.request.url.startswith(('http://127.0.0.1:5173', 'ws://127.0.0.1:5173', 'data:', 'blob:')):
            route.continue_()
        else:
            external.append(route.request.url)
            route.abort()
    context.route('**/*', route_request)
    page = context.new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto('http://127.0.0.1:5173'); page.wait_for_load_state('networkidle')
    page.evaluate("""async cards => {
      const { default: store } = await import('/node_modules/.vite/deps/localforage.js');
      const { encodeDeckCode } = await import('/src/lib/deckCode.ts');
      await store.setItem('kards_card_database_v1', {schemaVersion:1, active:{source:'official', fetchedAt:null, cards}});
      await store.setItem(`kards_card_image_v1_54_zh-Hans_${cards[0].importId}`, window.__full);
      const code = encodeDeckCode('Germany','Britain',new Map([[cards[0].importId,1]]));
      await store.setItem('kards_decks',[{id:'legacy',name:'旧牌库缩略图',code,mainNation:'Germany',allyNation:'Britain',totalCards:1,isFavorite:false,isArena:false,warnings:[]}]);
      localStorage.setItem('__failThumbnail','yes');
    }""", legacy)
    page.reload(); page.wait_for_load_state('networkidle')
    page.get_by_role('button', name='选择卡组 旧牌库缩略图', exact=True).click()
    details = page.get_by_role('dialog', name='卡组详情', exact=True)
    row = details.locator('.deck-card-strip')
    page.wait_for_function('window.__images.length === 1')
    assert page.evaluate('window.__images') == [pair[0]['thumbUrl']], 'legacy full cache must not be used as a thumbnail or redownloaded'
    expect(row.locator('.deck-card-thumbnail img')).to_have_count(0)
    row.hover()
    expect(page.get_by_role('tooltip').locator('img')).to_have_attribute('src', re.compile('^data:image/png;base64,'))
    page.get_by_role('button', name='设置', exact=True).click()
    cache = page.get_by_role('region', name='本地缓存', exact=True)
    expect(cache.get_by_role('button', name='缓存失败（1）', exact=True)).to_be_visible()
    expect(cache.get_by_role('button', name='未缓存（1）', exact=True)).to_be_visible()
    cache.get_by_role('button', name='缓存失败（1）', exact=True).click()
    expect(cache.get_by_text('fixture thumbnail failure', exact=False)).to_be_visible()
    cache_row = cache.get_by_role('table', name='卡牌缓存清单').get_by_role('row').last
    expect(cache_row.get_by_role('cell').first).to_have_text('已缓存')
    expect(cache_row.get_by_role('cell').last).to_contain_text('缓存失败')

    # Restart retains image failures, reading settings doesn't download anything.
    page.reload(); page.wait_for_load_state('networkidle')
    page.get_by_role('button', name='设置', exact=True).click()
    cache.get_by_role('button', name='缓存失败（1）', exact=True).click()
    expect(cache.get_by_text('fixture thumbnail failure', exact=False)).to_be_visible()
    assert page.evaluate('window.__images') == []
    page.evaluate("window.__failThumbnail = false; localStorage.removeItem('__failThumbnail')")
    cache.get_by_role('button', name='重试失败卡图', exact=True).click()
    progress = page.get_by_role('region', name='卡图缓存下载进度', exact=True)
    expect(progress.get_by_role('status')).to_have_text('下载 1 · 已缓存 0 · 失败 0')
    expect(cache.get_by_role('button', name='缓存失败（0）', exact=True)).to_be_visible()
    expect(cache.get_by_role('button', name='已缓存（1）', exact=True)).to_be_visible()
    assert page.evaluate('window.__images') == [pair[0]['thumbUrl']]
    progress.get_by_role('button', name='关闭下载进度', exact=True).click()
    cache.get_by_role('button', name='已缓存（1）', exact=True).click()
    expect(cache.get_by_role('table', name='卡牌缓存清单').get_by_role('cell')).to_have_text(['已缓存', '已缓存'])
    cache.get_by_role('textbox', name='搜索缓存卡牌').fill('no-such-card')
    expect(cache.get_by_text('没有符合搜索条件的卡牌。', exact=True)).to_be_visible()
    cache.get_by_role('textbox', name='搜索缓存卡牌').press('Escape')
    expect(cache.get_by_role('textbox', name='搜索缓存卡牌')).to_have_value('')
    expect(page.get_by_test_id('settings-page')).to_be_visible()
    select_value(page, '缓存语言', 'en-EN')
    select_value(page, '缓存版本', '40')
    expect(cache.get_by_role('button', name='未缓存（2）', exact=True)).to_be_visible()
    assert page.evaluate('window.__images') == [pair[0]['thumbUrl']], 'language/version inventory must not download images'
    page.get_by_role('button', name='卡组', exact=True).click()
    page.get_by_role('button', name='选择卡组 旧牌库缩略图', exact=True).click()
    expect(row.locator('.deck-card-thumbnail img')).to_have_attribute('src', re.compile('^data:image/svg\\+xml,'))
    assert row.locator('.deck-card-thumbnail img').evaluate('el => getComputedStyle(el).position') == 'static'
    details.get_by_role('button', name='编辑卡组', exact=True).click()
    expect(page.locator('.deck-card-strip .deck-card-thumbnail img')).to_have_attribute('src', re.compile('^data:image/svg\\+xml,'))
    stored = page.evaluate("async () => (await import('/node_modules/.vite/deps/localforage.js')).default.getItem('kards_card_database_v1')")
    assert stored['active']['cards'] == legacy

    # A larger batch exercises pagination, cross-page updates, cancellation and resume.
    batch = cards[:35]
    page.evaluate("""async cards => {
      const { default: store } = await import('/node_modules/.vite/deps/localforage.js');
      await store.clear();
      await store.setItem('kards_card_database_v1',{schemaVersion:1,active:{source:'kardsplayer',fetchedAt:null,cards}});
    }""", batch)
    page.reload(); page.wait_for_load_state('networkidle')
    page.get_by_role('button', name='设置', exact=True).click()
    cache.get_by_role('button', name='未缓存（35）', exact=True).click()
    expect(cache.get_by_role('table', name='卡牌缓存清单').get_by_role('row')).to_have_count(31)
    cache.get_by_role('button', name='下一页', exact=True).click()
    expect(cache.get_by_role('table', name='卡牌缓存清单').get_by_role('row')).to_have_count(6)
    page.evaluate('window.__delay = 500')
    cache.get_by_role('button', name='缓存未缓存卡图', exact=True).click()
    page.get_by_role('button', name='卡组', exact=True).click()
    expect(progress).to_be_visible()
    progress.get_by_role('button', name='停止下载', exact=True).click()
    expect(progress.get_by_text('缓存已停止', exact=True)).to_be_visible()
    page.get_by_role('button', name='设置', exact=True).click()
    expect(cache.get_by_role('combobox', name='缓存查看范围', exact=True)).to_have_attribute('data-value', 'recent')
    expect(cache.get_by_role('button', name='缓存失败（0）', exact=True)).to_be_visible()
    done = int(re.search(r'已缓存（(\d+)）', cache.get_by_role('button', name=re.compile('^已缓存（')).text_content()).group(1))
    assert 0 < done < 35
    expect(cache.get_by_role('button', name=f'未缓存（{35-done}）', exact=True)).to_be_visible()
    page.evaluate('window.__delay = 0')
    cache.get_by_role('button', name='缓存未缓存卡图', exact=True).click()
    expect(cache.get_by_role('button', name='已缓存（35）', exact=True)).to_be_visible(timeout=15000)
    expect(cache.get_by_role('button', name='未缓存（0）', exact=True)).to_be_visible()
    cache.get_by_role('button', name='已缓存（35）', exact=True).click()
    cache.locator('summary').click()
    expect(cache.get_by_role('table', name='卡图文件分类').get_by_role('row').last.get_by_role('cell')).to_have_text(['简体中文', 'v53', '35', '35'])
    page.set_viewport_size({'width':980,'height':640})
    assert cache.evaluate('el => el.scrollWidth <= el.clientWidth')
    assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
    page.reload(); page.wait_for_load_state('networkidle')
    page.get_by_role('button', name='设置', exact=True).click()
    expect(cache.get_by_role('button', name='已缓存（35）', exact=True)).to_be_visible()
    expect(cache.get_by_role('combobox', name='缓存查看范围', exact=True)).to_have_attribute('data-value', 'recent')
    assert page.evaluate('window.__images') == []

    # Large downloads require confirmation; declining must leave every cache untouched.
    page.evaluate("""async cards => {
      const { default: store } = await import('/node_modules/.vite/deps/localforage.js');
      await store.clear();
      await store.setItem('kards_card_database_v1',{schemaVersion:1,active:{source:'kardsplayer',fetchedAt:null,cards}});
    }""", cards[:105])
    page.reload(); page.wait_for_load_state('networkidle')
    page.get_by_role('button', name='设置', exact=True).click()
    expect(cache.get_by_role('button', name='未缓存（105）', exact=True)).to_be_visible()
    confirmations = []
    def decline(dialog):
        confirmations.append(dialog.message)
        dialog.dismiss()
    page.once('dialog', decline)
    cache.get_by_role('button', name='缓存未缓存卡图', exact=True).click()
    assert len(confirmations) == 1 and '105' in confirmations[0]
    assert page.evaluate('window.__images') == []
    assert not errors, errors
    assert not external, external
    (OUT / 'ui.json').write_text(json.dumps({'status':'passed','pageErrors':errors,'checks':['legacy true thumbnail without metadata mutation','failed thumbnail placeholder, never full crop','full hover source','persistent failure/retry only missing image','read-only offline inventory','language/history independent','three categories and part status','search/Escape/pagination','batch scope and cancel/resume across pages','live updates and restart','large download confirmation','980x640 no horizontal overflow'],'screenshots':False,'imageDecoding':False},ensure_ascii=False,indent=2),encoding='utf-8')
    context.close(); browser.close()
    print('Cache settings and legacy thumbnail regression passed')
