"""Welcome navigation and startup preference. Run a renderer on port 5189 first."""
import os
import re
from pathlib import Path

from playwright.sync_api import expect, sync_playwright

ORIGIN = os.environ.get('KARDS_TEST_URL', 'http://127.0.0.1:5189')
OUT = Path(__file__).resolve().parents[1] / 'test-results' / 'welcome'
OUT.mkdir(parents=True, exist_ok=True)
CODE = '%%26|191a2H2i2yDQDSsRtXyE;DTwcyGyNyOySzB;DDDRDVtTyH;'
CODE_B = '%%38|6C6y7dE7E8EaflihtCtyu2uywXzi;E5g3iDiwtGtKu9x0zm;it;E9'
CODE_C = '%%49|919aDZE0ngthwm;8UDWn8rMsjtlyQz4;7HDUDXz0;wo'
CODE_D = '%%15|3Nbud3E1E3EbvWzd;3eDOgLvSwDxozazg;xp;qhtsz7'


def reordered_code(code):
    return '%%53|' + ';'.join(''.join(reversed([part[i:i + 2] for i in range(0, len(part), 2)])) for part in code.split('|')[1].split(';'))

with sync_playwright() as p:
    browser = p.chromium.launch(channel=os.environ.get('KARDS_BROWSER_CHANNEL', 'msedge'), headless=True)
    context = browser.new_context(viewport={'width': 1280, 'height': 820}, reduced_motion='reduce')
    context.route('**/*', lambda route: route.continue_() if route.request.url.startswith((ORIGIN, 'data:', 'blob:')) else route.abort())
    context.add_init_script("window.kardsDesktop = {readClipboardText: async () => '', setTheme: async () => {}, getAppInfo: async () => null};")
    page = context.new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto(ORIGIN)
    page.wait_for_load_state('networkidle')
    welcome = page.get_by_role('heading', name='欢迎使用 KARDS 工具箱', exact=True)
    logo = page.get_by_role('button', name='打开欢迎页', exact=True)
    preference = page.get_by_role('checkbox', name='显示欢迎页', exact=True)

    def home():
        logo.click()
        expect(welcome).to_be_visible()

    def action(name):
        page.locator('.welcome-page').get_by_role('button', name=re.compile('^' + name)).click()

    def stored(key):
        return page.evaluate("async key => (await import('/node_modules/.vite/deps/localforage.js')).default.getItem(key)", key)

    expect(welcome).to_be_visible()
    expect(preference).to_be_checked()
    expect(page.get_by_text('整理卡组、探索卡牌，或者先开一包试试手气。', exact=True)).to_have_count(0)
    expect(page.locator('.welcome-page').get_by_role('button', name=re.compile('^对比两个卡组')).locator('svg.lucide-arrow-right-left')).to_have_count(1)
    expect(page.locator('.welcome-page').get_by_role('button', name=re.compile('^搜索卡牌')).locator('img:visible')).to_have_attribute('src', re.compile('KardsLogoWhite_card.png$'))
    expect(page.locator('.welcome-page').get_by_role('button', name=re.compile('^探索卡牌库')).locator('img:visible')).to_have_attribute('src', re.compile('KardsLogoWhite_cards.png$'))
    for panel in page.locator('.welcome-page .glass-panel').all():
        assert panel.evaluate('(e) => getComputedStyle(e).backgroundColor').endswith('0.6)'), 'Welcome panels use a more transparent glass surface'
    navigation = page.get_by_role('complementary', name='主导航', exact=True)
    tools = navigation.locator('[aria-label="应用工具"]')
    expect(tools.get_by_role('button').nth(0)).to_have_text('卡组对比')
    expect(tools.get_by_role('button').nth(1)).to_have_text('卡组生图')
    page.screenshot(path=str(OUT / 'welcome-dark.png'))
    action('对比两个卡组')
    for button in page.get_by_role('button', name='选择现有卡组', exact=True).all():
        expect(button).to_be_disabled()
    expect(page.locator('#compare-deck-a-heading, #compare-deck-b-heading')).to_have_count(0)
    expect(page.get_by_role('button', name='选择卡组图片', exact=True)).to_have_count(0)
    home()
    preference.uncheck()
    page.wait_for_function("async () => (await import('/node_modules/.vite/deps/localforage.js')).default.getItem('kards_settings').then(s => s.showWelcomePage === false)")
    page.reload()
    expect(page.get_by_role('button', name='新卡组', exact=True)).to_be_visible()
    expect(welcome).to_have_count(0)
    top_compare = page.locator('header').first.get_by_role('button', name='卡组对比', exact=True)
    expect(top_compare).to_be_visible()
    expect(top_compare.locator('span')).to_be_visible()
    page.screenshot(path=str(OUT / 'decks-dark.png'))
    top_compare.click()
    expect(page.get_by_role('region', name='卡组对比', exact=True)).to_be_visible()
    home()
    expect(preference).not_to_be_checked()
    preference.check()
    page.wait_for_function("async () => (await import('/node_modules/.vite/deps/localforage.js')).default.getItem('kards_settings').then(s => s.showWelcomePage === true)")
    page.reload()
    expect(welcome).to_be_visible()
    expect(preference).to_be_checked()

    action('导入卡组')
    dialog = page.get_by_role('dialog')
    expect(dialog.get_by_role('heading', name='导入卡组', exact=True)).to_be_visible()
    dialog.locator('textarea').fill('欢迎页导入测试\n' + CODE)
    dialog.locator('[data-dialog-confirm]').click()
    expect(page.get_by_role('dialog', name='卡组详情', exact=True)).to_be_visible()
    expect(page.get_by_label('管理卡组名称', exact=True)).to_have_value('欢迎页导入测试')
    home()
    action('导入卡组')
    dialog = page.get_by_role('dialog')
    dialog.locator('textarea').fill('另一个名称\nHQ: Different headquarters\n' + reordered_code(CODE))
    dialog.locator('[data-dialog-confirm]').click()
    expect(dialog.get_by_role('alert')).to_contain_text('卡组已存在：“欢迎页导入测试”')
    assert len(stored('kards_decks')) == 1, 'Text imports compare cards and quantities, ignoring name, nation header and order'
    page.keyboard.press('Escape')

    action('新建战备卡组')
    preset = page.get_by_role('dialog', name='战备卡组', exact=True)
    expect(preset).to_be_visible()
    preset.get_by_role('button', name='添加到卡组', exact=True).click()
    expect(preset.get_by_role('alert')).to_contain_text('卡组已存在：“欢迎页导入测试”')
    assert len(stored('kards_decks')) == 1, 'A preset with a different name/card back must not duplicate an imported deck'
    preset.get_by_role('button', name='冬日游戏', exact=True).click()
    preset.get_by_role('button', name='添加到卡组', exact=True).click()
    expect(page.get_by_role('dialog', name='卡组详情', exact=True)).to_be_visible()
    page.keyboard.press('Escape')
    page.get_by_role('button', name='新卡组', exact=True).click()
    expect(page.get_by_role('dialog', name='新卡组', exact=True)).to_be_visible()
    page.keyboard.press('Escape')
    home()

    action('新建空白卡组')
    name = page.get_by_label('卡组名称', exact=True)
    expect(name).to_have_value('德苏卡组')
    page.get_by_role('combobox', name='主国', exact=True).click()
    page.get_by_role('option', name='苏联主国', exact=True).click()
    page.get_by_role('button', name='确认更换', exact=True).click()
    expect(name).to_have_value('苏卡组')
    page.get_by_role('combobox', name='盟国', exact=True).click()
    page.get_by_role('option', name='德国盟国', exact=True).click()
    page.get_by_role('button', name='确认更换', exact=True).click()
    expect(name).to_have_value('苏德卡组')
    name.fill('欢迎页未保存构筑')
    page.get_by_role('combobox', name='主国', exact=True).click()
    page.get_by_role('option', name='英国主国', exact=True).click()
    page.get_by_role('button', name='确认更换', exact=True).click()
    expect(name).to_have_value('欢迎页未保存构筑')
    logo.click()
    confirm = page.get_by_role('dialog', name='确认保存修改', exact=True)
    expect(confirm).to_be_visible()
    page.keyboard.press('Escape')
    expect(name).to_have_value('欢迎页未保存构筑')
    logo.click()
    confirm.get_by_role('button', name='放弃', exact=True).click()
    expect(welcome).to_be_visible()

    action('搜索卡牌')
    expect(page.get_by_role('textbox', name='搜索卡牌', exact=True)).to_be_focused()
    home()
    action('探索卡牌库')
    expect(page.get_by_role('textbox', name='搜索卡牌', exact=True)).to_have_value('')
    home()
    action('卡组快速生图')
    expect(page.get_by_role('textbox', name='卡组码', exact=True)).to_be_visible()
    home()
    action('开个卡包试试手气')
    expect(page.get_by_role('heading', name='卡包', exact=True)).to_be_visible()
    expect(page.get_by_role('region', name='模拟开包', exact=True)).to_be_visible()
    home()

    # Include a single-nation reserved deck to exercise both picker badges and optional allies.
    reserved_code = page.evaluate('''async () => {
        const cards = await (await import('/src/types/card.ts')).loadCardDatabase();
        const reserved = cards.find(card => card.reserved);
        if (!reserved) throw new Error('The bundled catalogue must contain reserved cards for this check');
        return '%%11|' + reserved.importId + ';;;';
    }''')
    action('导入卡组')
    dialog = page.get_by_role('dialog')
    dialog.locator('textarea').fill('含预备卡卡组\n' + reserved_code)
    dialog.locator('[data-dialog-confirm]').click()
    expect(page.get_by_role('dialog', name='卡组详情', exact=True)).to_be_visible()
    home()

    before = len(stored('kards_decks'))
    action('对比两个卡组')
    inputs = page.locator('.deck-compare-column')
    chooser = inputs.nth(0).get_by_role('button', name='选择现有卡组', exact=True)
    expect(chooser).to_be_enabled()
    chooser.click()
    picker = page.get_by_role('dialog', name='选择现有卡组', exact=True)
    expect(picker).to_be_visible()
    page.keyboard.press('Escape')
    expect(picker).to_have_count(0)
    expect(chooser).to_be_focused()
    chooser.click()
    picker_decks = page.evaluate('''async () => {
        const {loadCardDatabase} = await import('/src/types/card.ts');
        const {decodeDeckCode} = await import('/src/lib/deckCode.ts');
        const {factionIcon} = await import('/src/lib/assetCatalog.ts');
        const cards = await loadCardDatabase();
        const reserved = new Set(cards.filter(card => card.reserved).map(card => card.importId));
        const decks = await (await import('/node_modules/.vite/deps/localforage.js')).default.getItem('kards_decks');
        return decks.map(deck => ({name: deck.name,
            hasReserved: [...decodeDeckCode(deck.code).counts.keys()].some(id => reserved.has(id)),
            icons: [deck.mainNation, ...(deck.allyNation && deck.allyNation !== deck.mainNation ? [deck.allyNation] : [])].map(nation => factionIcon(nation))}));
    }''')
    expect(picker.locator('li')).to_have_count(len(picker_decks))
    for item, expected in zip(picker.locator('li > button').all(), picker_decks):
        expect(item.locator('.deck-compare-picker-name > span')).to_have_text(expected['name'])
        expect(item.locator('.reserved-badge')).to_have_count(1 if expected['hasReserved'] else 0)
        icons = item.locator('.deck-compare-picker-nations img').all()
        assert [icon.get_attribute('src') for icon in icons] == expected['icons'], 'Picker uses full-color nation icons in main/ally order'
        assert all(icon.evaluate('(e) => e.complete && e.naturalWidth > 0') for icon in icons)
        name_box = item.locator('.deck-compare-picker-name').bounding_box()
        nation_box = item.locator('.deck-compare-picker-nations').bounding_box()
        assert name_box['x'] + name_box['width'] < nation_box['x']
        row_box = item.bounding_box()
        assert abs(row_box['x'] + row_box['width'] - nation_box['x'] - nation_box['width'] - 10) < 1
    page.screenshot(path=str(OUT / 'compare-picker-dark.png'))
    picker.get_by_role('button', name=re.compile('^欢迎页导入测试')).click()
    expect(inputs.nth(0).locator('input')).to_have_value('欢迎页导入测试')
    expect(inputs.nth(0).locator('textarea')).to_have_value(CODE)
    expect(inputs.nth(0).locator('.deck-compare-result-heading')).to_have_text('欢迎页导入测试')
    expect(inputs.nth(0).get_by_role('button', name='仅分析', exact=True)).to_be_disabled()
    expect(inputs.nth(0).get_by_role('button', name='导入并分析', exact=True)).to_be_disabled()
    home()
    navigation.get_by_role('button', name='卡组对比', exact=True).click()
    expect(inputs.nth(0).locator('input')).to_have_value('欢迎页导入测试')
    expect(inputs.nth(0).locator('.deck-compare-result-heading')).to_have_text('欢迎页导入测试')
    expect(inputs.nth(0).get_by_role('button', name='仅分析', exact=True)).to_be_disabled()
    expect(inputs.nth(0).get_by_role('button', name='导入并分析', exact=True)).to_be_disabled()
    chooser.click()
    picker.get_by_role('button', name=re.compile('^冬日游戏')).click()
    expect(inputs.nth(0).locator('textarea')).to_have_value(CODE_C)
    expect(inputs.nth(0).locator('.deck-compare-result-heading')).to_have_text('冬日游戏')
    assert len(stored('kards_decks')) == before, 'Choosing existing decks automatically analyzes without saving'
    inputs.nth(0).locator('input').fill('手动修改名称')
    expect(inputs.nth(0).get_by_role('button', name='仅分析', exact=True)).to_be_enabled()
    expect(inputs.nth(0).get_by_role('button', name='导入并分析', exact=True)).to_be_enabled()
    # Leaving and returning preserves a draft even after editing invalidates its analysis.
    home()
    action('对比两个卡组')
    expect(inputs.nth(0).locator('input')).to_have_value('手动修改名称')
    expect(inputs.nth(0).locator('textarea')).to_have_value(CODE_C)
    expect(inputs.nth(0).locator('.deck-compare-analysis')).to_have_count(0)
    inputs.nth(0).locator('input').fill('')
    inputs.nth(0).locator('textarea').fill('')
    for i in range(2):
        name_height = inputs.nth(i).locator('input:not([type="file"])').bounding_box()['height']
        code_height = inputs.nth(i).locator('textarea').bounding_box()['height']
        assert abs(name_height - code_height) <= 1, 'Empty code and name fields have the same height'
        buttons = inputs.nth(i).locator('.deck-compare-import-actions > button').all()
        assert max(button.bounding_box()['y'] for button in buttons) - min(button.bounding_box()['y'] for button in buttons) < 1
    expect(page.locator('.deck-compare-header, .deck-compare-note')).to_have_count(0)
    inputs.nth(0).locator('textarea').fill('多行卡组文本\n' * 8 + CODE)
    assert inputs.nth(0).locator('textarea').bounding_box()['height'] > name_height, 'Code field expands for multiline content'
    inputs.nth(0).locator('textarea').fill('invalid')
    expect(inputs.nth(0).locator('textarea')).to_have_css('height', f'{int(name_height)}px')
    inputs.nth(0).get_by_role('button', name='仅分析', exact=True).click()
    expect(inputs.nth(0).get_by_role('alert')).to_contain_text('卡组码格式无效')
    # Default names use nation initials when neither a custom name nor share title exists.
    inputs.nth(0).locator('textarea').fill('%%41|9s;;;')
    inputs.nth(0).get_by_role('button', name='仅分析', exact=True).click()
    expect(inputs.nth(0).locator('.deck-compare-result-heading')).to_have_text('苏德卡组')
    for i, code in enumerate([CODE, CODE_B]):
        inputs.nth(i).locator('input:not([type="file"])').fill(['左侧对比', '右侧对比'][i])
        inputs.nth(i).locator('textarea').fill(('主国：英国\n盟国：法国\n' * 7 if i == 0 else '') + code)
        inputs.nth(i).get_by_role('button', name='仅分析', exact=True).click()
        expect(inputs.nth(i).locator('.deck-compare-image-button img')).to_be_visible(timeout=30000)
        assert inputs.nth(i).locator('.deck-compare-image-button img').evaluate('(image) => image.naturalWidth') == 2304
    assert len(stored('kards_decks')) == before, 'Analyze only must not add decks to the collection'
    expect(page.locator('.deck-compare-result-heading p')).to_have_count(0)
    assert page.locator('.deck-compare-analysis .deck-cost-columns').count() == 2
    def check_alignment():
        positions = [inputs.nth(i).locator('.deck-compare-analysis').bounding_box()['y'] for i in range(2)]
        assert abs(positions[0] - positions[1]) <= 1, 'Analysis sections align despite different textarea heights'

    check_alignment()
    table = page.locator('.deck-compare-table')
    expect(table.get_by_role('columnheader')).to_have_text(['参数', '左侧对比', '右侧对比', '差距'])
    expect(table.locator('tbody tr')).to_have_count(12)
    expect(table.locator('.ready-deck-rarity-icon img')).to_have_count(4)
    expect(table.locator('thead .deck-compare-marker')).to_have_count(0)
    expect(table.locator('[data-parameter="ratio"] td').last).to_have_text('—')
    expect(table.locator('[data-parameter="ratio"] .is-emphasized')).to_have_count(0)
    assert table.locator('.deck-compare-difference-pill').count() > 0
    for pill in table.locator('.deck-compare-difference-pill').all():
        assert re.fullmatch(r'\d+(?:\.\d+)?K?', pill.inner_text()), 'Table differences are unsigned absolute values'
    for icon in table.locator('.ready-deck-rarity-icon img').all():
        expect(icon).to_be_visible()
        assert icon.evaluate('(img) => Math.abs(img.width / img.height - img.naturalWidth / img.naturalHeight) < 0.02'), 'Wildcard artwork retains its native aspect ratio'
    for row in table.locator('tbody tr').all():
        cells = row.locator('td')
        values = [float(cells.nth(i).inner_text().removesuffix('K')) for i in range(2)] if row.get_attribute('data-parameter') != 'ratio' else None
        if values:
            smaller = row.get_attribute('data-parameter') in ['cost', 'unitDeployment', 'unitOperation']
            target = min(values) if smaller else max(values)
            for i in range(2):
                assert ('is-emphasized' in (cells.nth(i).get_attribute('class') or '')) == (values[0] != values[1] and values[i] == target)
                if values[0] != values[1] and values[i] == target:
                    color = table.locator('thead th').nth(i + 1).evaluate('(e) => getComputedStyle(e).color')
                    assert cells.nth(i).evaluate('(e) => getComputedStyle(e).color') == color
                    assert cells.nth(2).locator('.deck-compare-difference-pill').evaluate('(e) => getComputedStyle(e).color') == color
    ability = page.locator('.deck-compare-ability-summary')
    expect(ability.locator('.deck-compare-ability-row')).to_have_count(5)
    expect(ability.locator('.deck-compare-ability-track .deck-compare-marker.is-left')).to_have_count(5)
    expect(ability.locator('.deck-compare-ability-track .deck-compare-marker.is-right')).to_have_count(5)
    expect(ability.locator('.deck-compare-ability-scores')).to_have_count(0)
    swatch = ability.locator('.deck-compare-ability-legend .deck-ability-band')
    expect(swatch).to_be_visible()
    assert swatch.bounding_box()['width'] >= 18 and swatch.bounding_box()['height'] >= 10
    assert abs(page.locator('.deck-compare-summary').bounding_box()['width'] - ability.bounding_box()['width']) < 1
    for point in ability.locator('.deck-compare-ability-point').all():
        marker = point.locator('i').bounding_box()
        label = point.locator('span').bounding_box()
        assert label['x'] > marker['x'] + marker['width'], 'Score follows its marker'
        assert abs(label['y'] + label['height'] / 2 - marker['y'] - marker['height'] / 2) < 1, 'Score and marker share a vertical center'
    for side, index in [('left', 0), ('right', 1)]:
        color = inputs.nth(index).locator('input').evaluate('(e) => getComputedStyle(e).color')
        assert color == inputs.nth(index).locator('textarea').evaluate('(e) => getComputedStyle(e).color')
        assert color == inputs.nth(index).locator('h3').evaluate('(e) => getComputedStyle(e).color')
        assert color == table.locator('thead .is-' + side).evaluate('(e) => getComputedStyle(e).color')
        assert color == ability.locator('.deck-compare-marker.is-' + side).first.evaluate('(e) => getComputedStyle(e).backgroundColor')
    expect(ability.locator('.deck-compare-ability-legend')).to_contain_text('左侧对比')
    expect(ability.locator('.deck-compare-ability-legend')).to_contain_text('右侧对比')
    assert '卡组A' not in ability.inner_text() and '卡组B' not in ability.inner_text()
    for row in ability.locator('.deck-compare-ability-row').all():
        values = [float(label.inner_text()) for label in row.locator('.deck-compare-ability-point > span').all()]
        pill = row.locator('.deck-compare-ability-difference .deck-compare-difference-pill')
        expect(pill).to_have_text(f'+{abs(values[0] - values[1]):.1f}')
        assert row.locator('.deck-compare-ability-label').evaluate('(e) => getComputedStyle(e).color') == pill.evaluate('(e) => getComputedStyle(e).color'), 'Each ability name follows its own gap pill color'
        side = 0 if values[0] > values[1] else 1
        assert pill.evaluate('(e) => getComputedStyle(e).color') == table.locator('thead th').nth(side + 1).evaluate('(e) => getComputedStyle(e).color')
        table_pill = table.locator('.deck-compare-difference-pill').first.bounding_box()
        score_pill = pill.bounding_box()
        assert abs(table_pill['x'] + table_pill['width'] - score_pill['x'] - score_pill['width']) <= 1, 'Score gaps align with the table gap column'
    opener = inputs.nth(0).get_by_role('button', name='放大左侧对比卡组大图', exact=True)
    original_width = opener.bounding_box()['width']
    opener.click()
    enlarged = page.get_by_role('dialog', name='左侧对比卡组大图放大预览', exact=True)
    expect(enlarged).to_be_visible()
    assert enlarged.locator('img').bounding_box()['width'] > original_width
    page.screenshot(path=str(OUT / 'compare-image-zoom.png'))
    page.keyboard.press('Escape')
    expect(enlarged).to_have_count(0)
    expect(opener).to_be_focused()
    page.screenshot(path=str(OUT / 'compare-dark.png'))
    page.locator('.deck-compare-summary').evaluate('(e) => e.scrollIntoView({block: "start"})')
    page.screenshot(path=str(OUT / 'compare-table-dark.png'))
    page.locator('.deck-compare-scroll').evaluate('(e) => e.scrollTop = e.scrollHeight')
    page.screenshot(path=str(OUT / 'compare-scores-dark.png'))
    saved_scroll = page.locator('.deck-compare-scroll').evaluate('(e) => e.scrollTop')
    saved_images = [item.get_attribute('src') for item in inputs.locator('.deck-compare-image-button img').all()]
    navigation.get_by_role('button', name='卡组', exact=True).click()
    expect(page.get_by_role('region', name='卡组对比', exact=True)).to_have_count(0)
    page.keyboard.press('Escape')
    expect(page.get_by_role('textbox', name='搜索卡组', exact=True)).to_be_visible()
    top_compare.click()
    assert abs(page.locator('.deck-compare-scroll').evaluate('(e) => e.scrollTop') - saved_scroll) <= 1, 'Compare scroll position survives navigation'
    assert [item.get_attribute('src') for item in inputs.locator('.deck-compare-image-button img').all()] == saved_images, 'Generated images are retained when returning'
    expect(inputs.nth(0).locator('input')).to_have_value('左侧对比')
    expect(inputs.nth(1).locator('input')).to_have_value('右侧对比')
    expect(ability.locator('.deck-compare-ability-row')).to_have_count(5)
    page.keyboard.press('Escape')
    expect(welcome).to_be_visible()
    navigation.get_by_role('button', name='卡组对比', exact=True).click()
    assert abs(page.locator('.deck-compare-scroll').evaluate('(e) => e.scrollTop') - saved_scroll) <= 1
    inputs.nth(0).get_by_role('button', name='导入并分析', exact=True).click()
    expect(inputs.nth(0).get_by_role('status').filter(has_text='卡组已存在')).to_be_visible()
    assert len(stored('kards_decks')) == before
    expect(page.get_by_role('region', name='卡组对比', exact=True)).to_be_visible()
    inputs.nth(0).get_by_role('button', name='导入并分析', exact=True).click()
    expect(inputs.nth(0).get_by_role('status').filter(has_text='卡组已存在')).to_be_visible()
    assert len(stored('kards_decks')) == before, 'Repeated imports must not create duplicates'
    page.evaluate('''() => {
        const put = IDBObjectStore.prototype.put;
        window.__rejectDeckWrite = true;
        IDBObjectStore.prototype.put = function(value, key) {
            if (key === 'kards_decks' && window.__rejectDeckWrite) {
                window.__rejectDeckWrite = false;
                throw new DOMException('测试保存失败，请重试', 'QuotaExceededError');
            }
            return put.call(this, value, key);
        };
    }''')
    inputs.nth(1).get_by_role('button', name='导入并分析', exact=True).click()
    expect(inputs.nth(1).get_by_role('alert')).to_contain_text('测试保存失败')
    assert len(stored('kards_decks')) == before, 'Failed import must not append the deck'
    inputs.nth(1).get_by_role('button', name='导入并分析', exact=True).click()
    expect(inputs.nth(1).get_by_role('status').filter(has_text='已导入卡组并完成分析')).to_be_visible()
    assert len(stored('kards_decks')) == before + 1
    page.set_viewport_size({'width': 980, 'height': 640})
    navigation.get_by_role('button', name='卡组', exact=True).click()
    expect(top_compare).to_be_visible()
    header = page.locator('header').first
    assert header.evaluate('(e) => e.scrollWidth <= e.clientWidth'), 'The deck toolbar fits the minimum window'
    assert header.locator('h1').bounding_box()['height'] <= 28, 'The deck title stays on one line'
    left, right = [part.bounding_box() for part in header.locator(':scope > div').all()]
    assert left['x'] + left['width'] <= right['x'], 'Toolbar controls do not overlap the theme and about buttons'
    page.screenshot(path=str(OUT / 'decks-minimum-dark.png'))
    top_compare.click()
    page.locator('.deck-compare-scroll').evaluate('(e) => e.scrollTop = 0')
    page.screenshot(path=str(OUT / 'compare-minimum-dark.png'))
    check_alignment()
    for section in ['.deck-compare-grid', '.deck-compare-summary', '.deck-compare-ability-summary']:
        assert page.locator(section).evaluate('(e) => e.scrollWidth <= e.clientWidth + 1'), section
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    page.get_by_role('button', name='切换到浅色模式', exact=True).click()
    page.wait_for_timeout(350)
    page.locator('.deck-compare-summary').evaluate('(e) => e.scrollIntoView({block: "start"})')
    page.screenshot(path=str(OUT / 'compare-table-minimum-light.png'))
    page.locator('.deck-compare-scroll').evaluate('(e) => e.scrollTop = e.scrollHeight')
    page.screenshot(path=str(OUT / 'compare-scores-minimum-light.png'))
    for row in ability.locator('.deck-compare-ability-row').all():
        assert row.locator('.deck-compare-ability-label').evaluate('(e) => getComputedStyle(e).color') == row.locator('.deck-compare-difference-pill').evaluate('(e) => getComputedStyle(e).color')
    inputs.nth(1).locator('textarea').fill('%%14|9s;;;')
    expect(inputs.nth(1).locator('.deck-compare-analysis')).to_have_count(0)
    inputs.nth(1).get_by_role('button', name='仅分析', exact=True).click()
    expect(ability.get_by_role('status').filter(has_text='构筑满39张')).to_be_visible()
    inputs.nth(1).locator('textarea').fill(CODE)
    inputs.nth(1).get_by_role('button', name='仅分析', exact=True).click()
    for row in ability.locator('.deck-compare-ability-row').all():
        labels = row.locator('.deck-compare-ability-point > span')
        top = labels.nth(0).bounding_box()
        bottom = labels.nth(1).bounding_box()
        assert bottom['y'] >= top['y'] + top['height'], 'Identical scores remain readable on separate marker rows'
        expect(row.locator('.deck-compare-ability-difference')).to_have_text('+0.0')
        assert row.locator('.deck-compare-ability-label').evaluate('(e) => getComputedStyle(e).color') == row.locator('.deck-compare-difference-pill').evaluate('(e) => getComputedStyle(e).color'), 'Tied labels and pills share a neutral color'
    page.locator('.deck-compare-scroll').evaluate('(e) => e.scrollTop = e.scrollHeight')
    page.screenshot(path=str(OUT / 'compare-equal-scores-light.png'))
    for i, code in enumerate([CODE_D, reordered_code(CODE_D)]):
        inputs.nth(i).locator('textarea').fill(code)
    page.evaluate("() => document.querySelectorAll('.deck-compare-import-actions > button:last-child').forEach(button => button.click())")
    expect(inputs.nth(0).get_by_role('status').filter(has_text='已导入卡组并完成分析')).to_be_visible()
    expect(inputs.nth(1).get_by_role('status').filter(has_text='卡组已存在')).to_be_visible()
    assert len(stored('kards_decks')) == before + 2, 'Concurrent comparison imports of the same cards only save one deck'
    home()

    page.set_viewport_size({'width': 980, 'height': 640})
    expect(page.locator('.welcome-page').get_by_role('button', name=re.compile('^搜索卡牌')).locator('img:visible')).to_have_attribute('src', re.compile('KardsLogoBlack_card.png$'))
    expect(page.locator('.welcome-page').get_by_role('button', name=re.compile('^探索卡牌库')).locator('img:visible')).to_have_attribute('src', re.compile('KardsLogoBlack_cards.png$'))
    page.screenshot(path=str(OUT / 'welcome-minimum-light.png'))
    for panel in page.locator('.welcome-page .glass-panel').all():
        assert panel.evaluate('(e) => getComputedStyle(e).backgroundColor').endswith('0.6)')
    footer = page.locator('.welcome-footer').bounding_box()
    assert footer['y'] + footer['height'] <= 640, 'Welcome preference must fit in the minimum window'
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    page.get_by_role('button', name='关于', exact=True).click()
    page.get_by_role('button', name='返回', exact=True).click()
    expect(welcome).to_be_visible()
    assert errors == [], errors
    browser.close()
    print('Welcome smoke passed: default, persistence, logo, unsaved edits, all shortcuts, comparison, themes and minimum window.')
