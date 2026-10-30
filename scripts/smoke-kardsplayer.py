"""Kardsplayer metadata, image addresses and manual migration; no visual tests."""
import copy
import json
import re
import sys
from pathlib import Path
from playwright.sync_api import expect, sync_playwright
from select_helpers import select_value

sys.stdout.reconfigure(encoding='utf-8')
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'test-results/kardsplayer'
OUT.mkdir(parents=True, exist_ok=True)
KEY = 'kards_card_database_v1'
cards = json.loads((ROOT / 'public/data/cards.json').read_text(encoding='utf-8'))['cards']
pair = [next(c for c in cards if c['cardId'] == name) for name in ['50_infantry_regiment', '50_infantry_regiment_vet']]
legacy = copy.deepcopy(pair)
for c in legacy:
    del c['imageUrl'], c['thumbUrl']

def stored(page):
    return page.evaluate("""async () => {
      const {default: store} = await import('/node_modules/.vite/deps/localforage.js');
      return store.getItem('kards_card_database_v1');
    }""")

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    context = browser.new_context(viewport={'width': 1280, 'height': 820})
    context.add_init_script("""window.__images = [];
      window.__failThumbnail = false;
      window.kardsDesktop = {
        setTheme: async () => true,
        fetchCardImage: async url => {
          window.__images.push(url);
          if (url.includes('/thumb/')) {
            if (window.__failThumbnail && url.endsWith('/50_infantry_regiment.avif')) throw new Error('fixture thumbnail failure');
            return 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"></svg>');
          }
          return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l1sAAAAASUVORK5CYII=';
        }
      };
    """)
    page = context.new_page()
    errors, api_calls = [], []
    page.on('pageerror', lambda e: errors.append(str(e)))
    remote = [copy.deepcopy(pair)]

    def route_request(route):
        url = route.request.url
        if url == 'https://api.kardsplayer.com/graphql':
            api_calls.append(route.request.post_data_json)
            route.fulfill(json={'data': {'cards': {'pageInfo': {'count': 2, 'hasNextPage': False}, 'edges': [{'node': c} for c in remote[0]]}}})
        elif url.startswith(('http://127.0.0.1:5173', 'ws://127.0.0.1:5173', 'data:', 'blob:')):
            route.continue_()
        else:
            route.abort()

    page.route('**/*', route_request)
    page.goto('http://127.0.0.1:5173'); page.wait_for_load_state('networkidle')
    page.evaluate("""async cards => {
      const {default: store} = await import('/node_modules/.vite/deps/localforage.js');
      await store.setItem('kards_card_database_v1', {schemaVersion: 1, active: {source: 'official', fetchedAt: null, cards}});
    }""", legacy)
    page.reload(); page.wait_for_load_state('networkidle')
    page.get_by_role('button', name='卡牌', exact=True).click()
    expect(page.get_by_text('本地目录 2 张 · 当前结果 2 张', exact=True)).to_be_visible()
    assert stored(page)['active']['cards'] == legacy, 'an installed old catalogue must not be silently replaced'
    assert not api_calls
    page.get_by_role('button', name='设置', exact=True).click()
    expect(page.get_by_text('2 张 · 旧官方接口数据', exact=True)).to_be_visible()
    page.get_by_role('button', name='获取最新卡牌数据', exact=True).click()
    expect(page.get_by_text('当前 2 张 → 待更新 2 张 · 新增 0 / 修改 2 / 移除 0', exact=True)).to_be_visible()
    page.locator('details summary').first.click()
    expect(page.get_by_role('rowheader', name='当前卡图地址', exact=True)).to_be_visible()
    expect(page.get_by_role('rowheader', name='缩略图地址', exact=True)).to_be_visible()
    assert stored(page)['active']['cards'] == legacy
    page.get_by_role('button', name='应用更新', exact=True).click()
    expect(page.get_by_text('2 张 · Kardsplayer 更新数据', exact=True)).to_be_visible()
    assert stored(page)['active']['cards'] == pair
    page.get_by_role('button', name='卡牌', exact=True).click()
    search = page.get_by_role('textbox', name='搜索卡牌', exact=True)
    search.fill('50_infantry_regiment')
    expect(page.get_by_test_id('library-grid').get_by_role('button')).to_have_count(2)
    base = page.get_by_role('button', name='查看第 50 步兵团', exact=True)
    veteran = page.get_by_role('button', name='查看第 50 步兵团（老兵）', exact=True)
    expect(base).to_be_visible(); expect(veteran).to_be_visible()
    base.click()
    detail = page.get_by_role('dialog', name='卡牌详情', exact=True)
    def stat(label, value):
        expect(detail.locator('dt', has_text=label).locator('xpath=following-sibling::dd[1]')).to_have_text(value)
    stat('部署费用', '2 K'); stat('行动费用', '1 K'); stat('攻击 / 生命', '3 / 2')
    stat('状态', '现役'); stat('常备卡池', '是')
    detail.get_by_role('button', name='老兵形态第 50 步兵团（老兵）', exact=True).click()
    expect(detail.get_by_role('heading', name='第 50 步兵团（老兵）', exact=True)).to_be_visible()
    stat('攻击 / 生命', '4 / 3'); stat('卡组码 ID', 'Cr')
    expect(detail.get_by_label('卡牌词条', exact=True)).to_have_text('伏击')
    detail.get_by_role('button', name='原卡第 50 步兵团', exact=True).click()
    expect(detail.get_by_role('heading', name='第 50 步兵团', exact=True)).to_be_visible()
    detail.press('Escape')
    expect(detail).to_have_count(0)
    select_value(page, '卡牌文字语言', 'en-EN')
    expect(page.get_by_role('button', name='查看50. INFANTRY REGIMENT (Veteran)', exact=True)).to_be_visible()
    page.wait_for_function("window.__images.some(u => u.includes('/v53/zh-Hans/50_infantry_regiment_vet.avif'))")
    urls = page.evaluate('window.__images')
    assert pair[0]['imageUrl'] in urls and pair[1]['imageUrl'] in urls
    assert pair[0]['thumbUrl'] in urls and pair[1]['thumbUrl'] in urls

    # An image-only remote change must be visible and invalidate just that URL.
    remote[0][0]['imageUrl'] = pair[0]['imageUrl'].replace('/v53/', '/v55/')
    page.get_by_role('button', name='设置', exact=True).click()
    page.get_by_role('button', name='获取最新卡牌数据', exact=True).click()
    expect(page.get_by_text('当前 2 张 → 待更新 2 张 · 新增 0 / 修改 1 / 移除 0', exact=True)).to_be_visible()
    page.get_by_role('button', name='应用更新', exact=True).click()
    expect(page.get_by_text('更新已应用，卡牌库和构筑已使用新数据。当前卡图按新地址加载，已有缓存保留。', exact=True)).to_be_visible()
    page.get_by_role('button', name='卡牌', exact=True).click()
    page.wait_for_function("window.__images.some(u => u.includes('/v55/zh-Hans/50_infantry_regiment.avif'))")
    count = len(page.evaluate('window.__images'))
    page.get_by_role('button', name='设置', exact=True).click()
    page.once('dialog', lambda dialog: dialog.accept())
    page.get_by_role('button', name='回退上次数据', exact=True).click()
    expect(page.get_by_text('已回退至上次卡牌数据，用户卡组和卡图缓存未改变。', exact=True)).to_be_visible()
    page.get_by_role('button', name='卡牌', exact=True).click()
    page.wait_for_load_state('networkidle')
    assert len(page.evaluate('window.__images')) == count, 'rollback must reuse the preserved original URL cache'
    assert stored(page)['active']['cards'] == pair

    # Full-only old caches need thumbnail completion, not a redundant full download.
    page.evaluate("""async card => {
      const {default: store} = await import('/node_modules/.vite/deps/localforage.js');
      await store.removeItem(`kards_card_image_v2_${card.importId}_${encodeURIComponent(card.thumbUrl)}`);
      window.__failThumbnail = true;
    }""", pair[0])
    page.get_by_role('button', name='缓存卡牌图片（2）', exact=True).click()
    progress = page.get_by_role('region', name='卡图缓存下载进度', exact=True)
    expect(progress.get_by_text('缓存完成', exact=True)).to_be_visible()
    expect(progress.get_by_role('status')).to_have_text('下载 0 · 已缓存 1 · 失败 1')
    downloads_before = page.evaluate('window.__images.length')
    page.evaluate('window.__failThumbnail = false')
    progress.get_by_role('button', name='重试失败卡图', exact=True).click()
    expect(progress.get_by_text('缓存完成', exact=True)).to_be_visible()
    expect(progress.get_by_role('status')).to_have_text('下载 1 · 已缓存 0 · 失败 0')
    assert page.evaluate('window.__images.slice(' + str(downloads_before) + ')') == [pair[0]['thumbUrl']]
    progress.get_by_role('button', name='关闭下载进度', exact=True).click()
    page.get_by_role('button', name='缓存卡牌图片（2）', exact=True).click()
    expect(progress.get_by_role('status')).to_have_text('下载 0 · 已缓存 2 · 失败 0')
    progress.get_by_role('button', name='关闭下载进度', exact=True).click()

    page.evaluate("""async () => {
      const {default: store} = await import('/node_modules/.vite/deps/localforage.js');
      const {encodeDeckCode} = await import('/src/lib/deckCode.ts');
      const code = encodeDeckCode('Germany', 'Britain', new Map([['lV', 1]]));
      await store.setItem('kards_decks', [{id:'image-pair',name:'缩略图卡组',code,mainNation:'Germany',allyNation:'Britain',totalCards:1,isFavorite:false,isArena:false,warnings:[]}]);
    }""")
    page.reload(); page.wait_for_load_state('networkidle')
    page.get_by_role('button', name='选择卡组 缩略图卡组', exact=True).click()
    details = page.get_by_role('dialog', name='卡组详情', exact=True)
    row = details.locator('.deck-card-strip')
    expect(row.locator('.deck-card-thumbnail img')).to_have_attribute('src', re.compile('^data:image/svg\\+xml,'))
    row.hover()
    expect(page.get_by_role('tooltip').locator('img')).to_have_attribute('src', re.compile('^data:image/png;base64,'))
    row.press('Escape')
    details.get_by_role('button', name='编辑卡组', exact=True).click()
    expect(page.locator('.deck-card-strip .deck-card-thumbnail img')).to_have_attribute('src', re.compile('^data:image/svg\\+xml,'))
    assert not errors, errors
    (OUT / 'ui.json').write_text(json.dumps({'status': 'passed', 'pageErrors': errors, 'checks': ['legacy manual migration', 'URL-only preview/apply/rollback', 'base/veteran distinct titles', '3/2 vs 4/3 and 2/1 costs', 'ambush keyword', 'related card navigation', 'OnlySpawnable base remains constructible', 'text language independent of Chinese image URLs', 'cache retained for rollback', 'paired full/thumbnail cache', 'partial thumbnail retry without full redownload', 'bulk skip requires both images', 'details/builder strips use thumbnails and hover uses full images']}, ensure_ascii=False, indent=2), encoding='utf-8')
    context.close(); browser.close()
    print('Kardsplayer UI smoke passed')
