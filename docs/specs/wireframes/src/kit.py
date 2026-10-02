# Wireframe kit: grayscale low-fi components for GOALIE frames.
CSS = r"""
*{box-sizing:border-box}
body{margin:0;background:#fff;font-family:Inter,Helvetica,Arial,sans-serif;color:#222;font-size:13px}
.frame{width:1280px;padding:20px 24px 24px;background:#fff}
.fhead{display:flex;align-items:center;gap:14px;border-bottom:2px solid #222;padding-bottom:10px;margin-bottom:14px}
.fhead .num{font-size:28px;font-weight:800;border:2px solid #222;border-radius:6px;padding:2px 10px}
.fhead h1{margin:0;font-size:20px}
.fhead .src{color:#555;font-size:12px;margin-top:2px}
.fhead .tag{margin-left:auto;font-size:11px;border:1px dashed #777;padding:3px 8px;border-radius:10px;color:#444;white-space:nowrap}
.fhead .tag.assumed{border:2px solid #222;color:#222;font-weight:700}
.body{display:flex;gap:18px;align-items:flex-start}
.screen{flex:0 0 900px;border:2px solid #333;border-radius:8px;overflow:hidden;background:#fafafa}
.notes{flex:1;font-size:12.5px;line-height:1.4}
.notes h3{margin:0 0 6px;font-size:13px;text-transform:uppercase;letter-spacing:.04em;color:#333}
.notes ol{margin:0 0 14px;padding-left:0;list-style:none}
.notes ol li{display:flex;gap:8px;margin-bottom:7px}
.notes .tenet{border-left:4px solid #222;background:#f0f0f0;padding:7px 9px;margin-bottom:10px}
.notes .q{border:1px dashed #555;padding:7px 9px;margin-bottom:10px}
.pin{display:inline-flex;align-items:center;justify-content:center;min-width:18px;height:18px;border-radius:9px;background:#111;color:#fff;font-size:11px;font-weight:700;padding:0 4px;vertical-align:middle;margin:0 3px;flex:0 0 auto}
.chrome{background:#ddd;padding:6px 10px;display:flex;gap:6px;align-items:center;border-bottom:1px solid #bbb}
.chrome i{width:10px;height:10px;border-radius:5px;background:#aaa;display:inline-block}
.chrome .url{flex:1;background:#fff;border:1px solid #bbb;border-radius:4px;padding:2px 8px;color:#666;font-size:11px;margin-left:8px}
.top{display:flex;align-items:center;gap:12px;background:#e9e9e9;padding:8px 12px;border-bottom:1px solid #ccc}
.logo{font-weight:800;letter-spacing:.08em;border:2px solid #333;padding:1px 6px;border-radius:4px}
.search{flex:1;border:1px solid #bbb;background:#fff;border-radius:4px;padding:4px 8px;color:#888}
.live{font-size:11px;color:#444}
.av{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:12px;background:#bbb;font-size:10px;font-weight:700;color:#222;border:2px solid #fafafa}
.av.agent{border-radius:4px;background:#d6d6d6;border:1px dashed #555}
.app{display:flex;min-height:200px}
.nav{width:170px;flex:0 0 170px;background:#efefef;border-right:1px solid #ccc;padding:10px 8px;font-size:12px}
.nav .h{font-size:10px;text-transform:uppercase;color:#777;margin:10px 4px 4px;letter-spacing:.06em}
.nav a{display:flex;justify-content:space-between;padding:4px 6px;border-radius:4px;color:#333;text-decoration:none}
.nav a.on{background:#cfcfcf;font-weight:700}
.nav a .c{background:#999;color:#fff;border-radius:8px;padding:0 6px;font-size:10px}
.nav a.sub{padding-left:16px}
.main{flex:1;padding:14px 16px;min-width:0}
h2{margin:0 0 4px;font-size:17px}
.sub{color:#666;font-size:12px}
.row{display:flex;gap:10px;align-items:center}
.sp{flex:1}
.btn{display:inline-block;border:1.5px solid #333;border-radius:4px;padding:4px 10px;background:#fff;font-size:12px;font-weight:600;white-space:nowrap}
.btn.pri{background:#333;color:#fff}
.btn.ghost{border-style:dashed;color:#555}
.btn.dis{border-color:#aaa;color:#aaa}
.chip{display:inline-block;border:1px solid #888;border-radius:10px;padding:1px 8px;font-size:11px;background:#fff;white-space:nowrap}
.chip.on{background:#333;color:#fff;border-color:#333}
table.g{width:100%;border-collapse:collapse;background:#fff;font-size:12px}
table.g th{text-align:left;font-size:10.5px;text-transform:uppercase;color:#555;border-bottom:2px solid #999;padding:5px 6px;background:#f3f3f3;letter-spacing:.03em}
table.g td{border-bottom:1px solid #ddd;padding:6px;vertical-align:top}
.h-RED{display:inline-block;background:#111;color:#fff;font-weight:800;font-size:10px;padding:1px 6px;border-radius:3px}
.h-YELLOW{display:inline-block;background:#888;color:#fff;font-weight:800;font-size:10px;padding:1px 6px;border-radius:3px}
.h-GREEN{display:inline-block;border:1.5px solid #333;color:#333;font-weight:800;font-size:10px;padding:0 5px;border-radius:3px;background:#fff}
.dt{display:inline-block;font-size:10px;font-weight:700;padding:0 5px;border-radius:3px;border:1px solid #555;margin-left:4px}
.dt.C{background:#333;color:#fff}
.dt.A{border-style:solid;background:#e3e3e3}
.dt.F{border-style:dashed;background:#fff;color:#555}
.id{font-family:Menlo,monospace;font-size:11px;color:#555}
.card{background:#fff;border:1px solid #bbb;border-radius:6px;padding:10px 12px;margin-bottom:10px}
.card.draft{border:2px dashed #333;background:#f4f4f4}
.card.warn{border:2px solid #222}
.card h4{margin:0 0 6px;font-size:13px}
.f{margin-bottom:8px}
.f label{display:block;font-size:10.5px;text-transform:uppercase;color:#666;margin-bottom:2px;letter-spacing:.03em}
.in{border:1px solid #aaa;background:#fff;border-radius:4px;padding:5px 8px;min-height:28px;color:#333}
.in.ph{color:#999}
.in.err{border:2px solid #111}
.in.ta{min-height:56px}
.in.lock{background:#eee;color:#555}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.grid3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px}
.grid4{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}
.kv{display:grid;grid-template-columns:150px 1fr;gap:4px 10px;font-size:12px}
.kv div:nth-child(odd){color:#666}
.tabs{display:flex;gap:0;border-bottom:2px solid #bbb;margin:10px 0}
.tabs span{padding:5px 12px;font-size:12px;color:#555}
.tabs span.on{border-bottom:3px solid #222;margin-bottom:-2px;font-weight:700;color:#222}
.ev{border-left:2px solid #999;padding:2px 0 8px 10px;margin-left:6px;position:relative;font-size:12px}
.ev:before{content:"";position:absolute;left:-6px;top:5px;width:10px;height:10px;border-radius:5px;background:#666}
.ev .who{font-weight:700}
.ev .reason{color:#444;font-style:italic}
.muted{color:#777}
.bar{height:10px;background:#ddd;border-radius:3px;overflow:hidden}
.bar b{display:block;height:100%;background:#555}
.cut{border-top:3px dashed #111;margin:6px 0;position:relative;text-align:center;font-size:10.5px;font-weight:700}
.cut span{background:#fafafa;padding:0 8px;position:relative;top:-9px}
.modal{background:#fff;border:2px solid #222;border-radius:8px;box-shadow:6px 6px 0 #bbb;padding:14px;margin:6px auto}
.dim{background:repeating-linear-gradient(45deg,#ececec,#ececec 6px,#e3e3e3 6px,#e3e3e3 12px)}
.md{font-family:Menlo,monospace;font-size:11.5px;background:#fff;border:1px solid #bbb;padding:10px;line-height:1.55;white-space:pre-wrap}
.caret{display:inline-block;border-left:2px solid #111;height:14px;vertical-align:middle;margin:0 1px;position:relative}
.caret em{position:absolute;top:-14px;left:-2px;font-size:9px;background:#111;color:#fff;padding:0 3px;font-style:normal;white-space:nowrap}
.phone{width:300px;border:3px solid #333;border-radius:26px;padding:14px 8px;background:#fafafa}
.phone .scr{border:1px solid #bbb;background:#fff;border-radius:6px;overflow:hidden;min-height:520px}
.term{background:#1e1e1e;color:#ddd;font-family:Menlo,monospace;font-size:11.5px;padding:12px;line-height:1.5;white-space:pre-wrap;border-radius:0}
.term b{color:#fff}
.term .t{color:#aaa}
.lint{font-size:11px;border:1px dashed #555;padding:1px 6px;border-radius:3px;background:#fff}
"""

