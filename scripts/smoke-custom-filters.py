"""Custom select/filter regression. DOM and interaction checks only; no image reads."""
import copy
import json
import sys
from pathlib import Path

from playwright.sync_api import expect, sync_playwright
from select_helpers import select_value

sys.stdout.reconfigure(encoding='utf-8')
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'test-results/custom-filters'
OUT.mkdir(parents=True, exist_ok=True)
records = json.loads((ROOT / 'public/data/cards.json').read_text(encoding='utf-8'))['cards']
weather_ids = set(json.loads((ROOT / 'src/data/cardStatusGroups.json').read_text(encoding='utf-8'))['weather'])
specs = [
    ('德军步兵', 'Germany', 'infantry', 0, 'Standard', 'Base'),
    ('德军坦克', 'Germany', 'tank', 7, 'Elite', 'OceaniaStorm'),
    ('苏军步兵', 'Soviet', 'infantry', 1, 'Limited', 'Homefront'),
    ('苏军指令', 'Soviet', 'order', 8, 'Special', 'NavalWarfare'),
    ('中立指令', 'Neutral', 'order', 0, 'Standard', 'Base'),
    ('日本战斗机', 'Japan', 'fighter', 3, 'Elite', 'Base'),
    ('盟国精英', 'Soviet', 'tank', 7, 'Elite', 'Base'),
    ('主国衍生', 'Germany', 'infantry', 0, 'Standard', 'OnlySpawnable'),
    ('主国特殊', 'Germany', 'infantry', 0, 'Standard', 'Special'),
    ('T-34测试卡', 'Soviet', 'tank', 4, 'Limited', 'Base'),
    ('喷火测试卡', 'Britain', 'fighter', 3, 'Limited', 'Base'),
]
catalogue = {card['cardId']: card for card in records}
fixture_records = [card for card in records if card['cardId'] not in weather_ids]
cards = copy.deepcopy(fixture_records[:len(specs) - 2] + [catalogue['ot34'], catalogue['spitfire_mk_ia']])
for card, (name, faction, kind, cost, rarity, expansion) in zip(cards, specs):
    card['json'] = {'title': {'zh-Hans': name, 'en-EN': 'English ' + name}, 'description': {'en-EN': 'custom filter fixture'}, 'faction': faction, 'type': kind, 'kredits': cost, 'rarity': rarity, 'set': expansion}
    card['reserved'] = False
