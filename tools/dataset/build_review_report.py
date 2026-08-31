#!/usr/bin/env python3
"""Build a read-only HTML workspace for manual answer and image verification."""

from __future__ import annotations

import argparse
import html
import json
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_ANSWER_REVIEW = ROOT / "data" / "raw" / "answer-review.json"
DEFAULT_IMAGE_REVIEW = ROOT / "data" / "raw" / "image-review.json"
DEFAULT_IMAGE_DATASET = ROOT / "data" / "raw" / "questions.with-images.json"
DEFAULT_ASSETS = ROOT / "data" / "processed" / "assets"
DEFAULT_OUTPUT = ROOT / "data" / "raw" / "review-workspace.html"


def read_json(path: Path) -> dict[str, Any]:
    if not path.is_file():
        return {}
    value = json.loads(path.read_text(encoding="utf-8"))
    return value if isinstance(value, dict) else {}


def esc(value: Any) -> str:
    return html.escape(str(value if value is not None else ""), quote=True)


def score_table(scores: dict[str, Any]) -> str:
    if not scores:
        return '<span class="muted">Không có geometry score.</span>'
    cells = "".join(
        f"<tr><td>{esc(key)}</td><td>{float(value):.4f}</td></tr>"
        for key, value in sorted(scores.items())
        if isinstance(value, (int, float))
    )
    return f"<table><thead><tr><th>Đáp án</th><th>Underline score</th></tr></thead><tbody>{cells}</tbody></table>"


def answer_cards(payload: dict[str, Any]) -> str:
    items = payload.get("items")
    if not isinstance(items, list) or not items:
        return '<div class="empty">Không có answer unresolved trong report hiện tại.</div>'

    cards: list[str] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        question_id = item.get("id")
        answers = item.get("parsedAnswers") if isinstance(item.get("parsedAnswers"), list) else []
        answer_rows = "".join(
            f'<li><strong>{esc(answer.get("key"))}</strong> {esc(answer.get("content"))}</li>'
            for answer in answers
            if isinstance(answer, dict)
        )
        cards.append(
            f"""
            <article class="card" id="answer-{esc(question_id)}">
              <div class="card-title">
                <h3>Câu {esc(question_id)}</h3>
                <span>Trang {esc(item.get('sourcePage') or '—')}</span>
              </div>
              <p class="reason">{esc(item.get('reason') or 'unresolved')}</p>
              <div class="two-column">
                <div><h4>Parsed answers</h4><ol class="answers">{answer_rows}</ol></div>
                <div><h4>Geometry</h4>{score_table(item.get('scores') if isinstance(item.get('scores'), dict) else {})}</div>
              </div>
              <p class="hint">Ghi quyết định đã đối chiếu PDF vào <code>data/source/manual-answer-review.json</code>.</p>
            </article>
            """
        )
    return "\n".join(cards)


def asset_preview(image_path: str | None, output: Path, assets_root: Path) -> str:
    if not image_path:
        return '<span class="muted">Chưa có rendered asset.</span>'
    asset = assets_root / image_path
    if not asset.is_file():
        return f'<span class="muted">Asset chưa tồn tại: {esc(image_path)}</span>'
    try:
        relative = asset.relative_to(output.parent)
    except ValueError:
        relative = Path("../../processed/assets") / image_path
    return f'<img class="preview" src="{esc(relative.as_posix())}" alt="{esc(image_path)}" />'


def image_cards(
    review_payload: dict[str, Any],
    image_dataset: dict[str, Any],
    output: Path,
    assets_root: Path,
) -> str:
    image_by_question: dict[int, str | None] = {}
    dataset_rows = image_dataset.get("questions")
    if isinstance(dataset_rows, list):
        for row in dataset_rows:
            if not isinstance(row, dict) or not isinstance(row.get("id"), int):
                continue
            image = row.get("image")
            image_by_question[int(row["id"])] = image if isinstance(image, str) else None

    items = review_payload.get("questions")
    if not isinstance(items, list) or not items:
        return '<div class="empty">Chưa có image-review report.</div>'

    cards: list[str] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        status = str(item.get("status") or "unknown")
        if status == "none" and not item.get("image"):
            continue
        question_id = int(item.get("questionId", 0) or 0)
        candidates = item.get("candidates") if isinstance(item.get("candidates"), list) else []
        candidate_rows = "".join(
            f"<tr><td>{esc(candidate.get('page'))}</td><td><code>{esc(candidate.get('crop'))}</code></td>"
            f"<td>{esc(candidate.get('rasterObjects'))}</td><td>{esc(candidate.get('vectorObjects'))}</td></tr>"
            for candidate in candidates
            if isinstance(candidate, dict)
        ) or '<tr><td colspan="4" class="muted">Không có candidate crop.</td></tr>'
        image_path = image_by_question.get(question_id) or (
            item.get("image") if isinstance(item.get("image"), str) else None
        )
        cards.append(
            f"""
            <article class="card" id="image-{question_id}">
              <div class="card-title">
                <h3>Câu {question_id}</h3>
                <span class="status {esc(status)}">{esc(status)}</span>
              </div>
              <p>Source page: <strong>{esc(item.get('sourcePage') or '—')}</strong></p>
              <p class="reason">{esc(item.get('reason') or '')}</p>
              <div class="image-grid">
                <div>{asset_preview(image_path, output, assets_root)}</div>
                <div>
                  <table>
                    <thead><tr><th>Page</th><th>Crop</th><th>Raster</th><th>Vector</th></tr></thead>
                    <tbody>{candidate_rows}</tbody>
                  </table>
                </div>
              </div>
              <p class="hint">Ghi quyết định vào <code>data/source/manual-image-review.json</code>; không approve ảnh nếu crop chứa answer text/underline.</p>
            </article>
            """
        )
    return "\n".join(cards) or '<div class="empty">Không có image item cần xem trong report hiện tại.</div>'


