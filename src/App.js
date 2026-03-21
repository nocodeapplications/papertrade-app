import React, { useState, useEffect, useCallback } from 'react';
import { UserProvider, useUser } from './UserContext';
import AuthScreen from './components/AuthScreen';
import StockModal from './components/StockModal';
import { useMarket, STOCKS, CRYPTOS, UNIVERSE, getName, fmtPrice } from './useMarket';
import { useAI } from './useAI';

const THEMES = [
  { id: 'warmgray', bg: '#FAFAFA', shadow: '0 0 0 1px rgba(0,0,0,0.18)', title: 'Warm Gray' },
  { id: 'coolgray', bg: '#ECEFF1', shadow: '0 0 0 1px rgba(0,0,0,0.13)', title: 'Cool Gray' },
  { id: 'cream',    bg: '#FDFBF7', shadow: '0 0 0 1px rgba(80,60,20,0.2)', title: 'Cream' },
  { id: 'dark',     bg: '#111111', shadow: 'none', title: 'Dark' },
  { id: 'oatmeal',  bg: '#F2EDE8', shadow: '0 0 0 1px rgba(90,65,40,0.2)', title: 'Oatmeal' },
];

// ─── Inner app (shown after login) ─────────────────────────
function TradingApp() {
  const { currentUser, userData, updateData, setTheme, logout,
          getAICache, setAICache, getCryptoCache, setCryptoCache } = useUser();
  const { prices, loadingMarket, fetchAll, fetchCrypto, refreshPrice } = useMarket();
  const { getAIPicks, getCloseSignals, getCoverSignals, getCryptoRecs } = useAI();

  const [tab, setTab] = useState('ai');
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState({ msg: '', show: false });
  const [search, setSearch] = useState('');
  const [showSearch, setShowSearch] = useState(false);

  // AI state
  const [buyRecs, setBuyRecs] = useState([]);
  const [shortRecs, setShortRecs] = useState([]);
  const [aiTs, setAiTs] = useState('');
  const [loadingAI, setLoadingAI] = useState(false);

  // Signals state
  const [longSigs, setLongSigs] = useState(null);
  const [shortSigs, setShortSigs] = useState(null);
  const [loadingSigs, setLoadingSigs] = useState(false);

  // Crypto state
  const [cryptoRecs, setCryptoRecs] = useState([]);
  const [cryptoTs, setCryptoTs] = useState('');
  const [loadingCrypto, setLoadingCrypto] = useState(false);

  const cash = userData?.cash ?? 10000;
  const longs = userData?.longs ?? {};
  const shortPos = userData?.shortPos ?? {};
  const history = userData?.history ?? [];
  const theme = userData?.theme ?? 'warmgray';

  // Fetch stock prices on mount
  useEffect(() => { fetchAll(); }, []); // eslint-disable-line

  // Load AI picks on mount (from cache or fresh)
  useEffect(() => {
    const cached = getAICache();
    if (cached) {
      setBuyRecs(cached.buys || []);
      setShortRecs(cached.shorts || []);
      setAiTs('Cached · ' + new Date(userData?.aiCache?.ts).toLocaleTimeString());
    } else {
      loadAIPicks();
    }
  }, []); // eslint-disable-line

  // Stats
  const longValue = Object.keys(longs).filter(s => longs[s] > 0)
    .reduce((a, s) => a + (prices[s]?.price || 0) * longs[s], 0);
  const shortPnL = Object.keys(shortPos).filter(s => shortPos[s]?.qty > 0)
    .reduce((a, s) => {
      const sp = shortPos[s];
      return a + sp.qty * (sp.entryPrice - (prices[s]?.price || sp.entryPrice));
    }, 0);
  const totalPnL = (cash + longValue + shortPnL) - 10000;

  // ─── TRADE EXECUTION ───────────────────────────────────────
  const executeTrade = useCallback((sym, mode, qty, price) => {
    const total = price * qty;
    updateData(prev => {
      let { cash, longs, shortPos, history } = { ...prev };
      longs = { ...longs };
      shortPos = { ...shortPos };

      if (mode === 'buy') {
        cash -= total;
        longs[sym] = (longs[sym] || 0) + qty;
        showToast(`Bought ${qty} ${sym.replace('-USD','')} @ $${price.toFixed(2)}`);
      } else if (mode === 'sell') {
        cash += total;
        longs[sym] -= qty;
        showToast(`Sold ${qty} ${sym.replace('-USD','')} @ $${price.toFixed(2)}`);
      } else if (mode === 'short') {
        const margin = total * 0.5;
        cash -= margin;
        if (!shortPos[sym] || shortPos[sym].qty === 0) {
          shortPos[sym] = { qty, entryPrice: price, margin };
        } else {
          const pr = shortPos[sym];
          const nq = pr.qty + qty;
          shortPos[sym] = { qty: nq, entryPrice: (pr.entryPrice * pr.qty + price * qty) / nq, margin: pr.margin + margin };
        }
        showToast(`Shorted ${qty} ${sym.replace('-USD','')} @ $${price.toFixed(2)}`);
      } else if (mode === 'cover') {
        const sp = shortPos[sym];
        const pnl = (sp.entryPrice - price) * qty;
        const mr = (sp.margin / sp.qty) * qty;
        cash += mr + pnl - total;
        shortPos[sym] = { ...sp, qty: sp.qty - qty };
        showToast(`Covered ${qty} ${sym.replace('-USD','')} P&L: ${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}`);
      }

      const newHistory = [...(history || []), {
        sym, type: mode, qty, price,
        total: mode === 'short' ? total * 0.5 : total,
        date: new Date().toLocaleDateString(),
      }];
      return { ...prev, cash, longs, shortPos, history: newHistory };
    });
  }, [updateData]); // eslint-disable-line

  // ─── AI PICKS ──────────────────────────────────────────────
  async function loadAIPicks(force = false) {
    if (loadingAI) return;
    if (!force) {
      const cached = getAICache();
      if (cached) {
        setBuyRecs(cached.buys || []);
        setShortRecs(cached.shorts || []);
        return;
      }
    }
    setLoadingAI(true);
    setBuyRecs([]); setShortRecs([]);
    const priceList = Object.keys(prices).length < 4 ? {} : prices;
    const ctx = STOCKS.map(s => {
      const p = priceList[s.sym];
      return p ? `${s.sym}: $${p.price.toFixed(2)} ${p.pct >= 0 ? '+' : ''}${p.pct.toFixed(2)}%` : `${s.sym}: N/A`;
    }).join('\n');
    try {
      const result = await getAIPicks(ctx);
      const buys = (result.buys || []).slice(0, 5);
      const shorts = (result.shorts || []).slice(0, 5);
      setBuyRecs(buys); setShortRecs(shorts);
      setAICache({ buys, shorts });
      setAiTs('Updated ' + new Date().toLocaleTimeString());
    } catch {
      setBuyRecs(null); setShortRecs(null);
    }
    setLoadingAI(false);
  }

  // ─── SIGNALS ───────────────────────────────────────────────
  async function loadSignals() {
    if (loadingSigs) return;
    setLoadingSigs(true);
    setLongSigs(null); setShortSigs(null);

    const lo = Object.keys(longs).filter(s => longs[s] > 0);
    const so = Object.keys(shortPos).filter(s => shortPos[s]?.qty > 0);

    if (lo.length) {
      const ctx = lo.map(s => {
        const p = prices[s];
        return `${s}: $${p?.price?.toFixed(2) || '?'} (${p?.pct >= 0 ? '+' : ''}${p?.pct?.toFixed(2) || '?'}%), ${longs[s]} shares`;
      }).join('\n');
      try { setLongSigs(await getCloseSignals(ctx)); } catch { setLongSigs([]); }
    } else { setLongSigs([]); }

    if (so.length) {
      const ctx = so.map(s => {
        const p = prices[s]; const sp = shortPos[s];
        const pnl = sp.qty * (sp.entryPrice - (p?.price || sp.entryPrice));
        return `${s}: shorted ${sp.qty}@$${sp.entryPrice.toFixed(2)}, now $${p?.price?.toFixed(2) || '?'}, P&L $${pnl.toFixed(2)}`;
      }).join('\n');
      try { setShortSigs(await getCoverSignals(ctx)); } catch { setShortSigs([]); }
    } else { setShortSigs([]); }

    setLoadingSigs(false);
  }

  // ─── CRYPTO ────────────────────────────────────────────────
  async function loadCrypto(force = false) {
    if (loadingCrypto) return;
    if (!force) {
      const cached = getCryptoCache();
      if (cached) { setCryptoRecs(cached); return; }
    }
    setLoadingCrypto(true);
    setCryptoRecs([]);
    await fetchCrypto();
    const ctx = CRYPTOS.map(c => {
      const p = prices[c.sym];
      return p ? `${c.ticker}: $${p.price.toFixed(2)} ${p.pct >= 0 ? '+' : ''}${p.pct.toFixed(2)}%` : `${c.ticker}: N/A`;
    }).join('\n');
    try {
      const recs = await getCryptoRecs(ctx);
      setCryptoRecs(recs);
      setCryptoCache(recs);
      setCryptoTs('Updated ' + new Date().toLocaleTimeString());
    } catch { setCryptoRecs(null); }
    setLoadingCrypto(false);
  }

  // ─── TAB SWITCH ────────────────────────────────────────────
  function switchTab(t) {
    setTab(t);
    if (t === 'signals' && longSigs === null) loadSignals();
    if (t === 'crypto' && cryptoRecs.length === 0) loadCrypto();
  }

  // ─── OPEN MODAL ────────────────────────────────────────────
  async function openModal(sym) {
    if (!prices[sym]) await refreshPrice(sym);
    setModal(sym);
  }

  // ─── TOAST ─────────────────────────────────────────────────
  function showToast(msg) {
    setToast({ msg, show: true });
    setTimeout(() => setToast({ msg: '', show: false }), 2800);
  }

  // ─── SEARCH ────────────────────────────────────────────────
  const searchMatches = search.trim()
    ? UNIVERSE.filter(s =>
        s.sym.toUpperCase().startsWith(search.toUpperCase()) ||
        s.name.toUpperCase().includes(search.toUpperCase()) ||
        (s.ticker && s.ticker.toUpperCase().startsWith(search.toUpperCase()))
      ).slice(0, 6)
    : [];

  // ─── RENDER HELPERS ────────────────────────────────────────
  function PriceCell({ sym }) {
    const p = prices[sym];
    if (!p) return <div className="cprice">—</div>;
    return (
      <div className="cprice">
        {fmtPrice(p.price, sym)}
        <br />
        <span className={`chg ${p.pct >= 0 ? 'pos' : 'neg'}`}>{p.pct >= 0 ? '+' : ''}{p.pct.toFixed(2)}%</span>
      </div>
    );
  }

  function Spinner() {
    return <div className="lrow"><div className="spinner" /><span>Loading…</span></div>;
  }

  function ConfPill({ c, type }) {
    const cls = type === 'short'
      ? (c === 'High' ? 'r-pill' : c === 'Medium' ? 'y-pill' : 'b-pill')
      : (c === 'High' ? 'g-pill' : c === 'Medium' ? 'y-pill' : 'b-pill');
    return <span className={`pill ${cls}`}>{c}</span>;
  }

  // ─── TABS CONTENT ──────────────────────────────────────────
  function AIPicksTab() {
    return (
      <div className="sec">
        <div className="disc">AI day-trading picks — top 5 buys &amp; top 5 shorts. Not financial advice.</div>
        <div className="rbar">
          <span className="ts">{aiTs || '—'}</span>
          <button className="rfbtn" onClick={() => { loadAIPicks(true); }}>↻ Refresh</button>
        </div>

        <div className="divider">Top 5 buys today <span className="pill g-pill">LONG</span></div>
        {loadingAI ? <Spinner /> : buyRecs === null
          ? <div className="empty">Could not load. Try refreshing.</div>
          : buyRecs.length === 0 ? <Spinner />
          : buyRecs.map((r, i) => (
            <div key={r.sym} className="card" onClick={() => openModal(r.sym)}>
              <div className="card-row">
                <div><div className="csym"><span className="rank">#{i+1}</span>{r.sym}</div><div className="cname">{getName(r.sym)}</div></div>
                <PriceCell sym={r.sym} />
              </div>
              <div className="reason">{r.reason}</div>
              <div className="sig-row">
                <span className="sig-note">Exit: {r.exit || '—'}</span>
                <ConfPill c={r.confidence} />
              </div>
            </div>
          ))
        }

        <div className="divider" style={{ marginTop: 4 }}>Top 5 shorts today <span className="pill r-pill">SHORT</span></div>
        {loadingAI ? <Spinner /> : shortRecs === null
          ? <div className="empty">Could not load. Try refreshing.</div>
          : shortRecs.length === 0 ? <Spinner />
          : shortRecs.map((r, i) => (
            <div key={r.sym} className="card" onClick={() => openModal(r.sym)}>
              <div className="card-row">
                <div><div className="csym"><span className="rank">#{i+1}</span>{r.sym}</div><div className="cname">{getName(r.sym)}</div></div>
                <PriceCell sym={r.sym} />
              </div>
              <div className="reason">{r.reason}</div>
              <div className="sig-row">
                <span className="sig-note">Cover: {r.cover || '—'}</span>
                <ConfPill c={r.confidence} type="short" />
              </div>
            </div>
          ))
        }
      </div>
    );
  }

  function SignalsTab() {
    const lo = Object.keys(longs).filter(s => longs[s] > 0);
    const so = Object.keys(shortPos).filter(s => shortPos[s]?.qty > 0);
    return (
      <div className="sec">
        <div className="disc">AI exit analysis for your open positions.</div>
        <div className="rbar"><span /><button className="rfbtn" onClick={loadSignals}>↻ Refresh</button></div>

        <div className="divider">Long positions — close signals <span className="pill g-pill">LONG</span></div>
        {loadingSigs ? <Spinner />
         : lo.length === 0 ? <div className="empty">No long positions yet.</div>
         : longSigs === null ? <Spinner />
         : longSigs.map(r => {
            const p = prices[r.sym]; const pct = p ? ((p.pct >= 0 ? '+' : '') + p.pct.toFixed(2) + '%') : '';
            const ac = r.action === 'CLOSE' ? 'g-pill' : r.urgency === 'Monitor' ? 'y-pill' : 'b-pill';
            return (
              <div key={r.sym} className="card" onClick={() => openModal(r.sym)}>
                <div className="card-row">
                  <div><div className="csym">{r.sym}<span className="long-tag">LONG</span></div><div className="cname">{longs[r.sym]} shares</div></div>
                  <div>{pct && <span className={`chg ${p.pct >= 0 ? 'pos' : 'neg'}`}>{pct}</span>}</div>
                </div>
                <div className="reason">{r.reason}</div>
                <div className="sig-row"><span className={`pill ${ac}`}>{r.action === 'CLOSE' ? 'Exit now' : r.urgency}</span></div>
              </div>
            );
          })}

        <div className="divider" style={{ marginTop: 4 }}>Short positions — buy-back signals <span className="pill r-pill">SHORT</span></div>
        {loadingSigs ? <Spinner />
         : so.length === 0 ? <div className="empty">No short positions yet.</div>
         : shortSigs === null ? <Spinner />
         : shortSigs.map(r => {
            const sp = shortPos[r.sym]; const p = prices[r.sym];
            const pnl = sp ? sp.qty * (sp.entryPrice - (p?.price || sp.entryPrice)) : 0;
            const ac = r.action === 'COVER' ? 'b-pill' : r.urgency === 'Monitor' ? 'y-pill' : 'g-pill';
            return (
              <div key={r.sym} className="card" onClick={() => openModal(r.sym)}>
                <div className="card-row">
                  <div><div className="csym">{r.sym}<span className="short-tag">SHORT</span></div><div className="cname">{sp?.qty} @ ${sp?.entryPrice?.toFixed(2)}</div></div>
                  <div className="cprice" style={{ color: pnl >= 0 ? 'var(--green)' : 'var(--red)' }}>{pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}</div>
                </div>
                <div className="reason">{r.reason}</div>
                <div className="sig-row"><span className={`pill ${ac}`}>{r.action === 'COVER' ? 'Cover now' : r.urgency}</span></div>
              </div>
            );
          })}
      </div>
    );
  }

  function CryptoTab() {
    return (
      <div className="sec">
        <div className="disc">AI day-trading signals for top cryptos. OI is AI-estimated.</div>
        <div className="rbar">
          <span className="ts">{cryptoTs || '—'}</span>
          <button className="rfbtn" onClick={() => loadCrypto(true)}>↻ Refresh</button>
        </div>
        {loadingCrypto ? <Spinner />
         : cryptoRecs === null ? <div className="empty">Could not load. Try refreshing.</div>
         : cryptoRecs.length === 0 ? <Spinner />
         : cryptoRecs.map(c => {
            const crypto = CRYPTOS.find(x => x.ticker === c.ticker);
            const p = crypto ? prices[crypto.sym] : null;
            const recCls = c.rec === 'BUY' ? 'g-pill' : c.rec === 'SELL' ? 'r-pill' : 'y-pill';
            const oiCls = (c.oi_tier === 'Very High' || c.oi_tier === 'High') ? 'g-pill' : c.oi_tier === 'Medium' ? 'y-pill' : 'b-pill';
            const confCls = c.confidence === 'High' ? 'g-pill' : c.confidence === 'Medium' ? 'y-pill' : 'r-pill';
            return (
              <div key={c.ticker} className="card" onClick={() => crypto && openModal(crypto.sym)}>
                <div className="card-row">
                  <div><div className="csym">{c.ticker}</div><div className="cname">{crypto?.name || c.ticker}</div></div>
                  {p ? (
                    <div className="cprice">
                      {fmtPrice(p.price, crypto?.sym)}
                      <br />
                      <span className={`chg ${p.pct >= 0 ? 'pos' : 'neg'}`}>{p.pct >= 0 ? '+' : ''}{p.pct.toFixed(2)}%</span>
                    </div>
                  ) : <div className="cprice">—</div>}
                </div>
                <div className="oi-grid">
                  <div className="oi-cell"><div className="oi-lbl">Signal</div><span className={`pill ${recCls}`}>{c.rec}</span></div>
                  <div className="oi-cell"><div className="oi-lbl">OI Tier</div><span className={`pill ${oiCls}`}>{c.oi_tier}</span></div>
                  <div className="oi-cell"><div className="oi-lbl">Confidence</div><span className={`pill ${confCls}`}>{c.confidence}</span></div>
                </div>
                <div className="reason">{c.reason}</div>
                {c.oi_note && <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 5, fontFamily: 'var(--font-display)' }}>{c.oi_note}</div>}
              </div>
            );
          })}
      </div>
    );
  }

  function MarketTab() {
    return (
      <div className="sec">
        <div className="search-wrap">
          <span className="search-ic">⌕</span>
          <input className="sinput" type="text" placeholder="Search ticker or name…" value={search}
            onChange={e => { setSearch(e.target.value); setShowSearch(true); }}
            onFocus={() => setShowSearch(true)}
          />
        </div>
        {showSearch && searchMatches.length > 0 && (
          <div className="sdrop">
            {searchMatches.map(s => (
              <div key={s.sym} className="sdi" onClick={() => { setSearch(''); setShowSearch(false); openModal(s.sym); }}>
                <span className="sym">{s.ticker || s.sym}</span>
                <span className="nm">{s.name}</span>
              </div>
            ))}
          </div>
        )}
        {loadingMarket ? <Spinner /> : STOCKS.filter(s => prices[s.sym]).map(s => (
          <div key={s.sym} className="card" onClick={() => openModal(s.sym)}>
            <div className="card-row">
              <div><div className="csym">{s.sym}</div><div className="cname">{s.name}</div></div>
              <PriceCell sym={s.sym} />
            </div>
          </div>
        ))}
      </div>
    );
  }

  function PortfolioTab() {
    const lo = Object.keys(longs).filter(s => longs[s] > 0);
    const so = Object.keys(shortPos).filter(s => shortPos[s]?.qty > 0);
    const totalLong = lo.reduce((a, s) => a + (prices[s]?.price || 0) * longs[s], 0);
    if (!lo.length && !so.length) return <div className="sec"><div className="empty">No open positions yet.<br />Head to AI Picks to get started.</div></div>;
    return (
      <div className="sec">
        {lo.length > 0 && (
          <>
            <div className="divider">Long positions <span className="pill g-pill">LONG</span></div>
            {lo.map(s => {
              const p = prices[s]; const val = (p?.price || 0) * longs[s];
              const bar = totalLong > 0 ? Math.round((val / totalLong) * 100) : 0;
              const pct = p ? ((p.pct >= 0 ? '+' : '') + p.pct.toFixed(2) + '%') : '';
              return (
                <div key={s} className="card" onClick={() => openModal(s)}>
                  <div className="card-row">
                    <div><div className="csym">{s}<span className="long-tag">LONG</span></div><div className="cname">{longs[s]} shares</div></div>
                    <div className="cprice">{fmtPrice(val, s)}{pct && <><br /><span className={`chg ${p.pct >= 0 ? 'pos' : 'neg'}`}>{pct}</span></>}</div>
                  </div>
                  <div className="hbar"><div className="hfill" style={{ width: `${bar}%`, background: 'var(--green)' }} /></div>
                </div>
              );
            })}
          </>
        )}
        {so.length > 0 && (
          <>
            <div className="divider" style={{ marginTop: 8 }}>Short positions <span className="pill r-pill">SHORT</span></div>
            {so.map(s => {
              const p = prices[s]; const sp = shortPos[s];
              const pnl = sp.qty * (sp.entryPrice - (p?.price || sp.entryPrice));
              return (
                <div key={s} className="card" onClick={() => openModal(s)}>
                  <div className="card-row">
                    <div><div className="csym">{s}<span className="short-tag">SHORT</span></div><div className="cname">{sp.qty} shares @ ${sp.entryPrice.toFixed(2)}</div></div>
                    <div className="cprice" style={{ color: pnl >= 0 ? 'var(--green)' : 'var(--red)' }}>{pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}</div>
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>
    );
  }

  function HistoryTab() {
    if (!history.length) return <div className="sec"><div className="empty">No trades yet.</div></div>;
    const labels = { buy: 'LONG', sell: 'SELL', short: 'SHORT', cover: 'COVER' };
    return (
      <div className="sec">
        {[...history].reverse().map((t, i) => {
          const isShort = t.type === 'short';
          const isBuy = t.type === 'buy';
          return (
            <div key={i} className="card">
              <div className="card-row">
                <div>
                  <div className="csym">
                    {t.sym.replace('-USD', '')}
                    <span className={isBuy ? 'long-tag' : isShort ? 'short-tag' : ''} style={{ marginLeft: 7, fontSize: 10, padding: '2px 6px', borderRadius: 4 }}>
                      {labels[t.type] || t.type}
                    </span>
                  </div>
                  <div className="cname">{t.date} · {t.qty} shares @ ${t.price?.toFixed(2)}</div>
                </div>
                <div className="cprice">${t.total?.toFixed(2)}</div>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  // ─── MAIN RENDER ───────────────────────────────────────────
  return (
    <div className="app" onClick={() => { if (showSearch) setShowSearch(false); }}>
      {/* Header */}
      <div className="hdr">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div className="logo">Paper<span>Trade</span></div>
          <div className="user-badge">{currentUser}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div className="theme-switcher">
            {THEMES.map(t => (
              <button key={t.id} title={t.title}
                className={`theme-dot${theme === t.id ? ' active' : ''}`}
                onClick={() => setTheme(t.id)}
                style={{ background: t.bg, boxShadow: t.shadow }}
              />
            ))}
          </div>
          <div className="cash-pill">${cash.toFixed(2)}</div>
          <button className="logout-btn" onClick={logout}>Sign out</button>
        </div>
      </div>

      {/* Stats */}
      <div className="stats">
        <div className="st"><div className="stl">Total</div><div className="stv">${Math.round(cash + longValue).toLocaleString()}</div></div>
        <div className="st"><div className="stl">Longs</div><div className="stv">${Math.round(longValue).toLocaleString()}</div></div>
        <div className="st"><div className="stl">Shorts</div><div className={`stv ${shortPnL >= 0 ? 'pos' : 'neg'}`}>{shortPnL >= 0 ? '+' : ''}${Math.abs(Math.round(shortPnL)).toLocaleString()}</div></div>
        <div className="st"><div className="stl">P&amp;L</div><div className={`stv ${totalPnL >= 0 ? 'pos' : 'neg'}`}>{totalPnL >= 0 ? '+' : ''}${Math.abs(totalPnL).toFixed(2)}</div></div>
      </div>

      {/* Tab bar */}
      <div className="tabbar">
        {[['ai','AI Picks'],['signals','Signals'],['crypto','Crypto'],['market','Market'],['portfolio','Portfolio'],['history','History']].map(([t, label]) => (
          <button key={t} className={`tb${tab === t ? ' on' : ''}`} onClick={() => switchTab(t)}>{label}</button>
        ))}
      </div>

      {/* Content */}
      <div className="content">
        {tab === 'ai' && <AIPicksTab />}
        {tab === 'signals' && <SignalsTab />}
        {tab === 'crypto' && <CryptoTab />}
        {tab === 'market' && <MarketTab />}
        {tab === 'portfolio' && <PortfolioTab />}
        {tab === 'history' && <HistoryTab />}
      </div>

      {/* Bottom nav */}
      <nav className="nav">
        {[['ai','★','AI Picks'],['crypto','◈','Crypto'],['market','▦','Market'],['portfolio','◆','Portfolio'],['history','↺','History']].map(([t, ic, lb]) => (
          <button key={t} className={`nit${tab === t ? ' on' : ''}`} onClick={() => switchTab(t)}>
            <div className="nic">{ic}</div>
            <div className="nlb">{lb}</div>
          </button>
        ))}
      </nav>

      {/* Modal */}
      {modal && (
        <StockModal
          sym={modal}
          prices={prices}
          onClose={() => setModal(null)}
          onTrade={executeTrade}
        />
      )}

      {/* Toast */}
      <div className={`toast${toast.show ? ' show' : ''}`}>{toast.msg}</div>
    </div>
  );
}

// ─── Root App ───────────────────────────────────────────────
function AppInner() {
  const { currentUser } = useUser();
  return currentUser ? <TradingApp /> : <AuthScreen />;
}

export default function App() {
  return (
    <UserProvider>
      <AppInner />
    </UserProvider>
  );
}
