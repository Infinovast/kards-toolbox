#!/usr/bin/env python3
"""清理稀有度 PNG 的均匀半透明灰底，仅依赖 Pillow。

安装依赖：python -m pip install Pillow
只做检查：python clean_alpha.py --check
处理本目录：python clean_alpha.py
指定目录：python clean_alpha.py "D:\\path\\to\\images"

适用条件：单帧 RGBA PNG，四周都是空白，背景带有近似均匀的非零 alpha。
以四边 alpha 最大值为 floor、全图 alpha 最大值为 peak，逐像素计算：
    new_alpha = round(max(0, alpha - floor) * peak / (peak - floor))
仅调整 alpha；保留 RGB、尺寸、主体最大不透明度及抗锯齿过渡。
四边已完全透明时跳过；边框变化过大、无 alpha 等情况留给人工确认。

只扫描目录直属 PNG，不递归、不改 SVG。覆盖前在系统临时目录备份，
重新读取并验证候选文件后再替换原图。不会修改项目版本或构建资源包。
退出码：0=完成/无需处理，1=检查发现待处理图片，2=存在需人工确认或错误。
"""

import argparse
from pathlib import Path
import shutil
import sys
import tempfile

try:
    from PIL import Image, PngImagePlugin
except ImportError:
    raise SystemExit("缺少 Pillow，请先运行：python -m pip install Pillow")


def detect_floor(image):
    """返回 (floor, peak)；已透明则返回 None，不适用则抛出 ValueError。"""
    if image.mode != "RGBA" or getattr(image, "is_animated", False):
        raise ValueError("仅支持单帧 RGBA PNG")
    alpha = image.getchannel("A")
    width, height = image.size
    edges = [
        alpha.crop((0, 0, width, 1)).getextrema(),
        alpha.crop((0, height - 1, width, height)).getextrema(),
        alpha.crop((0, 0, 1, height)).getextrema(),
        alpha.crop((width - 1, 0, width, height)).getextrema(),
    ]
    border_min = min(low for low, _ in edges)
    floor = max(high for _, high in edges)
    if floor == 0:
        return None
    alpha_min, peak = alpha.getextrema()
    if alpha_min == 0 or floor - border_min > 4 or floor >= peak:
        raise ValueError("背景不符合均匀半透明底层特征，请人工确认")
    return floor, peak


def clean_file(path, image, floor, peak, backup):
    lookup = [
        max(0, min(peak, round((value - floor) * peak / (peak - floor))))
        for value in range(256)
    ]
    cleaned = image.copy()
    cleaned.putalpha(image.getchannel("A").point(lookup))
    # 保留当前素材的文本信息，以及常用的色彩配置、分辨率和 EXIF 信息。
    pnginfo = PngImagePlugin.PngInfo()
    for key, value in image.text.items():
        if isinstance(value, PngImagePlugin.iTXt):
            pnginfo.add_itxt(key, value, lang=value.lang, tkey=value.tkey)
        else:
            pnginfo.add_text(key, value)
    options = {
        key: image.info[key]
        for key in ("icc_profile", "dpi", "exif")
        if key in image.info
    }
    shutil.copy2(path, backup / path.name)
    with tempfile.NamedTemporaryFile(
        prefix=f".{path.stem}-", suffix=".tmp", dir=path.parent, delete=False
    ) as handle:
        candidate = Path(handle.name)
    try:
        cleaned.save(candidate, format="PNG", optimize=True, pnginfo=pnginfo, **options)
        with Image.open(candidate) as verified:
            verified.load()
            if (
                verified.mode != image.mode
                or verified.size != image.size
                or verified.tobytes() != cleaned.tobytes()
                or verified.getchannel("A").getextrema() != (0, peak)
            ):
                raise ValueError("输出验证失败，原图未覆盖")
        # Windows 上先关闭源文件句柄，再原子替换同目录中的文件。
        image.close()
        candidate.replace(path)
    finally:
        candidate.unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("directory", nargs="?", type=Path, default=Path(__file__).resolve().parent)
    parser.add_argument("--check", action="store_true", help="仅检查，不修改图片或创建备份")
    args = parser.parse_args()
    directory = args.directory.resolve()
    if not directory.is_dir():
        parser.error(f"目录不存在：{directory}")
    paths = sorted(p for p in directory.iterdir() if p.is_file() and p.suffix.lower() == ".png")
    changed = skipped = errors = 0
    backup = None
    for path in paths:
        try:
            with Image.open(path) as image:
                image.load()
                result = detect_floor(image)
                if result is None:
                    skipped += 1
                    print(f"[跳过] {path.name}：四周已完全透明")
                    continue
                floor, peak = result
                if not args.check:
                    if backup is None:
                        backup = Path(tempfile.mkdtemp(prefix="kards-rarity-alpha-"))
                        print(f"[备份] {backup}")
                    clean_file(path, image, floor, peak, backup)
                changed += 1
                action = "待处理" if args.check else "已处理"
                print(f"[{action}] {path.name}：移除底值 {floor}，保留主体峰值 {peak}")
        except (OSError, ValueError) as error:
            errors += 1
            print(f"[需确认] {path.name}：{error}", file=sys.stderr)
    action = "待处理" if args.check else "已处理"
    print(f"共 {len(paths)} 张 PNG：{action} {changed}，跳过 {skipped}，需确认/错误 {errors}。")
    return 2 if errors else (1 if args.check and changed else 0)


if __name__ == "__main__":
    raise SystemExit(main())
