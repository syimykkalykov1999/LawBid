W,H=220,440
C=["#1D9E75","#378ADD","#D4537E","#7F77DD","#5DCAA5","#EF9F27"]; N=["Анна","Борис","Вера","Глеб","Дарья","Егор"]
SH='filter="url(#sh)"'
def phone(x,y,body):
    k=f"{x}_{y}"
    return (f'<g transform="translate({x},{y})"><clipPath id="c{k}"><rect width="{W}" height="{H}" rx="26"/></clipPath><g clip-path="url(#c{k})"><rect width="{W}" height="{H}" fill="#111"/>{body}</g><rect width="{W}" height="{H}" rx="26" fill="none" stroke="#333" stroke-width="2"/></g>')
def lab(x,y,t,s=""):
    r=f'<text x="{x}" y="{y}" font-size="11" font-weight="bold" fill="#222" text-anchor="middle">{t}</text>'
    if s: r+=f'<text x="{x}" y="{y+13}" font-size="8" fill="#555" text-anchor="middle">{s}</text>'
    return r
def btns(y=392):
    s=f'<rect x="22" y="{y-26}" width="176" height="52" rx="26" fill="#fff" opacity="0.10"/>'
    for i,x in enumerate([50,90,130,170]):
        s+=f'<circle cx="{x}" cy="{y}" r="17" fill="{"#E53935" if i==3 else "#fff"}" opacity="{1 if i==3 else 0.18}"/>'
    return s
def av(cx,cy,r,col,ch,ring=False):
    s=f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{col}"/><text x="{cx}" y="{cy+r*0.36}" font-size="{r*1.05}" fill="#fff" text-anchor="middle" font-weight="bold">{ch}</text>'
    if ring: s+=f'<circle cx="{cx}" cy="{cy}" r="{r+5}" fill="none" stroke="#FAC775" stroke-width="2.5"/>'
    return s
def top(title,sub):
    return f'<text x="16" y="36" font-size="12" fill="#fff" font-weight="bold" {SH}>{title}</text><text x="16" y="50" font-size="9" fill="#fff" opacity="0.85" {SH}>{sub}</text><text x="196" y="40" font-size="14" fill="#fff" text-anchor="middle" {SH}>+</text>'
def blurbg(col):
    return (f'<rect width="{W}" height="{H}" fill="{col}"/><circle cx="60" cy="120" r="140" fill="#fff" opacity="0.10" filter="url(#bl)"/><circle cx="190" cy="360" r="150" fill="#000" opacity="0.35" filter="url(#bl)"/><rect width="{W}" height="{H}" fill="#000" opacity="0.35"/>')
# Option 1: like FaceTime/iOS — blurred photo background, one big avatar, no cards
def o1_1to1():
    return blurbg("#D4537E")+av(110,160,48,"#D4537E","А")+f'<text x="110" y="236" font-size="17" fill="#fff" text-anchor="middle" font-weight="bold">Анна</text><text x="110" y="254" font-size="10" fill="#fff" opacity="0.8" text-anchor="middle">02:14</text>'+f'<text x="196" y="40" font-size="14" fill="#fff" text-anchor="middle">+</text>'+btns()
def o1_group():
    b=blurbg("#378ADD")+top("Группа · 6","05:40")
    pos=[(60,120),(110,120),(160,120),(60,215),(110,215),(160,215)]
    for i,(x,y) in enumerate(pos): b+=av(x,y,21,C[i],N[i][0],ring=(i==1))+f'<text x="{x}" y="{y+34}" font-size="8" fill="#fff" text-anchor="middle">{N[i]}</text>'
    b+='<text x="110" y="300" font-size="9" fill="#fff" opacity="0.8" text-anchor="middle">говорит: Борис</text>'
    return b+btns()
