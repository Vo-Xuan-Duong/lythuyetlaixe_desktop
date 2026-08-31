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
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Traffic-sign manual review</title>
<style>
:root {{ font-family: Inter,system-ui,sans-serif; color:#172033; background:#f5f7fb; }} * {{ box-sizing:border-box; }} body {{ margin:0; }}
header {{ position:sticky; top:0; z-index:5; background:rgba(255,255,255,.96); border-bottom:1px solid #dfe5ee; padding:16px 22px; }}
h1 {{ margin:0 0 6px; font-size:22px; }} .muted {{ color:#657086; }} .toolbar,.selection-row,.flags,.crop-row {{ display:flex; flex-wrap:wrap; gap:10px; align-items:center; }}
.toolbar {{ margin-top:14px; }} input,textarea,select,button {{ font:inherit; }} .toolbar input,.toolbar select,.crop-row input {{ padding:9px 11px; border:1px solid #cfd7e4; border-radius:9px; background:white; }}
button {{ border:1px solid #bec9dc; border-radius:9px; padding:9px 13px; background:white; cursor:pointer; font-weight:700; }} button.primary {{ background:#2056d7; border-color:#2056d7; color:white; }} button.danger {{ color:#a72b2b; }}
main {{ max-width:1500px; margin:0 auto; padding:20px; display:grid; gap:14px; }} .summary {{ display:flex; gap:12px; flex-wrap:wrap; }} .summary span {{ background:white; border:1px solid #dfe5ee; border-radius:999px; padding:7px 11px; }}
.card {{ background:white; border:1px solid #dfe5ee; border-radius:14px; padding:16px; display:grid; gap:14px; margin-bottom:14px; }} .card.verified {{ border-color:#a8d7bd; }} .card.pending {{ border-color:#edc88e; }}
.card-head {{ display:flex; justify-content:space-between; gap:14px; align-items:flex-start; }} .code {{ font-weight:900; color:#2056d7; font-size:18px; }} .section {{ color:#657086; font-size:12px; }}
.grid {{ display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; }} label {{ display:grid; gap:5px; font-size:12px; color:#59657a; }} label.full {{ grid-column:1/-1; }} label input,label textarea,label select {{ width:100%; border:1px solid #cfd7e4; border-radius:8px; padding:9px 10px; color:#172033; background:#fff; }} label textarea {{ min-height:88px; resize:vertical; }}
.flags label {{ display:flex; align-items:center; gap:7px; color:#172033; font-size:13px; }} .candidate {{ white-space:pre-wrap; overflow-wrap:anywhere; background:#f7f9fc; border:1px solid #e5eaf1; border-radius:10px; padding:12px; line-height:1.55; }} .candidate strong {{ display:block; margin-bottom:6px; }}
.preview {{ max-width:220px; max-height:170px; object-fit:contain; border:1px solid #dfe5ee; border-radius:10px; padding:7px; background:#f7f9fc; }} .image-review {{ border:1px solid #dfe5ee; border-radius:12px; padding:12px; display:grid; gap:10px; }} .image-review h3 {{ margin:0; font-size:14px; }}
.image-gallery {{ display:grid; grid-template-columns:repeat(auto-fill,minmax(190px,1fr)); gap:10px; }} .image-option {{ border:2px solid #dfe5ee; border-radius:12px; padding:9px; background:#fff; display:grid; gap:8px; text-align:left; cursor:pointer; }} .image-option.selected {{ border-color:#2056d7; box-shadow:0 0 0 2px rgba(32,86,215,.12); }} .image-option img {{ width:100%; height:150px; object-fit:contain; background:#f7f9fc; border-radius:8px; }} .image-meta {{ font-size:11px; color:#657086; overflow-wrap:anywhere; }}
.selection-chip {{ font-size:12px; background:#eef3ff; color:#204ba8; border-radius:999px; padding:6px 9px; }} .crop-help {{ font-size:11px; color:#657086; }} .crop-page {{ width:110px; }} .crop-rect {{ min-width:280px; flex:1; }}
@media(max-width:760px) {{ .grid {{ grid-template-columns:1fr; }} label.full {{ grid-column:auto; }} .card-head {{ flex-direction:column; }} .crop-rect {{ min-width:100%; }} }}
</style>
</head>
<body>
<header>
<h1>Traffic-sign manual review</h1>
<div class="muted">Nguồn: {title}. Candidate text/ảnh chỉ là ngữ cảnh. Production chỉ nhận record đã verify và ảnh có provenance từ QCVN chính thức.</div>
<div class="toolbar"><input id="search" type="search" placeholder="Tìm mã / tên / nội dung..."><select id="group"><option value="">Tất cả nhóm</option><option>PROHIBITION</option><option>WARNING</option><option>MANDATORY</option><option>INDICATION</option><option>SUPPLEMENTARY</option></select><select id="state"><option value="">Tất cả trạng thái</option><option value="pending">Chưa verify</option><option value="verified">Đã verify</option></select><button id="export" class="primary">Export manual-review.json</button></div>
</header>
<main><div id="summary" class="summary"></div><div id="cards"></div></main>
<script>
const review={payload}; const records=review.records; const cards=document.getElementById('cards'); const summary=document.getElementById('summary'); const search=document.getElementById('search'); const group=document.getElementById('group'); const state=document.getElementById('state');
function scalarField(labelText,value,key,index,area=false,full=false){{const w=document.createElement('label');if(full)w.classList.add('full');const c=document.createElement('span');c.textContent=labelText;const i=document.createElement(area?'textarea':'input');i.value=value??'';i.addEventListener('input',()=>records[index][key]=i.value);w.append(c,i);return w;}}
function arrayField(labelText,value,key,index,full=false){{const w=document.createElement('label');if(full)w.classList.add('full');const c=document.createElement('span');c.textContent=labelText;const i=document.createElement('textarea');i.value=(value||[]).join('\n');i.addEventListener('input',()=>records[index][key]=i.value.split('\n').map(v=>v.trim()).filter(Boolean));w.append(c,i);return w;}}
function pagesField(record,index){{const w=document.createElement('label');const c=document.createElement('span');c.textContent='Source pages - dạng 10,11';const i=document.createElement('input');i.value=(record.sourcePages||[]).join(',');i.addEventListener('input',()=>records[index].sourcePages=i.value.split(',').map(v=>Number(v.trim())).filter(v=>Number.isInteger(v)&&v>0));w.append(c,i);return w;}}
function summaryChip(text){{const s=document.createElement('span');s.textContent=text;summary.appendChild(s);}}
function clearImageChoice(record){{record.selectedImageCandidate=null;delete record.manualImageCrop;record.image=null;record.imageSelection=null;record.imageVerified=false;}}
function renderImageReview(record,index){{
 const panel=document.createElement('div');panel.className='image-review';const title=document.createElement('h3');title.textContent='Ảnh từ QCVN chính thức';panel.appendChild(title);
 const row=document.createElement('div');row.className='selection-row';const chip=document.createElement('span');chip.className='selection-chip';chip.textContent=record.selectedImageCandidate?`Candidate: ${{record.selectedImageCandidate}}`:record.manualImageCrop?`Manual crop: page ${{record.manualImageCrop.page}}`:'Chưa chọn/crop ảnh';row.appendChild(chip);
 if(record.selectedImageCandidate||record.manualImageCrop){{const clear=document.createElement('button');clear.type='button';clear.className='danger';clear.textContent='Bỏ lựa chọn ảnh';clear.addEventListener('click',()=>{{clearImageChoice(record);render();}});row.appendChild(clear);}} panel.appendChild(row);
 const cropRow=document.createElement('div');cropRow.className='crop-row';const pageInput=document.createElement('input');pageInput.className='crop-page';pageInput.type='number';pageInput.min='1';pageInput.placeholder='Page';pageInput.value=record.manualImageCrop?.page??'';const cropInput=document.createElement('input');cropInput.className='crop-rect';cropInput.placeholder='x0,y0,x1,y1';cropInput.value=Array.isArray(record.manualImageCrop?.crop)?record.manualImageCrop.crop.join(','):'';const applyCrop=document.createElement('button');applyCrop.type='button';applyCrop.textContent='Dùng manual crop';applyCrop.addEventListener('click',()=>{{const page=Number(pageInput.value);const crop=cropInput.value.split(',').map(v=>Number(v.trim()));if(!Number.isInteger(page)||page<=0||crop.length!==4||crop.some(v=>!Number.isFinite(v))||crop[2]<=crop[0]||crop[3]<=crop[1]){{alert('Manual crop phải có page > 0 và crop dạng x0,y0,x1,y1 với diện tích dương.');return;}}record.manualImageCrop={{page,crop}};record.selectedImageCandidate=null;record.image=null;record.imageSelection=null;record.imageVerified=false;render();}});cropRow.append(pageInput,cropInput,applyCrop);panel.appendChild(cropRow);const help=document.createElement('div');help.className='crop-help';help.textContent='Manual crop dùng tọa độ PDF của file QCVN ghép đã verify. Sau export, chạy signs:review:images để render/copy ảnh processed rồi mở lại workspace để kiểm tra.';panel.appendChild(help);
 const candidates=Array.isArray(record.candidateImages)?record.candidateImages:[];if(candidates.length===0){{const empty=document.createElement('div');empty.className='muted';empty.textContent='Không có image candidate tự động cho section này; dùng manual crop nếu biển cần ảnh.';panel.appendChild(empty);return panel;}}
 const gallery=document.createElement('div');gallery.className='image-gallery';candidates.forEach(candidate=>{{if(!candidate||typeof candidate.file!=='string')return;const option=document.createElement('button');option.type='button';option.className='image-option';if(record.selectedImageCandidate===candidate.file)option.classList.add('selected');const img=document.createElement('img');img.src=candidate.file;img.alt=`Candidate ${{record.code}}`;const meta=document.createElement('div');meta.className='image-meta';meta.textContent=`${{candidate.file}} · page ${{candidate.page??'-'}} · ${{candidate.status??'candidate'}}`;option.append(img,meta);option.addEventListener('click',()=>{{record.selectedImageCandidate=candidate.file;delete record.manualImageCrop;record.image=null;record.imageSelection=null;record.imageVerified=false;render();}});gallery.appendChild(option);}});panel.appendChild(gallery);return panel;
}}
function render(){{cards.replaceChildren();const q=search.value.trim().toLowerCase();let shown=0;records.forEach((record,index)=>{{const status=record.verified===true?'verified':'pending';const haystack=`${{record.code}} ${{record.name||''}} ${{record.meaning||''}} ${{record.candidateHeading||''}}`.toLowerCase();if(q&&!haystack.includes(q))return;if(group.value&&record.groupCode!==group.value)return;if(state.value&&status!==state.value)return;shown++;
 const card=document.createElement('section');card.className=`card ${{status}}`;const head=document.createElement('div');head.className='card-head';const identity=document.createElement('div');const code=document.createElement('div');code.className='code';code.textContent=record.code||'(missing code)';const section=document.createElement('div');section.className='section';section.textContent=`${{record.groupCode||'-'}} · ${{record.sourceSection||'-'}} · pages ${{(record.sourcePages||[]).join(', ')||'-'}}`;identity.append(code,section);head.appendChild(identity);
 const flags=document.createElement('div');flags.className='flags';const verifiedLabel=document.createElement('label');const verified=document.createElement('input');verified.type='checkbox';verified.checked=record.verified===true;verified.addEventListener('change',()=>{{record.verified=verified.checked;render();}});verifiedLabel.append(verified,document.createTextNode(' Record verified'));const imageLabel=document.createElement('label');const imageVerified=document.createElement('input');imageVerified.type='checkbox';imageVerified.checked=record.imageVerified===true;imageVerified.disabled=!record.image;imageVerified.addEventListener('change',()=>record.imageVerified=imageVerified.checked);imageLabel.append(imageVerified,document.createTextNode(' Image verified'));flags.append(verifiedLabel,imageLabel);head.appendChild(flags);card.appendChild(head);
 const grid=document.createElement('div');grid.className='grid';grid.append(scalarField('Tên biển',record.name,'name',index),scalarField('Đường dẫn ảnh processed',record.image,'image',index));grid.append(scalarField('Ý nghĩa',record.meaning,'meaning',index,true,true));grid.append(scalarField('Nhận biết',record.recognition,'recognition',index,true),scalarField('Phạm vi',record.scope,'scope',index,true));grid.append(arrayField('Ngoại lệ - mỗi dòng một mục',record.exceptions,'exceptions',index,true),arrayField('Keywords - mỗi dòng một từ/cụm',record.keywords,'keywords',index,true));grid.append(scalarField('Lưu ý',record.notes,'notes',index,true,true));grid.append(scalarField('Người verify',record.verifiedBy,'verifiedBy',index),scalarField('Thời điểm verify ISO-8601',record.verifiedAt,'verifiedAt',index));grid.append(scalarField('Source section',record.sourceSection,'sourceSection',index),pagesField(record,index));card.appendChild(grid);
 card.appendChild(renderImageReview(record,index));if(record.image&&!record.image.includes('://')&&!record.image.startsWith('/')){{const wrap=document.createElement('div');const t=document.createElement('strong');t.textContent='Processed asset hiện tại';const img=document.createElement('img');img.className='preview';img.src=`../processed/assets/${{record.image}}`;img.alt=`${{record.code}} processed preview`;wrap.append(t,document.createElement('br'),img);card.appendChild(wrap);}}
 const candidate=document.createElement('div');candidate.className='candidate';const ct=document.createElement('strong');ct.textContent='Candidate text - không tự coi là dữ liệu production';const text=document.createElement('span');text.textContent=`${{record.candidateHeading||''}}\n${{record.candidateText||''}}`;candidate.append(ct,text);card.appendChild(candidate);cards.appendChild(card);}});
 summary.replaceChildren();summaryChip(`Hiển thị: ${{shown}}/${{records.length}}`);summaryChip(`Verified: ${{records.filter(r=>r.verified===true).length}}`);summaryChip(`Pending: ${{records.filter(r=>r.verified!==true).length}}`);summaryChip(`Có candidate ảnh: ${{records.filter(r=>Array.isArray(r.candidateImages)&&r.candidateImages.length>0).length}}`);summaryChip(`Đã chọn candidate: ${{records.filter(r=>r.selectedImageCandidate).length}}`);summaryChip(`Manual crop: ${{records.filter(r=>r.manualImageCrop).length}}`);summaryChip(`Ảnh chờ verify: ${{records.filter(r=>r.image&&r.imageVerified!==true).length}}`);
}}
[search,group,state].forEach(el=>el.addEventListener('input',render));document.getElementById('export').addEventListener('click',()=>{{const blob=new Blob([JSON.stringify(review,null,2)+'\n'],{{type:'application/json'}});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='manual-review.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}});render();
</script>
</body></html>"""
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(document, encoding="utf-8")
    print(f"[ok] review workspace: {OUTPUT}")
    print("Review records/images. Export manual-review.json back into data/traffic-signs/raw/. For selected/cropped images run pnpm signs:review:images, rebuild workspace, inspect processed assets, then mark imageVerified=true.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
