W,H=220,440
COLORS=["#1D9E75","#378ADD","#D4537E","#7F77DD","#5DCAA5","#EF9F27","#D85A30","#F09595","#1D9E75"]
NAMES=["Анна","Борис","Вера","Глеб","Дарья","Егор","Жанна","Зоя","Я"]
SH='filter="url(#sh)"'
def phone(x,y,body):
    k=f"{x}_{y}"
    return (f'<g transform="translate({x},{y})"><clipPath id="c{k}"><rect width="{W}" height="{H}" rx="26"/></clipPath>'
            f'<g clip-path="url(#c{k})"><rect width="{W}" height="{H}" fill="#111"/>{body}</g>'
            f'<rect width="{W}" height="{H}" rx="26" fill="none" stroke="#333" stroke-width="2"/></g>')
def label(x,y,t,sub=""):
    s=f'<text x="{x}" y="{y}" font-size="11" font-weight="bold" fill="#222" text-anchor="middle">{t}</text>'
    if sub: s+=f'<text x="{x}" y="{y+13}" font-size="8" fill="#555" text-anchor="middle">{sub}</text>'
    return s
def btns(style,y=392):
    xs=[50,90,130,170]; s=""
    if style=="B": s+=f'<rect x="28" y="{y-24}" width="164" height="48" rx="24" fill="#fff" opacity="0.16"/>'
    if style=="C": s+=f'<rect x="22" y="{y-26}" width="176" height="52" rx="26" fill="#000" opacity="0.30"/>'
    for i,x in enumerate(xs):
        if i==3: s+=f'<circle cx="{x}" cy="{y}" r="17" fill="#E53935" {SH}/>'
        elif style=="A": s+=f'<circle cx="{x}" cy="{y}" r="17" fill="#fff" opacity="0.92" {SH}/>'
        elif style=="B": s+=f'<circle cx="{x}" cy="{y}" r="16" fill="#fff" opacity="0.25"/>'
        else: s+=f'<circle cx="{x}" cy="{y}" r="17" fill="#fff" opacity="0.18"/>'
    return s
def top(style,title,sub):
    # no dark bands: text straight over the video with a soft shadow, or small glass pills
    if style=="B":
        return (f'<rect x="50" y="20" width="120" height="30" rx="15" fill="#000" opacity="0.28"/>'
                f'<text x="110" y="34" font-size="11" fill="#fff" text-anchor="middle" font-weight="bold">{title}</text><text x="110" y="45" font-size="8" fill="#fff" opacity="0.85" text-anchor="middle">{sub}</text>'
                f'<circle cx="24" cy="35" r="12" fill="#000" opacity="0.28"/><text x="24" y="39" font-size="10" fill="#fff" text-anchor="middle">⌄</text><circle cx="196" cy="35" r="12" fill="#000" opacity="0.28"/><text x="196" y="39" font-size="11" fill="#fff" text-anchor="middle">+</text>')
    if style=="C":
        return (f'<text x="16" y="36" font-size="12" fill="#fff" font-weight="bold" {SH}>{title}</text><text x="16" y="50" font-size="9" fill="#fff" opacity="0.9" {SH}>{sub}</text>'
                f'<text x="196" y="40" font-size="14" fill="#fff" text-anchor="middle" {SH}>+</text>')
    return (f'<text x="110" y="38" font-size="13" fill="#fff" text-anchor="middle" font-weight="bold" {SH}>{title}</text><text x="110" y="53" font-size="9" fill="#fff" opacity="0.9" text-anchor="middle" {SH}>{sub}</text>'
            f'<text x="18" y="40" font-size="12" fill="#fff" {SH}>⌄</text><text x="196" y="40" font-size="14" fill="#fff" text-anchor="middle" {SH}>+</text>')
def avatar(cx,cy,r,col,ch):
    return f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{col}"/><text x="{cx}" y="{cy+r*0.35}" font-size="{r}" fill="#fff" text-anchor="middle" font-weight="bold">{ch}</text>'
def face(cx,cy,r,col): return f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="#000" opacity="0.18"/>'
def nametag(x,y,t): return f'<rect x="{x}" y="{y}" width="{len(t)*6+12}" height="14" rx="7" fill="#000" opacity="0.4"/><text x="{x+6}" y="{y+10}" font-size="8" fill="#fff">{t}</text>'
def tile(style,x,y,w,h,i,cam_off=False,active=False,me=False):
    rx={"A":12,"B":16,"C":0}[style]; col=COLORS[i]
    s=f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" fill="{col}"/>'
    if cam_off: s+=f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" fill="#2C2C2A"/>'+avatar(x+w/2,y+h/2,min(w,h)*0.22,col,NAMES[i][0])
    else: s+=face(x+w/2,y+h/2,min(w,h)*0.28,col)
    if active: s+=f'<rect x="{x+1}" y="{y+1}" width="{w-2}" height="{h-2}" rx="{rx}" fill="none" stroke="#FAC775" stroke-width="2"/>'
    s+=nametag(x+6,y+h-20,NAMES[i])
    return s
def video_1to1(style):
    b=f'<rect width="{W}" height="{H}" fill="#378ADD"/>'+face(110,210,62,"")
    b+=top(style,"Анна","02:14")
    r={"A":14,"B":14,"C":16}[style]
    b+=f'<rect x="148" y="286" width="60" height="86" rx="{r}" fill="#1D9E75" stroke="#fff" stroke-opacity="0.55" stroke-width="1.5" {SH}/>'+face(178,329,20,"")
    return b+btns(style)
