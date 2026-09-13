from pathlib import Path
import re
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
if marker not in s: raise SystemExit('search show marker not found')
s=s.replace(marker,guard+marker,1)
s=s.replace('if(submit && top.s>=8200 && (!second || top.s-second.s>=350)){redirect(top.c);return;}','if(submit && top.s>=8200 && !cityConflict(q,top.c) && (!second || top.s-second.s>=350)){redirect(top.c);return;}')
p.write_text(s,encoding='utf-8')
print('Patched homepage search with city-conflict protection.')