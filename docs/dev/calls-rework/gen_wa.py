W,H=220,440
C=["#1D9E75","#378ADD","#D4537E","#7F77DD","#5DCAA5","#EF9F27","#D85A30","#F09595","#2C7A7B"]; N=["Анна","Борис","Вера","Глеб","Дарья","Егор","Жанна","Зоя","Я"]
SH='filter="url(#sh)"'
def phone(x,y,body):
    k=f"{x}_{y}"
    return (f'<g transform="translate({x},{y})"><clipPath id="c{k}"><rect width="{W}" height="{H}" rx="26"/></clipPath><g clip-path="url(#c{k})"><rect width="{W}" height="{H}" fill="#0b1a16"/>{body}</g><rect width="{W}" height="{H}" rx="26" fill="none" stroke="#333" stroke-width="2"/></g>')
def lab(x,y,t,s=""):
    r=f'<text x="{x}" y="{y}" font-size="11" font-weight="bold" fill="#222" text-anchor="middle">{t}</text>'
    if s: r+=f'<text x="{x}" y="{y+13}" font-size="8" fill="#555" text-anchor="middle">{s}</text>'
    return r
def sheet(audio=False):
    # WhatsApp bottom sheet: rounded top, dark translucent, grabber, 4 round buttons
    y=H-96
    s=f'<rect x="0" y="{y}" width="{W}" height="110" rx="22" fill="#1f2c28" opacity="{0.92 if not audio else 1}"/><rect x="95" y="{y+8}" width="30" height="4" rx="2" fill="#fff" opacity="0.35"/>'
    icons=["⟳","▣","🎤","✕"]
    for i,x in enumerate([44,88,132,176]):
        s+=f'<circle cx="{x}" cy="{y+50}" r="19" fill="{"#E53935" if i==3 else "#fff"}" opacity="{1 if i==3 else 0.16}"/>'
        if i==3: s+=f'<text x="{x}" y="{y+55}" font-size="12" fill="#fff" text-anchor="middle">✕</text>'
    return s
def top(title,sub,plus=True):
    s=f'<text x="110" y="34" font-size="13" fill="#fff" text-anchor="middle" font-weight="bold" {SH}>{title}</text><text x="110" y="49" font-size="9" fill="#fff" opacity="0.9" text-anchor="middle" {SH}>{sub}</text><text x="18" y="38" font-size="12" fill="#fff" {SH}>⌄</text>'
    if plus: s+=f'<circle cx="198" cy="34" r="12" fill="#000" opacity="0.3"/><text x="198" y="39" font-size="14" fill="#fff" text-anchor="middle">+</text>'
    return s
def tag(x,y,t): return f'<rect x="{x}" y="{y}" width="{len(t)*6+12}" height="14" rx="7" fill="#000" opacity="0.45"/><text x="{x+6}" y="{y+10}" font-size="8" fill="#fff">{t}</text>'
def expand(x,y): return f'<rect x="{x}" y="{y}" width="16" height="16" rx="5" fill="#000" opacity="0.45"/><text x="{x+8}" y="{y+12}" font-size="10" fill="#fff" text-anchor="middle">⤢</text>'
def tile(x,y,w,h,i,active=False,cam_off=False):
    s=f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="10" fill="{C[i]}"/>'
    if cam_off: s+=f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="10" fill="#2a3a35"/><circle cx="{x+w/2}" cy="{y+h/2}" r="{min(w,h)*0.2}" fill="{C[i]}"/><text x="{x+w/2}" y="{y+h/2+5}" font-size="13" fill="#fff" text-anchor="middle" font-weight="bold">{N[i][0]}</text>'
    else: s+=f'<circle cx="{x+w/2}" cy="{y+h/2}" r="{min(w,h)*0.26}" fill="#000" opacity="0.18"/>'
    if active: s+=f'<rect x="{x+1}" y="{y+1}" width="{w-2}" height="{h-2}" rx="10" fill="none" stroke="#25D366" stroke-width="2"/>'
    return s+tag(x+6,y+h-20,N[i])+expand(x+w-22,y+6)
def grid(n,active=1):
    cols=2 if n<=4 else 3; rows=(n+cols-1)//cols; g=3
    HH=H-100
    ch=(HH-g*(rows+1))/rows
    b=f'<rect width="{W}" height="{H}" fill="#0b1a16"/>'
    for i in range(n):
        r,c=divmod(i,cols); in_row=min(cols,n-r*cols); w=(W-g*(in_row+1))/in_row
        b+=tile(g+c*(w+g),g+r*(ch+g),w,ch,i,active=(i==active),cam_off=(i==2))
    return b+top(f"Группа · {n}","05:40")+sheet()
