"""Immediate details, double-click editing, persistent toggles and tablecloth fades."""
import copy
import json
from pathlib import Path
from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]
cards = copy.deepcopy(json.loads((ROOT / 'public/data/cards.json').read_text(encoding='utf-8'))['cards'][:12])
for index, card in enumerate(cards):
    card['json'].update(faction='Germany', title={'zh-Hans': f'交互卡牌{index + 1:02}'}, rarity='Standard', type='infantry', kredits=1, set='Base')
    card['reserved'] = False
cards[1]['reserved'] = True

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    context = browser.new_context(viewport={'width': 1280, 'height': 820})
    context.add_init_script("""window.kardsDesktop = {readClipboardText:async()=>'',setTheme:async()=>{},
      fetchCardImage:async()=> 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l1sAAAAASUVORK5CYII='};""")
    context.route('**/*', lambda route: route.continue_() if route.request.url.startswith(('http://127.0.0.1:5173', 'ws://127.0.0.1:5173', 'data:', 'blob:')) else route.abort())
    page = context.new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto('http://127.0.0.1:5173')
    page.wait_for_load_state('networkidle')
    page.evaluate("""async cards => {
      const {default:store}=await import('/node_modules/.vite/deps/localforage.js');
      const {encodeDeckCode}=await import('/src/lib/deckCode.ts');
      const {headquartersOptions,tableclothForHeadquarters}=await import('/src/lib/cardAssets.ts');
      const hq=headquartersOptions('Germany').find(item=>tableclothForHeadquarters(item.groupId));
      if(!hq) throw Error('No headquarters tablecloth fixture');
      window.__hqTablecloth=tableclothForHeadquarters(hq.groupId);
      const code=encodeDeckCode('Germany','Britain',new Map([[cards[0].importId,2]]));
      await store.setItem('kards_card_database_v1',{schemaVersion:1,active:{source:'bundled',fetchedAt:null,cards}});
      await store.setItem('kards_decks',[{id:'controls',name:'交互测试卡组',code,mainNation:'Germany',allyNation:'Britain',totalCards:2,isFavorite:false,isArena:false,headquartersId:hq.groupId,warnings:[]}]);
      await store.setItem('kards_settings',{showDeckFolders:false});
    }""", cards)
    page.reload()
    page.wait_for_load_state('networkidle')
    toggle = page.get_by_role('button', name='显示收藏夹', exact=True)
    expect(toggle).to_have_attribute('aria-pressed', 'false')
    assert toggle.evaluate("el=>el.previousElementSibling?.getAttribute('placeholder')") == '搜索卡组...'
    for width in [1280, 980]:
        page.set_viewport_size({'width': width, 'height': 820})
        assert page.locator('header').evaluate('el=>el.scrollWidth<=el.clientWidth'), width
        expect(toggle).to_be_visible()
    page.set_viewport_size({'width': 1280, 'height': 820})
    background = page.locator('[data-tablecloth]')
    default_background = background.get_attribute('data-tablecloth')
    deck = page.get_by_role('button', name='选择卡组 交互测试卡组', exact=True)
    deck.click()
    details = page.get_by_role('dialog', name='卡组详情', exact=True)
    expect(details).to_be_visible()
    assert background.get_attribute('data-tablecloth') != default_background
    assert background.locator(':scope > div').count() == 2
    assert any(0 < value < 1 for value in background.locator(':scope > div').evaluate_all('els=>els.map(el=>+getComputedStyle(el).opacity)'))
    expect(background.locator(':scope > div')).to_have_count(1, timeout=2000)
    group = details.get_by_test_id('deck-detail-customization')
    assert group.get_by_role('button').all_text_contents() == [' 添加标签', '更换总部', '更换卡背']
    assert len(set(group.get_by_role('button').evaluate_all('els=>els.map(el=>el.getBoundingClientRect().height)'))) == 1
    page.evaluate("""()=>{window.__details=document.querySelector('[data-deck-details]');window.__removed=0;
      new MutationObserver(records=>records.forEach(record=>record.removedNodes.forEach(node=>{if(node===window.__details)window.__removed++})))
      .observe(document.body,{subtree:true,childList:true});}""")
    deck.click()
    assert page.evaluate("window.__removed===0 && window.__details===document.querySelector('[data-deck-details]')")
    deck.dblclick()
    expect(page.get_by_test_id('builder-grid')).to_be_visible()
    assert page.evaluate('window.__removed') == 1
    page.get_by_role('button', name='保存并退出', exact=True).click()
    expect(details).to_be_visible()
    details.locator('.deck-card-strip').first.click()
    overlay = page.locator('.card-detail-overlay')
    expect(overlay).to_have_attribute('data-phase', 'moving')
    expect(overlay.locator('.card-detail-close')).to_be_hidden()
    expect(overlay.locator('.card-detail-close')).to_be_disabled()
    overlay.locator('.card-detail-art').evaluate('el=>el.getAnimations()[0].finish()')
    expect(overlay).to_have_attribute('data-phase', 'ready')
    expect(overlay.locator('.card-detail-close')).to_be_visible()
    expect(overlay.locator('.card-detail-close')).to_be_enabled()
    overlay.locator('.card-detail-close').evaluate("""button=>{
      button.click();
      document.querySelector('.card-detail-art').getAnimations().forEach(animation=>animation.pause());
    }""")
    expect(overlay).to_have_attribute('data-phase', 'closing')
    expect(overlay.locator('.card-detail-close')).to_be_hidden()
    expect(overlay.locator('.card-detail-panel').first).to_be_hidden()
    overlay.locator('.card-detail-art').evaluate('el=>el.getAnimations().forEach(animation=>animation.finish())')
    expect(overlay).to_have_count(0)
    details.get_by_role('button', name='关闭卡组详情', exact=True).click()
    expect(background).to_have_attribute('data-tablecloth', default_background)
    expect(background.locator(':scope > div')).to_have_count(1, timeout=2000)
    toggle.click()
    expect(page.get_by_role('region', name='卡组收藏夹', exact=True)).to_be_visible()
    toggle.click()

    page.get_by_role('button', name='卡牌', exact=True).click()
    mode = page.get_by_role('button', name='卡牌详情：浮窗', exact=True)
    expect(mode).to_have_attribute('aria-pressed', 'true')
    badge = page.get_by_test_id('library-grid').locator('.library-reserved-badge')
    assert badge.evaluate("""el=>{const b=el.getBoundingClientRect(),parent=el.parentElement.getBoundingClientRect();
      return b.x < parent.x+parent.width/2 && b.y > parent.y+parent.height/2;}""")
    mode.click()
    page.reload()
    page.wait_for_load_state('networkidle')
    page.get_by_role('button', name='卡牌', exact=True).click()
    mode = page.get_by_role('button', name='卡牌详情：侧栏', exact=True)
    expect(mode).to_have_attribute('aria-pressed', 'false')
    tile = page.get_by_role('button', name='查看交互卡牌01', exact=True)
    tile.click()
    expect(page.get_by_role('dialog', name='卡牌详情', exact=True)).to_have_attribute('aria-modal', 'false')
    page.keyboard.press('Escape')
    mode.click()
    expect(page.get_by_role('button', name='卡牌详情：浮窗', exact=True)).to_have_attribute('aria-pressed', 'true')
    tile.click()
    overlay = page.locator('.card-detail-overlay')
    expect(overlay).to_be_visible()
    overlay.locator('.card-detail-art').evaluate('el=>el.getAnimations()[0]?.finish()')
    expect(overlay).to_have_attribute('data-phase', 'ready')
    expect(overlay.locator('aside dt')).to_have_text(['状态', '卡池'])
    assert overlay.locator('aside > div').evaluate("""el=>{
      const type=el.querySelector('h2').getBoundingClientRect(),nation=el.lastElementChild.getBoundingClientRect();
      return Math.abs(type.y+type.height/2-nation.y-nation.height/2)<1 && nation.x>type.right;
    }""")
    page.keyboard.press('Escape')
    expect(overlay).to_have_count(0)
    page.reload()
    page.wait_for_load_state('networkidle')
    page.get_by_role('button', name='卡牌', exact=True).click()
    expect(page.get_by_role('button', name='卡牌详情：浮窗', exact=True)).to_be_visible()
    page.get_by_role('button', name='展开德国总部', exact=True).click()
    page.get_by_role('button', name='查看总部卡牌：但泽', exact=True).click()
    expect(overlay).to_be_visible()
    page.keyboard.press('Escape')
    expect(overlay).to_have_count(0)
    page.keyboard.press('Escape')

    page.get_by_role('button', name='卡组', exact=True).click()
    deck.dblclick()
    builder = page.get_by_test_id('builder-grid')
    expect(builder).to_be_visible()
    page.get_by_role('button', name='显示预备卡', exact=True).click()
    badge = builder.locator('.library-reserved-badge')
    assert badge.evaluate("""el=>{const b=el.getBoundingClientRect(),parent=el.parentElement.getBoundingClientRect();
      return b.x < parent.x+parent.width/2 && b.y > parent.y+parent.height/2;}""")
    page.get_by_role('button', name='显示预备卡', exact=True).click()
    tile = builder.get_by_role('button', name='查看交互卡牌01', exact=True)
    row = page.locator(f'[data-deck-card-id="{cards[0]["importId"]}"]')
    page.evaluate("""()=>{window.__latencies=[];document.addEventListener('click',event=>{
      if(event.target.closest('.card-action,.deck-card-strip'))window.__clickedAt=performance.now();},true);
      new MutationObserver(records=>{if(records.some(record=>[...record.addedNodes].some(node=>node instanceof Element&&node.matches('.card-detail-overlay'))))
      window.__latencies.push(performance.now()-window.__clickedAt);}).observe(document.body,{childList:true});}""")
    for source in [tile, row]:
        source.click()
        expect(overlay).to_be_visible()
        assert page.evaluate('window.__latencies.at(-1)') < 200
        page.keyboard.press('Escape')
        expect(overlay).to_have_count(0)
    tile.dblclick()
    expect(page.locator('.deck-count-value')).to_have_text('4/40')
    expect(overlay).to_have_count(0)
    row.dblclick()
    expect(page.locator('.deck-count-value')).to_have_text('5/40')
    expect(overlay).to_have_count(0)
    row.click(button='right')
    expect(page.locator('.deck-count-value')).to_have_text('4/40')
    expect(page.locator('.deck-card-preview')).to_have_count(0)
    assert not errors, errors
    print('PASS: stable deck selection, responsive toolbar, customization row, tablecloth restore, persistent modal/sidebar, headquarters modal, immediate animations, double-click add and right-click remove.')
    browser.close()
