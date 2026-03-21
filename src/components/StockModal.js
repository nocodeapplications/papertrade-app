import React, { useState, useEffect, useRef } from 'react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement,
  LineElement, Tooltip, Filler
} from 'chart.js';
import { fetchPrice, getName, fmtPrice } from '../useMarket';
import { useUser } from '../UserContext';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Filler);

const RANGES = [
  { label: '1D', range: '1d', interval: '5m' },
  { label: '5D', range: '5d', interval: '15m' },
  { label: '1M', range: '1mo', interval: '1d' },
  { label: '3M', range: '3mo', interval: '1d' },
  { label: '1Y', range: '1y', interval: '1wk' },
];

export default function StockModal({ sym, prices, onClose, onTrade }) {
  const { userData } = useUser();
  const [mode, setMode] = useState('buy');
  const [qty, setQty] = useState(1);
  const [err, setErr] = useState('');
  const [chartRange, setChartRange] = useState('1d');
  const [chartData, setChartData] = useState(null);
  const [loadingChart, setLoadingChart] = useState(false);

  const price = prices[sym]?.price;
  const longs = userData?.longs || {};
  const shortPos = userData?.shortPos || {};

  useEffect(() => {
    loadChart('1d');
  }, [sym]); // eslint-disable-line

  async function loadChart(range) {
    setChartRange(range);
    setLoadingChart(true);
    const cfg = RANGES.find(r => r.range === range);
    const data = await fetchPrice(sym, range, cfg?.interval || '1d');
    if (data?.timestamps?.length) {
      const labels = data.timestamps.map(t => {
        const d = new Date(t * 1000);
        return range === '1d'
          ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          : d.toLocaleDateString([], { month: 'short', day: 'numeric' });
      });
      const closes = data.closes.map(v => v ? parseFloat(v.toFixed(4)) : null);
      const isUp = (closes[closes.length - 1] || 0) >= (closes[0] || 0);
      setChartData({ labels, closes, isUp });
    }
    setLoadingChart(false);
  }

  function getChartColors() {
    const s = getComputedStyle(document.documentElement);
    return {
      grid: s.getPropertyValue('--chart-grid').trim(),
      tick: s.getPropertyValue('--chart-tick').trim(),
      ttBg: s.getPropertyValue('--chart-tt-bg').trim(),
      ttTitle: s.getPropertyValue('--chart-tt-title').trim(),
      ttBody: s.getPropertyValue('--chart-tt-body').trim(),
      ttBorder: s.getPropertyValue('--chart-tt-border').trim(),
      green: s.getPropertyValue('--green').trim(),
      red: s.getPropertyValue('--red').trim(),
    };
  }

  function handleTrade() {
    setErr('');
    const total = (price || 0) * qty;
    const cash = userData?.cash || 0;

    if (mode === 'buy') {
      if (total > cash) { setErr('Insufficient cash.'); return; }
    } else if (mode === 'sell') {
      if (qty > (longs[sym] || 0)) { setErr(`Only ${longs[sym] || 0} shares held.`); return; }
    } else if (mode === 'short') {
      if ((total * 0.5) > cash) { setErr('Insufficient margin (50% required).'); return; }
    } else if (mode === 'cover') {
      const sp = shortPos[sym];
      if (!sp?.qty) { setErr('No short position.'); return; }
      if (qty > sp.qty) { setErr(`Only shorted ${sp.qty} shares.`); return; }
    }
    onTrade(sym, mode, qty, price);
    onClose();
  }

  const hasLong = (longs[sym] || 0) > 0;
  const hasShort = (shortPos[sym]?.qty || 0) > 0;
  const sp = shortPos[sym];
  const pnl = hasShort && price ? sp.qty * (sp.entryPrice - price) : 0;
  const c = getChartColors();

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="mhdr">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="msym">{sym.replace('-USD', '')}</span>
            {hasLong && <span className="long-tag">LONG {longs[sym]}</span>}
            {hasShort && <span className="short-tag">SHORT {sp.qty}</span>}
          </div>
          <button className="mx" onClick={onClose}>✕</button>
        </div>

        <div className="mprice">{price ? fmtPrice(price, sym) : '—'}</div>
        <div className="mco">{getName(sym)}</div>

        {/* Chart range buttons */}
        <div className="chart-range">
          {RANGES.map(r => (
            <button key={r.range} className={`crb${chartRange === r.range ? ' on' : ''}`} onClick={() => loadChart(r.range)}>
              {r.label}
            </button>
          ))}
        </div>

        {/* Chart */}
        <div className="chart-wrap">
          {loadingChart && <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text3)', fontSize: 12, fontFamily: 'var(--font-display)' }}>Loading chart…</div>}
          {!loadingChart && chartData && (
            <Line
              data={{
                labels: chartData.labels,
                datasets: [{
                  data: chartData.closes,
                  borderColor: chartData.isUp ? c.green : c.red,
                  borderWidth: 1.5,
                  pointRadius: 0,
                  tension: 0.3,
                  fill: false,
                  spanGaps: true,
                }],
              }}
              options={{
                responsive: true, maintainAspectRatio: false,
                plugins: {
                  legend: { display: false },
                  tooltip: {
                    mode: 'index', intersect: false,
                    backgroundColor: c.ttBg, titleColor: c.ttTitle, bodyColor: c.ttBody,
                    borderColor: c.ttBorder, borderWidth: 1,
                    callbacks: { label: v => '$' + (v.raw?.toFixed(2) || '') },
                  },
                },
                scales: {
                  x: { ticks: { maxTicksLimit: 6, color: c.tick, font: { size: 10, family: "'Space Mono'" } }, grid: { display: false }, border: { display: false } },
                  y: { ticks: { color: c.tick, font: { size: 10, family: "'Space Mono'" }, callback: v => '$' + (v > 100 ? Math.round(v) : v.toFixed(2)) }, grid: { color: c.grid }, border: { display: false }, position: 'right' },
                },
              }}
            />
          )}
        </div>

        {/* Position info */}
        {(hasLong || hasShort) && (
          <div className="pos-info">
            {hasLong && (
              <>
                <div className="pir"><span className="lbl">Long shares</span><span className="val">{longs[sym]}</span></div>
                <div className="pir"><span className="lbl">Market value</span><span className="val">${((price || 0) * longs[sym]).toFixed(2)}</span></div>
              </>
            )}
            {hasShort && sp && (
              <>
                <div className="pir"><span className="lbl">Short shares</span><span className="val">{sp.qty}</span></div>
                <div className="pir"><span className="lbl">Entry price</span><span className="val">${sp.entryPrice.toFixed(2)}</span></div>
                <div className="pir">
                  <span className="lbl">Unrealised P&L</span>
                  <span className="val" style={{ color: pnl >= 0 ? 'var(--green)' : 'var(--red)' }}>{pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}</span>
                </div>
              </>
            )}
          </div>
        )}

        {/* Trade tabs */}
        <div className="ttabs">
          {['buy','sell','short','cover'].map(m => (
            <button key={m} className={`ttab${mode === m ? ` on ${m}-tab` : ''}`} onClick={() => { setMode(m); setErr(''); }}>
              {{ buy: 'Buy Long', sell: 'Sell Long', short: 'Short', cover: 'Cover' }[m]}
            </button>
          ))}
        </div>

        {/* Qty */}
        <div className="qrow">
          <span className="qlbl">Shares</span>
          <div className="qctrl">
            <button className="qbtn" onClick={() => setQty(q => Math.max(1, q - 1))}>−</button>
            <span className="qnum">{qty}</span>
            <button className="qbtn" onClick={() => setQty(q => q + 1)}>+</button>
          </div>
        </div>

        <div className="crow2">
          <span className="clbl">{{ buy: 'Total cost', sell: 'Proceeds', short: 'Margin (50%)', cover: 'Cost to cover' }[mode]}</span>
          <span className="cval">${mode === 'short' ? ((price || 0) * qty * 0.5).toFixed(2) : ((price || 0) * qty).toFixed(2)}</span>
        </div>

        <button
          className={`tbtn ${mode}-btn`}
          onClick={handleTrade}
        >
          {{ buy: 'Buy Long', sell: 'Sell Long', short: 'Sell Short', cover: 'Cover Short' }[mode]}
        </button>
        <div className="errmsg">{err}</div>
      </div>
    </div>
  );
}
