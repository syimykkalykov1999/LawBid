W,H=220,440
C=["#378ADD","#1D9E75","#D4537E","#7F77DD","#5DCAA5","#EF9F27","#D85A30"]; N=["Борис","Анна","Вера","Глеб","Дарья","Егор","Жанна"]
SH='filter="url(#sh)"'
def phone(x,y,body):
    k=f"{x}_{y}"
    return (f'<g transform="translate({x},{y})"><clipPath id="c{k}"><rect width="{W}" height="{H}" rx="26"/></clipPath><g clip-path="url(#c{k})"><rect width="{W}" height="{H}" fill="#0b1a16"/>{body}</g><rect width="{W}" height="{H}" rx="26" fill="none" stroke="#333" stroke-width="2"/></g>')
def lab(x,y,t,s=""):
    r=f'<text x="{x}" y="{y}" font-size="11" font-weight="bold" fill="#222" text-anchor="middle">{t}</text>'
    if s:
        for j,line in enumerate(s.split("|")): r+=f'<text x="{x}" y="{y+13+j*11}" font-size="8" fill="#555" text-anchor="middle">{line}</text>'
    return r
def face(cx,cy,r): return f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="#000" opacity="0.18"/>'
def sheet(y=None):
    y=H-96 if y is None else y
    s=f'<rect x="0" y="{y}" width="{W}" height="110" rx="22" fill="#1f2c28" opacity="0.94"/><rect x="95" y="{y+8}" width="30" height="4" rx="2" fill="#fff" opacity="0.35"/>'
    for i,x in enumerate([44,88,132,176]):
        s+=f'<circle cx="{x}" cy="{y+50}" r="19" fill="{"#E53935" if i==3 else "#fff"}" opacity="{1 if i==3 else 0.16}"/>'
        if i==3: s+=f'<text x="{x}" y="{y+55}" font-size="12" fill="#fff" text-anchor="middle">✕</text>'
    return s
def top(title,sub):
    return (f'<text x="110" y="34" font-size="13" fill="#fff" text-anchor="middle" font-weight="bold" {SH}>{title}</text><text x="110" y="49" font-size="9" fill="#fff" opacity="0.9" text-anchor="middle" {SH}>{sub}</text>'
            f'<text x="18" y="38" font-size="12" fill="#fff" {SH}>⌄</text><circle cx="198" cy="34" r="12" fill="#000" opacity="0.3"/><text x="198" y="39" font-size="14" fill="#fff" text-anchor="middle">+</text>')
def expand(x,y): return f'<rect x="{x}" y="{y}" width="18" height="18" rx="6" fill="#000" opacity="0.45"/><text x="{x+9}" y="{y+13}" font-size="11" fill="#fff" text-anchor="middle">⤢</text>'
def tag(x,y,t): return f'<rect x="{x}" y="{y}" width="{len(t)*6+12}" height="14" rx="7" fill="#000" opacity="0.45"/><text x="{x+6}" y="{y+10}" font-size="8" fill="#fff">{t}</text>'
def pip(): return f'<rect x="150" y="66" width="56" height="80" rx="12" fill="#2C7A7B" {SH}/>'+face(178,106,18)
# side neighbours as 3D edges (skewed, darker)
def side(left,col,shift=0):
    if left:
        return f'<g transform="translate({-14+shift},0) skewY(6)"><rect x="0" y="40" width="22" height="360" fill="{col}"/><rect x="0" y="40" width="22" height="360" fill="#000" opacity="0.45"/></g>'
    return f'<g transform="translate({212+shift},0) skewY(-6)"><rect x="0" y="40" width="22" height="360" fill="{col}"/><rect x="0" y="40" width="22" height="360" fill="#000" opacity="0.45"/></g>'
def main(i=0):
    b=f'<rect width="{W}" height="{H}" fill="{C[i]}"/>'+face(110,200,64)+side(True,C[(i-1)%7])+side(False,C[(i+1)%7])
    return b+top(N[i],"05:40 · 7 в звонке")+pip()+expand(12,H-124)+tag(W-60,H-124,"говорит")+sheet()
def swiping():
    # card 0 sliding left, card 1 coming in from the right with perspective
    b=f'<rect width="{W}" height="{H}" fill="#0b1a16"/>'
    b+=f'<g transform="translate(-90,0) skewY(8) scale(0.92)"><rect width="{W}" height="{H}" fill="{C[0]}"/>'+face(110,200,64)+f'<rect width="{W}" height="{H}" fill="#000" opacity="0.25"/></g>'
    b+=f'<g transform="translate(118,-10) skewY(-8) scale(0.96)"><rect width="{W}" height="{H}" fill="{C[1]}"/>'+face(110,200,64)+f'</g>'
    b+=f'<text x="110" y="34" font-size="13" fill="#fff" text-anchor="middle" font-weight="bold" {SH}>Борис → Анна</text><text x="110" y="49" font-size="9" fill="#fff" opacity="0.9" text-anchor="middle" {SH}>05:40</text>'
    b+=f'<text x="110" y="250" font-size="28" fill="#fff" text-anchor="middle" opacity="0.9">←</text>'
    return b+pip()+sheet()
