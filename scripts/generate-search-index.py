#!/usr/bin/env python3
import json,re
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'search-index.json'
BASE='https://vai2110.github.io/mba-admission-portal/'
MASTER=json.loads((ROOT/'data/college-search-master.json').read_text(encoding='utf-8'))
MASTER_ROWS=MASTER.get('colleges',[])

EXTRA=[
('Symbiosis Institute of Business Management, Pune','Pune',['SIBM Pune','SIBM Pune MBA']),
('Symbiosis Institute of International Business, Pune','Pune',['SIIB','SIIB Pune']),
('Symbiosis Institute of Operations Management, Nashik','Nashik',['SIOM','SIOM Nashik']),
('Symbiosis Institute of Telecom Management, Pune','Pune',['SITM','SITM Pune']),
('Symbiosis Institute of Business Management, Nagpur','Nagpur',['SIBM Nagpur','Symbiosis Nagpur']),
('Symbiosis Institute of Computer Studies and Research, Pune','Pune',['SICSR','SICSR Pune']),
('Symbiosis Institute of Management Studies, Pune','Pune',['SIMS','SIMS Pune']),
('Symbiosis Centre for Information Technology, Pune','Pune',['SCIT','SCIT Pune']),
('Symbiosis School of Media and Communication, Bengaluru','Bengaluru',['SSMC','SSMC Bangalore','SSMC Bengaluru']),
('Asia Pacific Institute of Management, New Delhi','New Delhi',['Asia Pacific Institute','AIM New Delhi']),
('Department of Management Sciences (PUMBA), Pune','Pune',['PUMBA','PUMBA Pune','DMS PUMBA']),
('Vignana Jyothi Institute of Management, Hyderabad','Hyderabad',['VJIM','VJIM Hyderabad','VJIM Hyd']),
('Xavier Institute of Management & Entrepreneurship, Bangalore','Bangalore',['XIME','XIME Bangalore','XIME Bengaluru']),
('Institute of Management Studies, Ghaziabad','Ghaziabad',['IMS Ghaziabad','IMS Gzb']),
('Institute of Public Enterprise, Hyderabad','Hyderabad',['IPE','IPE Hyderabad','IPE Hyd']),
('ICFAI Business School, Hyderabad','Hyderabad',['IBS Hyderabad','IBS Hyd','ICFAI Business School Hyderabad','ICFAI Hyderabad','IBSH']),
('SDM Institute for Management Development, Mysore','Mysore',['SDMIMD','SDM IMD','SDM Mysore','SDMIMD Mysuru']),
('SIES College of Management Studies, Navi Mumbai','Navi Mumbai',['SIESCOMS','SIES COMS','SIES MMS','SIES Nerul'])]

