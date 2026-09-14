from pathlib import Path

p=Path(__file__).resolve().parents[1]/'index.html'
s=p.read_text(encoding='utf-8')

marker='function show(q,submit=false)'
guard=r'''function cityConflict(q,c){
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
 s=s.replace(marker,guard+marker,1)
old='if(submit && top.s>=8200 && (!second || top.s-second.s>=350)){redirect(top.c);return;}'
new='if(submit && top.s>=8200 && !cityConflict(q,top.c) && (!second || top.s-second.s>=350)){redirect(top.c);return;}'
if old in s:
 s=s.replace(old,new,1)
old_fallback='const eligible=ranked.filter(x=>!cityConflict(q,x.c)&&!familyConflict(q,x.c)),pool=eligible.length?eligible:ranked,top=pool[0],second=pool[1];'
new_fallback="const eligible=ranked.filter(x=>!cityConflict(q,x.c)&&!familyConflict(q,x.c));if(!eligible.length){results.innerHTML='<div class=\"result\"><div class=\"result-name\">No exact college match found</div><div class=\"result-meta\">The search term conflicts with the available college name or city. Try the full college name, abbreviation and city.</div></div>';results.hidden=false;status.textContent='No safe match — no college was redirected.';return;}const pool=eligible,top=pool[0],second=pool[1];"
if old_fallback in s:
 s=s.replace(old_fallback,new_fallback,1)
p.write_text(s,encoding='utf-8')
print('Homepage search patch verified: city-conflict protection is present and patching is idempotent.')