# Option 2: like WhatsApp — gradient from avatar colour, big avatar, group as two rows of large avatars
def o2_1to1():
    b=f'<defs><linearGradient id="g2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a1f3d"/><stop offset="1" stop-color="#0f3d31"/></linearGradient></defs><rect width="{W}" height="{H}" fill="url(#g2)"/>'
    b+=av(110,150,54,"#D4537E","А")+f'<text x="110" y="232" font-size="17" fill="#fff" text-anchor="middle" font-weight="bold">Анна</text><text x="110" y="250" font-size="10" fill="#fff" opacity="0.8" text-anchor="middle">02:14</text>'
    b+='<circle cx="110" cy="150" r="64" fill="none" stroke="#fff" stroke-opacity="0.25" stroke-width="2"/><circle cx="110" cy="150" r="76" fill="none" stroke="#fff" stroke-opacity="0.12" stroke-width="2"/>'
    return b+f'<text x="196" y="40" font-size="14" fill="#fff" text-anchor="middle">+</text>'+btns()
def o2_group():
    b=f'<rect width="{W}" height="{H}" fill="url(#g2)"/>'+top("Группа · 6","05:40")
    pos=[(55,130),(110,110),(165,130),(55,225),(110,245),(165,225)]
    for i,(x,y) in enumerate(pos): b+=av(x,y,24,C[i],N[i][0],ring=(i==1))+f'<text x="{x}" y="{y+38}" font-size="8" fill="#fff" text-anchor="middle">{N[i]}</text>'
    return b+btns()
# Option 3: Telegram-like — dark, avatar with animated sound wave ring; group = a single large row with live wave on the speaker
def wave(cx,cy,r,col):
    return f'<circle cx="{cx}" cy="{cy}" r="{r+6}" fill="{col}" opacity="0.35"/><circle cx="{cx}" cy="{cy}" r="{r+13}" fill="{col}" opacity="0.18"/><circle cx="{cx}" cy="{cy}" r="{r+21}" fill="{col}" opacity="0.08"/>'
def o3_1to1():
    b=f'<rect width="{W}" height="{H}" fill="#121214"/>'+wave(110,160,48,"#D4537E")+av(110,160,48,"#D4537E","А")
    b+=f'<text x="110" y="240" font-size="17" fill="#fff" text-anchor="middle" font-weight="bold">Анна</text><text x="110" y="258" font-size="10" fill="#9a9a9a" text-anchor="middle">02:14</text>'
    return b+f'<text x="196" y="40" font-size="14" fill="#fff" text-anchor="middle">+</text>'+btns()
def o3_group():
    b=f'<rect width="{W}" height="{H}" fill="#121214"/>'+top("Группа · 6","05:40")
    # speaker big on top, others small row below
    b+=wave(110,140,40,C[1])+av(110,140,40,C[1],"Б")+f'<text x="110" y="200" font-size="11" fill="#fff" text-anchor="middle" font-weight="bold">Борис</text><text x="110" y="213" font-size="8" fill="#9a9a9a" text-anchor="middle">говорит</text>'
    xs=[40,75,110,145,180]; others=[0,2,3,4,5]
    for x,i in zip(xs,others): b+=av(x,262,15,C[i],N[i][0])+f'<text x="{x}" y="{x and 288}" font-size="7" fill="#bbb" text-anchor="middle">{N[i]}</text>'
    return b+btns()
svg=(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1500 580" width="3000" height="1160" font-family="Helvetica, Arial, sans-serif"><defs><filter id="sh" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="1" stdDeviation="1.5" flood-color="#000" flood-opacity="0.6"/></filter><filter id="bl"><feGaussianBlur stdDeviation="30"/></filter></defs><rect width="1500" height="580" fill="#f6f5f2"/>'
     f'<text x="750" y="34" font-size="20" font-weight="bold" fill="#222" text-anchor="middle">Аудиозвонки — три варианта (к оформлению C)</text>')
items=[("1 · как FaceTime","размытый фон цвета аватара",o1_1to1()),("1 · группа","все аватары на размытом фоне, кольцо у говорящего",o1_group()),
       ("2 · как WhatsApp","тёмный градиент, кольца вокруг аватара",o2_1to1()),("2 · группа","аватары «россыпью», кольцо у говорящего",o2_group()),
       ("3 · как Telegram","чёрный фон, звуковая волна вокруг аватара",o3_1to1()),("3 · группа","говорящий крупно сверху, остальные в ряд",o3_group())]
for i,(t,s,body) in enumerate(items):
    x=30+i*245; svg+=phone(x,80,body)+lab(x+110,545,t,s)
open("audio-options.svg","w").write(svg+'</svg>')