MANUAL={
'Indian Institute of Management Ahmedabad':['IIMA','IIM Ahmedabad'],'Indian Institute of Management Bangalore':['IIMB','IIM Bengaluru'],'Indian Institute of Management Kozhikode':['IIMK','IIM Kozhikode'],
'Indian Institute of Technology Delhi':['IITD','IIT Delhi DMS','DMS IIT Delhi'],'Indian Institute of Management Lucknow':['IIML','IIM Lucknow'],'Indian Institute of Management, Mumbai':['IIMM','IIM Mumbai'],
'Indian Institute of Management Calcutta':['IIMC','IIM Calcutta','IIM Kolkata','IIMC Kolkata'],'Indian Institute of Management Indore':['IIMI','IIM Indore'],'Management Development Institute':['MDI','MDI Gurgaon','MDI Gurugram'],
'XLRI - Xavier School of Management':['XLRI','XLRI Jamshedpur'],'Symbiosis Institute of Business Management':['SIBM Pune','Symbiosis Pune'],'Indian Institute of Technology Kharagpur':['IIT Kharagpur','IITKGP','IIT KGP'],
'Indian Institute of Technology Madras':['IIT Madras','IITM'],'Indian Institute of Technology Bombay':['IIT Bombay','IITB'],'Indian Institute of Management Raipur':['IIM Raipur'],
'Indian Institute of Management Tiruchirappalli':['IIM Trichy','IIM Tiruchirappalli','IIM Tiruchirapalli'],'Indian Institute of Foreign Trade':['IIFT','IIFT Delhi'],'Indian Institute of Management Ranchi':['IIM Ranchi'],
'Indian Institute of Management Rohtak':['IIM Rohtak'],'S. P. Jain Institute of Management and Research':['SPJIMR','SP Jain','SPJIMR Mumbai'],'Indian Institute of Management Udaipur':['IIM Udaipur','IIMU'],
'Indian Institute of Technology Roorkee':['IIT Roorkee','IITR'],'Indian Institute of Management Kashipur':['IIM Kashipur'],'SVKM`s Narsee Monjee Institute of Management Studies':['NMIMS','NMIMS Mumbai'],
'Indian Institute of Management':['IIM Nagpur','IIMN'],'Jamia Millia Islamia':['JMI','Jamia'],'Indian Institute of Management Visakhapatnam':['IIM Visakhapatnam','IIM Vizag','IIMV'],
'Institute of Management Technology':['IMT Ghaziabad','IMT GZB'],'Indian Institute of Management Bodh Gaya':['IIM Bodh Gaya','IIMBG'],'Chandigarh University':['CU'],
'Indian Institute of Management Sambalpur':['IIM Sambalpur'],'Indian Institute of Management Jammu (IIMJ)':['IIM Jammu','IIMJ'],'T. A. Pai Management Institute Manipal':['TAPMI','T A Pai','TAPMI Manipal'],
'IMI Delhi':['IMI New Delhi'],'Jaipuria Institute of Management':['Jaipuria Noida','Jaipuria Jaipur'],'IMI Kolkata':['IMI Kolkata'],'Goa Institute of Management':['GIM'],
'Lovely Professional University':['LPU'],'XIM University':['XIMB','XIM University Bhubaneswar'],'ICFAI Foundation for Higher Education, Hyderabad':['IFHE','ICFAI Hyderabad'],'Thapar Institute of Engineering and Technology (Deemed-to-be-university)':['Thapar','TIET'],
'Indian Institute of Technology (Indian School of Mines)':['IIT ISM Dhanbad','IIT Dhanbad','IIT(ISM)'],'Amity University':['Amity University Noida'],'Indian Institute of Management Sirmaur':['IIM Sirmaur'],
'Graphic Era University':['GEU','Graphic Era'],'Nirma University':['Nirma'],'Institute of Rural Management Anand':['IRMA','IRMA Anand'],'Loyola Institute of Business Administration':['LIBA','LIBA Chennai'],
'S.R.M. Institute of Science and Technology':['SRM','SRMIST'],'Christ University':['Christ','Christ University Bangalore','Christ University Bengaluru'],'National Institute of Technology Tiruchirappalli':['NIT Trichy','NIT Tiruchirappalli','DMS NIT Trichy'],
'Fore School of Management':['FSM','FORE','FORE School Delhi'],'Banaras Hindu University':['BHU'],'Birla Institute of Management Technology':['BIMTECH'],'Malaviya National Institute of Technology':['MNIT','MNIT Jaipur'],
'Saveetha Institute of Medical and Technical Sciences':['Saveetha','SIMATS'],'Indian Institute of Management, Amritsar':['IIM Amritsar'],'K.J.Somaiya Institute of Management':['KJ Somaiya','KJSIM','Somaiya Institute of Management'],
'Siksha `O` Anusandhan':['SOA','SOA Bhubaneswar','SOA BBSR'],'Jaipuria Institute of Management, Lucknow':['Jaipuria Lucknow','Jaipuria Institute of Management Lucknow'],'Kalinga Institute of Industrial Technology':['KIIT','KIIT Bhubaneswar'],
'Aligarh Muslim University':['AMU'],'Koneru Lakshmaiah Education Foundation University (K L College of Engineering)':['KL University','KLU'],'Alliance University':['Alliance'],
'Jain university,Bangalore':['JAIN University','JAIN Bengaluru','Jain University Bangalore'],'Prin. L.N. Welingkar Institute of Management Development and Research (PGDM)':['Welingkar','WeSchool','Welingkar Mumbai'],
'Guru Gobind Singh Indraprastha University':['GGSIPU','IPU'],'BML Munjal University':['BMU'],'Chitkara University':['Chitkara'],'Babasheb Bhimrao Ambedkar University':['BBAU','BBAU Lucknow'],
'Thiagarajar School of Management':['TSM'],'Manipal University Jaipur':['MUJ'],'Cochin University of Science and Technology':['CUSAT'],'Madan Mohan Malaviya University of Technology':['MMMUT'],
'PSG College of Technology':['PSG Tech'],'National Institute of Technology Calicut':['NIT Calicut','NITC'],'New Delhi Institute of Management':['NDIM'],'Jamia Hamdard':['Jamia Hamdard'],
'Anna University':['Anna University','AU Chennai'],'Pandit Deendayal Energy University':['PDEU','PDPU'],'Jagan Institute of Management Studies':['JIMS','JIMS Delhi'],'Rajagiri Business School':['Rajagiri'],
'Panjab University':['Panjab University','PU Chandigarh'],'Atal Bihari Vajpayee Indian Institute of Information Technology and Management':['ABV-IIITM','IIITM Gwalior','ABV IIITM Gwalior'],
'IMI Bhubaneswar':['IMI Bhubaneswar','IMI BBSR'],'National Institute of Agricultural Extension Management':['MANAGE'],'Bharathidasan Institute of Management':['BIM Trichy'],
'Birla Institute of Technology':['BIT Mesra','Birla Institute of Technology Mesra'],'Indian Institute of Technology Jodhpur':['IIT Jodhpur','IITJ'],'Institute of Management Technology, Nagpur':['IMT Nagpur','IMTNagpur'],'University of Lucknow':['Lucknow University','LU']}

