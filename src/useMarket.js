import { useState, useCallback, useRef } from 'react';

const PROXY = 'https://corsproxy.io/?';
const YF = 'https://query1.finance.yahoo.com/v8/finance/chart/';

export const STOCKS = [
  {sym:'AAPL',name:'Apple Inc.'},{sym:'MSFT',name:'Microsoft Corp.'},{sym:'GOOGL',name:'Alphabet Inc.'},
  {sym:'AMZN',name:'Amazon.com'},{sym:'TSLA',name:'Tesla Inc.'},{sym:'NVDA',name:'NVIDIA Corp.'},
  {sym:'META',name:'Meta Platforms'},{sym:'NFLX',name:'Netflix Inc.'},{sym:'AMD',name:'AMD Inc.'},
  {sym:'INTC',name:'Intel Corp.'},{sym:'JPM',name:'JPMorgan Chase'},{sym:'V',name:'Visa Inc.'},
  {sym:'DIS',name:'Walt Disney Co.'},{sym:'SPOT',name:'Spotify'},{sym:'CRM',name:'Salesforce'},
  {sym:'PYPL',name:'PayPal'},{sym:'UBER',name:'Uber Technologies'},{sym:'COIN',name:'Coinbase'},
  {sym:'PLTR',name:'Palantir Technologies'},{sym:'BABA',name:'Alibaba Group'},
];

export const CRYPTOS = [
  {sym:'BTC-USD',name:'Bitcoin',ticker:'BTC'},
  {sym:'ETH-USD',name:'Ethereum',ticker:'ETH'},
  {sym:'SOL-USD',name:'Solana',ticker:'SOL'},
  {sym:'BNB-USD',name:'BNB',ticker:'BNB'},
  {sym:'XRP-USD',name:'XRP',ticker:'XRP'},
  {sym:'DOGE-USD',name:'Dogecoin',ticker:'DOGE'},
  {sym:'ADA-USD',name:'Cardano',ticker:'ADA'},
  {sym:'AVAX-USD',name:'Avalanche',ticker:'AVAX'},
  {sym:'LINK-USD',name:'Chainlink',ticker:'LINK'},
  {sym:'DOT-USD',name:'Polkadot',ticker:'DOT'},
];

export const UNIVERSE = [...STOCKS, ...CRYPTOS];

export function getName(sym) {
  return UNIVERSE.find(x => x.sym === sym)?.name || sym;
}

export function fmtPrice(p, sym) {
  if (!p && p !== 0) return 'N/A';
  if (sym && sym.includes('-USD')) {
    if (p > 1000) return '$' + p.toLocaleString(undefined, { maximumFractionDigits: 0 });
    if (p > 1) return '$' + p.toFixed(2);
    return '$' + p.toFixed(4);
  }
  return '$' + p.toFixed(2);
}

export async function fetchPrice(sym, range = '1d', interval = '5m') {
  try {
    const url = `${YF}${sym}?interval=${interval}&range=${range}`;
    const r = await fetch(PROXY + encodeURIComponent(url));
    const d = await r.json();
    const res = d?.chart?.result?.[0];
    if (!res) return null;
    const price = res.meta.regularMarketPrice;
    const prev = res.meta.chartPreviousClose || res.meta.previousClose || price;
    return {
      price, prev,
      change: price - prev,
      pct: ((price - prev) / prev) * 100,
      timestamps: res.timestamp || [],
      closes: res.indicators?.quote?.[0]?.close || [],
    };
  } catch { return null; }
}

export function useMarket() {
  const [prices, setPrices] = useState({});
  const [loadingMarket, setLoadingMarket] = useState(false);
  const fetchedRef = useRef(false);

  const fetchAll = useCallback(async (list = STOCKS) => {
    if (loadingMarket) return;
    setLoadingMarket(true);
    const results = await Promise.all(list.map(async s => {
      const p = await fetchPrice(s.sym);
      return { sym: s.sym, data: p };
    }));
    const map = {};
    results.forEach(r => { if (r.data) map[r.sym] = r.data; });
    setPrices(prev => ({ ...prev, ...map }));
    setLoadingMarket(false);
    fetchedRef.current = true;
  }, [loadingMarket]);

  const fetchCrypto = useCallback(async () => {
    const results = await Promise.all(CRYPTOS.map(async c => {
      const p = await fetchPrice(c.sym);
      return { sym: c.sym, data: p };
    }));
    const map = {};
    results.forEach(r => { if (r.data) map[r.sym] = r.data; });
    setPrices(prev => ({ ...prev, ...map }));
  }, []);

  const refreshPrice = useCallback(async (sym) => {
    const p = await fetchPrice(sym);
    if (p) setPrices(prev => ({ ...prev, [sym]: p }));
    return p;
  }, []);

  return { prices, loadingMarket, fetchAll, fetchCrypto, refreshPrice, fetched: fetchedRef.current };
}
