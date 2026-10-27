function start(D){
const R=D.R, S=D.S, V=D.V, N=D.N, C=D.C, P=D.P, U=D.U;
// row: [date,site,vendor,name,code,spec,unit,cur,qty,price,usd,recv,pr]
const isSAB=S.map(s=>/SAB/i.test(s));
// ===== 환율 · 기준 통화 =====
// 회사 시스템 환산 환율(연도별) + 2026-10-07 CBI 공식 환율 변경(1,320→1,520) 반영. [시작일, IQD per USD]
const FX=[[20150101,1166],[20160101,1182],[20210101,1458],[20220101,1450],[20230101,1300],[20250101,1320],[20261007,1520]];
const FX_FIX_FROM=20261007; // 이 날짜 이후 IQD 발주는 시스템 환율(1,320) 대신 1,520으로 USD 재환산
const fxAt=d=>{let v=FX[0][1];for(const [s,x] of FX){if(d>=s)v=x;else break}return v};
const n0=R.length, puU=new Float64Array(n0), puI=new Float64Array(n0), amU=new Float64Array(n0), amI=new Float64Array(n0), fxFix=new Uint8Array(n0);
R.forEach((r,i)=>{const q=r[8],fx=fxAt(r[0]);
  if(r[7]){ // IQD 발주: 원 단가 = IQD
    puI[i]=r[9]; amI[i]=r[9]*q;
    if(r[0]>=FX_FIX_FROM){amU[i]=amI[i]/fx;fxFix[i]=1}else amU[i]=r[10];
  }else{ // USD 발주: 원 단가 = USD, IQD는 발주 당시 환율로 환산
    amU[i]=r[10]; amI[i]=r[10]*fx; puI[i]=q>0?amI[i]/q:0;
  }
  puU[i]=q>0?amU[i]/q:0;
});
const BASE_KEY='bp-base';let CUR='IQD';try{const b=localStorage.getItem(BASE_KEY);if(b==='USD'||b==='IQD')CUR=b}catch(_){}
const pu=new Float64Array(n0); // 기준 통화 단가 (R[i][10]은 기준 통화 금액으로 덮어씀)
function setBase(c){CUR=c;const P_=c==='USD'?puU:puI,A_=c==='USD'?amU:amI;for(let i=0;i<n0;i++){pu[i]=P_[i];R[i][10]=A_[i]}}
setBase(CUR);
const isConv=i=>(R[i][7]?'IQD':'USD')!==CUR;
const yr=i=>Math.floor(R[i][0]/10000);
const minY=yr(0), maxY=yr(R.length-1);
const lastDate=R[R.length-1][0];
// searchable text per row (name|spec|code), cached by key
const keyText=new Map(); const rowKey=new Array(R.length);
R.forEach((r,i)=>{const k=r[3]+'|'+r[5]+'|'+r[4]; rowKey[i]=k; if(!keyText.has(k)) keyText.set(k,(N[r[3]]+' '+P[r[5]]+' '+C[r[4]]).toLowerCase());});
const nameKey=N.map(n=>n.toLowerCase().replace(/\s+/g,' ').trim());

const $=s=>document.querySelector(s);
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const fmtD=d=>{d=String(d);return d.slice(0,4)+'-'+d.slice(4,6)+'-'+d.slice(6)};
const f=(x,dg)=>{if(x==null||!isFinite(x))return '–';const a=Math.abs(x);if(dg==null)dg=a>=1000?0:a>=10?2:a>=1?2:3;return x.toLocaleString('en-US',{minimumFractionDigits:0,maximumFractionDigits:dg})};
const fUSD=x=>f(x,Math.abs(x)>=100?0:2);
const med=a=>{if(!a.length)return NaN;const s=[...a].sort((x,y)=>x-y),m=s.length>>1;return s.length%2?s[m]:(s[m-1]+s[m])/2};
$('#meta').textContent=`${minY}–${maxY} · ${R.length.toLocaleString()}건 · 최종 ${fmtD(lastDate)}`;

/* ---------- routing ---------- */
const views=['search','vendors','quote','recurring','spend','report'];
function route(){let v=location.hash.slice(1);if(!views.includes(v))v='search';
  views.forEach(x=>{$('#v-'+x).hidden=x!==v});
  document.querySelectorAll('nav.tabs a').forEach(a=>a.setAttribute('aria-current',a.dataset.v===v?'page':'false'));
  if(v==='vendors'&&!vInit){vInit=true;renderVendors()}
  if(v==='report'&&!rInit){rInit=true;renderReport()}
  if(v==='recurring'&&!rcInit){rcInit=true;renderRecurring()}
  if(v==='spend'&&!spInit){spInit=true;initSpend()}
}
window.addEventListener('hashchange',route);

/* ---------- shared: price chart ---------- */
function chart(idx,refMed){
  if(!idx.length)return '';
  const W=640,H=200,L=52,Rp=12,T=16,B=24;
  const ys=idx.map(i=>pu[i]).filter(v=>v>0); if(!ys.length)return '';
  let y0=0,y1=Math.max(...ys)*1.08; if(y1<=0)y1=1;
  const t0=Date.UTC(minY,0,1),t1=Date.UTC(maxY+1,0,1);
  const X=d=>{d=String(d);const t=Date.UTC(+d.slice(0,4),+d.slice(4,6)-1,+d.slice(6));return L+(t-t0)/(t1-t0)*(W-L-Rp)};
  const Y=v=>T+(1-(v-y0)/(y1-y0))*(H-T-B);
  const step=niceStep(y1/4); let g='';
  for(let v=0;v<=y1+1e-9;v+=step){const y=Y(v);g+=`<line class="grid" x1="${L}" x2="${W-Rp}" y1="${y}" y2="${y}"/><text x="${L-6}" y="${y+3}" text-anchor="end">${f(v,step<1?2:0)}</text>`}
  for(let yy=minY;yy<=maxY;yy++){const x=X(yy*10000+101);g+=`<line class="grid" x1="${x}" x2="${x}" y1="${T}" y2="${H-B}"/>`;if((yy-minY)%(W<500?2:1)===0)g+=`<text x="${x+2}" y="${H-8}">${String(yy).slice(2)}</text>`}
  let m=''; if(isFinite(refMed)&&refMed>0){const y=Y(refMed);m=`<line class="med" x1="${L}" x2="${W-Rp}" y1="${y}" y2="${y}"/>`}
  let fxl='';FX.slice(1).forEach(([d,x],k)=>{const prev=FX[k][1];if(d<minY*10000||d>maxY*10000+1231)return;const xx=X(d);fxl+=`<line class="fxl" x1="${xx}" x2="${xx}" y1="${T}" y2="${H-B}"><title>${fmtD(d)} 환율 ${f(prev,0)}→${f(x,0)}</title></line><text class="fxt" x="${xx>W-Rp-30?xx-2:xx+2}" y="${T-4}" text-anchor="${xx>W-Rp-30?'end':'start'}">${f(x,0)}</text>`});
  let pts=''; idx.forEach(i=>{if(pu[i]<=0)return;const r=R[i];pts+=`<circle class="pt${isSAB[r[1]]?' sab':''}${isConv(i)?' cv':''}" cx="${X(r[0]).toFixed(1)}" cy="${Y(pu[i]).toFixed(1)}" r="3.6"><title>${fmtD(r[0])} · ${esc(V[r[2]])} · ${fUSD(pu[i])} ${CUR}${isConv(i)?' (환산)':''}</title></circle>`});
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="단가 추이">${g}<line class="axis" x1="${L}" x2="${W-Rp}" y1="${H-B}" y2="${H-B}"/>${fxl}${m}${pts}</svg>
  <div class="legend"><span><i style="background:var(--accent)"></i>SAB 외 현장</span><span><i style="background:var(--sab)"></i>SAB Airfield</span><span><i style="background:transparent;border:1.5px solid var(--accent)"></i>빈 점: ${CUR==='IQD'?'USD':'IQD'} 발주를 당시 환율로 환산</span><span>점선: 중앙단가 · 세로선: 환율 변경</span><span>단위: ${CUR} / 발주단위</span></div>`;
}
function niceStep(x){const p=Math.pow(10,Math.floor(Math.log10(x||1)));const n=x/p;return (n<=1?1:n<=2?2:n<=5?5:10)*p}

/* ---------- shared: line table ---------- */
// flag: same code+unit+year, price >= 2x median of that year group
const yrMedKey=new Map();
function yearMedian(i){const r=R[i];const k=r[4]+'|'+r[6]+'|'+yr(i);if(yrMedKey.has(k))return yrMedKey.get(k);return NaN}
function buildYrMed(){yrMedKey.clear();const tmp=new Map();R.forEach((r,i)=>{if(pu[i]<=0)return;const k=r[4]+'|'+r[6]+'|'+yr(i);(tmp.get(k)||tmp.set(k,[]).get(k)).push(pu[i])});tmp.forEach((a,k)=>{if(a.length>=3)yrMedKey.set(k,med(a))})}
buildYrMed();

function lineTable(idx,opts={}){
  const lim=opts.limit||200; const rows=idx.slice(0,lim);
  let h=`<div class="tbl-wrap"><table><thead><tr><th>발주일</th><th>현장</th><th>거래처</th><th>자재코드</th><th>품명 / 규격</th><th>단위</th><th class="r">발주수량</th><th class="r">발주단가 (원통화)</th><th class="r">${CUR} 단가</th><th class="r">입고</th><th>PR</th></tr></thead><tbody>`;
  rows.forEach(i=>{const r=R[i];const ym=yearMedian(i);const hi=isFinite(ym)&&pu[i]>=2*ym;
    const rc=r[11]<r[8]?`<span class="chip warn" title="입고수량이 발주수량보다 적음">${f(r[11])}</span>`:f(r[11]);
    h+=`<tr><td class="num">${fmtD(r[0])}</td><td>${esc(S[r[1]])}${isSAB[r[1]]?' <span class="chip sab">SAB</span>':''}</td><td>${esc(V[r[2]])}</td><td class="mono">${esc(C[r[4]])}</td><td class="wrap-cell">${esc(N[r[3]])}<br><span class="hint">${esc(P[r[5]])}</span></td><td>${esc(U[r[6]])}</td><td class="r num">${f(r[8])}</td><td class="r num">${f(r[9])} <span class="chip iqd">${r[7]?'IQD':'USD'}</span></td><td class="r num">${fUSD(pu[i])}${isConv(i)?' <span class="chip none" title="발주 당시 환율 '+f(fxAt(r[0]),0)+'로 환산">환산</span>':''}${fxFix[i]&&CUR==='USD'?' <span class="chip warn" title="회사 시스템은 1,320으로 환산. BP는 2026-10-07 이후 1,520 적용">1,520</span>':''}${hi?` <span class="chip chk" title="같은 해 같은 코드 중앙단가(${fUSD(ym)})의 2배 이상">확인</span>`:''}</td><td class="r num">${rc}</td><td class="mono hint">${esc(r[12])}</td></tr>`});
  h+='</tbody></table></div>';
  if(idx.length>lim)h+=`<div class="more"><button class="ghost" type="button" data-more="${lim+300}">${(idx.length-lim).toLocaleString()}건 더 보기</button></div>`;
  return h;
}

/* ---------- 기준 통화 전환 ---------- */
function updMeta(){$('#meta').textContent=`${minY}–${maxY} · ${R.length.toLocaleString()}건 · 최종 ${fmtD(lastDate)}`;$('#base').value=CUR}
$('#base').addEventListener('change',()=>{setBase($('#base').value);try{localStorage.setItem(BASE_KEY,CUR)}catch(_){}
  buildYrMed();vStats=null;vSel=null;vInit=false;rcInit=false;spInit=false;
  const keepSel=sSel,keepCode=sCode;runSearch();if(sGroups[keepSel]){selectGroup(keepSel);if(keepCode!=null){sCode=keepCode;renderDetail()}}
  runQuote();route();});
/* ---------- 통합 검색 ---------- */
const y1=$('#y1'),y2=$('#y2');
for(let y=minY;y<=maxY;y++){y1.add(new Option(y,y));y2.add(new Option(y,y))}
y1.value=minY;y2.value=maxY;
let sGroups=[],sSel=null,sCode=null,sLimit=200;
function filterRow(i,sg,cur,a,b){const r=R[i];const y=yr(i);if(y<a||y>b)return false;if(sg==='bncp'&&isSAB[r[1]])return false;if(sg==='sab'&&!isSAB[r[1]])return false;if(cur!=='all'&&String(r[7])!==cur)return false;return true}
function runSearch(){
  const toks=$('#q').value.toLowerCase().split(/\s+/).filter(Boolean);
  const a=+y1.value,b=+y2.value,sg=$('#sg').value,cur=$('#cur').value;
  const okKey=new Map();const g=new Map();
  if(toks.length){
    for(let i=0;i<R.length;i++){
      const k=rowKey[i];let ok=okKey.get(k);if(ok===undefined){const t=keyText.get(k);ok=toks.every(x=>t.includes(x));okKey.set(k,ok)}
      if(!ok||!filterRow(i,sg,cur,a,b))continue;
      const nk=nameKey[R[i][3]];let e=g.get(nk);if(!e){e={name:N[R[i][3]],idx:[],codes:new Set(),vend:new Set()};g.set(nk,e)}
      e.idx.push(i);e.codes.add(R[i][4]);e.vend.add(R[i][2]);
    }
  }
  sGroups=[...g.values()].sort((x,y)=>y.idx.length-x.idx.length);
  const tot=sGroups.reduce((s,e)=>s+e.idx.length,0);
  $('#gcount').textContent=toks.length?`${sGroups.length}개 품명 · ${tot.toLocaleString()}건`:'';
  const ul=$('#glist');
  if(!toks.length){ul.innerHTML='<li class="empty" style="display:block;cursor:default">검색어를 입력하세요.</li>';$('#detail').innerHTML='<div class="pb"><div class="empty">검색어를 입력하세요.</div></div>';return}
  if(!sGroups.length){ul.innerHTML='<li class="empty" style="display:block;cursor:default">결과가 없습니다. 철자나 조건을 바꿔 보세요.</li>';$('#detail').innerHTML='<div class="pb"><div class="empty">결과 없음</div></div>';return}
  ul.innerHTML=sGroups.slice(0,400).map((e,k)=>{const last=e.idx[e.idx.length-1];return `<li role="option" tabindex="0" data-k="${k}"><span class="gn">${esc(e.name)}</span><span class="gp num">${fUSD(pu[last])}</span><span class="gm">${e.idx.length}건 · 코드 ${e.codes.size} · 업체 ${e.vend.size} · 최근 ${fmtD(R[last][0])}</span></li>`}).join('');
  selectGroup(0);
}
function selectGroup(k){
  sSel=k;sCode=null;sLimit=200;
  document.querySelectorAll('#glist li').forEach(li=>li.setAttribute('aria-selected',String(+li.dataset.k===k)));
  renderDetail();
}
function renderDetail(){
  const e=sGroups[sSel];if(!e)return;
  // by code+spec+unit
  const m=new Map();e.idx.forEach(i=>{const r=R[i];const k=r[4]+'|'+r[5]+'|'+r[6];let x=m.get(k);if(!x){x={code:r[4],spec:r[5],unit:r[6],idx:[]};m.set(k,x)}x.idx.push(i)});
  const subs=[...m.values()].sort((a,b)=>b.idx.length-a.idx.length);
  const show=sCode==null?e.idx:subs[sCode].idx;
  const prices=show.map(i=>pu[i]).filter(v=>v>0);const md=med(prices);
  const last=show[show.length-1];
  const vend=new Map();show.forEach(i=>{const v=R[i][2];const x=vend.get(v)||{n:0,usd:0,p:[],last:0};x.n++;x.usd+=R[i][10];if(pu[i]>0)x.p.push(pu[i]);x.last=Math.max(x.last,R[i][0]);vend.set(v,x)});
  const vrows=[...vend.entries()].sort((a,b)=>b[1].n-a[1].n);
  const ord=[...show].reverse();
  let h=`<div class="ph"><h3>${esc(e.name)}</h3><span class="hint">${sCode==null?'전체 규격':esc(C[subs[sCode].code])+' · '+esc(P[subs[sCode].spec])+' · '+esc(U[subs[sCode].unit])}</span></div><div class="pb" style="display:flex;flex-direction:column;gap:14px">`;
  if(sCode==null&&subs.length>1)h+=`<div class="note"><b>규격·단위가 ${subs.length}가지</b> 섞여 있습니다. 단가는 아래 표에서 규격을 하나 골라서 비교하세요.</div>`;
  h+=`<div class="stats">
    <div class="stat"><div class="k">발주 건수</div><div class="v">${show.length.toLocaleString()}</div><div class="s">${fmtD(R[show[0]][0]).slice(0,7)} ~ ${fmtD(R[last][0]).slice(0,7)}</div></div>
    <div class="stat"><div class="k">최근 단가</div><div class="v">${fUSD(pu[last])}</div><div class="s">${fmtD(R[last][0])} · ${esc(V[R[last][2]]).slice(0,22)}</div></div>
    <div class="stat"><div class="k">중앙 단가</div><div class="v">${fUSD(md)}</div><div class="s">${CUR} 기준</div></div>
    <div class="stat"><div class="k">최저 / 최고</div><div class="v">${fUSD(Math.min(...prices))} / ${fUSD(Math.max(...prices))}</div><div class="s">${CUR} 기준</div></div>
    <div class="stat"><div class="k">총 발주액</div><div class="v">${fUSD(show.reduce((s,i)=>s+R[i][10],0))}</div><div class="s">${CUR} 기준</div></div>
  </div>`;
  h+=chart(show,md);
  h+=`<div><div class="row" style="justify-content:space-between;margin-bottom:6px"><b>규격별</b>${sCode!=null?'<button class="ghost" type="button" id="allspec">전체 규격 보기</button>':''}</div><div class="tbl-wrap"><table><thead><tr><th>자재코드</th><th>규격</th><th>단위</th><th class="r">건수</th><th class="r">최저</th><th class="r">중앙</th><th class="r">최고</th><th class="r">최근</th><th>최근 발주</th></tr></thead><tbody>`;
  subs.forEach((s,k)=>{const p=s.idx.map(i=>pu[i]).filter(v=>v>0);const l=s.idx[s.idx.length-1];h+=`<tr class="click${sCode===k?' sel':''}" data-sub="${k}" tabindex="0"><td class="mono">${esc(C[s.code])}</td><td class="wrap-cell">${esc(P[s.spec])}</td><td>${esc(U[s.unit])}</td><td class="r num">${s.idx.length}</td><td class="r num">${fUSD(Math.min(...p))}</td><td class="r num">${fUSD(med(p))}</td><td class="r num">${fUSD(Math.max(...p))}</td><td class="r num">${fUSD(pu[l])}</td><td class="num">${fmtD(R[l][0])}</td></tr>`});
  h+=`</tbody></table></div></div>`;
  h+=`<div><b style="display:block;margin-bottom:6px">거래처별</b><div class="tbl-wrap"><table><thead><tr><th>거래처</th><th class="r">건수</th><th class="r">중앙 단가</th><th class="r">발주액 (${CUR})</th><th>최근 거래</th></tr></thead><tbody>`;
  vrows.forEach(([v,x])=>{h+=`<tr><td>${esc(V[v])}</td><td class="r num">${x.n}</td><td class="r num">${fUSD(med(x.p))}</td><td class="r num">${fUSD(x.usd)}</td><td class="num">${fmtD(x.last)}</td></tr>`});
  h+=`</tbody></table></div></div>`;
  h+=`<div><b style="display:block;margin-bottom:6px">발주 내역 <span class="hint">최신순</span></b>${lineTable(ord,{limit:sLimit})}</div></div>`;
  const el=$('#detail');el.innerHTML=h;
  el.querySelectorAll('tr[data-sub]').forEach(tr=>{const go=()=>{sCode=+tr.dataset.sub;sLimit=200;renderDetail()};tr.onclick=go;tr.onkeydown=ev=>{if(ev.key==='Enter')go()}});
  const ab=el.querySelector('#allspec');if(ab)ab.onclick=()=>{sCode=null;renderDetail()};
  const mb=el.querySelector('[data-more]');if(mb)mb.onclick=()=>{sLimit=+mb.dataset.more;renderDetail()};
}
$('#glist').addEventListener('click',ev=>{const li=ev.target.closest('li[data-k]');if(li)selectGroup(+li.dataset.k)});
$('#glist').addEventListener('keydown',ev=>{const li=ev.target.closest('li[data-k]');if(li&&ev.key==='Enter')selectGroup(+li.dataset.k)});
let st;$('#q').addEventListener('input',()=>{clearTimeout(st);st=setTimeout(runSearch,220)});
['#y1','#y2','#sg','#cur'].forEach(s=>$(s).addEventListener('change',runSearch));

/* ---------- 거래처 ---------- */
let vInit=false,vStats=null,vSel=null,vLimit=200;
let vTot=1;
function buildV(){vTot=R.reduce((s,r)=>s+r[10],0)||1;vStats=V.map((name,id)=>({id,name,n:0,usd:0,first:99999999,last:0,idx:[],codes:new Set(),years:{}}));
  R.forEach((r,i)=>{const s=vStats[r[2]];s.n++;s.usd+=r[10];s.first=Math.min(s.first,r[0]);s.last=Math.max(s.last,r[0]);s.idx.push(i);s.codes.add(r[4]);const y=yr(i);s.years[y]=(s.years[y]||0)+r[10]})}
function renderVendors(){
  if(!vStats)buildV();
  const q=$('#vq').value.toLowerCase().trim();const so=$('#vsort').value;
  let L=vStats.filter(s=>!q||s.name.toLowerCase().includes(q));
  L.sort((a,b)=>so==='n'?b.n-a.n:so==='last'?b.last-a.last:b.usd-a.usd);
  $('#vcount').textContent=`${L.length}개사`;
  $('#vlist').innerHTML=L.map(s=>`<li role="option" tabindex="0" data-v="${s.id}" aria-selected="${s.id===vSel}"><span class="gn">${esc(s.name)}</span><span class="gp num">${fUSD(s.usd)}</span><span class="gm">${s.n.toLocaleString()}건 · 품목 ${s.codes.size} · ${String(s.first).slice(0,4)}–${String(s.last).slice(0,4)} · 전체의 ${f(s.usd/vTot*100,1)}%</span></li>`).join('')||'<li class="empty" style="display:block">해당 업체가 없습니다.</li>';
  if(vSel==null&&L.length)selectVendor(L[0].id);
}
function selectVendor(id){vSel=id;vLimit=200;document.querySelectorAll('#vlist li').forEach(li=>li.setAttribute('aria-selected',String(+li.dataset.v===id)));renderVDetail()}
function renderVDetail(){
  const s=vStats[vSel];const mx=Math.max(...Object.values(s.years),1);
  const items=new Map();s.idx.forEach(i=>{const r=R[i];const k=r[4]+'|'+r[6];let x=items.get(k);if(!x){x={i0:i,n:0,usd:0,p:[],last:0};items.set(k,x)}x.n++;x.usd+=r[10];if(pu[i]>0)x.p.push(pu[i]);x.last=r[0]});
  const top=[...items.values()].sort((a,b)=>b.usd-a.usd).slice(0,40);
  const sites=new Map();s.idx.forEach(i=>{const k=R[i][1];sites.set(k,(sites.get(k)||0)+R[i][10])});
  const ts=[...sites.entries()].sort((a,b)=>b[1]-a[1]).slice(0,6);
  let h=`<div class="ph"><h3>${esc(s.name)}</h3><span class="hint">${fmtD(s.first)} ~ ${fmtD(s.last)}</span></div><div class="pb" style="display:flex;flex-direction:column;gap:14px">
  <div class="stats"><div class="stat"><div class="k">발주 라인</div><div class="v">${s.n.toLocaleString()}</div></div><div class="stat"><div class="k">품목(코드)</div><div class="v">${s.codes.size}</div></div><div class="stat"><div class="k">총 발주액</div><div class="v">${fUSD(s.usd)}</div><div class="s">${CUR} 기준</div></div><div class="stat"><div class="k">주요 현장</div><div class="v" style="font-size:13px;font-family:var(--font-body)">${esc(S[ts[0][0]])}</div><div class="s">${ts.length>1?'외 '+(sites.size-1)+'곳':''}</div></div></div>
  <div><b style="display:block;margin-bottom:6px">연도별 발주액 (${CUR})</b><div class="ybars">`;
  for(let y=minY;y<=maxY;y++){const v=s.years[y]||0;h+=`<div title="${y}: ${fUSD(v)} ${CUR}"><span class="b" style="height:${v?Math.max(2,v/mx*70):0}px"></span><span class="l">${String(y).slice(2)}</span></div>`}
  h+=`</div></div><div><b style="display:block;margin-bottom:6px">주요 품목 <span class="hint">발주액 상위 40 · 행을 누르면 통합 검색으로 이동</span></b><div class="tbl-wrap"><table><thead><tr><th>자재코드</th><th>품명 / 규격</th><th>단위</th><th class="r">건수</th><th class="r">중앙 단가</th><th class="r">발주액</th><th>최근</th></tr></thead><tbody>`;
  top.forEach(x=>{const r=R[x.i0];h+=`<tr class="click" tabindex="0" data-code="${esc(C[r[4]])}"><td class="mono">${esc(C[r[4]])}</td><td class="wrap-cell">${esc(N[r[3]])}<br><span class="hint">${esc(P[r[5]])}</span></td><td>${esc(U[r[6]])}</td><td class="r num">${x.n}</td><td class="r num">${fUSD(med(x.p))}</td><td class="r num">${fUSD(x.usd)}</td><td class="num">${fmtD(x.last)}</td></tr>`});
  h+=`</tbody></table></div></div><div><b style="display:block;margin-bottom:6px">발주 내역 <span class="hint">최신순</span></b>${lineTable([...s.idx].reverse(),{limit:vLimit})}</div></div>`;
  const el=$('#vdetail');el.innerHTML=h;
  el.querySelectorAll('tr[data-code]').forEach(tr=>{const go=()=>{$('#q').value=tr.dataset.code;location.hash='search';runSearch()};tr.onclick=go;tr.onkeydown=ev=>{if(ev.key==='Enter')go()}});
  const mb=el.querySelector('[data-more]');if(mb)mb.onclick=()=>{vLimit=+mb.dataset.more;renderVDetail()};
}
$('#vlist').addEventListener('click',ev=>{const li=ev.target.closest('li[data-v]');if(li)selectVendor(+li.dataset.v)});
$('#vlist').addEventListener('keydown',ev=>{const li=ev.target.closest('li[data-v]');if(li&&ev.key==='Enter')selectVendor(+li.dataset.v)});
$('#vq').addEventListener('input',()=>{vSel=null;renderVendors()});
$('#vsort').addEventListener('change',renderVendors);

/* ---------- 견적 체크 ---------- */
const codeIdx=new Map();C.forEach((c,i)=>codeIdx.set(c.toLowerCase(),i));
$('#qt').value=['9010030010\t30000\tIQD\tEA','Safety Shoes\t25000\tIQD\tEA','Fluorescent Lamp 36W\t5500\tIQD\tEA','PP Rope 8mm\t36000\tIQD\tROLL','Cable Tie 300mm\t2.5\tUSD\tBAG'].join('\n');
function runQuote(){
  const yv=$('#qyrs').value,sg=$('#qsg').value,fx=+$('#qfx').value||1520,cmp=$('#qcmp').value;
  const yrs=yv==='new'?0:+yv;
  const cutoff=yv==='new'?FX_FIX_FROM:(Math.floor(lastDate/10000)-yrs)*10000+lastDate%10000;
  const lines=$('#qt').value.split(/\n/).map(l=>l.trim()).filter(Boolean);
  let h=`<div class="tbl-wrap"><table><thead><tr><th>견적 품목</th><th class="r">견적 단가 (${CUR})</th><th>매칭</th><th class="r">이력 건수</th><th class="r">최저</th><th class="r">중앙</th><th class="r">최고</th><th class="r">최근</th><th class="r">중앙 대비</th><th>위치</th></tr></thead><tbody>`;
  lines.forEach(l=>{
    let parts=l.split('\t');if(parts.length<2){const m=l.match(/^(.*?)[\s,]+([\d.,]+)\s*(usd|iqd)?\s*(\S+)?$/i);parts=m?[m[1],m[2],m[3]||'',m[4]||'']:[l]}
    const item=(parts[0]||'').trim(),price=parseFloat(String(parts[1]||'').replace(/,/g,'')),cur=(parts[2]||'USD').trim().toUpperCase(),unit=(parts[3]||'').trim().toUpperCase();
    const qUsd=cur===CUR?price:(cur==='IQD'?price/fx:price*fx);
    const qc=cur==='IQD'?1:0;
    let match='',idx=[];const ci=codeIdx.get(item.toLowerCase());
    const pick=fn=>{const out=[];for(let i=0;i<R.length;i++){const r=R[i];if(!fn(r,i))continue;if(sg==='bncp'&&isSAB[r[1]])continue;if(sg==='sab'&&!isSAB[r[1]])continue;if(unit&&U[r[6]]!==unit)continue;if(cmp==='same'&&r[7]!==qc)continue;out.push(i)}return out};
    if(ci!=null){idx=pick(r=>r[4]===ci);match=`코드 ${esc(C[ci])}`}
    else{const toks=item.toLowerCase().split(/\s+/).filter(Boolean);idx=pick((r,i)=>toks.every(t=>keyText.get(rowKey[i]).includes(t)));
      const cc=new Set(idx.map(i=>R[i][4]));match=`품명 검색 · 코드 ${cc.size}개`+(cc.size>1?' <span class="chip warn">규격 혼재</span>':'')}
    let recent=idx.filter(i=>R[i][0]>=cutoff),scope=(yv==='new'?'2026-10-07 이후':yrs>=99?'전체':`최근 ${yrs}년`)+(cmp==='same'?` · ${cur} 발주만`:' · 환산 포함');
    if(!recent.length&&idx.length){recent=idx;scope='전체 (기간 내 없음)'}
    const p=recent.map(i=>pu[i]).filter(v=>v>0);
    if(!p.length||!isFinite(qUsd)){h+=`<tr><td class="wrap-cell">${esc(item)}</td><td class="r num">${isFinite(qUsd)?fUSD(qUsd):'–'}</td><td>${match}</td><td colspan="7"><span class="chip none">${isFinite(qUsd)?'이력 없음':'단가를 읽지 못함'}</span></td></tr>`;return}
    const mn=Math.min(...p),mx=Math.max(...p),md=med(p),last=recent[recent.length-1],rel=(qUsd/md-1)*100;
    const pos=qUsd<mn?['ok','이력 최저 미만']:qUsd<=md?['ok','중앙 이하']:qUsd<=mx?['warn','중앙~최고 사이']:['bad','이력 최고 초과'];
    h+=`<tr><td class="wrap-cell"><b>${esc(item)}</b>${unit?' <span class="hint">'+esc(unit)+'</span>':''}<br><span class="hint">${cur!==CUR?f(price)+' '+cur+' → 환율 '+f(fx,0):''}</span></td><td class="r num">${fUSD(qUsd)}</td><td class="wrap-cell">${match}<br><span class="hint">${scope}</span></td><td class="r num">${p.length}</td><td class="r num">${fUSD(mn)}</td><td class="r num">${fUSD(md)}</td><td class="r num">${fUSD(mx)}</td><td class="r num" title="${esc(V[R[last][2]])}">${fUSD(pu[last])}<br><span class="hint">${fmtD(R[last][0])}</span></td><td class="r num">${rel>0?'+':''}${f(rel,0)}%</td><td><span class="chip ${pos[0]}">${pos[1]}</span></td></tr>`;
  });
  h+=`</tbody></table></div><p class="hint" style="margin:10px 0 0">${CUR} 기준으로 비교합니다. 과거 발주는 발주 당시 환율로 환산되어 있고(현재 환율로 재환산하지 않음), 견적 통화가 기준 통화와 다르면 입력한 환율로 바꿉니다. "같은 통화 발주만"을 고르면 견적과 같은 통화로 산 이력하고만 비교합니다. 품명으로 찾으면 다른 규격이 섞일 수 있으니, 정확히 보려면 자재코드를 넣으세요.</p>`;
  $('#qout').innerHTML=h;
}
$('#qrun').onclick=runQuote;['#qyrs','#qsg','#qcmp'].forEach(s=>$(s).addEventListener('change',runQuote));

/* ---------- 고가 구매 리포트 ---------- */
let rInit=false,rRes=null,rSel=null;
const rc=$('#rcut');for(let y=minY;y<maxY-1;y++)rc.add(new Option(y+'년',y));rc.value=2016;
const GEN=/order product article|^sample$|^general$|^-$|^$/i;
function renderReport(){
  const cut=+rc.value,mul=+$('#rmul').value,minN=+$('#rmin').value,ex=$('#rex').value==='1';
  const later=new Map();R.forEach((r,i)=>{if(yr(i)<=cut||puU[i]<=0)return;const k=r[4]+'|'+r[6];(later.get(k)||later.set(k,[]).get(k)).push(puU[i])});
  const lm=new Map();later.forEach((a,k)=>{if(a.length>=minN)lm.set(k,med(a))});
  const early=new Map();R.forEach((r,i)=>{if(yr(i)>cut||puU[i]<=0)return;if(ex&&GEN.test(P[r[5]].trim()))return;const k=r[4]+'|'+r[6];if(!lm.has(k))return;(early.get(k)||early.set(k,[]).get(k)).push(i)});
  const vend=new Map();let totPaid=0,totEx=0,nCodes=0;
  early.forEach((idx,k)=>{const em=med(idx.map(i=>puU[i]));const L=lm.get(k);if(em<mul*L)return;nCodes++;
    idx.forEach(i=>{const r=R[i];const exc=Math.max(0,puU[i]-L)*r[8];let v=vend.get(r[2]);if(!v){v={id:r[2],lines:0,codes:new Map(),paid:0,ex:0};vend.set(r[2],v)}
      v.lines++;v.paid+=amU[i];v.ex+=exc;totPaid+=amU[i];totEx+=exc;
      let c=v.codes.get(k);if(!c){c={i0:i,later:L,nl:later.get(k).length,q:0,paid:0,ex:0,p:[],idx:[]};v.codes.set(k,c)}c.q+=r[8];c.paid+=amU[i];c.ex+=exc;c.p.push(puU[i]);c.idx.push(i)})});
  rRes=[...vend.values()].sort((a,b)=>b.ex-a.ex);
  $('#rsum').textContent=`${nCodes}개 품목 · 초과 ${fUSD(totEx)} USD · USD 기준`;
  $('#rlist').innerHTML=rRes.map(v=>`<li role="option" tabindex="0" data-r="${v.id}" aria-selected="${v.id===rSel}"><span class="gn">${esc(V[v.id])}</span><span class="gp num">${fUSD(v.ex)}</span><span class="gm">${v.codes.size}개 품목 · ${v.lines}건 · 지급 ${fUSD(v.paid)} · 비중 ${f(v.ex/totEx*100,1)}%</span></li>`).join('')||'<li class="empty" style="display:block">조건에 맞는 품목이 없습니다.</li>';
  const keep=rRes.find(v=>v.id===rSel);selectR(keep?keep.id:(rRes[0]&&rRes[0].id));
}
function selectR(id){rSel=id;document.querySelectorAll('#rlist li').forEach(li=>li.setAttribute('aria-selected',String(+li.dataset.r===id)));
  const v=rRes&&rRes.find(x=>x.id===id);const el=$('#rdetail');if(!v){el.innerHTML='<div class="pb"><div class="empty">조건에 맞는 품목이 없습니다.</div></div>';return}
  const items=[...v.codes.values()].sort((a,b)=>b.ex-a.ex);
  let h=`<div class="ph"><h3>${esc(V[id])}</h3><span class="hint">~${rc.value}년 구매분</span></div><div class="pb" style="display:flex;flex-direction:column;gap:14px">
  <div class="stats"><div class="stat"><div class="k">대상 품목</div><div class="v">${v.codes.size}</div></div><div class="stat"><div class="k">발주 라인</div><div class="v">${v.lines}</div></div><div class="stat"><div class="k">지급액 (USD)</div><div class="v">${fUSD(v.paid)}</div></div><div class="stat"><div class="k">초과 추정 (USD)</div><div class="v" style="color:var(--bad)">${fUSD(v.ex)}</div></div></div>
  <div class="tbl-wrap"><table><thead><tr><th>자재코드</th><th>품명 / 규격</th><th>단위</th><th class="r">수량</th><th class="r">당시 단가</th><th class="r">이후 중앙</th><th class="r">배수</th><th class="r">이후 건수</th><th class="r">초과 추정</th></tr></thead><tbody>`;
  items.forEach(c=>{const r=R[c.i0];const em=med(c.p);h+=`<tr class="click" tabindex="0" data-code="${esc(C[r[4]])}"><td class="mono">${esc(C[r[4]])}</td><td class="wrap-cell">${esc(N[r[3]])}<br><span class="hint">${esc(P[r[5]])}</span></td><td>${esc(U[r[6]])}</td><td class="r num">${f(c.q)}</td><td class="r num">${fUSD(em)}</td><td class="r num">${fUSD(c.later)}</td><td class="r num">${f(em/c.later,1)}×</td><td class="r num">${c.nl}</td><td class="r num">${fUSD(c.ex)}</td></tr>`});
  h+=`</tbody></table></div><p class="hint" style="margin:0">행을 누르면 통합 검색에서 그 코드의 전체 이력과 단가 추이를 봅니다. 배수가 지나치게 크면(예: 10배 이상) 규격 혼용이나 단위 오입력일 수 있으니 이력에서 확인하세요.</p></div>`;
  el.innerHTML=h;
  el.querySelectorAll('tr[data-code]').forEach(tr=>{const go=()=>{$('#q').value=tr.dataset.code;y1.value=minY;y2.value=maxY;$('#sg').value='all';$('#cur').value='all';location.hash='search';runSearch()};tr.onclick=go;tr.onkeydown=ev=>{if(ev.key==='Enter')go()}});
}
$('#rlist').addEventListener('click',ev=>{const li=ev.target.closest('li[data-r]');if(li)selectR(+li.dataset.r)});
$('#rlist').addEventListener('keydown',ev=>{const li=ev.target.closest('li[data-r]');if(li&&ev.key==='Enter')selectR(+li.dataset.r)});
['#rcut','#rmul','#rmin','#rex'].forEach(s=>$(s).addEventListener('change',renderReport));

/* ---------- 반복 구매 · 소요 예측 ---------- */
let rcInit=false,rcLimit=200;
const dnum=d=>{d=String(d);return Date.UTC(+d.slice(0,4),+d.slice(4,6)-1,+d.slice(6))/864e5};
const lastDay=dnum(lastDate);
const yearsAll=[];for(let y=minY;y<=maxY;y++)yearsAll.push(y);
function renderRecurring(){
  const toks=$('#rq').value.toLowerCase().split(/\s+/).filter(Boolean);
  const minYrs=+$('#rcy').value,sg=$('#rsg').value,rec=$('#rrec').value,so=$('#rso').value;
  const m=new Map();
  for(let i=0;i<R.length;i++){
    const r=R[i];if(sg==='bncp'&&isSAB[r[1]])continue;if(sg==='sab'&&!isSAB[r[1]])continue;
    if(toks.length){const t=keyText.get(rowKey[i]);if(!toks.every(x=>t.includes(x)))continue}
    const k=r[4]+'|'+r[6];let x=m.get(k);
    if(!x){x={i0:i,yq:{},yrs:new Set(),n:0,q12:0,q24:0,o12:0,usd12:0,last:-1,days:[],p3:[]};m.set(k,x)}
    const y=yr(i),age=lastDay-dnum(r[0]);
    x.yq[y]=(x.yq[y]||0)+r[8];x.yrs.add(y);x.n++;x.last=i;
    if(age<365){x.q12+=r[8];x.o12++;x.usd12+=r[10]}
    if(age<730)x.q24+=r[8];
    if(age<1095){x.days.push(dnum(r[0]));if(pu[i]>0)x.p3.push(pu[i])}
  }
  let L=[];
  m.forEach(x=>{
    if(x.yrs.size<minYrs)return;
    const age=lastDay-dnum(R[x.last][0]);
    if(rec!=='any'&&age>=(+rec)*30.5)return;
    const ds=[...new Set(x.days)].sort((a,b)=>a-b);let gap=NaN;
    if(ds.length>=2)gap=(ds[ds.length-1]-ds[0])/(ds.length-1);
    x.gap=gap;x.lp=pu[x.last];x.est=x.q12*x.lp;
    x.consec=[2024,2025,2026].every(y=>x.yrs.has(y));
    L.push(x);
  });
  L.sort((a,b)=>so==='yrs'?(b.yrs.size-a.yrs.size)||(b.est-a.est):so==='ord'?(b.o12-a.o12)||(b.est-a.est):(b.est-a.est));
  const totEst=L.reduce((s,x)=>s+x.est,0),consec=L.filter(x=>x.consec).length;
  $('#rcstats').innerHTML=`<div class="stat"><div class="k">대상 품목</div><div class="v">${L.length.toLocaleString()}</div><div class="s">${minYrs}개 연도 이상 구매</div></div>
   <div class="stat"><div class="k">2024–26 연속 구매</div><div class="v">${consec.toLocaleString()}</div><div class="s">단가계약 우선 후보</div></div>
   <div class="stat"><div class="k">최근 12개월 발주액</div><div class="v">${fUSD(L.reduce((s,x)=>s+x.usd12,0))}</div><div class="s">${CUR} · 대상 품목 합계</div></div>
   <div class="stat"><div class="k">연간 예상 금액</div><div class="v">${fUSD(totEst)}</div><div class="s">최근 12개월 수량 × 최근 단가</div></div>`;
  $('#rccount').textContent=`${fmtD(lastDate)} 기준 최근 12개월`;
  const show=L.slice(0,rcLimit);
  let h=`<div class="tbl-wrap"><table><thead><tr><th>자재코드</th><th>품명 / 규격</th><th>단위</th><th>연도별 수량 <span class="hint">${String(minY).slice(2)}–${String(maxY).slice(2)}</span></th><th class="r">구매 연도</th><th class="r">최근12개월 수량</th><th class="r">직전 12개월</th><th class="r">12개월 발주횟수</th><th class="r">평균 발주간격</th><th class="r">최근 단가</th><th class="r">3년 중앙단가</th><th class="r">연간 예상 (${CUR})</th></tr></thead><tbody>`;
  show.forEach(x=>{const r=R[x.i0];const mx=Math.max(...Object.values(x.yq),1);
    const sp=yearsAll.map(y=>{const q=x.yq[y]||0;return q?`<i style="height:${Math.max(2,q/mx*22)}px" title="${y}: ${f(q)}"></i>`:`<i class="z" title="${y}: 0"></i>`}).join('');
    const prev=x.q24-x.q12;
    h+=`<tr class="click" tabindex="0" data-code="${esc(C[r[4]])}"><td class="mono">${esc(C[r[4]])}</td><td class="wrap-cell">${esc(N[r[3]])}<br><span class="hint">${esc(P[r[5]])}</span></td><td>${esc(U[r[6]])}</td><td><span class="spark">${sp}</span></td><td class="r num">${x.yrs.size}${x.consec?' <span class="chip ok" title="2024·2025·2026 모두 구매">연속</span>':''}</td><td class="r num">${f(x.q12)}</td><td class="r num">${f(prev)}</td><td class="r num">${x.o12}</td><td class="r num">${isFinite(x.gap)?f(x.gap,0)+'일':'–'}</td><td class="r num">${fUSD(x.lp)}</td><td class="r num">${fUSD(med(x.p3))}</td><td class="r num"><b>${fUSD(x.est)}</b></td></tr>`});
  h+='</tbody></table></div>';
  if(L.length>rcLimit)h+=`<div class="more"><button class="ghost" type="button" id="rcmore">${(L.length-rcLimit).toLocaleString()}개 더 보기</button></div>`;
  h+=`<p class="hint" style="margin:10px 0 0">평균 발주간격은 최근 3년 안의 발주일 기준입니다. 공사 물량이 많던 2015–2020년과 지금은 소요량 차이가 크니, 예측은 최근 12개월과 직전 12개월을 비교해서 보세요.</p>`;
  if(!L.length)h='<div class="empty">조건에 맞는 품목이 없습니다. 최소 구매 연도 수나 최근 구매 조건을 줄여 보세요.</div>';
  const el=$('#rcout');el.innerHTML=h;
  el.querySelectorAll('tr[data-code]').forEach(tr=>{const go=()=>gotoCode(tr.dataset.code);tr.onclick=go;tr.onkeydown=ev=>{if(ev.key==='Enter')go()}});
  const mb=el.querySelector('#rcmore');if(mb)mb.onclick=()=>{rcLimit+=300;renderRecurring()};
}
function gotoCode(code){$('#q').value=code;y1.value=minY;y2.value=maxY;$('#sg').value='all';$('#cur').value='all';location.hash='search';runSearch()}
let rcT;$('#rq').addEventListener('input',()=>{clearTimeout(rcT);rcT=setTimeout(()=>{rcLimit=200;renderRecurring()},250)});
['#rcy','#rsg','#rrec','#rso'].forEach(s=>$(s).addEventListener('change',()=>{rcLimit=200;renderRecurring()}));

/* ---------- 지출 현황 ---------- */
let spInit=false;
const CAT={'10':'시멘트·철강·구조재','11':'유류·가스','19':'설치·용역','20':'토목·도로자재','30':'건축 철물·가설','31':'도료·합판','32':'양생·필름','33':'방수·화학','34':'접착·앵커','35':'유리·기타 건자재','40':'설비·밸브·공조','41':'펌프','50':'전기자재','51':'전기 제어','60':'소방·수처리','70':'장비·기계','71':'공구·소모품','79':'장비 임대','80':'잡자재·소모품','89':'기타','90':'안전·일반 소모품'};
function catOf(code){const p=code.slice(0,2);if(CAT[p])return p+' '+CAT[p];const c=code[0];if(c==='A')return 'A* 장비 부품';if(c==='E')return 'E* 캠프 생활용품';if(c==='P')return 'P* 공장 소모품';if(c==='B')return 'B* 식자재';return p+' 기타'}
const rowCat=new Array(R.length);const catNames=new Map();
R.forEach((r,i)=>{const c=catOf(C[r[4]]);rowCat[i]=c});
function initSpend(){
  const a=$('#sy1'),b=$('#sy2');if(a.options.length){renderSpend();return}for(let y=minY;y<=maxY;y++){a.add(new Option(y,y));b.add(new Option(y,y))}a.value=minY;b.value=maxY;
  const st=$('#ssite');st.add(new Option('전체','-1'));const tot=new Map();R.forEach(r=>tot.set(r[1],(tot.get(r[1])||0)+r[10]));
  [...tot.entries()].sort((x,y)=>y[1]-x[1]).forEach(([s])=>st.add(new Option(S[s]||'(현장명 없음)',s)));
  const sc=$('#scat');sc.add(new Option('전체',''));[...new Set(rowCat)].sort().forEach(c=>sc.add(new Option(c,c)));
  ['#sy1','#sy2','#ssite','#scat'].forEach(s=>$(s).addEventListener('change',renderSpend));
  $('#sreset').onclick=()=>{a.value=minY;b.value=maxY;st.value='-1';sc.value='';renderSpend()};
  renderSpend();
}
function renderSpend(){
  const a=+$('#sy1').value,b=+$('#sy2').value,site=+$('#ssite').value,cat=$('#scat').value;
  const years={},sites=new Map(),cats=new Map(),items=new Map();let tot=0,n=0;const vend=new Set();
  for(let i=0;i<R.length;i++){const r=R[i],y=yr(i);if(y<a||y>b)continue;if(site>=0&&r[1]!==site)continue;if(cat&&rowCat[i]!==cat)continue;
    const u=r[10];tot+=u;n++;vend.add(r[2]);years[y]=(years[y]||0)+u;
    const s=sites.get(r[1])||{usd:0,n:0,yrs:new Set()};s.usd+=u;s.n++;s.yrs.add(y);sites.set(r[1],s);
    const c=cats.get(rowCat[i])||{usd:0,n:0,codes:new Set()};c.usd+=u;c.n++;c.codes.add(r[4]);cats.set(rowCat[i],c);
    const k=r[4]+'|'+r[6];const it=items.get(k)||{i0:i,usd:0,q:0,n:0};it.usd+=u;it.q+=r[8];it.n++;items.set(k,it)}
  $('#sstats').innerHTML=`<div class="stat"><div class="k">발주액 (${CUR})</div><div class="v">${fUSD(tot)}</div><div class="s">${a}–${b}</div></div><div class="stat"><div class="k">발주 라인</div><div class="v">${n.toLocaleString()}</div></div><div class="stat"><div class="k">현장·부서</div><div class="v">${sites.size}</div></div><div class="stat"><div class="k">거래처</div><div class="v">${vend.size}</div></div>`;
  const mx=Math.max(...Object.values(years),1);let yb='<div class="vbars">';
  for(let y=a;y<=b;y++){const v=years[y]||0;const lbl=v>=1e6?f(v/1e6,1)+'M':v>=1e3?f(v/1e3,0)+'K':v?f(v,0):'–';yb+=`<div title="${y}: ${fUSD(v)} ${CUR}"><span class="v">${lbl}</span><span class="b" style="height:${v?Math.max(2,v/mx*110):0}px"></span><span class="l">${y}</span></div>`}
  $('#syears').innerHTML=yb+'</div>';
  const sl=[...sites.entries()].sort((x,y)=>y[1].usd-x[1].usd);
  $('#ssitec').textContent=`${sl.length}곳`;
  $('#ssites').innerHTML=`<div class="tbl-wrap" style="max-height:420px;overflow:auto"><table><thead><tr><th>현장·부서</th><th class="r">발주액</th><th>비중</th><th class="r">라인</th><th>기간</th></tr></thead><tbody>${sl.map(([s,x])=>{const ys=[...x.yrs].sort();const sh=x.usd/tot*100;return `<tr class="click" tabindex="0" data-site="${s}"><td>${esc(S[s]||'(없음)')}${isSAB[s]?' <span class="chip sab">SAB</span>':''}</td><td class="r num">${fUSD(x.usd)}</td><td class="num"><span class="share" style="width:${Math.max(1,sh*0.8)}px"></span>${f(sh,1)}%</td><td class="r num">${x.n.toLocaleString()}</td><td class="num">${ys[0]}–${String(ys[ys.length-1]).slice(2)}</td></tr>`}).join('')}</tbody></table></div>`;
  const cl=[...cats.entries()].sort((x,y)=>y[1].usd-x[1].usd);
  $('#scatc').textContent=`${cl.length}개 군`;
  $('#scats').innerHTML=`<div class="tbl-wrap" style="max-height:420px;overflow:auto"><table><thead><tr><th>품목군</th><th class="r">발주액</th><th>비중</th><th class="r">라인</th><th class="r">품목</th></tr></thead><tbody>${cl.map(([c,x])=>{const sh=x.usd/tot*100;return `<tr class="click" tabindex="0" data-cat="${esc(c)}"><td>${esc(c)}</td><td class="r num">${fUSD(x.usd)}</td><td class="num"><span class="share" style="width:${Math.max(1,sh*0.8)}px"></span>${f(sh,1)}%</td><td class="r num">${x.n.toLocaleString()}</td><td class="r num">${x.codes.size}</td></tr>`}).join('')}</tbody></table></div>`;
  const il=[...items.values()].sort((x,y)=>y.usd-x.usd).slice(0,25);
  $('#sitems').innerHTML=`<div class="tbl-wrap"><table><thead><tr><th>자재코드</th><th>품명 / 규격</th><th>단위</th><th class="r">수량</th><th class="r">라인</th><th class="r">발주액 (${CUR})</th><th>비중</th></tr></thead><tbody>${il.map(x=>{const r=R[x.i0];const sh=x.usd/tot*100;return `<tr class="click" tabindex="0" data-code="${esc(C[r[4]])}"><td class="mono">${esc(C[r[4]])}</td><td class="wrap-cell">${esc(N[r[3]])}<br><span class="hint">${esc(P[r[5]])}</span></td><td>${esc(U[r[6]])}</td><td class="r num">${f(x.q)}</td><td class="r num">${x.n}</td><td class="r num">${fUSD(x.usd)}</td><td class="num">${f(sh,1)}%</td></tr>`}).join('')}</tbody></table></div>`;
  const bind=(sel,fn)=>document.querySelectorAll(sel).forEach(tr=>{tr.onclick=()=>fn(tr);tr.onkeydown=ev=>{if(ev.key==='Enter')fn(tr)}});
  bind('#ssites tr[data-site]',tr=>{$('#ssite').value=tr.dataset.site;renderSpend()});
  bind('#scats tr[data-cat]',tr=>{$('#scat').value=tr.dataset.cat;renderSpend()});
  bind('#sitems tr[data-code]',tr=>gotoCode(tr.dataset.code));
}

updMeta();runSearch();runQuote();route();
}
/* ---------- 로그인 · 복호화 ---------- */
(function(){
  const KEY='bp-pw';
  const lerr=document.getElementById('lerr'),pw=document.getElementById('pw'),btn=document.getElementById('lbtn');
  let encP=null;
  const b64=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
  async function getEnc(){if(!encP)encP=fetch('data.enc',{cache:'no-cache'}).then(r=>{if(!r.ok)throw new Error('데이터 파일(data.enc)을 불러오지 못했습니다.');return r.json()});return encP}
  async function decrypt(pass){
    const e=await getEnc();
    const base=await crypto.subtle.importKey('raw',new TextEncoder().encode(pass),'PBKDF2',false,['deriveKey']);
    const key=await crypto.subtle.deriveKey({name:'PBKDF2',salt:b64(e.salt),iterations:e.iter,hash:'SHA-256'},base,{name:'AES-GCM',length:256},false,['decrypt']);
    const pt=await crypto.subtle.decrypt({name:'AES-GCM',iv:b64(e.iv)},key,b64(e.ct));
    return JSON.parse(new TextDecoder().decode(pt));
  }
  async function open(pass,remember){
    btn.disabled=true;btn.textContent='여는 중…';lerr.textContent='';
    try{
      const D=await decrypt(pass);
      try{if(remember)localStorage.setItem(KEY,pass);}catch(_){}
      document.getElementById('login').hidden=true;
      start(D);
    }catch(err){
      lerr.textContent=err&&err.name==='OperationError'?'비밀번호가 맞지 않습니다.':(err.message||'열 수 없습니다.');
      try{localStorage.removeItem(KEY)}catch(_){}
      btn.disabled=false;btn.textContent='열기';pw.select();
    }
  }
  document.getElementById('lform').addEventListener('submit',ev=>{ev.preventDefault();if(pw.value)open(pw.value,document.getElementById('remember').checked)});
  document.getElementById('logout').addEventListener('click',()=>{try{localStorage.removeItem(KEY)}catch(_){}location.hash='';location.reload()});
  if(!window.crypto||!crypto.subtle){lerr.textContent='이 브라우저는 암호 해제를 지원하지 않습니다. https 주소로 열어 주세요.';btn.disabled=true;return}
  let saved=null;try{saved=localStorage.getItem(KEY)}catch(_){}
  if(saved){document.getElementById('remember').checked=true;open(saved,true)}else pw.focus();
})();

