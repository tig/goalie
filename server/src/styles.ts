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
.board{padding:20px 20px 16px}
.board h2{font-size:15px;font-weight:800;margin:0}
.head{display:flex;align-items:baseline;gap:10px;margin:0 0 6px 42px}
.scroll{overflow-x:auto}.inner{min-width:980px}
.row{display:grid;grid-template-columns:380px minmax(0,1fr);column-gap:8px;align-items:center;min-height:44px;border-top:1px solid var(--line)}
.row.weeks{border-top:0;min-height:40px;height:40px;align-items:end}
.left{display:flex;align-items:center;gap:12px;padding:10px 0;min-width:0}
.body{min-width:0;flex:1}
.rank{width:30px;height:30px;border-radius:10px;display:inline-flex;align-items:center;justify-content:center;font-weight:800;flex:none}
.title{font-weight:700;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden;overflow-wrap:anywhere}
.meta{display:flex;align-items:center;flex-wrap:wrap;gap:6px 8px;font-size:12px;color:var(--mute);margin-top:4px}
.chip{display:inline-flex;align-items:center;height:20px;padding:0 8px;border-radius:999px;font-size:12px;font-weight:800}
.ptg{font-size:12px;margin-top:4px;color:var(--ink)}.ptg b{font-weight:800}
.lane{position:relative;height:64px;overflow:hidden}
.sub .lane{height:48px}.sub .left{padding:6px 0}.sub .title{font-weight:600}
.gl{position:absolute;top:0;bottom:0;width:1px;background:var(--grid)}
.today{position:absolute;top:0;bottom:0;width:2px;background:var(--today);z-index:4}
.wk{position:absolute;bottom:6px;margin-left:5px;font-size:12px;font-weight:600;color:var(--mute);white-space:nowrap}
.todaylbl{position:absolute;top:0;transform:translateX(-50%);background:var(--today);color:var(--today-ink);font-size:12px;font-weight:800;padding:2px 8px;border-radius:999px;white-space:nowrap}
.seg{position:absolute;top:50%;height:22px;margin-top:-11px}.sub .seg{height:14px;margin-top:-7px}
.seg.first{border-radius:999px 0 0 999px}.seg.last{border-radius:0 999px 999px 0}.seg.first.last{border-radius:999px}
.ahead{background:var(--ahead)}
.slip{background:repeating-linear-gradient(135deg,var(--slip-a) 0 6px,var(--slip-b) 6px 12px)}
.tick{position:absolute;top:50%;width:3px;height:30px;margin:-15px 0 0 -1.5px;border-radius:2px;background:var(--ink);z-index:3}.sub .tick{height:20px;margin-top:-10px}
.ticklbl{position:absolute;top:2px;font-size:12px;font-weight:800;white-space:nowrap;z-index:3}
.line{position:absolute;top:50%;height:0;margin-top:-1px;z-index:1;border-top:2px solid var(--ambition-line)}
.line.Fantasy{border-top:2px dotted var(--fantasy-line)}
.dot{position:absolute;top:50%;width:8px;height:8px;margin:-4px 0 0 -4px;border-radius:50%;z-index:2;background:var(--ambition);box-shadow:0 0 0 1.5px var(--card)}
.dot.Fantasy{background:var(--card);box-shadow:inset 0 0 0 1.5px var(--fantasy),0 0 0 1.5px var(--card)}
.endlbl{position:absolute;top:calc(50% + 9px);font-size:12px;font-weight:600;white-space:nowrap;color:var(--mute)}
.endlbl.Ambition{color:var(--ambition-ink)}.endlbl.Fantasy{color:var(--fantasy-ink)}
.edge{position:absolute;top:50%;transform:translateY(-50%);font-size:12px;font-weight:700;z-index:3;background:var(--card);padding:0 4px;white-space:nowrap}
.edge.after{right:6px}.edge.before{left:6px}
.edge.Ambition{color:var(--ambition-ink)}.edge.Fantasy{color:var(--fantasy-ink)}
details>summary{list-style:none;cursor:pointer;border-radius:12px}details>summary::-webkit-details-marker{display:none}
details>summary:focus-visible{outline:3px solid var(--focus);outline-offset:-3px}
.chev{width:28px;height:28px;border-radius:50%;background:var(--control);color:var(--ink);display:inline-flex;align-items:center;justify-content:center;flex:none;margin-left:auto;margin-right:8px;transition:transform .15s}
details[open]>summary .chev{transform:rotate(180deg)}
.kids{background:var(--sub-bg)}
.cut{display:flex;align-items:center;gap:10px;margin:6px 0;color:var(--mute);font-size:12px;font-weight:800;letter-spacing:.06em;text-transform:uppercase}
.cut::before,.cut::after{content:"";flex:1;border-top:1.5px dashed var(--cut)}
.empty{padding:12px 0 4px 42px;color:var(--mute);font-size:13px}
.legend{display:flex;flex-wrap:wrap;gap:18px;justify-content:flex-end;margin-top:14px;font-size:12px;color:var(--mute)}
.legend span{display:inline-flex;align-items:center;gap:7px}
.legend p{flex-basis:100%;text-align:right;margin:0}
.sw{display:inline-block;width:28px;height:10px;border-radius:999px}
.sw.Ambition{height:0;border-top:2px solid var(--ambition-line);border-radius:0}.sw.Fantasy{height:0;border-top:2px dotted var(--fantasy-line);border-radius:0}
.signin{max-width:32rem;margin:15vh auto;text-align:center;display:block}
.when{display:none;font-size:12px;color:var(--mute);margin-top:4px}
@media (max-width:760px){.top{padding:12px 16px}main{padding:20px 16px 40px}.tab{margin-left:4px}
.board{order:1;padding:16px 12px 12px}.cards{order:2;grid-template-columns:1fr;gap:10px;margin:16px 0 0}.card{padding:14px 16px}.big{font-size:18px}
.inner{min-width:0}.row{grid-template-columns:minmax(0,1fr)}.lane,.row.weeks{display:none}.when{display:block}.head{margin-left:0}.legend{display:none}.left{padding-right:4px}}
</style>`;