def video_grid(style,n):
    gap={"A":3,"B":6,"C":0}[style]
    cols=2 if n<=4 else 3; rows=(n+cols-1)//cols
    cw=(W-gap*(cols+1))/cols; ch=(H-gap*(rows+1))/rows
    b=""
    for i in range(n):
        r,c=divmod(i,cols); x=gap+c*(cw+gap); y=gap+r*(ch+gap)
        b+=tile(style,x,y,cw,ch,i,cam_off=(i in (2,7)),active=(i==1))
    b+=top(style,f"Группа · {n}","05:40")+btns(style)
    return b
def video_focus(style,n):
    b=f'<rect width="{W}" height="{H}" fill="#378ADD"/>'+face(110,200,70,"")
    b+=nametag(8,330,"Борис")
    b+=top(style,f"Группа · {n}","05:40")
    gap={"A":4,"B":6,"C":3}[style]; rx={"A":10,"B":12,"C":8}[style]
    x=8; y=300; w=44; h=58
    for i in [0,2,3,4,5]:
        col=COLORS[i]
        b+=f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" fill="{col}" {SH}/>'
        if i==2: b+=f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" fill="#2C2C2A"/>'+avatar(x+w/2,y+h/2,11,col,NAMES[i][0])
        x+=w+gap
    b+=f'<text x="110" y="372" font-size="7" fill="#fff" text-anchor="middle" {SH}>← полоска листается →</text>'
    return b+btns(style,y=400)
def audio_1to1(style):
    bg={"A":'<rect width="220" height="440" fill="#0d3b2e"/><circle cx="110" cy="170" r="120" fill="#D4537E" opacity="0.18"/>',
        "B":'<rect width="220" height="440" fill="#1c1c1e"/><circle cx="110" cy="170" r="110" fill="#7F77DD" opacity="0.16"/>',
        "C":'<rect width="220" height="440" fill="#D4537E"/><rect width="220" height="440" fill="#000" opacity="0.6"/>'}[style]
    b=bg+avatar(110,170,44,"#D4537E","А")
    b+=f'<text x="110" y="240" font-size="16" fill="#fff" text-anchor="middle" font-weight="bold">Анна</text><text x="110" y="258" font-size="10" fill="#fff" opacity="0.75" text-anchor="middle">02:14 · аудио</text>'
    b+=f'<text x="196" y="40" font-size="14" fill="#fff" text-anchor="middle">+</text>'
    return b+btns(style)
def audio_group(style):
    bg={"A":'<rect width="220" height="440" fill="#0d3b2e"/>',"B":'<rect width="220" height="440" fill="#1c1c1e"/>',"C":'<rect width="220" height="440" fill="#1a1a1c"/>'}[style]
    b=bg; pos=[(70,140),(150,140),(70,240),(150,240)]
    for i,(cx,cy) in enumerate(pos):
        if style=="C": b+=f'<rect x="{cx-44}" y="{cy-44}" width="88" height="88" rx="18" fill="#2c2c2e"/>'
        b+=avatar(cx,cy,26,COLORS[i],NAMES[i][0])
        if i==1: b+=f'<circle cx="{cx}" cy="{cy}" r="30" fill="none" stroke="#FAC775" stroke-width="2"/>'
        b+=f'<text x="{cx}" y="{cy+42}" font-size="9" fill="#fff" text-anchor="middle">{NAMES[i]}</text>'
    return b+top(style,"Группа · 4","05:40")+btns(style)

INFO={"A":("Вариант A — как WhatsApp","имя и время прямо на видео с лёгкой тенью, круглые белые кнопки, плитки с зазором 3 px"),
      "B":("Вариант B — как Telegram","стеклянные капсулы сверху и снизу, плитки с зазором 6 px и крупным скруглением"),
      "C":("Вариант C — как FaceTime","плитки вплотную без зазоров, полупрозрачная панель кнопок, надписи слева")}
for st in "ABC":
    t,sub=INFO[st]
    svg=(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1500 580" width="3000" height="1160" font-family="Helvetica, Arial, sans-serif">'
         f'<defs><filter id="sh" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="1" stdDeviation="1.5" flood-color="#000" flood-opacity="0.6"/></filter></defs>'
         f'<rect width="1500" height="580" fill="#f6f5f2"/>')
    svg+=f'<text x="750" y="34" font-size="20" font-weight="bold" fill="#222" text-anchor="middle">{t}</text><text x="750" y="54" font-size="12" fill="#555" text-anchor="middle">{sub}</text>'
    items=[("Видео 1:1","",video_1to1(st)),
           ("Группа 4 — сетка","тап по плитке → развернуть",video_grid(st,4)),
           ("Группа — развёрнут","тап по большому → снова сетка",video_focus(st,6)),
           ("Группа 9 — сетка 3×3","от 5 до 9 участников",video_grid(st,9)),
           ("Аудио 1:1","",audio_1to1(st)),
           ("Аудио, группа","",audio_group(st))]
    for i,(lab,sub2,body) in enumerate(items):
        x=30+i*245
        svg+=phone(x,80,body)+label(x+110,545,lab,sub2)
    svg+='</svg>'
    open(f"variant-{st}.svg","w").write(svg)
print("ok")
