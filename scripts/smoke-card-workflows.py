"""Card filters, details, comparison shortcuts and builder regression.

Run the renderer on port 5189 first. Uses an isolated browser context.
"""
import json
import os
import re
import sys
from pathlib import Path

from playwright.sync_api import expect, sync_playwright
from select_helpers import select_value

ORIGIN = os.environ.get('KARDS_TEST_URL', 'http://127.0.0.1:5189')
sys.stdout.reconfigure(encoding='utf-8')
sys.stderr.reconfigure(encoding='utf-8')
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'test-results' / 'card-workflows'
OUT.mkdir(parents=True, exist_ok=True)
records = json.loads((ROOT / 'public/data/cards.json').read_text(encoding='utf-8'))['cards']
reserve = next(card for card in records if card.get('reserved') and card['json'].get('faction') == 'Germany' and card['json'].get('set') not in ['OnlySpawnable', 'Special'])
CODE = '%%26|191a2H2i2yDQDSsRtXyE;DTwcyGyNyOySzB;DDDRDVtTyH;'

with sync_playwright() as p:
    browser = p.chromium.launch(channel=os.environ.get('KARDS_BROWSER_CHANNEL', 'msedge'), headless=True)
    context = browser.new_context(viewport={'width': 1280, 'height': 820}, reduced_motion='reduce')
    context.route('**/*', lambda route: route.continue_() if route.request.url.startswith((ORIGIN, 'data:', 'blob:')) else route.abort())
    context.add_init_script("window.kardsDesktop = {readClipboardText: async () => '', setTheme: async () => {}, getAppInfo: async () => null};")
    page = context.new_page()
    page.set_default_timeout(12000)
    errors, warnings = [], []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('console', lambda message: warnings.append(message.text) if 'same key' in message.text else None)
    page.goto(ORIGIN)
    page.wait_for_load_state('networkidle')
    page.evaluate('''async fixture => {
      const { default: store } = await import('/node_modules/.vite/deps/localforage.js');
      const settings = await store.getItem('kards_settings') || {};
      await store.setItem('kards_settings', { ...settings, showWelcomePage: false, showReserveDecks: true });
      await store.setItem('kards_decks', [
        {id:'reserve-test',name:'reserve-workflow',code:'%%11|' + fixture.reserveId + ';;;',mainNation:'Germany',allyNation:'Germany',totalCards:1,tags:[],warnings:[],isFavorite:false,isArena:false},
        {id:'other-test',name:'other-workflow',code:fixture.code,mainNation:'Britain',allyNation:'France',totalCards:39,tags:[],warnings:[],isFavorite:false,isArena:false}
      ]);
    }''', {'reserveId': reserve['importId'], 'code': CODE})
    page.reload()
    page.wait_for_load_state('networkidle')
    nav = page.get_by_role('complementary', name='主导航', exact=True)
    nav.get_by_role('button', name='卡牌', exact=True).click()
    search = page.get_by_role('textbox', name='搜索卡牌', exact=True)
    expect(search).to_be_visible()

    # The toolbar exposes a single settings symbol; nested selectors work independently.
    settings = page.get_by_role('button', name='卡牌库设置', exact=True)
    expect(settings.locator('svg.lucide-settings')).to_have_count(1)
    expect(page.get_by_role('combobox', name='卡牌文字语言', exact=True)).to_have_count(0)
    settings.click()
    settings_panel = page.get_by_role('dialog', name='卡牌库设置', exact=True)
    expect(settings_panel).to_be_visible()
    page.get_by_role('combobox', name='卡牌文字语言', exact=True).click()
    page.get_by_role('listbox').press('Escape')
    expect(settings_panel).to_be_visible()
    page.keyboard.press('Escape')
    expect(settings_panel).to_have_count(0)
    expect(settings).to_be_focused()
    select_value(page, '卡牌文字语言', 'en-EN')
    expect(settings_panel).to_have_count(0)
    select_value(page, '卡牌文字语言', 'zh-Hans')
    settings.click()
    search.click()
    expect(settings_panel).to_have_count(0)
    settings.click()
    page.get_by_role('combobox', name='卡牌详情样式', exact=True).press('Tab')
    expect(settings_panel).to_have_count(0)

    # Library symbols share builder behavior, preserving filters through reflow.
    bar = page.locator('.library-filter-bar')
    page.set_viewport_size({'width':1920,'height':1080})
    expect(bar).to_have_attribute('data-collapsed', '0')
    for label in ['阵营筛选', '类型筛选', '稀有度筛选']:
        expect(bar.get_by_role('group', name=label, exact=True)).to_be_visible()
    controls = page.locator('.library-search-controls')
    expect(controls.locator(':scope > *')).to_have_count(4)
    assert controls.evaluate("el => el.children[0].classList.contains('library-search') && el.children[1].getAttribute('aria-label') === '卡牌状态筛选' && el.children[2].getAttribute('aria-label') === '扩展包筛选' && el.children[3].getAttribute('aria-label') === '卡牌排序'")
    expect(bar.get_by_role('combobox', name='扩展包筛选', exact=True)).to_have_count(0)
    types = bar.get_by_role('group', name='类型筛选', exact=True)
    rarities = bar.get_by_role('group', name='稀有度筛选', exact=True)
    assert types.bounding_box()['x'] < rarities.bounding_box()['x'] < bar.get_by_role('combobox', name='子类筛选', exact=True).bounding_box()['x']
    bar.get_by_role('button', name='阵营：德国', exact=True).click()
    bar.get_by_role('button', name='类型：步兵', exact=True).click()
    bar.get_by_role('button', name='稀有度：普通', exact=True).click()
    result = page.locator('.library-result-count strong').inner_text()
    layouts = [(True,True,True),(True,True,False),(True,False,True),(True,False,False),(False,True,False),(False,False,True),(False,False,False)]
    stages = []
    for container_width in range(1600, 743, -8):
        bar.evaluate('(el,width) => el.style.maxWidth = `${width}px`', container_width)
        page.evaluate('() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))')
        stage = int(bar.get_attribute('data-collapsed'))
        stages.append(stage)
        for label, expanded in zip(['阵营筛选','类型筛选','稀有度筛选'], layouts[stage]):
            expect(bar.get_by_role('combobox', name=label, exact=True)).to_have_count(0 if expanded else 1)
        expect(page.locator('.library-result-count strong')).to_have_text(result)
    assert stages == sorted(stages) and set(stages) == set(range(7)), stages
    expect(bar).to_have_attribute('data-collapsed', '6')
    assert bar.evaluate('el => el.scrollWidth <= el.clientWidth + 1')
    for theme in ['dark','light']:
        toggle = page.get_by_role('button', name=f'切换到{"深色" if theme=="dark" else "浅色"}模式', exact=True)
        if toggle.count(): toggle.click()
        bar.get_by_role('combobox', name='稀有度筛选', exact=True).click()
        menu = page.locator('.custom-select-icon-menu')
        expect(menu).to_be_visible()
        assert menu.bounding_box()['width'] == 216
        for option in menu.get_by_role('option').all():
            assert option.bounding_box()['height'] == 38
            symbol = option.locator('.builder-rarity-symbol')
            assert symbol.bounding_box()['width'] == 60 and symbol.bounding_box()['height'] == 24
        page.screenshot(path=str(OUT/f'rarity-menu-{theme}.png'))
        page.get_by_role('listbox').press('Escape')
    page.get_by_role('button', name='切换到深色模式',exact=True).click()
    for label, value in [('阵营筛选','Germany'),('类型筛选','infantry'),('稀有度筛选','Standard')]:
        bar.get_by_role('combobox', name=label, exact=True).click()
        expect(page.get_by_role('listbox').locator(f'[data-value="{value}"]')).to_have_attribute('aria-selected','true')
        page.get_by_role('listbox').press('Escape')
    bar.evaluate("el => el.style.removeProperty('max-width')")
    for width in [1920,1280,980]:
        page.set_viewport_size({'width':width,'height':820 if width>980 else 640})
        assert bar.evaluate('el => el.scrollWidth <= el.clientWidth + 1')
        for theme in ['dark','light']:
            toggle = page.get_by_role('button',name=f'切换到{"深色" if theme=="dark" else "浅色"}模式',exact=True)
            if toggle.count(): toggle.click()
            page.evaluate('() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))')
            page.screenshot(path=str(OUT/f'library-inline-{width}-{theme}.png'))
    page.get_by_role('button', name='切换到深色模式', exact=True).click()
    page.get_by_role('button', name='清除筛选', exact=True).click()
    page.set_viewport_size({'width':1280,'height':820})

    # Focus does not resize the search; only the rendered text does.
    width = search.bounding_box()['width']
    search.focus()
    assert abs(search.bounding_box()['width'] - width) < 1
    search.fill('a')
    page.wait_for_function("document.querySelector('.library-search').offsetWidth < 120")
    search.fill('一段较长的搜索内容')
    page.wait_for_function("document.querySelector('.library-search').offsetWidth > 150")
    assert search.evaluate("el => Math.abs(el.getBoundingClientRect().width - Math.ceil(document.querySelector('.library-search-measure').getBoundingClientRect().width) - 74) < 1")
    expect(page.get_by_role('button', name='清除搜索', exact=True).locator('svg.lucide-trash-2')).to_have_count(1)
    page.get_by_role('button', name='清除搜索', exact=True).click()

    # Numeric inference uses the full library and is only offered for scarce text results.
    numeric_queries = page.evaluate('''async () => {
      const {loadCardDatabase} = await import('/src/types/card.ts');
      const {matchesCardFilters, EMPTY_CARD_FILTERS} = await import('/src/lib/cardFilters.ts');
      const cards = await loadCardDatabase();
      const counts = new Map();
      for (const card of cards) {
        if (!['infantry','tank','fighter','bomber','artillery'].includes(card.json.type)) continue;
        for (const fields of [[card.json.kredits,card.json.attack,card.json.defense],
            [card.json.kredits,card.json.operationCost,card.json.attack,card.json.defense]]) {
          if (fields.every(value => Number.isInteger(value) && value>=0 && value<=9)) {
            const query=fields.join(''); counts.set(query,(counts.get(query)||0)+1);
          }
        }
      }
      const all=[...counts].map(([query,count]) => ({query,count,literal:cards.filter(card => matchesCardFilters(card,{...EMPTY_CARD_FILTERS,query})).length}));
      return {scarce:[3,4].map(length => all.find(item => item.query.length===length && item.literal<=3)),
        common:all.find(item => item.literal>3)};
    }''')
    hint = page.get_by_role('button', name=re.compile('^属性数值搜索找到了'))
    assert all(numeric_queries['scarce']), numeric_queries
    for candidate in numeric_queries['scarce']:
        search.fill(candidate['query'])
        expect(hint).to_be_visible()
        expect(hint.locator('strong')).to_have_text(f'{candidate["count"]:,}')
        expect(search).to_have_value(candidate['query'])
        hint.click()
        expect(search).to_have_value('x'+candidate['query'])
        expect(page.locator('.library-result-count strong')).to_have_text(f'{candidate["count"]:,}')
        expect(hint).to_have_count(0)
    candidate = numeric_queries['scarce'][0]
    page.get_by_role('group', name='卡牌状态筛选', exact=True).get_by_role('button', name='衍生', exact=True).click()
    search.fill(candidate['query'])
    expect(hint.locator('strong')).to_have_text(f'{candidate["count"]:,}')
    hint.click()
    expect(page.get_by_role('group', name='卡牌状态筛选', exact=True).get_by_role('button', name='全部', exact=True)).to_have_attribute('aria-pressed','true')
    expect(page.locator('.library-result-count strong')).to_have_text(f'{candidate["count"]:,}')
    for query in ['99','9999','99999','12a','x'+candidate['query']]:
        search.fill(query)
        expect(hint).to_have_count(0)
    if numeric_queries['common']:
        search.fill(numeric_queries['common']['query'])
        expect(hint).to_have_count(0)
    page.get_by_role('button',name='清除搜索',exact=True).click()

    # OR -> AND -> NOT forwards, with right-click reversing and wrapping.
    page.get_by_role('combobox', name='词条筛选', exact=True).click()
    popup = page.get_by_role('listbox', name='词条筛选选项', exact=True)
    popup.locator('[data-value="guard"]').click()
    popup.locator('[data-value="blitz"]').click()
    popup.press('Escape')
    mode = page.get_by_role('button', name='词条匹配：或', exact=True)
    mode.click()
    expect(page.get_by_role('button', name='词条匹配：与', exact=True)).to_have_text('与')
    page.get_by_role('button', name='词条匹配：与', exact=True).click()
    expect(page.get_by_role('button', name='词条匹配：非', exact=True)).to_have_text('非')
    expected = page.evaluate('''async () => {
      const {loadCardDatabase} = await import('/src/types/card.ts');
      const {cardHasKeyword} = await import('/src/lib/cardKeywords.ts');
      return (await loadCardDatabase()).filter(card => !['guard','blitz'].some(keyword => cardHasKeyword(card,keyword))).length;
    }''')
    expect(page.locator('.library-result-count strong')).to_have_text(f'{expected:,}')
    page.get_by_role('button', name='词条匹配：非', exact=True).click()
    expect(page.get_by_role('button', name='词条匹配：或', exact=True)).to_have_text('或')
    for current, previous in [('或', '非'), ('非', '与'), ('与', '或')]:
        page.get_by_role('button', name=f'词条匹配：{current}', exact=True).click(button='right')
        expect(page.get_by_role('button', name=f'词条匹配：{previous}', exact=True)).to_have_text(previous)
    page.get_by_role('button', name='清除筛选', exact=True).click()

    # Four compact columns, special rules-text filtering, and mutually exclusive abilities.
    page.get_by_role('combobox', name='词条筛选', exact=True).click()
    menu = page.locator('.custom-select-popover')
    expect(menu.locator('.custom-select-group')).to_have_text(['对战词条', '独立词条', '扩展词条', '特殊'])
    expect(popup.get_by_role('option')).to_have_count(35)
    assert popup.get_by_role('option').first.bounding_box()['height'] == 28
    material = menu.evaluate('el => ({background:getComputedStyle(el).backgroundColor,blur:getComputedStyle(el).backdropFilter})')
    assert '0.68' in material['background'] and 'blur(24px)' in material['blur'], material
    popup.locator('[data-value="pin"]').click()
    expected = page.evaluate('''async () => {
      const {loadCardDatabase} = await import('/src/types/card.ts');
      return (await loadCardDatabase()).filter(card => Object.values({...card.json.text,...card.json.description}).some(text => /压制|\\bPin\\b/iu.test(text))).length;
    }''')
    assert expected > 0
    expect(page.locator('.library-result-count strong')).to_have_text(f'{expected:,}')
    for keyword in ['guard', 'veteran', 'deployment', 'none']:
        popup.locator(f'[data-value="{keyword}"]').click()
    for keyword in ['guard', 'veteran']:
        expect(popup.locator(f'[data-value="{keyword}"]')).to_have_attribute('aria-selected', 'false')
    for keyword in ['deployment', 'pin', 'none']:
        expect(popup.locator(f'[data-value="{keyword}"]')).to_have_attribute('aria-selected', 'true')
    popup.locator('[data-value="guard"]').click()
    expect(popup.locator('[data-value="none"]')).to_have_attribute('aria-selected', 'false')
    menu.get_by_role('button', name='清除选择', exact=True).click()

    # Count is reachable by keyboard and cycles both ways without scrolling the list.
    count = menu.get_by_role('spinbutton', name='词条数量', exact=True)
    expect(count).to_have_text('不限')
    popup.press('Shift+Tab')
    expect(menu.get_by_role('button', name='清除选择', exact=True)).to_be_focused()
    page.keyboard.press('Shift+Tab')
    expect(count).to_be_focused()
    count.press('ArrowDown')
    expect(count).to_have_text('3')
    count.press('ArrowUp')
    expect(count).to_have_text('不限')
    count.hover()
    scroll_before = popup.evaluate('el => el.scrollTop')
    for value in [1, 2, 3, 0]:
        page.mouse.wheel(0, -100)
        expect(count).to_have_text(str(value) if value else '不限')
        if value:
            expected = page.evaluate('''async count => {
              const {loadCardDatabase} = await import('/src/types/card.ts');
              const {cardKeywordItems} = await import('/src/lib/cardKeywords.ts');
              return (await loadCardDatabase()).filter(card => cardKeywordItems(card,'zh-Hans').length === count).length;
            }''', value)
            expect(page.locator('.library-result-count strong')).to_have_text(f'{expected:,}')
            expect(page.locator('.hq-stack-tile')).to_have_count(0)
    page.mouse.wheel(0, 100)
    expect(count).to_have_text('3')
    assert popup.evaluate('el => el.scrollTop') == scroll_before
    count.click()
    expect(count).to_have_text('不限')
    count.click()
    expect(count).to_have_text('1')
    popup.press('Escape')
    expect(page.get_by_role('combobox', name='词条筛选', exact=True)).to_have_class(re.compile('has-selection'))
    page.get_by_role('button', name='清除筛选', exact=True).click()
    page.get_by_role('combobox', name='词条筛选', exact=True).click()
    expect(count).to_have_text('不限')
    for size in [{'width':1280,'height':820}, {'width':980,'height':640}]:
        page.set_viewport_size(size)
        for theme in ['dark', 'light']:
            toggle = page.get_by_role('button', name=f'切换到{"深色" if theme == "dark" else "浅色"}模式', exact=True)
            if toggle.count(): toggle.click()
            if not menu.is_visible(): page.get_by_role('combobox', name='词条筛选', exact=True).click()
            page.wait_for_function("[...document.querySelectorAll('.custom-select-popover img')].every(img => img.complete && img.naturalWidth > 0)")
            box = menu.bounding_box()
            assert box['x'] >= 0 and box['x'] + box['width'] <= size['width']
            assert menu.evaluate('el => el.scrollWidth <= el.clientWidth + 1')
            page.screenshot(path=str(OUT / f'keyword-menu-{size["width"]}-{theme}.png'))
    popup.press('Escape')
    page.get_by_role('button', name='切换到深色模式', exact=True).click()
    page.set_viewport_size({'width':1280,'height':820})

    # A temporary form has no deck ID in either detail mode. All forms stay keyed separately.
    search.fill('temp_deluge_1')
    card = page.locator('[data-detail-source="temp_deluge_1"]')
    expect(card).to_be_visible()
    cache_button = page.get_by_role('button', name=re.compile('^缓存卡牌图片'))
    expect(cache_button).to_be_visible()
    card.click()
    detail = page.get_by_role('dialog', name=re.compile('^卡牌详情'))
    expect(detail.locator('dt', has_text='卡组码 ID').locator('xpath=following-sibling::dd[1]')).to_have_text('无')
    page.keyboard.press('Escape')
    select_value(page, '卡牌详情样式', 'sidebar')
    card.click()
    detail = page.get_by_role('dialog', name='卡牌详情', exact=True)
    expect(detail.locator('dt', has_text='卡组码 ID').locator('xpath=following-sibling::dd[1]')).to_have_text('无')
    page.keyboard.press('Escape')

    # Fill both cache variants, then delete one: visibility follows the current results.
    page.evaluate('''async () => {
      const {loadCardDatabase} = await import('/src/types/card.ts');
      const {readCardImageCache,deleteCachedImages} = await import('/src/lib/cardImages.ts');
      const {default:store} = await import('/node_modules/.vite/deps/localforage.js');
      const card = (await loadCardDatabase()).find(card => card.cardId === 'temp_deluge_1');
      const entry = (await readCardImageCache([card])).entries[0];
      for (const part of [entry.full,entry.thumbnail]) await store.setItem(part.key,'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aT90AAAAASUVORK5CYII=');
      await deleteCachedImages([]);
    }''')
    expect(cache_button).to_have_count(0)
    page.evaluate('''async () => {
      const {loadCardDatabase} = await import('/src/types/card.ts');
      const {readCardImageCache,deleteCachedImages} = await import('/src/lib/cardImages.ts');
      const card = (await loadCardDatabase()).find(card => card.cardId === 'temp_deluge_1');
      await deleteCachedImages([(await readCardImageCache([card])).entries[0].thumbnail.key]);
    }''')
    expect(cache_button).to_be_visible()
    search.fill('不存在的搜索结果测试')
    expect(page.locator('.library-result-count strong')).to_have_text('0')
    expect(cache_button).to_have_count(0)
    page.get_by_role('button', name='清除搜索', exact=True).click()
    page.get_by_role('group', name='卡牌状态筛选', exact=True).get_by_role('button', name='预备', exact=True).click()
    for theme in ['dark', 'light']:
        if theme == 'light': page.get_by_role('button', name='切换到浅色模式', exact=True).click()
        page.screenshot(path=str(OUT / f'library-{theme}.png'))
    badge = page.locator('.library-reserved-badge').first
    def badge_ratios():
        return badge.evaluate('''el => {const a=el.parentElement.getBoundingClientRect(),b=el.getBoundingClientRect();return [b.width/a.width,(b.x-a.x)/a.width,(a.bottom-b.bottom)/a.height];}''')
    ratios = badge_ratios()
    page.set_viewport_size({'width': 980, 'height': 640})
    page.wait_for_function("window.innerWidth === 980")
    smaller = badge_ratios()
    assert all(abs(a-b) < .005 for a,b in zip(ratios,smaller)), (ratios,smaller)
    page.screenshot(path=str(OUT / 'library-minimum-light.png'))

    # Deck-detail actions are compact, and the shortcut selects left + opens right.
    page.set_viewport_size({'width': 1280, 'height': 820})
    nav.get_by_role('button', name='卡组', exact=True).click()
    page.get_by_text('reserve-workflow', exact=True).first.click()
    panel = page.get_by_role('dialog', name='卡组详情', exact=True)
    tag = panel.get_by_role('button', name='添加标签', exact=True)
    expect(tag).to_have_text('')
    expect(tag.locator('svg')).to_have_count(2)
    compare = panel.get_by_role('button', name='对比此卡组', exact=True)
    assert compare.bounding_box()['x'] < panel.get_by_role('button', name='卡组分析', exact=True).bounding_box()['x']
    expect(panel.locator(':scope > div')).to_have_css('opacity', '1')
    page.screenshot(path=str(OUT / 'deck-detail-light.png'))
    compare.click()
    expect(page.locator('#compare-deck-a-name')).to_have_value('reserve-workflow')
    expect(page.locator('.deck-compare-column.is-left').get_by_role('button', name='仅分析', exact=True)).to_be_disabled()
    picker = page.get_by_role('dialog', name='选择现有卡组', exact=True)
    expect(picker).to_be_visible()
    picker.get_by_role('button', name=re.compile('^other-workflow')).click()
    expect(page.locator('#compare-deck-b-name')).to_have_value('other-workflow')
    expect(page.locator('.deck-compare-column.is-left .deck-compare-result-heading')).to_have_text('reserve-workflow')
    expect(page.locator('.deck-compare-column.is-right .deck-compare-result-heading')).to_have_text('other-workflow')

    # Reserved decks enter the builder with reserve cards visible; expansion adapts.
    nav.get_by_role('button', name='卡组', exact=True).click()
    page.get_by_test_id('deck-grid').get_by_text('reserve-workflow', exact=True).dblclick()
    builder = page.locator('[aria-label="卡组构筑"]')
    expect(builder).to_be_visible()
    reserve_toggle = page.get_by_role('button', name='含预备', exact=True)
    expect(reserve_toggle).to_have_attribute('aria-pressed', 'true')
    expect(page.locator(f'[data-pool-card-id="{reserve["importId"]}"]')).to_be_visible()
    bsearch = page.get_by_role('textbox', name='构筑搜索卡牌', exact=True)
    initial_width = bsearch.bounding_box()['width']
    bsearch.focus()
    assert abs(bsearch.bounding_box()['width'] - initial_width) < 1
    bsearch.fill('构筑搜索长度检查')
    page.wait_for_function("document.querySelector('.builder-search').offsetWidth > 160")
    bsearch.fill('')
    expansion = page.locator('.builder-expansion-filter')
    assert expansion.bounding_box()['x'] > reserve_toggle.bounding_box()['x']
    expect(page.locator('.builder-inline-filters').get_by_role('combobox', name='构筑扩展包筛选', exact=True)).to_have_count(0)
    page.set_viewport_size({'width': 1920, 'height': 1080})
    expect(expansion).to_have_attribute('data-collapsed', 'false')
    expansion.get_by_role('button', name='扩展包：基础', exact=True).click()
    expect(expansion.get_by_role('button', name='扩展包：基础', exact=True)).to_have_attribute('aria-pressed', 'true')
    page.screenshot(path=str(OUT / 'builder-wide-light.png'))
    page.set_viewport_size({'width': 980, 'height': 640})
    expect(expansion).to_have_attribute('data-collapsed', 'true')
    select_value(page, '构筑扩展包筛选', 'All')
    page.screenshot(path=str(OUT / 'builder-minimum-light.png'))
    toolbar = page.locator('.builder-pool-toolbar')
    assert toolbar.evaluate('el => el.scrollWidth <= el.clientWidth + 1')
    assert not errors, errors
    assert not warnings, warnings
    context.close()
    browser.close()
    print('Card workflows passed: bidirectional keyword modes, special filters, mutual exclusion, count cycling, glass menus, search sizing, cache visibility, temporary IDs, detail shortcut and builder filters.')
