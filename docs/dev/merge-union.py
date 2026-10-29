import re,sys
for p in sys.argv[1:]:
    s=open(p).read()
    def join(m):
        head,main=m.group(1),m.group(2)
        if p.endswith(".tf"):
            opened=head.count("{")-head.count("}")
            if opened>0: head=head.rstrip("\n")+"\n"+"}\n"*opened+"\n"
        return head+main
    s=re.sub(r"<<<<<<< [^\n]*\n(.*?)=======\n(.*?)>>>>>>> [^\n]*\n",join,s,flags=re.S)
    if p.endswith("envs/prod/main.tf"):
        out=[];inmod=False;seen=set()
        for l in s.split("\n"):
            if re.match(r'^module "',l): inmod=True; seen=set()
            elif l.startswith("}"): inmod=False
            m=re.match(r"^\s{2}([a-zA-Z_0-9]+)\s*=",l) if inmod else None
            if m:
                if m.group(1) in seen: continue
                seen.add(m.group(1))
            out.append(l)
        s="\n".join(out)
    if p.endswith(".txt"):
        seen=set();out=[]
        for l in s.split("\n"):
            if l and l in seen: continue
            seen.add(l); out.append(l)
        s="\n".join(out)
    open(p,"w").write(s); print(p,"markers",len(re.findall(r"^<<<<<<< ",s,re.M)))
