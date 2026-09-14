#!/usr/bin/env python3
import json,re
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'search-index.json'
BASE='https://vai2110.github.io/mba-admission-portal/'
MASTER=json.loads((ROOT/'data/college-search-master.json').read_text(encoding='utf-8'))
MASTER_NAMES=[x['name'] for x in MASTER.get('colleges',[])]
LIVE=[
 ('IIT Delhi DMS','./content/iit-delhi-dms/overview.html','Delhi',['IIT DMS','DMS IIT Delhi','IITD DMS']),
 ("Siksha 'O' Anusandhan (SOA), Bhubaneswar",'./content/soa-bhubaneswar/overview.html','Bhubaneswar',['SOA','SOA Bhubaneswar','SOA BBSR']),
 ('Symbiosis Institute of Business Management, Nagpur','./content/sibm-nagpur/overview.html','Nagpur',['SIBM Nagpur','Symbiosis Nagpur']),
 ('Symbiosis Institute of Computer Studies and Research, Pune','./content/sicsr-pune/overview.html','Pune',['SICSR','SICSR Pune']),
 ('Symbiosis Institute of Management Studies, Pune','./content/sims-pune/overview.html','Pune',['SIMS','SIMS Pune']),
 ('Symbiosis Centre for Information Technology, Pune','./content/scit-pune/overview.html','Pune',['SCIT','SCIT Pune']),
 ('Symbiosis School of Media and Communication, Bengaluru','./content/ssmc-bangalore/overview.html','Bengaluru',['SSMC','SSMC Bangalore','SSMC Bengaluru']),
 ('Asia Pacific Institute of Management, New Delhi','./content/asia-pacific-institute-management-new-delhi/overview.html','New Delhi',['Asia Pacific Institute','AIM New Delhi']),
 ('Department of Management Sciences (PUMBA), Pune','./content/pumba-pune/overview.html','Pune',['PUMBA','PUMBA Pune','DMS PUMBA']),
 ('Vignana Jyothi Institute of Management, Hyderabad','./content/vjim-hyderabad/overview.html','Hyderabad',['VJIM','VJIM Hyderabad','VJIM Hyd']),
 ('Xavier Institute of Management & Entrepreneurship, Bangalore','./content/xime-bangalore/overview.html','Bangalore',['XIME','XIME Bangalore','XIME Bengaluru']),
 ('Institute of Management Studies, Ghaziabad','./content/ims-ghaziabad/overview.html','Ghaziabad',['IMS Ghaziabad','IMS Gzb']),
 ('Institute of Public Enterprise, Hyderabad','./content/ipe-hyderabad/overview.html','Hyderabad',['IPE','IPE Hyderabad','IPE Hyd']),
 ('ICFAI Business School, Hyderabad','./content/ibs-hyderabad/overview.html','Hyderabad',['IBS Hyderabad','IBS Hyd','ICFAI Business School Hyderabad','ICFAI Hyderabad','IBSH']),
 ('SDM Institute for Management Development, Mysore','./content/sdmimd-mysore/overview.html','Mysore',['SDMIMD','SDM IMD','SDM Mysore','SDMIMD Mysuru']),
 ('SIES College of Management Studies, Navi Mumbai','./content/siescoms-navi-mumbai/overview.html','Navi Mumbai',['SIESCOMS','SIES COMS','SIES MMS','SIES Nerul'])
]
EXTERNAL={
 'Indian Institute of Management Ahmedabad':('iim-ahmedabad.html','Ahmedabad',['IIMA','IIM Ahmedabad']),
 'Indian Institute of Management Bangalore':('iim-bangalore.html','Bangalore',['IIMB','IIM Bangalore','IIM Bengaluru']),
 'Indian Institute of Management Kozhikode':('iim-kozhikode.html','Kozhikode',['IIMK','IIM Kozhikode']),
 'Indian Institute of Technology Delhi':('iit-delhi-dms.html','Delhi',['IIT Delhi','IITD','IIT Delhi DMS','DMS IIT Delhi']),
 'Indian Institute of Management Lucknow':('iim-lucknow.html','Lucknow',['IIML','IIM Lucknow']),
 'Indian Institute of Management, Mumbai':('iim-mumbai.html','Mumbai',['IIMM','IIM Mumbai']),
 'Indian Institute of Management Calcutta':('iim-calcutta.html','Calcutta',['IIMC','IIM Calcutta','IIM Kolkata','IIM Calcutta Kolkata']),
 'Indian Institute of Management Indore':('iim-indore.html','Indore',['IIMI','IIM Indore']),
 'Management Development Institute':('mdi-gurugram.html','Gurugram',['MDI','MDI Gurgaon','MDI Gurugram']),
 'XLRI - Xavier School of Management':('xlri-jamshedpur.html','Jamshedpur',['XLRI','XLRI Jamshedpur']),
 'Symbiosis Institute of Business Management':('sibm-pune.html','Pune',['SIBM Pune','Symbiosis Pune','SIBM Pune MBA']),
 'Indian Institute of Technology Kharagpur':('iit-kharagpur.html','Kharagpur',['IIT Kharagpur','IITKGP','IIT KGP']),
 'Indian Institute of Technology Madras':('iit-madras.html','Chennai',['IIT Madras','IITM']),
 'Indian Institute of Technology Bombay':('iit-bombay.html','Mumbai',['IIT Bombay','IITB']),
 'Indian Institute of Management Raipur':('iim-raipur.html','Raipur',['IIM Raipur','IIMR']),
 'Indian Institute of Management Tiruchirappalli':('iim-trichy.html','Tiruchirappalli',['IIM Trichy','IIM Tiruchirappalli','IIM Tiruchirapalli']),
 'Indian Institute of Foreign Trade':('iift.html','Delhi',['IIFT','IIFT Delhi']),
 'Indian Institute of Management Ranchi':('iim-ranchi.html','Ranchi',['IIM Ranchi','IIMRanchi']),
 'Indian Institute of Management Rohtak':('iim-rohtak.html','Rohtak',['IIM Rohtak','IIMR']),
 'S. P. Jain Institute of Management and Research':('spjimr.html','Mumbai',['SPJIMR','SP Jain','SPJIMR Mumbai'])
}

def norm(s):
 return re.sub(r'\s+',' ',re.sub(r'[^a-z0-9]+',' ',(s or '').lower())).strip()

def acronym(s):
 stop={'of','the','and','for','in','at','to','a','an','deemed','university','institute','school','college'}
 return ''.join(x[0] for x in norm(s).split() if x not in stop)

def aliases(name, extra=None):
 vals={name,norm(name)}|{norm(x) for x in (extra or [])}
 # Avoid generic aliases that can collide across city-specific institutes.
 if norm(name)!='symbiosis institute of business management':
  a=acronym(name)
  if len(a)>=3: vals.add(a)
 return sorted(v for v in vals if v)

items=[]
for name,url,loc,extra in LIVE:
 items.append({'name':name,'title':name,'url':url,'aliases':aliases(name,extra),'location':norm(loc),'live':True})
for name,(file,loc,extra) in EXTERNAL.items():
 if name in MASTER_NAMES:
  items.append({'name':name,'title':name,'url':BASE+file,'aliases':aliases(name,extra),'location':norm(loc),'live':True})

OUT.write_text(json.dumps({'version':8,'master_list_count':len(MASTER_NAMES),'live_route_count':len(items),'live_overview_count':len(items),'generated_from':'college-search-master.json + live overview route manifest','colleges':items},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(f'Generated {OUT}: {len(items)} live overview routes.')
