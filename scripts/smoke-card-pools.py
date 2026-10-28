"""Responsive card pools and source-aware modal motion; no screenshots or pixel inspection."""
import copy
import json
import sys
from pathlib import Path

from playwright.sync_api import expect, sync_playwright

sys.stdout.reconfigure(encoding='utf-8')
ROOT = Path(__file__).resolve().parents[1]
cards = copy.deepcopy(json.loads((ROOT / 'public/data/cards.json').read_text(encoding='utf-8'))['cards'][:137])
for index, card in enumerate(cards):
    card['json'].update(faction='Germany', title={'zh-Hans': f'排版卡牌{index + 1:03}'},
                        rarity='Standard', type='infantry', kredits=1, set='Base')
    card['reserved'] = False

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    context = browser.new_context(viewport={'width': 1920, 'height': 1080})
    context.add_init_script("""
      window.kardsDesktop = {
        readClipboardText: async () => '', setTheme: async () => {},
        fetchCardImage: async () => 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l1sAAAAASUVORK5CYII='
      };
    """)
    context.route('**/*', lambda route: route.continue_() if route.request.url.startswith(
        ('http://127.0.0.1:5173', 'ws://127.0.0.1:5173', 'data:', 'blob:')) else route.abort())
    page = context.new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto('http://127.0.0.1:5173')
    page.wait_for_load_state('networkidle')
    page.evaluate("""async cards => {
      const {default: store} = await import('/node_modules/.vite/deps/localforage.js');
      const {encodeDeckCode} = await import('/src/lib/deckCode.ts');
      await store.setItem('kards_card_database_v1', {schemaVersion:1, active:{source:'bundled', fetchedAt:null, cards}});
      const code = encodeDeckCode('Germany', 'Britain', new Map([[cards[0].importId, 1]]));
      await store.setItem('kards_decks', [{id:'layout', name:'排版测试卡组', code, mainNation:'Germany',
        allyNation:'Britain', totalCards:1, isFavorite:false, isArena:false, warnings:[]}]);
    }""", cards)
    page.reload()
    page.wait_for_load_state('networkidle')

    def check_pool(grid, item_count):
        page.evaluate('() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))')
        page.wait_for_function("""async ({id, count}) => {
          const {calculateCardPoolLayout} = await import('/src/lib/cardPoolLayout.ts');
          const el = document.querySelector(`[data-testid="${id}"]`);
          const style = getComputedStyle(el);
          const w = el.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
          const h = el.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
          const gx = parseFloat(style.columnGap), gy = parseFloat(style.rowGap);
          const {columns, rows} = calculateCardPoolLayout(id === 'library-grid' ? 'library' : 'builder', w, h, gx, gy);
          return +el.dataset.capacity === columns * rows && el.querySelectorAll('.card-tile').length === Math.min(count, columns * rows);
        }""", arg={'id': grid.get_attribute('data-testid'), 'count': item_count})
        result = grid.evaluate("""el => {
          const b = el.getBoundingClientRect(), style = getComputedStyle(el);
          const items = [...el.querySelectorAll('.card-tile')].map(tile => {
            const r = tile.getBoundingClientRect();
            return {x:r.x, y:r.y, right:r.right, bottom:r.bottom};
          });
          return {capacity:+el.dataset.capacity, columns:style.gridTemplateColumns.split(' ').length,
            count:items.length, scrollHeight:el.scrollHeight, height:el.clientHeight,
            scrollTop:el.scrollTop, overflow:style.overflowY,
            inside:items.every(r => r.x >= b.x && r.y >= b.y && r.right <= b.right + 1 && r.bottom <= b.bottom + 1)};
        }""")
        assert result['overflow'] == 'hidden' and result['scrollTop'] == 0, result
        assert result['scrollHeight'] <= result['height'] + 1 and result['inside'], result
        if item_count >= result['capacity']:
            assert result['count'] % result['columns'] == 0, result
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        return result['capacity']

    def wheel_check(grid):
        indicator = page.get_by_role('spinbutton', name='页码', exact=True)
        indicator.press('Home')
        expect(indicator).to_have_attribute('aria-valuenow', '1')
        prevented = grid.evaluate("""el => Array.from({length:12}, () => {
          const event = new WheelEvent('wheel', {deltaY:100, bubbles:true, cancelable:true});
          el.dispatchEvent(event); return event.defaultPrevented;
        })""")
        assert all(prevented)
        expect(indicator).to_have_attribute('aria-valuenow', '2')
        page.wait_for_timeout(240)
        grid.dispatch_event('wheel', {'deltaY': -100, 'bubbles': True, 'cancelable': True})
        expect(indicator).to_have_attribute('aria-valuenow', '1')
        assert grid.evaluate('el => el.scrollTop') == 0

    page.get_by_role('button', name='卡牌', exact=True).click()
    library = page.get_by_test_id('library-grid')
    check_pool(library, 143)
    # Every headquarters image has the same vertical visual center as a normal card in that row.
    centers = library.evaluate("""el => {
      const card = el.querySelector('.card-tile:not(.hq-stack-tile) .card-face').getBoundingClientRect();
      return [...el.querySelectorAll('.hq-stack-art img')].map(image => {
        const r = image.getBoundingClientRect(); return Math.abs(r.y + r.height/2 - card.y - card.height/2);
      });
    }""")
    assert centers and max(centers) < 1, centers
    for width, height in [(1280, 820), (980, 640), (1600, 720), (1000, 900)]:
        page.set_viewport_size({'width': width, 'height': height})
        check_pool(library, 143)
    page.set_viewport_size({'width': 1280, 'height': 820})
    check_pool(library, 143)
    wheel_check(library)
    page.get_by_label('搜索卡牌', exact=True).fill('排版卡牌')
    capacity = check_pool(library, 137)
    indicator = page.get_by_role('spinbutton', name='页码', exact=True)
    page_count = int(indicator.get_attribute('aria-valuemax'))
    seen = set()
    for number in range(1, page_count + 1):
        expect(indicator).to_have_attribute('aria-valuenow', str(number))
        check_pool(library, 137)
        seen.update(library.locator('.card-tile').evaluate_all('els => els.map(el => el.title)'))
        if number < page_count:
            page.get_by_role('button', name='下一页', exact=True).click()
    assert len(seen) == 137 and library.locator('.card-tile').count() == capacity
    expect(library.get_by_role('button', name='查看排版卡牌137', exact=True)).to_be_visible()
    page.get_by_label('搜索卡牌', exact=True).fill('排版卡牌001')
    check_pool(library, 1)
    expect(indicator).to_have_attribute('aria-valuenow', '1')
    expect(indicator).to_have_attribute('aria-valuemax', '1')
    page.get_by_label('搜索卡牌', exact=True).fill('没有此卡')
    expect(library.locator('.card-tile')).to_have_count(0)
    expect(library.get_by_text('没有找到匹配的卡牌')).to_be_visible()

    def inspect_motion(kind, expected_origin=None):
        overlay = page.locator('.card-detail-overlay')
        expect(overlay).to_have_attribute('data-origin', kind)
        expect(overlay).to_have_attribute('data-phase', 'moving')
        state = overlay.evaluate("""el => {
          const art = el.querySelector('.card-detail-art');
          const animation = art.getAnimations()[0];
          animation.pause(); animation.currentTime = 0;
          const b = art.getBoundingClientRect();
          return {rect:{x:b.x,y:b.y,width:b.width,height:b.height},
            easing:animation.effect.getTiming().easing,
            panels:[...el.querySelectorAll('.card-detail-panel')].map(p => ({visibility:getComputedStyle(p).visibility,inert:p.inert})),
            close:{visibility:getComputedStyle(el.querySelector('.card-detail-close')).visibility,disabled:el.querySelector('.card-detail-close').disabled}};
        }""")
        assert state['easing'] == 'cubic-bezier(0.65, 0, 0.35, 1)', state
        assert all(panel['visibility'] == 'hidden' and panel['inert'] for panel in state['panels'])
        assert state['close'] == {'visibility': 'hidden', 'disabled': True}, state
        if expected_origin:
            for key in ['x', 'y', 'width', 'height']:
                assert abs(state['rect'][key] - expected_origin[key]) < 2, (key, state, expected_origin)
        return overlay

    page.get_by_role('button', name='卡组', exact=True).click()
    page.get_by_role('button', name='选择卡组 排版测试卡组', exact=True).click()
    details = page.get_by_role('dialog', name='卡组详情', exact=True)
    strip = details.locator('.deck-card-strip').first
    strip.hover()
    expect(page.locator('.deck-card-preview')).to_be_visible()
    hover_width = page.locator('.deck-card-preview .card-face').bounding_box()['width']
    b = strip.bounding_box()
    width = min(96, b['width'] / 3)
    strip.click()
    overlay = inspect_motion('strip', {'x': b['x'] + (b['width'] - width)/2, 'y': b['y'] + b['height'] + 4,
                                      'width': width, 'height': width*867/618})
    overlay.locator('.card-detail-art').evaluate('el => el.getAnimations()[0].finish()')
    expect(overlay).to_have_attribute('data-phase', 'ready')
    assert hover_width < overlay.locator('.card-detail-art').bounding_box()['width'] <= 278
    expect(overlay.locator('.card-detail-panel').first).to_be_visible()
    page.keyboard.press('Escape')
    expect(overlay).to_have_attribute('data-phase', 'closing')
    returning = overlay.locator('.card-detail-art').evaluate("""el => {
      const animation = el.getAnimations().find(a => a.effect.getKeyframes().some(f => 'transform' in f));
      animation.pause(); animation.currentTime = animation.effect.getTiming().duration - 0.001;
      const r = el.getBoundingClientRect(); return {x:r.x,y:r.y,width:r.width,height:r.height};
    }""")
    for key, expected in {'x': b['x'] + (b['width'] - width)/2, 'y': b['y'] + b['height'] + 4,
                          'width': width, 'height': width*867/618}.items():
        assert abs(returning[key] - expected) < 2, (returning, b)
    overlay.locator('.card-detail-art').evaluate('el => el.getAnimations().find(a => a.effect.getKeyframes().some(f => "transform" in f)).finish()')
    expect(overlay).to_have_count(0)

    details.get_by_role('button', name='编辑卡组', exact=True).click()
    builder = page.get_by_test_id('builder-grid')
    for width, height in [(1280, 820), (980, 640), (1920, 1080), (1000, 900)]:
        page.set_viewport_size({'width': width, 'height': height})
        check_pool(builder, 137)
    page.set_viewport_size({'width': 1280, 'height': 820})
    capacity = check_pool(builder, 137)
    wheel_check(builder)
    indicator = page.get_by_role('spinbutton', name='页码', exact=True)
    indicator.press('End')
    check_pool(builder, 137)
    assert builder.locator('.card-tile').count() == capacity
    expect(builder.get_by_role('button', name='查看排版卡牌137', exact=True)).to_be_visible()
    indicator.press('Home')
    tile = builder.get_by_role('button', name='查看排版卡牌001', exact=True)
    tile.hover()
    page.wait_for_timeout(180)
    origin = tile.locator('.card-face').bounding_box()
    tile.click()
    overlay = inspect_motion('pool', origin)
    page.keyboard.press('Tab')
    expect(overlay.get_by_role('dialog')).to_be_focused()
    overlay.locator('.card-detail-art').evaluate('el => el.getAnimations()[0].finish()')
    expect(overlay).to_have_attribute('data-phase', 'ready')
    destination = tile.locator('.card-face').bounding_box()
    overlay.locator('.card-detail-backdrop').click(position={'x': 2, 'y': 2})
    expect(overlay).to_have_attribute('data-phase', 'closing')
    returning = overlay.locator('.card-detail-art').evaluate("""el => {
      const animation = el.getAnimations().find(a => a.effect.getKeyframes().some(f => 'transform' in f));
      animation.pause(); animation.currentTime = animation.effect.getTiming().duration - 0.001;
      const r = el.getBoundingClientRect(); return {x:r.x,y:r.y,width:r.width,height:r.height};
    }""")
    for key in ['x', 'y', 'width', 'height']:
        assert abs(returning[key] - destination[key]) < 2, (key, returning, destination)
    overlay.locator('.card-detail-art').evaluate('el => el.getAnimations().find(a => a.effect.getKeyframes().some(f => "transform" in f)).finish()')
    expect(overlay).to_have_count(0)
    expect(tile).to_be_focused()
    # Closing midway must cancel the animation without reopening or firing a stale callback.
    tile.click()
    overlay = inspect_motion('pool')
    page.keyboard.press('Escape')
    expect(overlay).to_have_count(0)
    tile.press('Enter')
    overlay = inspect_motion('pool')
    page.set_viewport_size({'width': 1360, 'height': 860})
    expect(overlay).to_have_attribute('data-phase', 'ready')
    page.keyboard.press('Escape')
    expect(overlay).to_have_count(0)
    # Reduced motion skips spatial travel and exposes the information immediately.
    page.emulate_media(reduced_motion='reduce')
    page.wait_for_function("matchMedia('(prefers-reduced-motion: reduce)').matches")
    tile.press('Enter')
    expect(overlay).to_have_attribute('data-phase', 'ready')
    animations = overlay.locator('.card-detail-art').evaluate("""el => el.getAnimations().filter(animation =>
      animation.effect.getKeyframes().some(frame => 'transform' in frame)).map(animation => ({
      type:animation.constructor.name, state:animation.playState, timing:animation.effect.getTiming(),
      frames:animation.effect.getKeyframes()
    }))""")
    assert not animations, animations
    expect(overlay.locator('.card-detail-panel').first).to_be_visible()
    page.keyboard.press('Escape')
    tile.dblclick()
    expect(page.locator('.deck-count-value')).to_have_text('3/40')
    expect(overlay).to_have_count(0)
    tile.click(button='right')
    expect(page.locator('.deck-count-value')).to_have_text('2/40')
    expect(page.locator('.deck-card-flight')).to_have_count(0)

    page.emulate_media(reduced_motion='no-preference')
    page.wait_for_function("!matchMedia('(prefers-reduced-motion: reduce)').matches")
    card_id = cards[0]['importId']
    row = page.locator(f'[data-deck-card-id="{card_id}"]')

    def finish_flight(direction, source=None, check_number=True):
        flight = page.locator(f'.deck-card-flight[data-direction="{direction}"][data-card-id="{card_id}"]')
        expect(flight).to_have_count(1)
        result = flight.evaluate("""el => {
          const animation = el.getAnimations().find(item => item.effect.getKeyframes().some(frame => 'transform' in frame));
          animation.pause(); animation.currentTime = 0;
          const start = el.getBoundingClientRect();
          animation.currentTime = animation.effect.getTiming().duration - 0.001;
          const end = el.getBoundingClientRect();
          return {start:{x:start.x,y:start.y,width:start.width,height:start.height,bottom:start.bottom},
            end:{x:end.x,y:end.y,width:end.width,height:end.height}, opacity:+getComputedStyle(el).opacity};
        }""")
        assert result['opacity'] < 0.01, result
        if source:
            for key in ['x', 'y', 'width', 'height']:
                assert abs(result['start'][key] - source[key]) < 2, (key, result, source)
        if direction == 'add':
            b = row.bounding_box()
            assert result['end']['y'] >= b['y'] + b['height'], (result, b)
        elif row.count():
            assert result['start']['bottom'] <= row.bounding_box()['y'], result
        if check_number and row.count():
            assert row.locator('.deck-card-count-number').evaluate("el => el.getAnimations().some(a => a.effect.getKeyframes().some(f => 'transform' in f))")
        flight.evaluate('el => el.getAnimations().find(a => a.effect.getKeyframes().some(f => "transform" in f)).finish()')
        expect(flight).to_have_count(0)
        expect(page.locator('.deck-card-preview')).to_have_count(0)

    tile.hover()
    page.wait_for_timeout(180)
    source = tile.locator('.card-face').bounding_box()
    tile.dblclick()
    expect(page.locator('.deck-count-value')).to_have_text('3/40')
    finish_flight('add', source)
    row.dblclick()
    expect(page.locator('.deck-count-value')).to_have_text('4/40')
    finish_flight('add')
    tile.click(button='right')
    expect(page.locator('.deck-count-value')).to_have_text('3/40')
    finish_flight('remove')
    page.get_by_role('button', name='撤回', exact=True).click()
    expect(page.locator('.deck-count-value')).to_have_text('4/40')
    finish_flight('add')
    page.get_by_role('button', name='重做', exact=True).click()
    expect(page.locator('.deck-count-value')).to_have_text('3/40')
    finish_flight('remove')
    row.hover()
    expect(page.locator('.deck-card-preview')).to_be_visible()
    row.click()
    expect(page.locator('.deck-card-preview')).to_have_count(0)
    # The second source-position click adds without delaying the first modal.
    bounds = row.bounding_box()
    page.mouse.click(bounds['x'] + bounds['width'] / 2, bounds['y'] + bounds['height'] / 2)
    finish_flight('add')
    expect(overlay).to_have_count(0)
    for total in [3, 2, 1]:
        row.click(button='right')
        expect(page.locator('.deck-count-value')).to_have_text(f'{total}/40')
        finish_flight('remove', check_number=total > 1)
    expect(row).to_have_count(0)
    page.get_by_role('button', name='撤回', exact=True).click()
    expect(row).to_have_count(1)
    finish_flight('add')
    root = page.get_by_label('卡组构筑', exact=True)
    root.press('Control+z')
    expect(row.locator('.deck-card-count-number')).to_have_text('2')
    finish_flight('add')
    root.press('Control+Shift+z')
    expect(row.locator('.deck-card-count-number')).to_have_text('1')
    finish_flight('remove')

    # Removing a row must not reopen the preview of the next row under a stationary pointer.
    other_id = cards[1]['importId']
    other_row = page.locator(f'[data-deck-card-id="{other_id}"]')
    builder.get_by_role('button', name='查看排版卡牌002', exact=True).dblclick()
    expect(other_row).to_have_count(1)
    page.locator('.deck-card-flight').evaluate_all('els => els.forEach(el => el.getAnimations().forEach(a => a.finish()))')
    expect(page.locator('.deck-card-flight')).to_have_count(0)
    row.hover()
    expect(page.locator('.deck-card-preview')).to_be_visible()
    row.click(button='right')
    expect(row).to_have_count(0)
    finish_flight('remove', check_number=False)
    page.evaluate('() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))')
    expect(page.locator('.deck-card-preview')).to_have_count(0)
    other_bounds = other_row.bounding_box()
    page.mouse.move(other_bounds['x'] + other_bounds['width']/2 + 8, other_bounds['y'] + other_bounds['height']/2)
    expect(page.locator('.deck-card-preview')).to_be_visible()
    page.get_by_role('button', name='撤回', exact=True).click()
    finish_flight('add')
    other_row.click(button='right')
    expect(other_row).to_have_count(0)
    page.locator('.deck-card-flight').evaluate_all('els => els.forEach(el => el.getAnimations().forEach(a => a.finish()))')
    expect(page.locator('.deck-card-flight')).to_have_count(0)
    expect(page.locator('.deck-card-preview')).to_have_count(0)

    def check_confirmation(dialog):
        expect(dialog).to_be_visible()
        assert dialog.evaluate('el => getComputedStyle(el).textAlign') == 'center'
        title = dialog.locator('.builder-confirm-title')
        description = dialog.locator('.builder-confirm-description')
        if description.count():
            assert title.evaluate('el => parseFloat(getComputedStyle(el).fontSize)') > description.evaluate('el => parseFloat(getComputedStyle(el).fontSize)')
        dialog.press('Escape')
        expect(dialog).to_have_count(0)

    page.get_by_role('combobox', name='主国', exact=True).click()
    page.locator('[role="option"][data-value="Britain"]').click()
    check_confirmation(page.get_by_role('dialog', name='确认更换国家', exact=True))
    page.get_by_label('卡组名称', exact=True).fill('排版修改确认测试')
    page.get_by_label('卡组名称', exact=True).press('Enter')
    page.get_by_role('button', name='保存并退出', exact=True).click()
    check_confirmation(page.get_by_role('dialog', name='确认保存修改', exact=True))
    root.press('Escape')
    check_confirmation(page.get_by_role('dialog', name='确认保存修改', exact=True))
    assert not errors, errors
    context.close()
    browser.close()
    print('Card pools: adaptive sizes, complete rows, wheel gestures, reverse modal motion, add/remove/undo/redo flights and centered confirmations passed')
