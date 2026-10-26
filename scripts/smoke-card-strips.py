"""Cost typography, reserve markers, hover previews and HQ totals; no screenshot/pixel tests."""
import copy
import json
import re
import sys
from pathlib import Path

from playwright.sync_api import expect, sync_playwright
from select_helpers import select_value

sys.stdout.reconfigure(encoding='utf-8')
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'test-results/card-strips'
OUT.mkdir(parents=True, exist_ok=True)
cards = copy.deepcopy(json.loads((ROOT/'public/data/cards.json').read_text(encoding='utf-8'))['cards'][:6])
for card, (name, kind, operation, nation, reserved) in zip(cards, [
    ('零行动步兵', 'infantry', 0, 'Germany', False),
    ('行动坦克', 'tank', 2, 'Germany', True),
    ('指令牌', 'order', None, 'Germany', True),
    ('反制指令牌', 'countermeasure', None, 'Germany', False),
    ('澳新步兵', 'infantry', 1, 'Anzac', False),
    ('高费轰炸机', 'bomber', 3, 'Germany', False),
]):
    card['reserved'] = reserved
    card['json'] = {'title':{'zh-Hans':name}, 'faction':nation, 'type':kind, 'kredits':10 if kind=='bomber' else 1, 'rarity':'Standard', 'set':'Base', 'image':'fixture.avif'}
    if operation is not None:
        card['json']['operationCost'] = operation

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context(viewport={'width':1280,'height':820})
    context.add_init_script('window.kardsDesktop = {readClipboardText:async()=>"",setTheme:async()=>true}')
    context.route('**/*', lambda route: route.continue_() if route.request.url.startswith(('http://127.0.0.1:5173','ws://127.0.0.1:5173','data:','blob:')) else route.abort())
    page = context.new_page()
    errors = []
    page.on('pageerror',lambda error:errors.append(str(error)))
    page.goto('http://127.0.0.1:5173'); page.wait_for_load_state('networkidle')
    code = page.evaluate('''async cards=>{
      const {default:store}=await import('/node_modules/.vite/deps/localforage.js');
      const {encodeDeckCode}=await import('/src/lib/deckCode.ts');
      const {cardImageUrl}=await import('/src/types/card.ts');
      const code=encodeDeckCode('Germany','Anzac',new Map(cards.map((c,i)=>[c.importId,i===0?34:1])));
      await store.setItem('kards_card_database_v1',{schemaVersion:1,active:{cards,source:'bundled',fetchedAt:null}});
      await store.setItem('kards_decks',[
        {id:'strip-test',name:'卡牌条交互',code,mainNation:'Germany',allyNation:'Anzac',totalCards:39,isFavorite:false,isArena:false,warnings:[]},
        {id:'empty-test',name:'空白预览',code:'%%21|;;;',mainNation:'Britain',allyNation:'Germany',totalCards:0,isFavorite:false,isArena:false,warnings:[]}
      ]);
      for(const c of cards) for (const kind of ['full', 'thumbnail']) await store.setItem(`kards_card_image_v2_${c.importId}_${encodeURIComponent(cardImageUrl(c,'zh-Hans','current',kind))}`, 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l1sAAAAASUVORK5CYII=');
      return code;
    }''',cards)
    page.reload(); page.wait_for_load_state('networkidle')
    cover = page.get_by_role('button',name='选择卡组 卡牌条交互',exact=True)
    expect(cover.get_by_alt_text('卡组含预备卡',exact=True)).to_be_visible()
    expect(cover.get_by_text('行动坦克 是预备卡',exact=True)).to_have_count(0)
    expect(cover.get_by_text('指令牌 是预备卡',exact=True)).to_have_count(0)
    expect(cover.get_by_text('零行动步兵 有 34 张，超过稀有度上限 4 张',exact=True)).to_be_visible()
    main_flag=cover.get_by_alt_text('main',exact=True)
    ally_flag=cover.get_by_alt_text('ally',exact=True)
    marker=cover.get_by_alt_text('卡组含预备卡',exact=True)
    assert marker.bounding_box()['x']>ally_flag.bounding_box()['x']>main_flag.bounding_box()['x']
    assert page.evaluate('async url=>{const r=await fetch(url);return r.ok&&(await r.text()).includes("<svg")}',marker.get_attribute('src'))
    cover.click()
    details=page.get_by_role('dialog',name='卡组详情',exact=True)
    expect(details.get_by_text('40 张（含总部）',exact=True)).to_be_visible()
    expect(details.get_by_role('list').get_by_role('listitem').first).to_contain_text('DANZIG')
    hq=details.locator('.deck-headquarters-strip')
    expect(hq.locator('.deck-card-cost,.deck-card-count')).to_have_count(0)
    rows=details.locator('.deck-card-strip')

    def row(name):
        return page.locator('.deck-card-strip:visible').filter(has=page.locator('.deck-card-name',has_text=re.compile('^'+re.escape(name)+'$')))

    for name,expected in [('零行动步兵','0'),('行动坦克','2'),('澳新步兵','1'),('高费轰炸机','3')]:
        r=row(name)
        expect(r.locator('.deck-card-operation')).to_have_text(expected)
        big=r.locator('.deck-card-deployment').bounding_box()
        small=r.locator('.deck-card-operation').bounding_box()
        assert small['x']>big['x'] and small['y']>big['y']
        assert r.locator('.deck-card-operation').evaluate('el=>parseFloat(getComputedStyle(el).fontSize)')<r.locator('.deck-card-deployment').evaluate('el=>parseFloat(getComputedStyle(el).fontSize)')
    for name in ['指令牌','反制指令牌']:
        expect(row(name).locator('.deck-card-operation')).to_have_count(0)
    for name in ['行动坦克','指令牌']:
        r=row(name); badge=r.get_by_alt_text('预备卡',exact=True)
        expect(badge).to_be_visible()
        assert badge.bounding_box()['x']<r.locator('.deck-card-cost').bounding_box()['x']
    expect(row('零行动步兵').get_by_alt_text('预备卡',exact=True)).to_have_count(0)
    expect(row('澳新步兵').locator('.deck-card-nation')).to_have_attribute('src','./assets/filters/anzac.svg')

    def check_hover(target):
        target.scroll_into_view_if_needed()
        page.evaluate('async()=>{await Promise.all(document.getAnimations().map(a=>a.finished.catch(()=>{})))}')
        before=target.bounding_box()
        target.hover()
        tooltip=page.get_by_role('tooltip')
        expect(tooltip).to_be_visible()
        expect(tooltip.locator('img')).to_have_count(1)
        assert tooltip.evaluate('el=>el.parentElement===document.body')
        bounds=tooltip.bounding_box()
        assert bounds['x']+bounds['width']<before['x'] and bounds['y']>=0 and bounds['y']+bounds['height']<=page.viewport_size['height']
        assert target.bounding_box()==before
        page.wait_for_function('el=>getComputedStyle(el.querySelector(".deck-card-strip-body")).filter!=="none"',arg=target.element_handle())
        page.mouse.move(110,70)
        expect(tooltip).to_have_count(0)
        target.evaluate('el=>el.blur()')
        target.focus(); expect(tooltip).to_be_visible()
        target.press('Escape'); expect(tooltip).to_have_count(0)

    check_hover(row('零行动步兵'))
    expect(details).to_be_visible()
    row('零行动步兵').evaluate('el=>el.blur()')
    row('零行动步兵').focus()
    row('行动坦克').hover()
    expect(page.get_by_role('tooltip')).to_have_count(1)
    expect(page.get_by_role('tooltip')).to_have_attribute('aria-label','行动坦克卡牌大图')
    page.mouse.move(110,70)
    for size in [{'width':980,'height':640},{'width':1280,'height':820}]:
        page.set_viewport_size(size)
        check_hover(row('高费轰炸机'))
    details.get_by_role('button',name='编辑卡组',exact=True).click()
    expect(page.get_by_label('卡组总张数（含总部）',exact=True)).to_have_text('40 / 40')
    expect(page.get_by_label('构筑卡牌列表',exact=True).locator('>div').first).to_contain_text('DANZIG')
    expect(row('行动坦克').locator('.deck-card-operation')).to_have_text('2')
    expect(row('行动坦克').get_by_alt_text('预备卡',exact=True)).to_be_visible()
    check_hover(row('行动坦克'))
    expect(page.get_by_test_id('builder-grid')).to_be_visible()
    row('行动坦克').hover()
    page.get_by_label('构筑卡牌列表',exact=True).evaluate('el=>el.parentElement.dispatchEvent(new Event("scroll"))')
    expect(page.get_by_role('tooltip')).to_have_count(0)
    for nation,title in [('Britain','ALEXANDRIA'),('Soviet','STALINGRAD'),('Japan','TRUK'),('USA','CHERBOURG'),('Germany','DANZIG')]:
        select_value(page,'主国',nation)
        page.get_by_role('button',name='确认更换',exact=True).click()
        expect(page.get_by_label(f'主国总部 {title}',exact=True)).to_be_visible()
        expect(page.get_by_label(f'主国总部 {title}',exact=True).locator('.deck-card-cost,.deck-card-count')).to_have_count(0)
    select_value(page,'构筑规则','custom')
    # Use tag-qualified input because the summary deliberately carries the same accessible name.
    size_input=page.locator('input[type="number"]').first
    expect(size_input).to_have_value('40')
    size_input.fill('41')
    expect(page.locator('span[aria-label="卡组总张数（含总部）"]')).to_have_text('40 / 41')
    page.get_by_role('button',name='保存更改',exact=True).click()
    expect(details.get_by_text('40 张（含总部）',exact=True)).to_be_visible()
    saved=page.evaluate('''async()=>{const {default:s}=await import('/node_modules/.vite/deps/localforage.js');return (await s.getItem('kards_decks'))[0]}''')
    assert saved['code']==code and saved['totalCards']==39 and saved['customRules']['deckSize']==40
    details.get_by_role('button',name='关闭卡组详情',exact=True).click()
    page.get_by_role('button',name='选择卡组 空白预览',exact=True).click()
    expect(details.get_by_text('1 张（含总部）',exact=True)).to_be_visible()
    expect(details.get_by_label('主国总部 ALEXANDRIA',exact=True)).to_be_visible()
    expect(details.locator('.deck-card-strip')).to_have_count(0)
    details.get_by_role('button',name='关闭卡组详情',exact=True).click()
    page.get_by_role('button',name='新卡组',exact=True).click()
    page.get_by_role('button',name='新建卡组',exact=False).click()
    expect(page.locator('span[aria-label="卡组总张数（含总部）"]')).to_have_text('1 / 40')
    expect(page.get_by_label('主国总部 DANZIG',exact=True)).to_be_visible()
    expect(page.get_by_label('构筑卡牌列表',exact=True).locator('.deck-card-strip')).to_have_count(0)
    assert not errors,errors
    (OUT/'result.json').write_text(json.dumps({'status':'passed','screenshots':False,'imageInspection':False,'pageErrors':errors,'checks':['deployment and lower-right operation cost including zero','orders have no operation cost','offline official reserved marker','cover marker follows nations and replaces reserve warnings only','reserved row left marker','ANZAC filter symbol','hover and keyboard full-card portal to the left','no layout shift or viewport clipping','preview closes on leave/Esc/scroll','five HQ names and no cost/count','HQ follows confirmed nation','40 total, custom rule conversion and unchanged code','empty deck has HQ and 1/40']},ensure_ascii=False,indent=2),encoding='utf-8')
    context.close();browser.close()
    print('Card strip smoke passed (no screenshots or image inspection)')