NAV_ITEMS = [
  ("h","Views"),("My goals","mine",4),("Org overview","org",None),("Excaliwire","u-co",None),("Factory","u-fa",None),("Product","u-pr",None),("Operations","u-op",None),
  ("Promotions due","promo",2),("Priorities","prio",None),("Hygiene","hyg",5),("Scorecard","score",None),
  ("h","Favorites"),("★ Factory RED/YELLOW","fav",None),
  ("h","Reviews"),("Programs review (bi-wk)","rev",None),("Quarterly business review","rev2",None),
  ("h","More"),("User's Manual","man",None),("Settings","set",None),
]

def nav(active):
    out=['<div class="nav">']
    for it in NAV_ITEMS:
        if it[0]=="h": out.append(f'<div class="h">{it[1]}</div>'); continue
        label,key,c=it
        cls="on" if key==active else ""
        if key.startswith("u-"): cls+=" sub"
        cnt=f'<span class="c">{c}</span>' if c else ""
        out.append(f'<a class="{cls}">{label}{cnt}</a>')
    out.append('</div>')
    return "".join(out)

def shell(content, active="mine", url="goalie.excaliwire.com/views/my-goals", presence="", navon=True):
    top=f'''<div class="chrome"><i></i><i></i><i></i><div class="url">{url}</div></div>
<div class="top"><span class="logo">GOALIE</span><div class="search">Search goals, docs, people…  (GOAL-123 jumps straight to a goal)</div>
<span class="live">● Live</span>{presence}<span class="av" title="Tig">TK</span></div>'''
    body=f'<div class="app">{nav(active) if navon else ""}<div class="main">{content}</div></div>'
    return top+body