def build_html(answer_payload: dict[str, Any], image_payload: dict[str, Any], image_dataset: dict[str, Any], output: Path, assets_root: Path) -> str:
    answer_count = int(answer_payload.get("unresolvedCount", 0) or 0)
    image_count = int(image_payload.get("needsReview", 0) or 0)
    return f"""<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Dataset manual review workspace</title>
<style>
:root {{ font-family: Inter, system-ui, sans-serif; color: #172033; background: #eef2f7; }}
* {{ box-sizing: border-box; }} body {{ margin: 0; }} main {{ width: min(1180px, calc(100% - 28px)); margin: 28px auto 80px; }}
header {{ background: white; border: 1px solid #dce4ef; border-radius: 18px; padding: 24px; }}
h1,h2,h3,h4 {{ margin-top: 0; }} header p,.muted,.hint {{ color: #69768a; }}
.summary {{ display: flex; gap: 10px; flex-wrap: wrap; }} .summary span {{ background: #edf2fa; border-radius: 999px; padding: 7px 10px; font-weight: 700; font-size: 13px; }}
section {{ margin-top: 28px; }} .card {{ margin-top: 12px; padding: 20px; border: 1px solid #dde4ed; border-radius: 15px; background: white; }}
.card-title {{ display:flex; justify-content:space-between; gap:12px; align-items:center; }} .card-title h3 {{ margin:0; }}
.reason {{ padding: 9px 11px; background:#fff8eb; border-radius:9px; color:#80530f; }}
.two-column,.image-grid {{ display:grid; grid-template-columns:1fr 1fr; gap:18px; }}
table {{ width:100%; border-collapse:collapse; font-size:13px; }} th,td {{ padding:8px; border-bottom:1px solid #e8edf3; text-align:left; vertical-align:top; }}
.answers {{ padding-left:22px; }} .answers li {{ margin:7px 0; }} code {{ overflow-wrap:anywhere; }}
.preview {{ display:block; max-width:100%; max-height:480px; object-fit:contain; border:1px solid #e0e5ed; border-radius:10px; background:#fafbfd; }}
.status {{ padding:5px 8px; border-radius:999px; background:#eef3ff; font-size:11px; font-weight:800; }}
.status.review {{ background:#fff6e9; color:#8b5a0f; }} .status.accepted {{ background:#eefaf4; color:#176a49; }}
.empty {{ padding:18px; background:white; border:1px dashed #ccd5e2; border-radius:12px; color:#69768a; }}
.warning {{ color:#9e3030; font-weight:700; }}
@media (max-width: 760px) {{ .two-column,.image-grid {{ grid-template-columns:1fr; }} .card-title {{ align-items:flex-start; flex-direction:column; }} }}
</style>
</head>
<body><main>
<header>
  <h1>Dataset manual review workspace</h1>
  <p>Trang này chỉ để đối chiếu. Không có nút tự xác nhận đáp án/hình ảnh và không thay đổi dataset.</p>
  <div class="summary"><span>Answer unresolved: {answer_count}</span><span>Image review: {image_count}</span></div>
  <p class="warning">Nguồn quyết định cuối cùng phải là PDF chính thức; AI/semantic guess không được dùng để điền đáp án.</p>
</header>
<section><h2>Answer review</h2>{answer_cards(answer_payload)}</section>
<section><h2>Image review</h2>{image_cards(image_payload, image_dataset, output, assets_root)}</section>
</main></body></html>"""


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--answers", type=Path, default=DEFAULT_ANSWER_REVIEW)
    parser.add_argument("--images", type=Path, default=DEFAULT_IMAGE_REVIEW)
    parser.add_argument("--image-dataset", type=Path, default=DEFAULT_IMAGE_DATASET)
    parser.add_argument("--assets-root", type=Path, default=DEFAULT_ASSETS)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()

    answer_payload = read_json(args.answers)
    image_payload = read_json(args.images)
    image_dataset = read_json(args.image_dataset)

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        build_html(answer_payload, image_payload, image_dataset, args.output, args.assets_root),
        encoding="utf-8",
    )
    print(f"[ok] review workspace: {args.output}")
    print("[note] read-only report; write verified decisions to manual review JSON files")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