def norm(s): return re.sub(r'\s+',' ',re.sub(r'[^a-z0-9]+',' ',(s or '').lower())).strip()
def tokens(s): return norm(s).split()
def acronym(s):
    stop={'of','the','and','for','in','at','to','a','an','deemed','university','institute','school','college'}
    return ''.join(x[0] for x in tokens(s) if x not in stop)
def aliases(name,extra=None):
    vals={name,norm(name)}|{norm(x) for x in (extra or [])}
    a=acronym(name)
    if len(a)>=3 and a not in {'iim','sibm','imt','jims','srm'}: vals.add(a)
    vals.update(norm(x) for x in MANUAL.get(name,[]))
    return sorted(v for v in vals if v)

items=[]; seen=set()
for row in MASTER_ROWS:
    name=row['name']; key=norm(name)
    if key in seen: continue
    seen.add(key)
    items.append({'name':name,'title':name,'url':row.get('live_url',''),'aliases':aliases(name),'location':norm(row.get('location','')),'live':bool(row.get('live_url'))})

for name,loc,extra in EXTRA:
    key=norm(name); match=next((x for x in items if norm(x['name'])==key),None)
    if match:
        match['aliases']=sorted(set(match['aliases'])|set(norm(x) for x in extra)); continue
    items.append({'name':name,'title':name,'url':BASE+'sibm-pune.html' if key==norm('symbiosis institute of business management, pune') else '','aliases':aliases(name,extra),'location':norm(loc),'live':key==norm('symbiosis institute of business management, pune')})

LIVE=[
('IIT Delhi DMS','./content/iit-delhi-dms/overview.html','Delhi',['IIT DMS','DMS IIT Delhi','IITDMS']),
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
('SIES College of Management Studies, Navi Mumbai','./content/siescoms-navi-mumbai/overview.html','Navi Mumbai',['SIESCOMS','SIES COMS','SIES MMS','SIES Nerul'])]
for name,url,loc,extra in LIVE:
    match=next((x for x in items if norm(x['name'])==norm(name)),None)
    if match:
        match.update(url=url,location=norm(loc),live=True); match['aliases']=sorted(set(match['aliases'])|set(norm(x) for x in extra))
    else: items.append({'name':name,'title':name,'url':url,'aliases':aliases(name,extra),'location':norm(loc),'live':True})