cards[0]['json']['attributes'] = ['blitz', 'guard']
cards[0]['json']['permanent_pool'] = True
cards[1]['json']['attributes'] = ['heavyArmor2', 'bond']
cards[2]['json']['attributes'] = ['BecomesVeteran:fixture_vet', 'OnlySpawnable']
cards[3]['json']['attributes'] = ['OnlySpawnable']
cards[4]['json']['attributes'] = ['covert', 'intel2']
cards[5]['json']['exile'] = 'Britain'


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context(viewport={'width': 1920, 'height': 1080})
    page = context.new_page()
    errors, bad_assets = [], []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('response', lambda response: bad_assets.append(response.url) if '/assets/' in response.url and response.status != 200 else None)
    page.route('**/*', lambda route: route.continue_() if route.request.url.startswith(('http://127.0.0.1:5173', 'ws://127.0.0.1:5173', 'data:', 'blob:')) else route.abort())
    page.goto('http://127.0.0.1:5173')
    page.wait_for_load_state('networkidle')
    page.evaluate('''async cards => {
      const {default: store} = await import('/node_modules/.vite/deps/localforage.js');
      const {encodeDeckCode} = await import('/src/lib/deckCode.ts');
      const code = encodeDeckCode('Germany','Soviet',new Map([[cards[0].importId,1]]));
      await store.setItem('kards_card_database_v1',{schemaVersion:1,active:{cards,source:'bundled',fetchedAt:null}});
      await store.setItem('kards_decks',[{id:'custom-select',name:'筛选控件测试',code,mainNation:'Germany',allyNation:'Soviet',totalCards:1,isFavorite:false,isArena:false,tags:['测试'],warnings:[]}]);
    }''', cards)
    page.reload()
    page.wait_for_load_state('networkidle')

    def open_select(label):
        page.get_by_role('combobox', name=label, exact=True).click()
        return page.get_by_role('listbox', name=label + '选项', exact=True)

    def option(value):
        return page.get_by_role('listbox').locator('[role="option"][data-value=' + json.dumps(value) + ']')

    def cost_button(index, builder=False):
        group = page.get_by_role('group', name='构筑费用筛选' if builder else '费用筛选', exact=True)
        return group.get_by_role('button', name=f'费用 {index}K' + ('+' if index == 7 else ''), exact=True)

    def close_select():
        page.get_by_role('listbox').press('Escape')
        expect(page.locator('.custom-select-popover')).to_have_count(0)

    def result_count(number, builder=False):
        cards = page.get_by_test_id('builder-grid' if builder else 'library-grid').locator('button[aria-label^="查看"]')
        if cards.count() != number:
            print('card count mismatch:', cards.evaluate_all('(els) => els.map(el => [el.getAttribute("aria-label"), el.closest("[data-pool-card-id]")?.getAttribute("data-pool-card-id")])'))
        expect(cards).to_have_count(number)

    def scope_fixture():
        page.get_by_label('搜索卡牌', exact=True).fill('custom filter fixture')

    # Homepage controls, including icon options, retain their single-select behavior.
    expect(page.locator('select')).to_have_count(0)
    select_value(page, '卡组主国筛选', 'Japan')
    expect(page.get_by_role('button', name='选择卡组 筛选控件测试', exact=True)).to_have_count(0)
    select_value(page, '卡组主国筛选', 'All')
    select_value(page, '卡组标签筛选', '测试')
    expect(page.get_by_role('button', name='选择卡组 筛选控件测试', exact=True)).to_be_visible()
    for label in ['卡组主国筛选', '卡组盟国筛选', '卡组标签筛选']:
        assert 'has-selection' not in page.get_by_role('combobox', name=label, exact=True).get_attribute('class')
    page.get_by_role('button', name='卡牌', exact=True).click()
    scope_fixture()
    result_count(11)
    expect(page.get_by_role('combobox')).to_have_count(9)

    # Sorting direction, numeric/name indicators and fixed type ties.
    pool_cards = page.get_by_test_id('library-grid').locator('button[aria-label^="查看"]')
    expect(page.get_by_role('button', name='排序方向：升序', exact=True)).to_have_attribute('aria-pressed', 'false')
    assert pool_cards.evaluate_all('els => els.slice(0,4).map(el => el.title)') == ['德军步兵', '主国衍生', '主国特殊', '中立指令']
    sorting = open_select('卡牌排序依据')
    expect(sorting.get_by_role('option')).to_have_text(['费用', '行动费用', '攻击力', '防御力', '中文名', '英文名'])
    close_select()
    page.get_by_role('button', name='排序方向：升序', exact=True).click()
    expect(pool_cards.first).to_have_attribute('title', '苏军指令')
    expect(pool_cards.last).to_have_attribute('title', '中立指令')
    select_value(page, '卡牌排序依据', 'nameEn')
    expect(page.get_by_role('button', name='排序方向：降序', exact=True)).to_have_text('Z-A')
    page.get_by_role('button', name='排序方向：降序', exact=True).click()
    expect(page.get_by_role('button', name='排序方向：升序', exact=True)).to_have_text('A-Z')
    select_value(page, '卡牌排序依据', 'kredits')
    expect(page.get_by_role('button', name='排序方向：升序', exact=True).locator('svg')).to_have_count(1)
    for label in ['卡牌排序依据', '扩展包筛选', '卡牌文字语言']:
        assert 'has-selection' not in page.get_by_role('combobox', name=label, exact=True).get_attribute('class')

    # One unified attribute map drives OR filtering, numbered keywords and veteran relations.
    keyword_trigger = page.get_by_role('combobox', name='词条筛选', exact=True)
    expect(keyword_trigger).to_have_text('词条')
    keywords = open_select('词条筛选')
    expect(keywords.get_by_role('option')).to_have_count(17)
    for key in ['blitz', 'ambush', 'shock', 'guard', 'fury', 'smokescreen']:
        expect(option(key).locator('span.font-bold')).to_have_class(__import__('re').compile('text-kards-status'))
    option('none').click()
    result_count(6)
    option('blitz').click()
    result_count(7)
    close_select()
    select_value(page, '词条筛选', 'veteran')
    result_count(1)
    select_value(page, '词条筛选', 'heavyArmor')
    result_count(1)
    expect(pool_cards.first).to_have_attribute('title', '德军坦克')
    select_value(page, '词条筛选', 'exile')
    result_count(1)
    expect(pool_cards.first).to_have_attribute('title', '日本战斗机')
    select_value(page, '词条筛选', 'All')
    result_count(11)
    page.get_by_role('button', name='查看德军步兵', exact=True).click()
    overlay = page.locator('.card-detail-overlay')
    expect(overlay).to_have_attribute('data-phase', 'moving')
    assert overlay.locator('.card-detail-art').evaluate('el=>el.getAnimations()[0].effect.getTiming().duration') == 340
    expect(overlay.locator('.card-detail-close')).to_be_hidden()
    overlay.locator('.card-detail-art').evaluate('el=>el.getAnimations()[0].finish()')
    expect(overlay).to_have_attribute('data-phase', 'ready')
    expect(overlay.get_by_label('卡牌词条', exact=True)).to_have_text('闪击，守护')
    expect(overlay.locator('h1 + p[lang="en"]')).to_have_text('English 德军步兵')
    overlay.locator('.card-detail-close').evaluate('''button=>{
      button.click();
      document.querySelector('.card-detail-art').getAnimations().forEach(animation=>animation.pause());
    }''')
    expect(overlay).to_have_attribute('data-phase', 'closing')
    assert overlay.locator('.card-detail-art').evaluate('el=>el.getAnimations()[0].effect.getTiming().duration') == 260
    expect(overlay.locator('.card-detail-close')).to_be_hidden()
    overlay.locator('.card-detail-art').evaluate('el=>el.getAnimations()[0].finish()')
    expect(overlay).to_have_count(0)

    statuses = page.get_by_role('group', name='卡牌状态筛选', exact=True)
    expect(statuses.get_by_role('button')).to_have_text(['全部', '现役', '预备', '常备', '衍生'])
    for label, count in [('现役', 9), ('预备', 0), ('常备', 1), ('衍生', 2), ('全部', 11)]:
        statuses.get_by_role('button', name=label, exact=True).click()
        expect(statuses.locator('button[aria-pressed="true"]')).to_have_count(1)
        expect(statuses.get_by_role('button', name=label, exact=True)).to_have_attribute('aria-pressed', 'true')
        result_count(count)
    for category, count in [('veteran', 0), ('weather', 0), ('research', 0), ('punishment', 0), ('other', 2)]:
        options = open_select('衍生分类筛选')
        expect(options.get_by_role('option')).to_have_text(['老兵', '天气', '研发', '惩戒', '其他'])
        option(category).click()
        expect(options).to_have_count(0)
        expect(statuses.get_by_role('button', name='衍生', exact=True)).to_have_attribute('aria-pressed', 'true')
        expect(statuses.locator('button[aria-pressed="true"]')).to_have_count(1)
        expect(statuses.locator('.card-status-generated')).to_have_attribute('data-selected', 'true')
        expect(page.get_by_role('combobox', name='衍生分类筛选', exact=True)).to_have_attribute('data-value', category)
        result_count(count)
    statuses.get_by_role('button', name='衍生', exact=True).click()
    result_count(2)
    page.get_by_role('button', name='查看主国衍生', exact=True).click()
    overlay.locator('.card-detail-art').evaluate('el=>el.getAnimations()[0]?.finish()')
    expect(overlay.locator('aside dt')).to_have_text(['状态', '卡池'])
    expect(overlay.locator('aside dd').first).to_have_text('现役，衍生卡')
    overlay.press('Escape')
    expect(overlay).to_have_count(0)
    statuses.get_by_role('button', name='全部', exact=True).click()
    result_count(11)

    countries = open_select('阵营筛选')
    expect(countries).to_have_attribute('aria-multiselectable', 'true')
    expect(countries.get_by_role('option')).to_have_count(11)
    expect(option('Germany')).to_contain_text('德国')
    expect(option('Neutral').locator('img')).to_have_attribute('src', '/assets/faction_icons/Neutral/neutral.svg')
    option('Germany').click()
    result_count(4)
    expect(option('Germany')).to_have_attribute('aria-selected', 'true')
    option('Soviet').click()
    result_count(8)
    expect(option('Germany')).to_have_attribute('aria-selected', 'true')
    expect(option('Soviet')).to_have_attribute('aria-selected', 'true')
    colors = option('Germany').evaluate('(el) => ({ selected: getComputedStyle(el).color, other: getComputedStyle(el.closest(\'.custom-select-options\').querySelector(\'[data-value="Japan"]\')).color })')
    assert colors['selected'] != colors['other'], colors
    option('Germany').click()
    result_count(4)
    option('Neutral').click()
    result_count(5)
    close_select()
    expect(page.get_by_role('combobox', name='阵营筛选', exact=True)).to_be_focused()
    select_value(page, '阵营筛选', 'All')
    result_count(11)

    # Multi-select OR, then AND across categories; empty selection removes the filter.
    open_select('类型筛选')
    option('infantry').click()
    option('order').click()
    result_count(6)
    expect(option('infantry').locator('.filter-symbol')).to_have_count(1)
    close_select()
    costs = page.get_by_role('group', name='费用筛选', exact=True)
    expect(costs.get_by_role('button')).to_have_count(8)
    expect(cost_button(7)).to_contain_text('7K+')
    cost_bounds = costs.get_by_role('button').first.bounding_box()
    assert abs(cost_bounds['width'] - cost_bounds['height']) < 1, cost_bounds
    cost_button(0).click()
    cost_button(7).click()
    result_count(5)
    open_select('稀有度筛选')
    for rarity in ['Standard', 'Limited', 'Special', 'Elite']:
        expect(option(rarity).locator('.filter-symbol')).to_have_count(1)
        expect(option(rarity).locator('span.sr-only')).to_have_count(1)
    option('Standard').click()
    option('Special').click()
    result_count(5)
    close_select()
    select_value(page, '扩展包筛选', 'Base')
    result_count(2)
    page.get_by_role('button', name='重置筛选', exact=True).click()
    scope_fixture()
    result_count(11)
    open_select('子类筛选')
    option('t-34').click()
    result_count(1)
    expect(page.get_by_role('button', name='查看T-34测试卡', exact=True)).to_be_visible()
    option('spitfire').click()
    result_count(2)
    option('t-34').click()
    result_count(1)
    close_select()
    page.get_by_role('button', name='重置筛选', exact=True).click()
    scope_fixture()
    page.get_by_role('button', name='查看T-34测试卡', exact=True).click()
    detail = page.locator('.card-detail-dialog')
    expect(detail.locator('aside dt', has_text='子类').locator('xpath=following-sibling::dd[1]')).to_have_text('T-34')
    page.keyboard.press('Escape')
    expect(detail).to_have_count(0)
    for label in ['阵营筛选', '类型筛选', '子类筛选', '词条筛选', '稀有度筛选']:
        expect(page.get_by_role('combobox', name=label, exact=True)).to_have_attribute('data-value', '')
    expect(cost_button(0)).to_have_attribute('aria-pressed', 'false')
    expect(cost_button(7)).to_have_attribute('aria-pressed', 'false')

    # Set labels and symbols, supplied order, unknown set fallback, language switching.
    open_select('扩展包筛选')
    assert page.get_by_role('listbox').get_by_role('option').evaluate_all('els => els.map(el => el.dataset.value)') == ['All', 'Base', 'OceaniaStorm', 'Homefront', 'NavalWarfare']
    expect(option('OceaniaStorm')).to_contain_text('澳新风暴')
    assert option('OceaniaStorm').locator('.filter-symbol').evaluate('el => getComputedStyle(el).maskImage').endswith('set-OceaniaStorm.svg")')
    close_select()
    select_value(page, '卡牌文字语言', 'en-EN')
    open_select('类型筛选')
    expect(option('infantry')).to_have_attribute('aria-label', 'Infantry')
    close_select()
    open_select('扩展包筛选')
    expect(option('Base')).to_contain_text('Base')
    close_select()
    select_value(page, '卡牌文字语言', 'zh-Hans')
    open_select('类型筛选')
    expect(option('infantry')).to_have_attribute('aria-label', '步兵')
    close_select()
    select_value(page, '卡牌文字语言', 'en-EN')
    open_select('子类筛选')
    expect(option('naval')).to_have_attribute('aria-label', 'Navy')
    close_select()
    select_value(page, '卡牌文字语言', 'zh-Hans')
    open_select('子类筛选')
    expect(option('naval')).to_have_attribute('aria-label', '海军')
    close_select()

    # Keyboard opening, selection, navigation, typeahead, focus return, and outside click.
    trigger = page.get_by_role('combobox', name='类型筛选', exact=True)
    trigger.focus()
    trigger.press('Enter')
    listing = page.get_by_role('listbox')
    expect(listing).to_be_focused()
    listing.press('Home')
    listing.press('Enter')
    expect(option('infantry')).to_have_attribute('aria-selected', 'true')
    listing.press('End')
    listing.press('Space')
    expect(option('countermeasure')).to_have_attribute('aria-selected', 'true')
    listing.press('Home')
    listing.press('Enter')
    expect(option('infantry')).to_have_attribute('aria-selected', 'false')
    close_select()
    trigger.press('ArrowDown')
    page.get_by_role('listbox').press('Tab')
    expect(page.locator('.custom-select-popover')).to_have_count(0)
    expect(page.get_by_role('combobox', name='子类筛选', exact=True)).to_be_focused()
    open_select('阵营筛选')
    page.get_by_role('combobox', name='类型筛选', exact=True).click()
    expect(page.get_by_role('listbox')).to_have_count(1)
    page.get_by_label('搜索卡牌', exact=True).click()
    expect(page.get_by_role('listbox')).to_have_count(0)
    page.get_by_role('button', name='重置筛选', exact=True).click()

    # Builder shares multi-select logic without broadening the legal display pool.
    page.get_by_role('button', name='卡组', exact=True).click()
    page.get_by_role('button', name='选择卡组 筛选控件测试', exact=True).dblclick()
    expect(page.get_by_role('heading', name='编辑卡组', exact=True)).to_be_visible()
    result_count(5, True)
    open_select('构筑子类筛选')
    option('t-34').click()
    result_count(1, True)
    close_select()
    open_select('构筑子类筛选')
    option('t-34').click()
    close_select()
    open_select('构筑类型筛选')
    option('infantry').click()
    option('order').click()
    close_select()
    result_count(3, True)
    cost_button(0, builder=True).click()
    cost_button(7, builder=True).click()
    result_count(2, True)
    # Esc inside popup must not leave the editor; Ctrl+Enter must not save from it.
    open_select('构筑规则')
    page.get_by_role('listbox').press('Control+Enter')
    expect(page.get_by_role('heading', name='编辑卡组', exact=True)).to_be_visible()
    open_select('构筑类型筛选')
    page.get_by_role('listbox').dispatch_event('keydown', {'key': 'Escape', 'isComposing': True, 'bubbles': True})
    expect(page.get_by_role('listbox')).to_be_visible()
    close_select()
    expect(page.get_by_role('heading', name='编辑卡组', exact=True)).to_be_visible()

    # Portals escape sidebar clipping; all menus stay within the minimum viewport.
    page.set_viewport_size({'width': 980, 'height': 640})
    for label in ['主国', '盟国', '构筑扩展包筛选', '构筑类型筛选', '构筑子类筛选']:
        open_select(label)
        bounds = page.locator('.custom-select-popover').bounding_box()
        assert bounds['x'] >= 0 and bounds['y'] >= 0 and bounds['x'] + bounds['width'] <= 981 and bounds['y'] + bounds['height'] <= 641, (label, bounds)
        assert page.locator('.custom-select-popover').evaluate('el => el.parentElement === document.body')
        close_select()
    assert page.evaluate('document.documentElement.scrollWidth') == 980
    page.get_by_role('button', name='保存并退出', exact=True).click()
    assert page.evaluate('document.documentElement.scrollWidth') == 980
    for label in ['卡组主国筛选', '卡组盟国筛选', '卡组标签筛选']:
        open_select(label)
        bounds = page.locator('.custom-select-popover').bounding_box()
        assert bounds['x'] >= 0 and bounds['x'] + bounds['width'] <= 981, (label, bounds)
        close_select()
    page.get_by_role('button', name='卡牌', exact=True).click()
    for label in ['阵营筛选', '类型筛选', '子类筛选', '词条筛选', '稀有度筛选', '扩展包筛选', '衍生分类筛选', '卡牌文字语言', '卡牌排序依据']:
        open_select(label)
        bounds = page.locator('.custom-select-popover').bounding_box()
        assert bounds['x'] >= 0 and bounds['y'] >= 0 and bounds['x'] + bounds['width'] <= 981 and bounds['y'] + bounds['height'] <= 641, (label, bounds)
        close_select()
    assert page.evaluate('document.documentElement.scrollWidth') == 980
    page.get_by_role('button', name='卡组', exact=True).click()
    page.get_by_role('button', name='设置', exact=True).click()
    expect(page.get_by_test_id('settings-page')).to_be_visible()
    page.get_by_role('button', name='卡组', exact=True).click()
    # A select inside nested card-back dialogs must not close/confirm the dialog.
    page.get_by_role('button', name='选择卡组 筛选控件测试', exact=True).click()
    page.get_by_role('button', name='更换卡背', exact=True).click()
    page.get_by_role('button', name='上传卡背', exact=True).click()
    dialog_count = page.locator('[role="dialog"][aria-modal="true"]').count()
    open_select('上传卡背分类')
    expect(page.get_by_role('listbox').locator('.custom-select-group')).to_have_count(1)
    close_select()
    expect(page.locator('[role="dialog"][aria-modal="true"]')).to_have_count(dialog_count)
    page.keyboard.press('Escape')
    expect(page.locator('[role="dialog"][aria-modal="true"]')).to_have_count(dialog_count - 1)
    page.keyboard.press('Escape')
    expect(page.locator('[role="dialog"][aria-modal="true"]')).to_have_count(0)
    # Verify that every shipped icon URL resolves locally, without reading image pixels.
    catalogue = json.loads((ROOT / 'src/data/assets.json').read_text(encoding='utf-8'))
    manifest = [item.get('white', item['icon']) for item in catalogue['factions'].values()]
    for section in ['types', 'rarities', 'sets']:
        manifest.extend(catalogue[section].values())
    for url in manifest:
        response = page.request.get('http://127.0.0.1:5173' + url)
        assert response.status == 200, url
    assert not errors, errors
    assert not bad_assets, bad_assets
    report = {'status': 'passed', 'screenshots': False, 'imageInspection': False, 'offlineIcons': len(manifest), 'pageErrors': errors, 'checks': ['no native selects', 'five multiselect filters', 'subtype mapping and detail metadata', 'OR and AND semantics', 'deselect/reset', 'neutral diamond', 'Chinese and English option labels', 'single-select sets and official ordering', 'cost button dimensions', 'rarity icons only', 'keyboard navigation and focus', 'IME guard', 'popup Esc before editor/dialog', 'outside click', 'one open menu', 'minimum viewport and portal clipping', 'builder nation/Elite/generated restrictions', 'nested card-back dialogs', 'local assets with network blocked']}
    (OUT / 'result.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    context.close()
    browser.close()
    print('Custom filter smoke passed (no screenshots or image inspection)')
