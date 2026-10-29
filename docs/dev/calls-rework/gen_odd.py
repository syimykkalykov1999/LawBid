W,H=220,440
C=["#1D9E75","#378ADD","#D4537E","#7F77DD","#5DCAA5","#EF9F27","#D85A30","#F09595","#2C7A7B"]; N=["Анна","Борис","Вера","Глеб","Дарья","Егор","Жанна","Зоя","Я"]
SH='filter="url(#sh)"'
def phone(x,y,body):
    k=f"{x}_{y}"
    return (f'<g transform="translate({x},{y})"><clipPath id="c{k}"><rect width="{W}" height="{H}" rx="26"/></clipPath><g clip-path="url(#c{k})"><rect width="{W}" height="{H}" fill="#111"/>{body}</g><rect width="{W}" height="{H}" rx="26" fill="none" stroke="#333" stroke-width="2"/></g>')
def lab(x,y,t,s=""):
    r=f'<text x="{x}" y="{y}" font-size="11" font-weight="bold" fill="#222" text-anchor="middle">{t}</text>'
    if s: r+=f'<text x="{x}" y="{y+13}" font-size="8" fill="#555" text-anchor="middle">{s}</text>'
    return r
def btns(y=392):
    s=f'<rect x="22" y="{y-26}" width="176" height="52" rx="26" fill="#000" opacity="0.30"/>'
    for i,x in enumerate([50,90,130,170]): s+=f'<circle cx="{x}" cy="{y}" r="17" fill="{"#E53935" if i==3 else "#fff"}" opacity="{1 if i==3 else 0.18}"/>'
    return s
def top(title,sub):
    return f'<text x="16" y="36" font-size="12" fill="#fff" font-weight="bold" {SH}>{title}</text><text x="16" y="50" font-size="9" fill="#fff" opacity="0.9" {SH}>{sub}</text><text x="196" y="40" font-size="14" fill="#fff" text-anchor="middle" {SH}>+</text>'
def tag(x,y,t): return f'<rect x="{x}" y="{y}" width="{len(t)*6+12}" height="14" rx="7" fill="#000" opacity="0.4"/><text x="{x+6}" y="{y+10}" font-size="8" fill="#fff">{t}</text>'
def tile(x,y,w,h,i,active=False):
    s=f'<rect x="{x}" y="{y}" width="{w}" height="{h}" fill="{C[i]}"/><circle cx="{x+w/2}" cy="{y+h/2}" r="{min(w,h)*0.27}" fill="#000" opacity="0.18"/>'
    if active: s+=f'<rect x="{x+1}" y="{y+1}" width="{w-2}" height="{h-2}" fill="none" stroke="#FAC775" stroke-width="2"/>'
    return s+tag(x+6,y+h-20,N[i])
def grid(n):
    cols=2 if n<=4 else 3
    rows=(n+cols-1)//cols
    ch=H/rows; cw=W/cols
    b=""
    for i in range(n):
        r,c=divmod(i,cols)
        in_row=min(cols,n-r*cols)
        w=W/in_row            # odd last row: tiles stretch to fill the row
        x=c*w; y=r*ch
        b+=tile(x,y,w,ch,i,active=(i==1))
    return b+top(f"Группа · {n}","05:40")+btns()
def av(cx,cy,r,col,ch): return f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{col}"/><text x="{cx}" y="{cy+r*0.36}" font-size="{r*1.05}" fill="#fff" text-anchor="middle" font-weight="bold">{ch}</text>'
def audio1():
    b=f'<rect width="{W}" height="{H}" fill="#D4537E"/><circle cx="60" cy="120" r="140" fill="#fff" opacity="0.10" filter="url(#bl)"/><rect width="{W}" height="{H}" fill="#000" opacity="0.45"/>'
    b+=av(110,160,48,"#D4537E","А")+f'<text x="110" y="236" font-size="17" fill="#fff" text-anchor="middle" font-weight="bold">Анна</text><text x="110" y="256" font-size="12" fill="#fff" opacity="0.85" text-anchor="middle">02:14</text>'
    return b+f'<text x="196" y="40" font-size="14" fill="#fff" text-anchor="middle">+</text>'+btns()
def audioG(n):
    b=f'<rect width="{W}" height="{H}" fill="#378ADD"/><circle cx="60" cy="120" r="140" fill="#fff" opacity="0.10" filter="url(#bl)"/><rect width="{W}" height="{H}" fill="#000" opacity="0.5"/>'
    b+=f'<text x="16" y="36" font-size="12" fill="#fff" font-weight="bold">Группа · {n}</text><text x="16" y="50" font-size="9" fill="#fff" opacity="0.9">05:40</text><text x="196" y="40" font-size="14" fill="#fff" text-anchor="middle">+</text>'
    cols=3 if n>4 else 2; r=21 if n>4 else 28; gapx=W/(cols+1); y0=120; gapy=80 if n>4 else 100
    for i in range(n):
        rr,c=divmod(i,cols); in_row=min(cols,n-rr*cols); gx=W/(in_row+1)
        x=gx*(c+1); y=y0+rr*gapy
        b+=av(x,y,r,C[i],N[i][0])
        if i==1: b+=f'<circle cx="{x}" cy="{y}" r="{r+5}" fill="none" stroke="#FAC775" stroke-width="2.5"/>'
        b+=f'<text x="{x}" y="{y+r+14}" font-size="8" fill="#fff" text-anchor="middle">{N[i]}</text>'
    return b+btns()
svg=(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1500 580" width="3000" height="1160" font-family="Helvetica, Arial, sans-serif"><defs><filter id="sh" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="1" stdDeviation="1.5" flood-color="#000" flood-opacity="0.6"/></filter><filter id="bl"><feGaussianBlur stdDeviation="30"/></filter></defs><rect width="1500" height="580" fill="#f6f5f2"/>'
     f'<text x="750" y="34" font-size="20" font-weight="bold" fill="#222" text-anchor="middle">Вариант C — нечётное число участников и аудио</text><text x="750" y="54" font-size="12" fill="#555" text-anchor="middle">последний ряд растягивается на всю ширину, пустых мест нет; на аудио только имя и время</text>')
items=[("Видео · 3","2 сверху, 1 во всю ширину",grid(3)),("Видео · 5","2+2+1",grid(5)),("Видео · 7","3+3+1",grid(7)),("Видео · 8","3+3+2",grid(8)),("Аудио 1:1","имя и время",audio1()),("Аудио · 5","имя и время, кольцо у говорящего",audioG(5))]
for i,(t,s,body) in enumerate(items):
    x=30+i*245; svg+=phone(x,80,body)+lab(x+110,545,t,s)
open("odd-counts.svg","w").write(svg+'</svg>')
