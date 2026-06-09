#!/usr/bin/env python3
"""将 PDF 每页导出为 slide-N.png（供 PPTX 渲染管线使用）"""
import sys

import fitz


def main() -> int:
    if len(sys.argv) != 3:
        print("usage: pdf-to-png.py <pdf_path> <out_dir>", file=sys.stderr)
        return 1

    pdf_path, out_dir = sys.argv[1], sys.argv[2]
    doc = fitz.open(pdf_path)
    scale = 160 / 72
    matrix = fitz.Matrix(scale, scale)

    for index, page in enumerate(doc):
        pixmap = page.get_pixmap(matrix=matrix)
        pixmap.save(f"{out_dir}/slide-{index + 1}.png")

    page_count = doc.page_count
    doc.close()
    print(page_count)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
