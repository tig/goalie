/**
 * The page CSS. Every color is a token on :root so an organization can reskin GOALIE.
 * Text tokens meet 4.5:1 on --card and on --ground. No text is below 12 px.
 */

/** Avatar colors. components.ts picks one by a hash of the actor id. */
export const AVATAR_COLORS = 6;

export const STYLE = `<style>
:root{--ground:#f3f8f4;--card:#ffffff;--ink:#2f3a33;--mute:#56625b;--line:#edf2ee;--grid:#eef3ef;--sub-bg:#fafcfb;--control:#f0f5f1;--cut:#c9d3cc;
--brand:#bfe6cc;--brand-ink:#17482f;--link:#1e6b45;--today:#22744a;--today-ink:#ffffff;--focus:#2c5796;
--shadow:rgba(47,58,51,.05);
--red-bg:#fbd9dd;--red-ink:#9c2a3c;--red:#e5677a;--yellow-bg:#fbefc6;--yellow-ink:#755800;--yellow:#e8c766;--green-bg:#d3f0e2;--green-ink:#1e6544;--green:#5cbf85;--none-bg:#eef2ef;--none:#b4beb7;
--ahead:#e6ece8;--ambition:#8fadd9;--ambition-line:#b7c9e6;--ambition-ink:#2c5796;--fantasy:#a99ce0;--fantasy-line:#cfc6ee;--fantasy-ink:#5e4fa8;--slip-a:#f6b8c0;--slip-b:#fdeef0;
--av-0-bg:#e3dafb;--av-0-ink:#4a3a91;--av-1-bg:#fadbe7;--av-1-ink:#9a2f5a;--av-2-bg:#d6ecfa;--av-2-ink:#1f5a85;--av-3-bg:#fde3cc;--av-3-ink:#8a4a12;--av-4-bg:#d3f0e2;--av-4-ink:#1e6544;--av-5-bg:#fbefc6;--av-5-ink:#6b5000;
--hover:#f7faf8;--tip-bg:#2f3a33;--tip-ink:#ffffff;--tip-shadow:rgba(47,58,51,.22);
--radius:18px}
body{margin:0;background:var(--ground);color:var(--ink);font:14px/1.4 var(--font)}
a{color:var(--link)}
.top{position:sticky;top:0;z-index:50;display:flex;align-items:center;gap:14px;padding:14px 32px;background:var(--card);border-bottom:1px solid var(--line)}
.logo{width:34px;height:34px;border-radius:11px;background:var(--brand);color:var(--brand-ink);display:inline-flex;align-items:center;justify-content:center;font-weight:800;font-size:16px}
.brand{font-weight:800;font-size:18px}.org{color:var(--mute)}
.tab{height:34px;padding:0 16px;border-radius:999px;background:var(--brand);color:var(--brand-ink);font-weight:700;display:inline-flex;align-items:center;margin-left:16px}
.me{margin-left:auto}
.av{width:24px;height:24px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-weight:800;font-size:12px;flex:none}
.av.mine{box-shadow:0 0 0 2px var(--card),0 0 0 3.5px var(--ink)}
.me .av{width:30px;height:30px;font-size:13px;box-shadow:none}
.who{display:inline-flex;align-items:center;gap:6px;color:var(--ink);font-weight:600}
main{max-width:1312px;margin:0 auto;padding:28px 32px 48px;box-sizing:border-box;display:flex;flex-direction:column}
h1{font-size:26px;font-weight:800;margin:0 0 20px}
.cards{display:grid;grid-template-columns:1.6fr 1fr 1fr;gap:16px;margin-bottom:16px}
.card{background:var(--card);border-radius:var(--radius);box-shadow:0 1px 2px var(--shadow),0 4px 16px var(--shadow);padding:18px 20px;min-width:0}
.lbl{font-size:12px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--mute);margin:0 0 8px}
.big{font-size:22px;font-weight:800;margin:0 0 8px;display:flex;align-items:baseline;gap:10px;flex-wrap:wrap}.big small{font-size:14px;font-weight:700;color:var(--ink)}
.counts{font-size:18px;font-weight:800;margin:0 0 8px}
.meter{display:flex;gap:3px;margin:0 0 10px}.meter span{flex:1;height:8px;border-radius:999px}
.note{font-size:13px;margin:0 0 6px}.small{font-size:12px;color:var(--mute)}
.late{color:var(--red-ink);font-weight:700;white-space:nowrap}
.date{white-space:nowrap}
.muted{color:var(--mute)}
.vh{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.has-tip{position:relative;display:inline-flex;align-items:center;gap:6px;cursor:help}
.q{width:16px;height:16px;border-radius:50%;background:var(--control);color:var(--mute);font-size:11px;display:inline-flex;align-items:center;justify-content:center;letter-spacing:0}
.count{display:inline-flex;align-items:center;gap:6px;margin-right:14px}
.hdot{width:10px;height:10px;border-radius:50%;flex:none;display:inline-block}
.hdot.none{box-shadow:inset 0 0 0 1.5px var(--none)}
.board{padding:18px 20px 14px;--left:380px;--gap:12px}
.bhead{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:0 0 6px;flex-wrap:wrap}
.board h2{font-size:16px;font-weight:800;margin:0}
.range{display:flex;align-items:center;gap:8px}
.navb{width:34px;height:34px;border-radius:50%;background:var(--card);box-shadow:0 1px 2px var(--shadow),0 4px 12px var(--shadow);color:var(--ink);font-weight:800;font-size:18px;display:inline-flex;align-items:center;justify-content:center;text-decoration:none}
.navb:hover{background:var(--control)}
.rangelbl{min-width:150px;text-align:center;font-weight:700;font-size:13px}
.btn{height:34px;padding:0 14px;border-radius:999px;border:1.5px solid var(--cut);color:var(--ink);font-weight:700;font-size:13px;display:inline-flex;align-items:center;text-decoration:none}
.btn:hover{background:var(--control)}
.navb:focus-visible,.btn:focus-visible,.row:focus-visible,.lg:focus-visible,.has-tip:focus-visible{outline:3px solid var(--focus);outline-offset:2px}
.scroll{overflow-x:auto}.tl{min-width:980px}
.axis{display:grid;grid-template-columns:var(--left) minmax(0,1fr);column-gap:var(--gap);height:44px}
.ticks{position:relative}
.wk{position:absolute;bottom:6px;margin-left:5px;font-size:12px;font-weight:600;color:var(--mute);white-space:nowrap}
.todaylbl{position:absolute;top:0;transform:translateX(-50%);background:var(--today);color:var(--today-ink);font-size:11px;font-weight:800;padding:1px 8px;border-radius:999px;white-space:nowrap;z-index:6}
.tlbody{position:relative;border-top:1px solid var(--line)}
.grid,.nowline{position:absolute;top:0;bottom:0;left:calc(var(--left) + var(--gap));right:0;pointer-events:none}
.grid{z-index:1}.nowline{z-index:5}
.gl{position:absolute;top:0;bottom:0;width:1px;background:var(--grid)}
.today{position:absolute;top:0;bottom:0;width:2px;margin-left:-1px;background:var(--today)}
.group{border-bottom:1px solid var(--line);padding:4px 0}
.row{position:relative;display:grid;grid-template-columns:var(--left) minmax(0,1fr);column-gap:var(--gap);align-items:center;min-height:52px;border-radius:12px}
.row:hover{background:var(--hover)}
.left{position:relative;display:flex;align-items:center;gap:10px;min-width:0;padding:6px 0 6px calc(var(--depth) * 26px)}
.d1 .left,.d2 .left{min-height:40px}
.d1,.d2{min-height:42px}
details{position:relative}
.kids>.row::after,.kids>details::after{content:"";position:absolute;left:calc(var(--pd) * 26px + 13px);top:-6px;bottom:0;border-left:1.5px solid var(--cut);pointer-events:none}
.kids>.row:last-child::after{bottom:50%}
.kids>details:last-child::after{bottom:auto;height:27px}
.d1 .left::before,.d2 .left::before{content:"";position:absolute;left:calc(var(--depth) * 26px - 13px);top:50%;width:13px;border-top:1.5px solid var(--cut)}
.title{flex:1;min-width:0;font-weight:700;font-size:14px;line-height:1.3;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden}
.d1 .title{font-weight:600;font-size:13.5px}
.d2 .title{font-weight:500;font-size:13px;color:var(--ink)}
.rank{width:28px;height:28px;border-radius:9px;display:inline-flex;align-items:center;justify-content:center;font-weight:800;flex:none}
.d1 .hdot,.d2 .hdot{margin:0 9px}
.chev{display:inline-flex;align-items:center;gap:4px;height:26px;padding:0 9px;border-radius:999px;background:var(--control);color:var(--mute);font-size:12px;font-weight:700;flex:none;margin-right:4px}
.chev svg{transition:transform .15s}
details[open]>summary .chev svg{transform:rotate(180deg)}
details>summary{list-style:none;cursor:pointer}details>summary::-webkit-details-marker{display:none}
details>summary:focus-visible{outline:3px solid var(--focus);outline-offset:-3px;border-radius:12px}
.tip{display:none;position:absolute;left:calc(var(--depth) * 26px + 38px);top:calc(100% - 4px);z-index:30;min-width:220px;max-width:360px;padding:10px 12px;border-radius:12px;background:var(--tip-bg);color:var(--tip-ink);font-size:12px;line-height:1.5;box-shadow:0 8px 28px var(--tip-shadow)}
.tip>div+div{margin-top:2px}.tip b{font-weight:800}
.tipkey{font-weight:800;letter-spacing:.02em}
.row:hover .tip,.row:focus-visible .tip,.lg:hover .tip,.lg:focus-visible .tip,.has-tip:hover .tip,.has-tip:focus-visible .tip{display:block}
.has-tip .tip,.lg .tip{left:0;top:calc(100% + 6px);text-transform:none;letter-spacing:0;font-weight:500;white-space:normal}
.lane{position:relative;height:100%;min-height:40px}
.seg{position:absolute;top:50%;height:20px;margin-top:-10px;z-index:2}
.d1 .seg,.d2 .seg{height:12px;margin-top:-6px}
.seg.first{border-radius:999px 0 0 999px}.seg.last{border-radius:0 999px 999px 0}.seg.first.last{border-radius:999px}
.ahead{background:var(--ahead)}
.slip{background:repeating-linear-gradient(135deg,var(--slip-a) 0 6px,var(--slip-b) 6px 12px)}
.tick{position:absolute;top:50%;width:3px;height:26px;margin:-13px 0 0 -1.5px;border-radius:2px;background:var(--ink);z-index:3}
.d1 .tick,.d2 .tick{height:18px;margin-top:-9px}
.ticklbl{position:absolute;bottom:calc(50% + 11px);font-size:11px;font-weight:800;white-space:nowrap;z-index:3}
.line{position:absolute;top:50%;height:0;margin-top:-1px;z-index:2;border-top:2px solid var(--ambition-line)}
.line.Fantasy{border-top:2px dotted var(--fantasy-line)}
.dot{position:absolute;top:50%;width:9px;height:9px;margin:-4.5px 0 0 -4.5px;border-radius:50%;z-index:3;background:var(--ambition);box-shadow:0 0 0 2px var(--card)}
.dot.Fantasy{background:var(--card);box-shadow:inset 0 0 0 1.5px var(--fantasy),0 0 0 2px var(--card)}
.endlbl{position:absolute;top:calc(50% + 8px);font-size:11px;font-weight:600;white-space:nowrap;color:var(--mute);z-index:3}
.endlbl.Ambition{color:var(--ambition-ink)}.endlbl.Fantasy{color:var(--fantasy-ink)}
.edge{position:absolute;top:50%;transform:translateY(-50%);font-size:11px;font-weight:700;z-index:3;background:var(--card);padding:2px 6px;border-radius:999px;white-space:nowrap}
.edge.after{right:4px}.edge.before{left:4px}
.edge.Ambition{color:var(--ambition-ink)}.edge.Fantasy{color:var(--fantasy-ink)}
.kids{padding-bottom:4px}
.cut{position:relative;z-index:6;display:flex;align-items:center;gap:10px;margin:10px 0 4px;color:var(--mute);font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}
.cut::before,.cut::after{content:"";flex:1;border-top:1.5px dashed var(--cut)}
.cut span{background:var(--card);padding:0 4px}
.empty{position:relative;z-index:6;padding:6px 0 4px 38px;color:var(--mute);font-size:13px;margin:0}
.legend{display:flex;flex-wrap:wrap;gap:6px 20px;justify-content:flex-end;margin-top:12px;font-size:12px;color:var(--mute)}
.lg{position:relative;display:inline-flex;align-items:center;gap:7px}
.lg[tabindex]{cursor:help;text-decoration:underline dotted var(--cut);text-underline-offset:3px}
.legend .tip{left:auto;right:0;width:260px}
.sw{display:inline-block;width:22px;height:8px;border-radius:999px}
.sw.health{background:var(--green)}.sw.ahead{background:var(--ahead)}.sw.slip{background:repeating-linear-gradient(135deg,var(--slip-a) 0 4px,var(--slip-b) 4px 8px)}
.sw.Ambition{height:0;border-top:2px solid var(--ambition-line);border-radius:0}.sw.Fantasy{height:0;border-top:2px dotted var(--fantasy);border-radius:0}
.signin{max-width:32rem;margin:15vh auto;text-align:center;display:block}
.when{display:none;font-size:12px;color:var(--mute);padding:0 0 6px calc(var(--depth, 0) * 26px + 38px)}
@media (max-width:760px){.top{padding:12px 16px}main{padding:20px 16px 40px}.tab{margin-left:4px}
.board{order:1;padding:14px 12px 12px;--left:100%;--gap:0px}.cards{order:2;grid-template-columns:1fr;gap:10px;margin:16px 0 0}.card{padding:14px 16px}.big{font-size:18px}
.tl{min-width:0}.row{grid-template-columns:minmax(0,1fr)}.left{padding-right:4px}.lane,.axis,.grid,.nowline{display:none}.when{display:block}.legend{display:none}.rangelbl{display:none}}
</style>`;
