"""Import the supplied KARDS collection filter symbols for offline use."""
from concurrent.futures import ThreadPoolExecutor
from email import policy
from email.parser import BytesParser
from pathlib import Path
from urllib.request import Request, urlopen
import json
import re

from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / 'public/assets/filters'
SETS = {
    'Base': '1732572097-set-icon-base.svg',
    'OceaniaStorm': '1780567349-oceania_storm_set-icon.svg',
    'Homefront': '1763718716-homefront.svg',
    'NavalWarfare': '1750348798-naval-warfare.svg',
    'BloodAndIron': '1732573199-set-icon-blood.svg',
    'CovertOps': '1732572110-set-icon-covert.svg',
    'WinterWar': '1732572120-set-icon-winter.svg',
    'BrothersInArms': '1732573000-set-icon-brothers.png',
    'TheatersOfWar': '1732572178-set-icon-theaters.svg',
    'WorldAtWar': '1732572859-set-icon-world.png',
    'Legions': '1732572188-set-icon-legions.svg',
    'Breakthrough': '1732572199-set-icon-breakthrough.svg',
    'Allegiance': '1732572215-set-icon-allegiance.svg',
}


def main():
    DEST.mkdir(parents=True, exist_ok=True)
    message = BytesParser(policy=policy.default).parsebytes((ROOT / 'references/收藏.mhtml').read_bytes())
    page = next(part for part in message.walk() if part.get_content_type() == 'text/html')
    soup = BeautifulSoup(page.get_payload(decode=True), 'html.parser')
    bar = soup.select_one('.FilterBar_filter__OSG_G')
    manifest = {}
    for button in bar.select('button[name]'):
        svg = button.find('svg')
        if not svg:
            continue
        name = {'Soviet Union': 'Soviet', 'United States': 'USA'}.get(button['name'], button['name'])
        # HTML parsers lowercase SVG attributes; restore the case required by SVG.
        content = str(svg).replace('viewbox=', 'viewBox=')
        content = re.sub(r'fill-opacity="[^"]*"', 'fill-opacity="1"', content)
        filename = f'{name.lower()}.svg'
        (DEST / filename).write_text(content, encoding='utf-8')
        manifest[filename] = 'references/收藏.mhtml · FilterBar_filter__OSG_G · ' + button['name']
    for part in message.walk():
        if part.get('Content-Location', '').endswith('/static/icons/set-icon-all.svg'):
            (DEST / 'set-all.svg').write_bytes(part.get_payload(decode=True))
            manifest['set-all.svg'] = part['Content-Location']
            break
    (DEST / 'neutral.svg').write_text('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><path d="M16 2 30 16 16 30 2 16Z" fill="#080808" stroke="#fff" stroke-width="2"/></svg>\n', encoding='utf-8')
    manifest['neutral.svg'] = 'User-specified black diamond with white outline'

    def download(item):
        name, path = item
        url = 'https://www.datocms-assets.com/120590/' + path
        with urlopen(Request(url, headers={'User-Agent': 'KARDS-Toolbox-asset-import'}), timeout=40) as response:
            content = response.read()
        suffix = Path(path).suffix
        if suffix == '.svg' and b'<svg' not in content:
            raise ValueError(f'Invalid SVG: {url}')
        if suffix == '.png' and not content.startswith(b'\x89PNG\r\n\x1a\n'):
            raise ValueError(f'Invalid PNG: {url}')
        filename = f'set-{name}{suffix}'
        (DEST / filename).write_bytes(content)
        return filename, url

    with ThreadPoolExecutor(max_workers=6) as pool:
        manifest.update(pool.map(download, SETS.items()))
    (DEST / 'sources.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'Imported {len(manifest)} offline filter icons into {DEST}')


if __name__ == '__main__':
    main()
