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
]
cards = copy.deepcopy(records[:len(specs)])
for card, (name, faction, kind, cost, rarity, expansion) in zip(cards, specs):
    card['json'] = {'title': {'zh-Hans': name, 'en-EN': 'English ' + name}, 'faction': faction, 'type': kind, 'kredits': cost, 'rarity': rarity, 'set': expansion}
    card['reserved'] = False


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context(viewport={'width': 1280, 'height': 820})
    page = context.new_page()
    errors, bad_assets = [], []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('response', lambda response: bad_assets.append(response.url) if '/assets/filters/' in response.url and response.status != 200 else None)
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

    def close_select():
        page.get_by_role('listbox').press('Escape')
        expect(page.locator('.custom-select-popover')).to_have_count(0)

    def result_count(number, builder=False):
        expect(page.get_by_test_id('builder-grid' if builder else 'library-grid').get_by_role('button')).to_have_count(number)

    # Homepage controls, including icon options, retain their single-select behavior.
    expect(page.locator('select')).to_have_count(0)
    select_value(page, '卡组主国筛选', 'Japan')
    expect(page.get_by_role('button', name='选择卡组 筛选控件测试', exact=True)).to_have_count(0)
    select_value(page, '卡组主国筛选', 'All')
    select_value(page, '卡组标签筛选', '测试')
    expect(page.get_by_role('button', name='选择卡组 筛选控件测试', exact=True)).to_be_visible()
    page.get_by_role('button', name='卡牌', exact=True).click()
    result_count(9)
    expect(page.get_by_role('combobox')).to_have_count(8)

    countries = open_select('阵营筛选')
    expect(countries).to_have_attribute('aria-multiselectable', 'true')
    expect(countries.get_by_role('option')).to_have_count(11)
    expect(option('Germany')).to_contain_text('德国')
    expect(option('Neutral').locator('img')).to_have_attribute('src', './assets/filters/neutral.svg')
    option('Germany').click()
    result_count(4)
    expect(option('Germany')).to_have_attribute('aria-selected', 'true')
    option('Soviet').click()
    result_count(7)
    expect(option('Germany')).to_have_attribute('aria-selected', 'true')
    expect(option('Soviet')).to_have_attribute('aria-selected', 'true')
    colors = option('Germany').evaluate('(el) => ({ selected: getComputedStyle(el).color, other: getComputedStyle(el.parentElement.parentElement.querySelector(\'[data-value="Japan"]\')).color })')
    assert colors['selected'] != colors['other'], colors
    option('Germany').click()
    result_count(3)
    option('Neutral').click()
    result_count(4)
    close_select()
    expect(page.get_by_role('combobox', name='阵营筛选', exact=True)).to_be_focused()
    select_value(page, '阵营筛选', 'All')
    result_count(9)

    # Multi-select OR, then AND across categories; empty selection removes the filter.
    open_select('类型筛选')
    option('infantry').click()
    option('order').click()
    result_count(6)
    expect(option('infantry').locator('.filter-symbol')).to_have_count(1)
    close_select()
    open_select('费用筛选')
    expect(page.get_by_role('listbox').locator('.filter-cost')).to_have_count(8)
    expect(option('7').locator('.filter-cost')).to_have_text('7K+')
    assert page.get_by_role('listbox').locator('.filter-cost').first.evaluate('el => getComputedStyle(el).borderTopColor') == 'rgb(255, 255, 255)'
    option('0').click()
    option('7').click()
    result_count(5)
    close_select()
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
    result_count(9)
    for label in ['阵营筛选', '类型筛选', '费用筛选', '稀有度筛选']:
        expect(page.get_by_role('combobox', name=label, exact=True)).to_have_attribute('data-value', '')

    # Set labels and symbols, supplied order, unknown set fallback, language switching.
    open_select('扩展包筛选')
    assert page.get_by_role('listbox').get_by_role('option').evaluate_all('els => els.map(el => el.dataset.value)') == ['All', 'Base', 'OceaniaStorm', 'Homefront', 'NavalWarfare', 'OnlySpawnable', 'Special']
    expect(option('OceaniaStorm')).to_contain_text('澳新风暴')
    assert option('OceaniaStorm').locator('.filter-symbol').evaluate('el => getComputedStyle(el).maskImage').endswith('set-OceaniaStorm.svg")')
    close_select()
    select_value(page, '卡牌语言', 'en-EN')
    open_select('类型筛选')
    expect(option('infantry')).to_have_attribute('aria-label', 'Infantry')
    close_select()
    open_select('扩展包筛选')
    expect(option('Base')).to_contain_text('Base')
    close_select()
    select_value(page, '卡牌语言', 'zh-Hans')
    open_select('类型筛选')
    expect(option('infantry')).to_have_attribute('aria-label', '步兵')
    close_select()

    # Keyboard opening, selection, navigation, typeahead, focus return, and outside click.
    trigger = page.get_by_role('combobox', name='费用筛选', exact=True)
    trigger.focus()
    trigger.press('Enter')
    listing = page.get_by_role('listbox')
    expect(listing).to_be_focused()
    listing.press('Home')
    listing.press('Enter')
    expect(option('0')).to_have_attribute('aria-selected', 'true')
    listing.press('End')
    listing.press('Space')
    expect(option('7')).to_have_attribute('aria-selected', 'true')
    listing.press('Home')
    listing.press('Enter')
    expect(option('0')).to_have_attribute('aria-selected', 'false')
    close_select()
    trigger.press('ArrowDown')
    page.get_by_role('listbox').press('Tab')
    expect(page.locator('.custom-select-popover')).to_have_count(0)
    expect(page.get_by_role('combobox', name='稀有度筛选', exact=True)).to_be_focused()
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
    result_count(4, True)
    open_select('构筑类型筛选')
    option('infantry').click()
    option('order').click()
    close_select()
    result_count(3, True)
    open_select('构筑费用筛选')
    option('0').click()
    option('7').click()
    close_select()
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
    for label in ['主国', '盟国', '构筑扩展包筛选', '构筑类型筛选']:
        open_select(label)
        bounds = page.locator('.custom-select-popover').bounding_box()
        assert bounds['x'] >= 0 and bounds['y'] >= 0 and bounds['x'] + bounds['width'] <= 981 and bounds['y'] + bounds['height'] <= 641, (label, bounds)
        assert page.locator('.custom-select-popover').evaluate('el => el.parentElement === document.body')
        close_select()
    assert page.evaluate('document.documentElement.scrollWidth') == 980
    page.get_by_role('button', name='返回卡组', exact=True).click()
    assert page.evaluate('document.documentElement.scrollWidth') == 980
    for label in ['卡组主国筛选', '卡组盟国筛选', '卡组标签筛选']:
        open_select(label)
        bounds = page.locator('.custom-select-popover').bounding_box()
        assert bounds['x'] >= 0 and bounds['x'] + bounds['width'] <= 981, (label, bounds)
        close_select()
    page.get_by_role('button', name='卡牌', exact=True).click()
    for label in ['阵营筛选', '类型筛选', '费用筛选', '稀有度筛选', '扩展包筛选', '卡牌状态筛选', '卡牌语言', '卡图版本']:
        open_select(label)
        bounds = page.locator('.custom-select-popover').bounding_box()
        assert bounds['x'] >= 0 and bounds['y'] >= 0 and bounds['x'] + bounds['width'] <= 981 and bounds['y'] + bounds['height'] <= 641, (label, bounds)
        close_select()
    assert page.evaluate('document.documentElement.scrollWidth') == 980
    page.get_by_role('button', name='卡组', exact=True).click()
    page.get_by_role('button', name='设置', exact=True).click()
    select_value(page, '显示模式', 'light')
    expect(page.locator('html')).to_have_class('light')
    open_select('显示模式')
    page.get_by_role('listbox').press('End')
    page.get_by_role('listbox').press('Enter')
    expect(page.get_by_test_id('settings-page')).to_be_visible()
    page.get_by_role('button', name='保存并返回', exact=True).click()
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
    manifest = json.loads((ROOT / 'public/assets/filters/sources.json').read_text(encoding='utf-8'))
    for filename in manifest:
        response = page.request.get('http://127.0.0.1:5173/assets/filters/' + filename)
        assert response.status == 200, filename
    assert not errors, errors
    assert not bad_assets, bad_assets
    report = {'status': 'passed', 'screenshots': False, 'imageInspection': False, 'offlineIcons': len(manifest), 'pageErrors': errors, 'checks': ['no native selects', 'four multiselect groups', 'OR and AND semantics', 'deselect/reset', 'neutral diamond', 'Chinese and English option labels', 'single-select sets and official ordering', 'cost frames', 'rarity icons only', 'keyboard navigation and focus', 'IME guard', 'popup Esc before editor/dialog', 'outside click', 'one open menu', 'minimum viewport and portal clipping', 'builder nation/Elite/generated restrictions', 'nested card-back dialogs', 'light/dark theme', 'local assets with network blocked']}
    (OUT / 'result.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    context.close()
    browser.close()
    print('Custom filter smoke passed (no screenshots or image inspection)')
