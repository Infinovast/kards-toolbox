#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
KARDS 卡牌改动文档 -> JSON 解析脚本

用法:
    pip install python-docx
    python parse_kards_changes.py 输入.docx [导出.json]

规则:
  - 版本标题: 段落带大纲级别(outlineLvl)，跳过 前言/致谢/内测版本列表
  - 每个版本内，以空行分隔的段落块 = 一条卡牌改动；块首行为卡名
  - 块首行以“。”结尾 => 视为规则/机制说明，放入版本的 notes
  - status: 卡名黄色突出显示 => discarded；红色字体(或红色底色) => unannounced；否则 unmarked
  - 改动句式:
      X由A调整为B                -> attribute
      旧：... / 新：...（可跨行）  -> modify_effect；只有一侧时归为 add_effect
      添加/移除词条“...”          -> add_keyword / remove_keyword
      添加/移除(效果|特效)...      -> add_effect / remove_effect
      删除...                     -> 归入版本 notes
  - 每条卡牌都保留原文和段落编号，待核对的内容记入 needs_review
  - 使用内置卡库、天气补充和 card-history-mappings.json 关联 cardId
  - 覆盖率校验通过后生成独立导出文件，应用数据由人工合并
"""
import json
import re
import sys
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path
from tempfile import NamedTemporaryFile

import docx
from docx.oxml.ns import qn

SKIP_HEADINGS = {"前言", "致谢", "目前可知的内测平衡性调整版本列表"}
RED_COLORS = {"EE0000", "FF0000", "C00000"}
RED_FILLS = RED_COLORS
YELLOW_FILLS = {"FFFF00"}
ATTR_RE = re.compile(r"^(.+?)由\s*(.+?)\s*调整为\s*(.+?)[。.．]?\s*$")
OLDNEW_RE = re.compile(r"^(旧|新)[：:]\s*(.*)$")
ADDREM_RE = re.compile(r"^(添加|移除)(词条|效果|特效)?(.*)$")
NUMERIC_FIELDS = {"花费", "防御力", "攻击力", "行动花费"}
ATTRIBUTE_FIELDS = {
    "花费": "kredits", "行动花费": "operationCost", "攻击力": "attack", "防御力": "defense",
    "稀有度": "rarity", "类型": "type", "国家": "faction",
}
ROOT = Path(__file__).resolve().parents[1]


# ---------- 格式判断 ----------
def is_heading(p):
    ppr = p._p.pPr
    return (ppr is not None and ppr.find(qn("w:outlineLvl")) is not None
            or p.style is not None and p.style.style_id.startswith("Heading"))


def run_mark(run):
    """返回 'discarded' / 'unannounced' / None"""
    rpr = run._r.rPr
    if rpr is None:
        return None
    hl = rpr.find(qn("w:highlight"))
    if hl is not None:
        v = hl.get(qn("w:val"))
        if v == "yellow":
            return "discarded"
        if v in ("red", "darkRed"):
            return "unannounced"
    shd = rpr.find(qn("w:shd"))
    if shd is not None:
        fill = (shd.get(qn("w:fill")) or "").upper()
        if fill in YELLOW_FILLS:
            return "discarded"
        if fill in RED_FILLS:
            return "unannounced"
    col = rpr.find(qn("w:color"))
    if col is not None and (col.get(qn("w:val")) or "").upper() in RED_COLORS:
        return "unannounced"
    return None


def status_of(p):
    for r in p.runs:
        if r.text.strip():
            m = run_mark(r)
            if m:
                return m
    return "unmarked"


# ---------- 文本工具 ----------
def num(v):
    v = v.strip().rstrip("。.．").strip()
    return int(v) if re.fullmatch(r"-?\d+", v) else v


def strip_quotes(t):
    t = re.sub(r"^\s*[：:]", "", t).strip().rstrip("。")
    if t.startswith("“") and t.endswith("”") and balanced_quotes(t):
        t = t[1:-1]
    return t.strip()


def balanced_quotes(text):
    depth = 0
    for char in text:
        if char == "“":
            depth += 1
        elif char == "”":
            depth -= 1
            if depth < 0:
                return False
    return depth == 0


def join_line(prev, t, keywords=frozenset()):
    # 跨行续写：上一行以句号结尾、或上一行只有词条（如“老兵，守护”）则换行，
    # 否则视为同一句被折行，直接拼接
    last = prev.split("\n")[-1].strip()
    items = [s.strip() for s in re.split(r"[，、,]", last) if s.strip()]
    kw_only = bool(items) and all(s in keywords or s == "老兵" for s in items)
    sep = "\n" if (re.search(r"[。.！!]$", prev) or kw_only) else ""
    return prev + sep + t


def category(title):
    for k in ("紧急平衡", "预览勘误", "轮换卡牌重做"):
        if k in title:
            return k
    return "常规平衡"


# ---------- 主解析 ----------
def split_sections(paras):
    heads = [i for i, p in enumerate(paras) if p.text.strip() and is_heading(p)]
    sections = []
    for k, h in enumerate(heads):
        if paras[h].text.strip() in SKIP_HEADINGS:
            continue
        end = heads[k + 1] if k + 1 < len(heads) else len(paras)
        blocks, cur = [], []
        for i in range(h + 1, end):
            if paras[i].text.strip():
                cur.append(i)
            elif cur:
                blocks.append(cur)
                cur = []
        if cur:
            blocks.append(cur)
        sections.append((h, blocks))
    return sections


def collect_keywords(paras, sections):
    kw = set()
    for _, blocks in sections:
        for b in blocks:
            for i in b[1:]:
                m = re.match(r"^(添加|移除)词条(.*)$", paras[i].text.strip())
                if m:
                    kw.update(re.findall(r"“([^”]+)”", m.group(2)))
    return kw


def parse_card(paras, b, keywords, version, names):
    lines = [paras[i].text.strip() for i in b]
    name, note = lines[0], None
    m = re.match(r"^(.+?)（(.*。)）$", name)
    if m:
        name, note = m.group(1), m.group(2)
    card = {"card": name, "sourceLine": b[0] + 1, "sourceName": lines[0],
            "status": status_of(paras[b[0]]), "changes": []}
    if note:
        card["note"] = note
    review, last = [], None
    raw = []

    for index, t in enumerate(lines[1:], 1):
        source_line = b[index] + 1
        if t.startswith("删除"):
            version["notes"].append({"text": t, "sourceLine": source_line})
            continue

        raw.append(t)
        if not balanced_quotes(t):
            review.append(f"第 {source_line} 段引号不配对")

        m = OLDNEW_RE.match(t)
        if m:
            k = "old" if m.group(1) == "旧" else "new"
            body = m.group(2)
            prev = card["changes"][-1] if card["changes"] else None
            if k == "new" and prev and prev["type"] == "modify_effect" and prev["new"] is None:
                ch = prev
            else:
                if prev and prev["type"] == "modify_effect" and (k == "old" or prev["new"] is not None):
                    review.append(f"第 {source_line} 段出现重复的旧新描述")
                ch = {"type": "modify_effect", "old": None, "new": None}
                card["changes"].append(ch)
            # 同一行同时写了 旧/新
            if k == "old":
                parts = re.split(r"\s+新[：:]\s*", body, maxsplit=1)
                if len(parts) == 2:
                    ch["old"], ch["new"] = parts
                    last = (ch, "new")
                    continue
            ch[k] = body
            last = (ch, k)
            continue

        m = ATTR_RE.match(t)
        if m:
            fields = m.group(1).split("和") if m.group(1) == "防御力和攻击力" else [m.group(1)]
            old, new = num(m.group(2)), num(m.group(3))
            for f in fields:
                field = ATTRIBUTE_FIELDS.get(f)
                if field is None:
                    review.append(f"第 {source_line} 段属性字段异常：{f}")
                    continue
                if f in NUMERIC_FIELDS and not all(isinstance(value, int) for value in (old, new)):
                    review.append(f"第 {source_line} 段属性值应为整数：{f}")
                card["changes"].append({"type": "attribute", "field": field, "from": old, "to": new})
            last = None
            continue

        m = ADDREM_RE.match(t)
        if m:
            act, kind, rest = m.groups()
            action = "add" if act == "添加" else "remove"
            qs = re.findall(r"“([^”]+)”", rest)
            only_kw = (kind is None and qs and all(q in keywords for q in qs)
                       and re.fullmatch(r"[：:]?(“[^”]+”[、，]?)+。?", rest))
            if kind == "词条" or only_kw:
                card["changes"].append({"type": f"{action}_keyword", "keywords": qs or [strip_quotes(rest)]})
            else:
                card["changes"].append({"type": f"{action}_effect", "text": strip_quotes(rest)})
            last = None
            continue

        following = lines[index + 1] if index + 1 < len(lines) else ""
        after_new = last and last[1] == "new"
        if normalize_name(t) in names or (after_new and OLDNEW_RE.match(following)
                                          and not re.search(r"[，。；？！：,.!?、]", t)):
            raise ValueError(f"第 {source_line} 段疑似卡名“{t}”，请检查卡牌间的空段落")

        if last:  # 跨行续写
            ch, k = last
            ch[k] = join_line(ch[k], t, keywords)
            continue

        review.append(f"无法识别的行：{t}")

    for ch in card["changes"]:
        if ch["type"] == "modify_effect":
            old, new = ch["old"], ch["new"]
            if not old:
                review.append("原文缺少“旧：”描述")
            if not new:
                review.append("原文缺少“新：”描述")
            if old and old == new:
                review.append("原文的旧、新描述相同")
            for k in ("old", "new"):
                if ch[k] and re.search(r"(获得){2}", ch[k]):
                    review.append(f"“{'旧' if k == 'old' else '新'}：”疑似原文不完整/重复字")
                if ch[k] and re.search(r"(^|\n)\d部署", ch[k]):
                    review.append(f"“{'旧' if k == 'old' else '新'}：”中的“1部署”疑似原文笔误")
            if bool(old) != bool(new):
                ch.clear()
                ch.update(type="add_effect", text=old or new)
    if not card["changes"]:
        review.append("未解析出任何改动")
    if review:
        card["needs_review"] = review
    card["raw"] = raw
    return card


def parse(path, names=frozenset()):
    d = docx.Document(path)
    paras = d.paragraphs
    sections = split_sections(paras)
    keywords = collect_keywords(paras, sections)
    versions = []
    for h, blocks in sections:
        title = paras[h].text.strip()
        v = {"version": title, "sourceLine": h + 1, "category": category(title), "notes": [], "cards": []}
        for b in blocks:
            first = paras[b[0]].text.strip()
            if re.search(r"。$", first):
                v["notes"].extend({"text": paras[i].text.strip(), "sourceLine": i + 1} for i in b)
                continue
            v["cards"].append(parse_card(paras, b, keywords, v, names))
        versions.append(v)
    return d, sections, versions


# ---------- 覆盖率校验 ----------
def verify(d, sections, versions):
    paras = d.paragraphs
    if not versions or len(sections) != len(versions):
        raise ValueError("未找到完整的版本区段")

    def check(claimed, expected, title):
        if claimed != expected:
            raise ValueError(f"{title} 的段落内容或归属与原文不符")

    for (heading, blocks), version in zip(sections, versions):
        title = version["version"]
        check((version["sourceLine"], title), (heading + 1, paras[heading].text.strip()), title)
        expected_cards, expected_notes = [], []
        for block in blocks:
            first = block[0]
            name = paras[first].text.strip()
            if name.endswith("。"):
                expected_notes.extend((i + 1, paras[i].text.strip()) for i in block)
                continue
            raw = []
            for i in block[1:]:
                text = paras[i].text.strip()
                if text.startswith("删除"):
                    expected_notes.append((i + 1, text))
                else:
                    raw.append(text)
            expected_cards.append((first + 1, name, status_of(paras[first]), raw))

        check([(c["sourceLine"], c["sourceName"], c["status"], c["raw"]) for c in version["cards"]],
              expected_cards, title)
        check([(n["sourceLine"], n["text"]) for n in version["notes"]], expected_notes, title)

    statuses = {card["sourceLine"]: card["status"] for v in versions for card in v["cards"]}
    for i, paragraph in enumerate(paras, 1):
        marks = {run_mark(r) for r in paragraph.runs if r.text.strip()} - {None}
        if marks and marks != {statuses.get(i)}:
            raise ValueError(f"第 {i} 段的颜色标记未对应到正确的卡牌")

    # 目录位于首个版本前，页眉和页脚不属于正文。
    body = d.element.body
    containers = {qn(f"w:{name}") for name in ("tbl", "txbxContent", "sdt")}
    text_tag = qn("w:t")
    after_heading = False
    for element in body:
        after_heading |= element is paras[sections[0][0]]._p
        if not after_heading:
            continue
        for node in element.iter():
            if node.tag in containers and any((t.text or "").strip() for t in node.iter(text_tag)):
                raise ValueError("正文中有表格、文本框或内容控件，需先核对其中的文字")


def read_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def normalize_name(name):
    return re.sub(r"[\s\-‐‑‒–—―·・]", "", unicodedata.normalize("NFKC", name).casefold())


def catalog_title_index():
    cards = read_json(ROOT / "public/data/cards.json")["cards"]
    weather = read_json(ROOT / "src/data/weatherCards.json")
    catalog = {card["cardId"]: card for card in weather}
    for card in cards:
        if not card["cardId"].startswith("temp_") or card["cardId"] not in catalog:
            catalog[card["cardId"]] = card
    names = defaultdict(set)
    for card in catalog.values():
        for lang in ("zh-Hans", "zh-Hant", "en-EN"):
            title = card["json"].get("title", {}).get(lang)
            if title:
                names[normalize_name(title)].add(card["cardId"])
    return catalog, names


def link_cards(versions, catalog, names, mappings):
    aliases = mappings["aliases"]
    overrides = dict(mappings["cards"])
    note_links = dict(mappings["notes"])
    unresolved = []

    def manual(mapping, item, source_text):
        entry = mapping.pop(str(item["sourceLine"]), None)
        if entry is None:
            return None
        if entry["source"] != source_text or ("firstChange" in entry and item.get("raw", [])[:1] != [entry["firstChange"]]):
            raise ValueError(f"第 {item['sourceLine']} 段的人工映射与原文不符")
        return entry["cardIds"]

    for v in versions:
        for note in v["notes"]:
            note["cardIds"] = manual(note_links, note, note["text"]) or []
        for c in v["cards"]:
            override_ids = manual(overrides, c, c["sourceName"])
            candidates = names.get(normalize_name(c["card"]), ())
            if override_ids is not None:
                c["cardIds"] = override_ids
            elif c["card"] in aliases:
                c["cardIds"] = [aliases[c["card"]]]
            else:
                c["cardIds"] = list(candidates) if len(candidates) == 1 else []
            if not c["cardIds"]:
                unresolved.append({"version": v["version"], "card": c["card"], "sourceLine": c["sourceLine"],
                                   "status": c["status"], "candidateCardIds": sorted(candidates)})

    if overrides or note_links:
        raise ValueError(f"人工映射未找到原文段落：{sorted(overrides.keys() | note_links.keys())}")
    mapped_ids = set(aliases.values())
    for version in versions:
        for item in version["cards"] + version["notes"]:
            mapped_ids.update(item["cardIds"])
    unknown_ids = mapped_ids - catalog.keys()
    if unknown_ids:
        raise ValueError(f"映射含卡库中不存在的 cardId：{sorted(unknown_ids)}")
    return unresolved


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    src = Path(sys.argv[1])
    dst = Path(sys.argv[2]) if len(sys.argv) > 2 else src.with_suffix(".export.json")
    export_path = dst.resolve()
    if src.resolve() == export_path:
        raise ValueError("输出路径必须与原文档不同")
    if export_path == (ROOT / "src/data/cardHistory.json").resolve():
        raise ValueError("src/data/cardHistory.json 由人工维护，请指定独立的导出文件")
    catalog, names = catalog_title_index()
    mappings = read_json(ROOT / "scripts/card-history-mappings.json")
    known_names = names.keys() | {normalize_name(name) for name in mappings["aliases"]}
    d, sections, versions = parse(src, known_names)
    verify(d, sections, versions)
    unresolved = link_cards(versions, catalog, names, mappings)
    cards = [c for v in versions for c in v["cards"]]
    out = {
        "source": src.name,
        "status_legend": {"unmarked": "原文未标色", "discarded": "原文卡名黄色突出显示", "unannounced": "原文卡名红色字体"},
        "change_types": {"attribute": "field/from/to", "modify_effect": "old/new",
                         "add_keyword": "keywords", "remove_keyword": "keywords",
                         "add_effect": "text", "remove_effect": "text"},
        "stats": {"versions": len(versions), "card_changes": len(cards),
                  "linked_card_changes": len(cards) - len(unresolved),
                  "linked_notes": sum(bool(n["cardIds"]) for v in versions for n in v["notes"]),
                  "needs_review_card_changes": sum("needs_review" in c for c in cards),
                  "unresolved_status": dict(Counter(item["status"] for item in unresolved)),
                  "status": dict(Counter(c["status"] for c in cards))},
        "unresolved": unresolved,
        "versions": versions,
    }
    pending = None
    try:
        with NamedTemporaryFile(mode="w", encoding="utf-8", newline="\n", dir=dst.parent, delete=False) as f:
            pending = Path(f.name)
            json.dump(out, f, ensure_ascii=False, indent=2)
            f.write("\n")
        pending.replace(dst)
    finally:
        if pending is not None:
            pending.unlink(missing_ok=True)
    print(f"已写入 {dst}，{len(versions)} 个版本，{len(cards)} 条卡牌记录，{len(unresolved)} 条待确认关联。")


if __name__ == "__main__":
    try:
        main()
    except ValueError as error:
        sys.exit(f"校验失败：{error}")