def H(h): return f'<span class="h-{h}">{h}</span>'
def DT(t): return f'<span class="dt {t[0]}">{t}</span>'
def P(n): return f'<b class="pin">{n}</b>'
def av(i,agent=False,title=""): return f'<span class="av{" agent" if agent else ""}" title="{title}">{i}</span>'

def frame(num,title,src,screen,notes,tenet=None,q=None,tag="Web app · desktop",assumed=False):
    tagcls="tag assumed" if assumed else "tag"
    tagtxt=("ASSUMED · " if assumed else "")+tag
    lis="".join(f'<li>{P(i+1)}<span>{n}</span></li>' for i,n in enumerate(notes))
    ten=f'<h3>Tenets applied</h3><div class="tenet">{tenet}</div>' if tenet else ""
    qq=f'<h3>Open question</h3><div class="q">{q}</div>' if q else ""
    return f'''<!doctype html><html><head><meta charset="utf-8"><style>{CSS}</style></head><body>
<div class="frame"><div class="fhead"><div class="num">{num:02d}</div><div><h1>{title}</h1><div class="src">Source: {src}</div></div><div class="{tagcls}">{tagtxt}</div></div>
<div class="body"><div class="screen">{screen}</div><aside class="notes"><h3>Annotations</h3><ol>{lis}</ol>{ten}{qq}</aside></div></div></body></html>'''