def with_list():
    b=f'<rect width="{W}" height="{H}" fill="{C[0]}"/>'+face(110,180,64)+side(True,C[6])+side(False,C[1])+top("Борис","05:40 · 7 в звонке")+pip()
    y=H-96-70; x=8
    for i in [1,2,3,4,5]:
        b+=f'<rect x="{x}" y="{y}" width="44" height="58" rx="10" fill="{C[i]}" {SH}/>'+face(x+22,y+29,12)
        if i==2: b+=f'<rect x="{x+1}" y="{y+1}" width="42" height="56" rx="10" fill="none" stroke="#25D366" stroke-width="2"/>'
        x+=48
    b+=f'<text x="110" y="{y+68}" font-size="7" fill="#fff" text-anchor="middle" {SH}>← список листается по кругу →</text>'
    return b+sheet()
def overview():
    b=f'<defs><radialGradient id="ov" cx="0.5" cy="0.45" r="0.7"><stop offset="0" stop-color="#2a3f3a"/><stop offset="1" stop-color="#060d0b"/></radialGradient></defs><rect width="{W}" height="{H}" fill="url(#ov)"/>'
    def card(cx,cy,sc,col,dark,skew=0,ring=False,ff=False):
        w=W*sc; h=H*sc
        inner=f'<rect width="{W}" height="{H}" rx="22" fill="{col}"/>'+(face(110,200,64) if ff else '')+f'<rect width="{W}" height="{H}" rx="22" fill="#000" opacity="{dark}"/>'
        if ring: inner+=f'<rect x="4" y="4" width="212" height="432" rx="22" fill="none" stroke="#25D366" stroke-width="6"/>'
        return f'<g transform="translate({cx-w/2},{cy-h/2}) skewY({skew}) scale({sc})" {SH}>{inner}</g>'
    # back row (far side of the ring): small and dark
    b+=card(75,150,0.22,C[4],0.6)+card(110,142,0.22,C[3],0.6)+card(145,150,0.22,C[5],0.6)
    # middle sides
    b+=card(34,200,0.34,C[6],0.35,skew=12)+card(186,200,0.34,C[1],0.35,skew=-12)
    # front sides
    b+=card(52,250,0.42,C[2],0.15,skew=6)
    # front center = current
    b+=card(120,262,0.5,C[0],0,ring=True,ff=True)
    b+=f'<text x="110" y="34" font-size="13" fill="#fff" text-anchor="middle" font-weight="bold">Все участники · 7</text><text x="110" y="49" font-size="9" fill="#fff" opacity="0.9" text-anchor="middle">05:40 · крути кольцо пальцем</text><circle cx="198" cy="34" r="12" fill="#fff" opacity="0.15"/><text x="198" y="39" font-size="14" fill="#fff" text-anchor="middle">+</text>'
    b+=f'<text x="110" y="{H-104}" font-size="7" fill="#fff" opacity="0.8" text-anchor="middle">↑ потяни вверх — назад к Борису</text>'
    return b+sheet()
def grid():
    g=3; HH=H-100; cols=3; rows=3; ch=(HH-g*(rows+1))/rows
    b=f'<rect width="{W}" height="{H}" fill="#0b1a16"/>'
    for i in range(7):
        r,c=divmod(i,cols); in_row=min(cols,7-r*cols); w=(W-g*(in_row+1))/in_row; x=g+c*(w+g); y=g+r*(ch+g)
        b+=f'<rect x="{x}" y="{y}" width="{w}" height="{ch}" rx="10" fill="{C[i]}"/>'+face(x+w/2,y+ch/2,min(w,ch)*0.26)+tag(x+5,y+ch-19,N[i])
        if i==0: b+=f'<rect x="{x+1}" y="{y+1}" width="{w-2}" height="{ch-2}" rx="10" fill="none" stroke="#25D366" stroke-width="2"/>'
    return b+top("Группа · 7","05:40")+expand(12,HH-24)+sheet()
svg=(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1260 640" width="2520" height="1280" font-family="Helvetica, Arial, sans-serif"><defs><filter id="sh" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="#000" flood-opacity="0.5"/></filter></defs><rect width="1260" height="640" fill="#f6f5f2"/>'
     f'<text x="630" y="34" font-size="20" font-weight="bold" fill="#222" text-anchor="middle">Видеозвонок — карусель по кругу + обзор как в GNOME</text><text x="630" y="54" font-size="11" fill="#555" text-anchor="middle">свайп влево/вправо = следующий/предыдущий по кругу · тап по видео = нижний список · потянул вниз = обзор-кольцо · ⤢ = сетка · тап по карточке = на весь экран</text>')
items=[("1 · Главный экран","края соседей видны сбоку (3D);|свайп крутит кольцо без конца",main()),
       ("2 · Во время свайпа","карточки едут с инерцией|и мягко замедляются",swiping()),
       ("3 · Тап по видео","снизу список всех, листается|по кругу; тап — он главный",with_list()),
       ("4 · Потянул вниз — обзор","все карточки кольцом в 3D, задние|видны за передними; кнопки стоят",overview()),
       ("5 · Сетка (кнопка ⤢)","все плитками; тап по плитке — на|весь экран; ⤢ — обратно",grid())]
for i,(t,s,body) in enumerate(items):
    x=30+i*245; svg+=phone(x,80,body)+lab(x+110,545,t,s)
svg+='<text x="630" y="605" font-size="10" fill="#555" text-anchor="middle">Все переходы 300–400 мс с плавным замедлением: карточка «вырастает» в большой экран и обратно, ничего не пропадает скачком. В 1:1 свайп меняет местами тебя и собеседника. Аудио — то же, вместо видео аватары.</text>'
open("carousel.svg","w").write(svg+'</svg>')