EXTERNAL={
'Indian Institute of Management Ahmedabad':('iim-ahmedabad.html','Ahmedabad',['IIMA','IIM Ahmedabad']),'Indian Institute of Management Bangalore':('iim-bangalore.html','Bangalore',['IIMB','IIM Bangalore','IIM Bengaluru']),'Indian Institute of Management Kozhikode':('iim-kozhikode.html','Kozhikode',['IIMK','IIM Kozhikode']),'Indian Institute of Technology Delhi':('iit-delhi-dms.html','Delhi',['IIT Delhi','IITD','IIT Delhi DMS','DMS IIT Delhi']),'Indian Institute of Management Lucknow':('iim-lucknow.html','Lucknow',['IIML','IIM Lucknow']),'Indian Institute of Management, Mumbai':('iim-mumbai.html','Mumbai',['IIMM','IIM Mumbai']),'Indian Institute of Management Calcutta':('iim-calcutta.html','Calcutta',['IIMC','IIM Calcutta','IIM Kolkata','IIM Calcutta Kolkata']),'Indian Institute of Management Indore':('iim-indore.html','Indore',['IIMI','IIM Indore']),'Management Development Institute':('mdi-gurugram.html','Gurugram',['MDI','MDI Gurgaon','MDI Gurugram']),'XLRI - Xavier School of Management':('xlri-jamshedpur.html','Jamshedpur',['XLRI','XLRI Jamshedpur']),'Symbiosis Institute of Business Management':('sibm-pune.html','Pune',['SIBM Pune','Symbiosis Pune']),'Indian Institute of Technology Kharagpur':('iit-kharagpur.html','Kharagpur',['IIT Kharagpur','IITKGP','IIT KGP']),'Indian Institute of Technology Madras':('iit-madras.html','Chennai',['IIT Madras','IITM']),'Indian Institute of Technology Bombay':('iit-bombay.html','Mumbai',['IIT Bombay','IITB']),'Indian Institute of Management Raipur':('iim-raipur.html','Raipur',['IIM Raipur']),'Indian Institute of Management Tiruchirappalli':('iim-trichy.html','Tiruchirappalli',['IIM Trichy','IIM Tiruchirappalli','IIM Tiruchirapalli']),'Indian Institute of Foreign Trade':('iift.html','Delhi',['IIFT','IIFT Delhi']),'Indian Institute of Management Ranchi':('iim-ranchi.html','Ranchi',['IIM Ranchi']),'Indian Institute of Management Rohtak':('iim-rohtak.html','Rohtak',['IIM Rohtak']),'S. P. Jain Institute of Management and Research':('spjimr.html','Mumbai',['SPJIMR','SP Jain','SPJIMR Mumbai'])}
for name,(file,loc,extra) in EXTERNAL.items():
    match=next((x for x in items if norm(x['name'])==norm(name)),None)
    if match:
        match.update(url=BASE+file,location=norm(loc),live=True); match['aliases']=sorted(set(match['aliases'])|set(norm(x) for x in extra))
    else: items.append({'name':name,'title':name,'url':BASE+file,'aliases':aliases(name,extra),'location':norm(loc),'live':True})

OUT.write_text(json.dumps({'version':11,'master_list_count':len(MASTER_ROWS),'master_unique_count':len({norm(x['name']) for x in MASTER_ROWS}),'live_overview_count':sum(x['live'] for x in items),'searchable_college_count':len(items),'generated_from':'College List master + supplied cutoff-list image + live CMS/external overview routes','colleges':items},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(f'Generated {OUT}: {len(items)} searchable colleges; {sum(x["live"] for x in items)} live overview routes.')
