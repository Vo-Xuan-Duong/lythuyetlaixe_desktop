from __future__ import annotations

import html
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
REVIEW = ROOT / "data" / "traffic-signs" / "raw" / "manual-review.json"
OUTPUT = ROOT / "data" / "traffic-signs" / "raw" / "review-workspace.html"


def main() -> int:
    if not REVIEW.is_file():
        raise SystemExit(f"Missing manual review: {REVIEW}. Run pnpm signs:review:prepare first.")

    try:
        review = json.loads(REVIEW.read_text(encoding="utf-8"))
    except json.JSONDecodeError as error:
        raise SystemExit(f"Cannot parse manual review: {error}") from error

    if not isinstance(review, dict) or not isinstance(review.get("records"), list):
        raise SystemExit("manual-review.json must contain a records array")

    payload = json.dumps(review, ensure_ascii=False).replace("</", "<\\/")
    title = html.escape(str(review.get("sourceDocument") or "Traffic sign review"))
    document = f"""<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Traffic-sign manual review</title>
<style>
:root {{ font-family: Inter, system-ui, sans-serif; color: #172033; background: #f5f7fb; }}
* {{ box-sizing: border-box; }} body {{ margin: 0; }}
header {{ position: sticky; top: 0; z-index: 5; background: rgba(255,255,255,.96); border-bottom: 1px solid #dfe5ee; padding: 16px 22px; }}
h1 {{ margin: 0 0 6px; font-size: 22px; }} .muted {{ color: #657086; }}
.toolbar {{ display: flex; flex-wrap: wrap; gap: 10px; margin-top: 14px; }}
input, textarea, select, button {{ font: inherit; }}
.toolbar input, .toolbar select {{ padding: 9px 11px; border: 1px solid #cfd7e4; border-radius: 9px; background: white; }}
button {{ border: 1px solid #bec9dc; border-radius: 9px; padding: 9px 13px; background: white; cursor: pointer; font-weight: 700; }}
button.primary {{ background: #2056d7; border-color: #2056d7; color: white; }}
main {{ max-width: 1500px; margin: 0 auto; padding: 20px; display: grid; gap: 14px; }}
.summary {{ display: flex; gap: 12px; flex-wrap: wrap; }} .summary span {{ background: white; border: 1px solid #dfe5ee; border-radius: 999px; padding: 7px 11px; }}
.card {{ background: white; border: 1px solid #dfe5ee; border-radius: 14px; padding: 16px; display: grid; gap: 14px; }}
.card.verified {{ border-color: #a8d7bd; }} .card.pending {{ border-color: #edc88e; }}
.card-head {{ display: flex; justify-content: space-between; gap: 14px; align-items: flex-start; }}
.code {{ font-weight: 900; color: #2056d7; font-size: 18px; }} .section {{ color: #657086; font-size: 12px; }}
.grid {{ display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 12px; }}
label {{ display: grid; gap: 5px; font-size: 12px; color: #59657a; }}
label.full {{ grid-column: 1/-1; }}
label input, label textarea, label select {{ width: 100%; border: 1px solid #cfd7e4; border-radius: 8px; padding: 9px 10px; color: #172033; background: #fff; }}
label textarea {{ min-height: 88px; resize: vertical; }}
.candidate {{ background: #f7f9fc; border: 1px solid #e5eaf1; border-radius: 10px; padding: 12px; line-height: 1.55; }}
.candidate strong {{ display: block; margin-bottom: 6px; }}
.flags {{ display: flex; gap: 18px; flex-wrap: wrap; }} .flags label {{ display: flex; align-items: center; gap: 7px; color: #172033; font-size: 13px; }}
.preview {{ max-width: 180px; max-height: 140px; object-fit: contain; border: 1px solid #dfe5ee; border-radius: 10px; padding: 7px; background: #f7f9fc; }}
.hidden {{ display: none !important; }}
@media(max-width:760px) {{ .grid {{ grid-template-columns:1fr; }} label.full {{ grid-column:auto; }} .card-head {{ flex-direction:column; }} }}
</style>
</head>
<body>
<header>
  <h1>Traffic-sign manual review</h1>
  <div class="muted">Nguồn: {title}. Candidate chỉ là ngữ cảnh; chỉ export record đã được người review xác minh.</div>
  <div class="toolbar">
    <input id="search" type="search" placeholder="Tìm mã / tên / nội dung...">
    <select id="group"><option value="">Tất cả nhóm</option><option>PROHIBITION</option><option>WARNING</option><option>MANDATORY</option><option>INDICATION</option><option>SUPPLEMENTARY</option></select>
    <select id="state"><option value="">Tất cả trạng thái</option><option value="pending">Chưa verify</option><option value="verified">Đã verify</option></select>
    <button id="export" class="primary">Export manual-review.json</button>
  </div>
</header>
<main>
  <div id="summary" class="summary"></div>
  <div id="cards"></div>
</main>
<script>
const review = {payload};
const records = review.records;
const cards = document.getElementById('cards');
const summary = document.getElementById('summary');
const search = document.getElementById('search');
const group = document.getElementById('group');
const state = document.getElementById('state');

function field(label, value, key, index, area=false, full=false) {{
  const wrapper = document.createElement('label');
  if (full) wrapper.classList.add('full');
  wrapper.textContent = label;
  const input = document.createElement(area ? 'textarea' : 'input');
  input.value = value ?? '';
  input.addEventListener('input', () => records[index][key] = input.value);
  wrapper.appendChild(input);
  return wrapper;
}}
function arrayField(label, value, key, index, full=false) {{
  const wrapper = field(label, (value || []).join('\n'), key, index, true, full);
  const input = wrapper.querySelector('textarea');
  input.removeEventListener?.('input', ()=>{{}});
  input.addEventListener('input', () => records[index][key] = input.value.split('\n').map(v => v.trim()).filter(Boolean));
  return wrapper;
}}
function render() {{
  cards.innerHTML = '';
  const q = search.value.trim().toLowerCase();
  let shown = 0;
  records.forEach((record, index) => {{
    const status = record.verified === true ? 'verified' : 'pending';
    const haystack = `${{record.code}} ${{record.name || ''}} ${{record.meaning || ''}} ${{record.candidateHeading || ''}}`.toLowerCase();
    if (q && !haystack.includes(q)) return;
    if (group.value && record.groupCode !== group.value) return;
    if (state.value && status !== state.value) return;
    shown += 1;
    const card = document.createElement('section'); card.className = `card ${{status}}`;
    const head = document.createElement('div'); head.className='card-head';
    head.innerHTML = `<div><div class="code">${{record.code}}</div><div class="section">${{record.groupCode || '-'}} · ${{record.sourceSection || '-'}} · pages ${{(record.sourcePages || []).join(', ') || '-'}}</div></div>`;
    const flags = document.createElement('div'); flags.className='flags';
    const verifiedLabel=document.createElement('label'); const verified=document.createElement('input'); verified.type='checkbox'; verified.checked=record.verified===true; verified.addEventListener('change',()=>{{record.verified=verified.checked; card.classList.toggle('verified',verified.checked); card.classList.toggle('pending',!verified.checked); updateSummary();}}); verifiedLabel.append(verified,' Record verified');
    const imageLabel=document.createElement('label'); const imageVerified=document.createElement('input'); imageVerified.type='checkbox'; imageVerified.checked=record.imageVerified===true; imageVerified.addEventListener('change',()=>record.imageVerified=imageVerified.checked); imageLabel.append(imageVerified,' Image verified');
    flags.append(verifiedLabel,imageLabel); head.appendChild(flags); card.appendChild(head);
    const grid=document.createElement('div'); grid.className='grid';
    grid.append(field('Tên biển',record.name,'name',index), field('Đường dẫn ảnh',record.image,'image',index));
    grid.append(field('Ý nghĩa',record.meaning,'meaning',index,true,true));
    grid.append(field('Nhận biết',record.recognition,'recognition',index,true), field('Phạm vi',record.scope,'scope',index,true));
    grid.append(arrayField('Ngoại lệ - mỗi dòng một mục',record.exceptions,'exceptions',index,true), arrayField('Keywords - mỗi dòng một từ/cụm',record.keywords,'keywords',index,true));
    grid.append(field('Lưu ý',record.notes,'notes',index,true,true));
    grid.append(field('Người verify',record.verifiedBy,'verifiedBy',index), field('Thời điểm verify ISO-8601',record.verifiedAt,'verifiedAt',index));
    grid.append(field('Source section',record.sourceSection,'sourceSection',index), field('Source pages - nhập dạng 10,11', (record.sourcePages||[]).join(','),'__pages',index));
    const pageInput=grid.lastChild.querySelector('input'); pageInput.addEventListener('input',()=>{{records[index].sourcePages=pageInput.value.split(',').map(v=>Number(v.trim())).filter(v=>Number.isInteger(v)&&v>0);}});
    card.appendChild(grid);
    if (record.image) {{ const img=document.createElement('img'); img.className='preview'; img.src=`../processed/assets/${{record.image}}`; img.alt=`${{record.code}} preview`; card.appendChild(img); }}
    const candidate=document.createElement('div'); candidate.className='candidate'; candidate.innerHTML=`<strong>Candidate context - không tự coi là dữ liệu production</strong>${{record.candidateHeading || ''}}<br>${{record.candidateText || ''}}`; card.appendChild(candidate);
    cards.appendChild(card);
  }});
  summary.innerHTML=`<span>Hiển thị: ${{shown}}/${{records.length}}</span><span>Verified: ${{records.filter(r=>r.verified===true).length}}</span><span>Pending: ${{records.filter(r=>r.verified!==true).length}}</span><span>Ảnh pending: ${{records.filter(r=>r.image && r.imageVerified!==true).length}}</span>`;
}}
function updateSummary() {{ render(); }}
[search,group,state].forEach(el=>el.addEventListener('input',render));
document.getElementById('export').addEventListener('click',()=>{{
  const blob=new Blob([JSON.stringify(review,null,2)+'\n'],{{type:'application/json'}});
  const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='manual-review.json'; a.click(); setTimeout(()=>URL.revokeObjectURL(url),1000);
}});
render();
</script>
</body>
</html>
"""
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(document, encoding="utf-8")
    print(f"[ok] review workspace: {OUTPUT}")
    print("Open it in a browser, review records, then export manual-review.json back into data/traffic-signs/raw/.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
