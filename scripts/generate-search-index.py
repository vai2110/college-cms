#!/usr/bin/env python3
from pathlib import Path
import html,json,re
ROOT=Path(__file__).resolve().parents[1]; OUT=ROOT/'search-index.json'; MASTER=ROOT/'data/college-search-master.json'
BASE='https://vai2110.github.io/mba-admission-portal/'
EXTERNAL={'Indian Institute of Management Ahmedabad':('iim-ahmedabad.html','Ahmedabad'),'Indian Institute of Management Bangalore':('iim-bangalore.html','Bangalore'),'Indian Institute of Management Kozhikode':('iim-kozhikode.html','Kozhikode'),'Indian Institute of Technology Delhi':('iit-delhi-dms.html','Delhi'),'Indian Institute of Management Lucknow':('iim-lucknow.html','Lucknow'),'Indian Institute of Management, Mumbai':('iim-mumbai.html','Mumbai'),'Indian Institute of Management Calcutta':('iim-calcutta.html','Calcutta'),'Indian Institute of Management Indore':('iim-indore.html','Indore'),'Management Development Institute':('mdi-gurugram.html','Gurugram'),'XLRI - Xavier School of Management':('xlri-jamshedpur.html','Jamshedpur'),'Symbiosis Institute of Business Management':('sibm-pune.html','Pune'),'Indian Institute of Technology Kharagpur':('iit-kharagpur.html','Kharagpur'),'Indian Institute of Technology Madras':('iit-madras.html','Chennai'),'Indian Institute of Technology Bombay':('iit-bombay.html','Mumbai'),'Indian Institute of Management Raipur':('iim-raipur.html','Raipur'),'Indian Institute of Management Tiruchirappalli':('iim-trichy.html','Tiruchirappalli'),'Indian Institute of Foreign Trade':('iift.html','Delhi'),'Indian Institute of Management Ranchi':('iim-ranchi.html','Ranchi'),'Indian Institute of Management Rohtak':('iim-rohtak.html','Rohtak'),'S. P. Jain Institute of Management and Research':('spjimr.html','Mumbai')}
CITY={'bangalore':['bengaluru','blr'],'bengaluru':['bangalore','blr'],'delhi':['new delhi'],'new delhi':['delhi'],'mumbai':['bombay'],'bombay':['mumbai'],'gurugram':['gurgaon'],'gurgaon':['gurugram'],'mysore':['mysuru'],'mysuru':['mysore'],'bhubaneswar':['bbsr','bhubaneshwar'],'bbsr':['bhubaneswar'],'hyderabad':['hyd'],'hyd':['hyderabad'],'ghaziabad':['gzb','gaziabad'],'gzb':['ghaziabad'],'calcutta':['kolkata'],'kolkata':['calcutta']}
EXTRA={'iit-delhi-dms':['IIT DMS','DMS IIT Delhi','IIT Delhi DMS','Department of Management Studies IIT Delhi','IITD DMS'],'soa-bhubaneswar':['SOA','SOA University','SOA Bhubaneswar','SOA BBSR'],'sibm-nagpur':['SIBM Nagpur','Symbiosis Nagpur'],'sicsr-pune':['SICSR','SICSR Pune'],'sims-pune':['SIMS','SIMS Pune'],'scit-pune':['SCIT','SCIT Pune'],'ssmc-bangalore':['SSMC','SSMC Bangalore','SSMC Bengaluru'],'pumba-pune':['PUMBA','PUMBA Pune','DMS PUMBA','DMS Pune'],'vjim-hyderabad':['VJIM','VJIM Hyderabad','VJIM Hyd'],'xime-bangalore':['XIME','XIME Bangalore','XIME Bengaluru'],'ims-ghaziabad':['IMS Ghaziabad','IMS Gzb'],'ipe-hyderabad':['IPE','IPE Hyderabad','IPE Hyd'],'ibs-hyderabad':['IBS','IBS Hyderabad','IBS Hyd','ICFAI Business School Hyderabad','ICFAI Hyderabad','IBSH'],'sdmimd-mysore':['SDMIMD','SDM IMD','SDM Mysore','SDMIMD Mysuru'],'siescoms-navi-mumbai':['SIESCOMS','SIES COMS','SIES','SIES MMS','SIES Nerul','SIESCOMS Navi Mumbai']}
STOP={'of','the','and','for','in','at','to','a','an','deemed','university','institute','school','college'}
def clean(s): return re.sub(r'\s+',' ',re.sub(r'<[^>]+>',' ',html.unescape(s or ''))).strip()
def norm(s): return re.sub(r'\s+',' ',re.sub(r'[^a-z0-9]+',' ',(s or '').lower())).strip()
def toks(s): return norm(s).split()
def acr(s): return ''.join(x[0] for x in toks(s) if x not in STOP)
def aliases(name,slug):
 vals={name,re.sub(r'[-_]',' ',slug)}|set(EXTRA.get(slug,[]))
 for v in list(vals):
  a=acr(v)
  if len(a)>=3 and not (norm(name)=='symbiosis institute of business management' and a=='sibm'): vals.add(a)
  ts=[x for x in toks(v) if len(x)>1]
  for i in range(len(ts)):
   for j in range(i+1,min(len(ts),i+3)+1):
    if len(' '.join(ts[i:j]))>=4: vals.add(' '.join(ts[i:j]))
  nv=norm(v)
  for c,vs in CITY.items():
   if c in nv:
    for x in vs: vals.add(re.sub(r'\b'+re.escape(c)+r'\b',x,nv))
 return sorted({norm(x) for x in vals if norm(x)})
master=json.loads(MASTER.read_text(encoding='utf-8')); master_names=[x['name'] for x in master.get('colleges',[])]
registry_path=ROOT/'data/registry.json'; registry=json.loads(registry_path.read_text(encoding='utf-8')) if registry_path.exists() else {'colleges':[]}
items=[]
for c in registry.get('colleges',[]):
 slug=c.get('slug'); page=ROOT/'content'/slug/'overview.html'
 if slug and page.exists():
  text=page.read_text(encoding='utf-8',errors='ignore'); h=re.search(r'<h1[^>]*>(.*?)</h1>',text,re.I|re.S); name=clean(c.get('name') or (h.group(1) if h else slug)); items.append({'name':name,'title':name,'url':f'./content/{slug}/overview.html','aliases':aliases(name,slug),'location':next((k for k in CITY if k in norm(name)), '')})
for name,(file,loc) in EXTERNAL.items():
 if name in master_names: items.append({'name':name,'title':name,'url':BASE+file,'aliases':aliases(name,file[:-5]),'location':norm(loc)})
OUT.write_text(json.dumps({'version':6,'master_list_count':len(master_names),'live_route_count':len(items),'live_overview_count':len(items),'generated_from':'college-search-master.json + registry.json','colleges':items},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(f'Generated {OUT}: {len(items)} routes; city-aware search aliases enabled; index version 6.')
assert any(x['name']=='Indian Institute of Management Calcutta' and x['url'].endswith('/iim-calcutta.html') for x in items), 'IIM Calcutta route missing'
assert not any(norm(x['name'])=='symbiosis institute of business management' and 'sibm' in x.get('aliases',[]) for x in items if x['url'].endswith('sibm-pune.html')), 'Generic SIBM alias regression detected'
