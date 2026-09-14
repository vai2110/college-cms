from pathlib import Path

p = Path(__file__).resolve().parents[1] / 'index.html'
s = p.read_text(encoding='utf-8')

marker = 'function show(q,submit=false)'
guard = r'''function cityConflict(q,c){
 const n=norm(q);
 const cities=[['bangalore',['bengaluru','blr']],['bengaluru',['bangalore','blr']],['delhi',['new delhi']],['new delhi',['delhi']],['mumbai',['bombay']],['bombay',['mumbai']],['gurugram',['gurgaon']],['gurgaon',['gurugram']],['mysore',['mysuru']],['mysuru',['mysore']],['hyderabad',['hyd']],['hyd',['hyderabad']],['ghaziabad',['gzb','gaziabad']],['gzb',['ghaziabad']],['calcutta',['kolkata']],['kolkata',['calcutta']]];
 const qCity=cities.find(([x,vs])=>n.split(' ').includes(x)||vs.some(v=>n.split(' ').includes(v)));
 if(!qCity) return false;
 const target=norm((c.name||'')+' '+(c.location||''));
 const same=qCity[0]===target || qCity[1].some(v=>target.includes(v)) || target.includes(qCity[0]);
 return !same;
}
'''
if marker not in s:
    raise SystemExit('search show marker not found')
if 'function cityConflict(q,c)' not in s:
    s = s.replace(marker, guard + marker, 1)

# Never auto-redirect from search submission. Results must be displayed first.
old_redirect = 'if(submit&&top&&top.c.live&&top.c.url&&top.s>=8200&&(!second||top.s-second.s>=350)){redirect(top.c);return;}'
if old_redirect in s:
    s = s.replace(old_redirect, '', 1)

# Make the result card contain an explicit button instead of behaving like an immediate navigation target.
old_return = "return x.c.live&&x.c.url?`<a class=\"result ${i===0?'selected':''}\" href=\"${x.c.url}\">${content}</a>`:`<div class=\"result ${i===0?'selected':''}\" aria-disabled=\"true\">${content}</div>`"
new_return = "return x.c.live&&x.c.url?`<div class=\"result ${i===0?'selected':''}\"><div>${content}</div><a class=\"result-open\" href=\"${x.c.url}\">Open College Page <span>→</span></a></div>`:`<div class=\"result ${i===0?'selected':''}\" aria-disabled=\"true\">${content}</div>`"
if old_return in s:
    s = s.replace(old_return, new_return, 1)

# Results are shown only after the search button is clicked, never while typing.
old_events = "form.addEventListener('submit',e=>{e.preventDefault();show(input.value,true)});input.addEventListener('input',()=>show(input.value,false));input.addEventListener('keydown',e=>{if(e.key==='Escape'){input.value='';show('',false)}});"
new_events = "form.addEventListener('submit',e=>e.preventDefault());document.querySelector('.search-btn').addEventListener('click',()=>show(input.value,true));input.addEventListener('input',()=>{results.hidden=true;});input.addEventListener('keydown',e=>{if(e.key==='Escape'){input.value='';results.hidden=true;}});"
if old_events in s:
    s = s.replace(old_events, new_events, 1)

# Search button must be a normal button so pressing Enter does not trigger a result search.
s = s.replace('<button class="search-btn" type="submit"', '<button class="search-btn" type="button"', 1)

# Add explicit result-button styling if it is not already present.
style_marker = '.result-meta{font-size:11px;color:var(--muted);margin-top:3px}'
style_add = '.result-meta{font-size:11px;color:var(--muted);margin-top:3px}.result-open{display:inline-flex;align-items:center;gap:6px;margin-top:10px;padding:8px 12px;border-radius:8px;background:var(--blue2);color:#fff;font-size:12px;font-weight:700}.result-open:hover{opacity:.9}'
if style_marker in s and '.result-open{' not in s:
    s = s.replace(style_marker, style_add, 1)

p.write_text(s, encoding='utf-8')
print('Homepage search updated: results appear only after clicking the search button; no automatic redirect while typing or pressing Enter.')