def video1():
    b=f'<rect width="{W}" height="{H}" fill="#378ADD"/><circle cx="110" cy="200" r="64" fill="#000" opacity="0.18"/>'+top("Анна","02:14")
    b+=f'<rect x="150" y="66" width="56" height="80" rx="12" fill="#1D9E75" {SH}/><circle cx="178" cy="106" r="18" fill="#000" opacity="0.18"/>'+expand(188,70)
    return b+sheet()
def focus(n):
    b=f'<rect width="{W}" height="{H}" fill="#378ADD"/><circle cx="110" cy="170" r="70" fill="#000" opacity="0.18"/>'+top(f"Группа · {n}","05:40")+tag(8,H-116-20,"Борис")+expand(W-26,60)
    x=8; y=H-96-66
    for i in [0,2,3,4,5]:
        b+=f'<rect x="{x}" y="{y}" width="44" height="58" rx="10" fill="{C[i]}" {SH}/>'
        if i==2: b+=f'<rect x="{x}" y="{y}" width="44" height="58" rx="10" fill="#2a3a35"/><circle cx="{x+22}" cy="{y+29}" r="11" fill="{C[i]}"/><text x="{x+22}" y="{y+33}" font-size="10" fill="#fff" text-anchor="middle" font-weight="bold">{N[i][0]}</text>'
        x+=48
    return b+sheet()
def av(cx,cy,r,col,ch): return f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{col}"/><text x="{cx}" y="{cy+r*0.36}" font-size="{r*1.05}" fill="#fff" text-anchor="middle" font-weight="bold">{ch}</text>'
BG='<defs><linearGradient id="wa" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0f3b2e"/><stop offset="1" stop-color="#07211a"/></linearGradient></defs><rect width="220" height="440" fill="url(#wa)"/>'
def audio1():
    b=BG+av(110,150,52,"#D4537E","А")+f'<text x="110" y="232" font-size="18" fill="#fff" text-anchor="middle" font-weight="bold">Анна</text><text x="110" y="252" font-size="11" fill="#cfe3dc" text-anchor="middle">02:14</text>'
    b+='<text x="18" y="38" font-size="12" fill="#fff">⌄</text><circle cx="198" cy="34" r="12" fill="#fff" opacity="0.12"/><text x="198" y="39" font-size="14" fill="#fff" text-anchor="middle">+</text>'
    return b+sheet(audio=True)
def audioG(n):
    b='<rect width="220" height="440" fill="url(#wa)"/>'+top(f"Группа · {n}","05:40")
    cols=3 if n>4 else 2; r=22 if n>4 else 28; y0=130; gapy=86 if n>4 else 100
    for i in range(n):
        rr,c=divmod(i,cols); in_row=min(cols,n-rr*cols); gx=W/(in_row+1); x=gx*(c+1); y=y0+rr*gapy
        b+=av(x,y,r,C[i],N[i][0])
        if i==1: b+=f'<circle cx="{x}" cy="{y}" r="{r+5}" fill="none" stroke="#25D366" stroke-width="2.5"/>'
        b+=f'<text x="{x}" y="{y+r+14}" font-size="8" fill="#fff" text-anchor="middle">{N[i]}</text>'
    return b+sheet(audio=True)
svg=(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1750 600" width="3500" height="1200" font-family="Helvetica, Arial, sans-serif"><defs><filter id="sh" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="1" stdDeviation="1.5" flood-color="#000" flood-opacity="0.6"/></filter></defs><rect width="1750" height="600" fill="#f6f5f2"/>'
     f'<text x="875" y="34" font-size="20" font-weight="bold" fill="#222" text-anchor="middle">Как в WhatsApp — аудио и видео</text><text x="875" y="54" font-size="12" fill="#555" text-anchor="middle">1 тап по экрану = показать/спрятать кнопки · 2 тапа по участнику или кнопка ⤢ = развернуть/свернуть · тап по карточке в полоске = сделать главным · «+» всегда справа сверху</text>')
items=[("Видео 1:1","своя камера справа сверху, таскается",video1()),("Группа · 4","сетка над шторкой; шторка спряталась — сетка на весь экран",grid(4)),("Группа — развёрнут","2 тапа или ⤢; полоска с живым видео",focus(6)),("Группа · 5","2+2+1, без пустот",grid(5)),("Группа · 7","3+3+1",grid(7)),("Аудио 1:1","имя и время",audio1()),("Аудио · 5","кольцо у говорящего",audioG(5))]
for i,(t,s,body) in enumerate(items):
    x=30+i*245; svg+=phone(x,80,body)+lab(x+110,545,t,s)
svg+='<text x="875" y="585" font-size="10" fill="#555" text-anchor="middle">Кнопки снизу на тёмной шторке как в WhatsApp: прячутся сами через 4 с (только в видео), шторку можно потянуть вверх — там список участников и «добавить»</text>'
open("whatsapp-style.svg","w").write(svg+'</svg>')
