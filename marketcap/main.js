'use strict';

const SOL_PRICE_API_URL = 'https://api.binance.com/api/v3/ticker/price?symbol=SOLUSDT';
const PUMP_ROOM_ID = '';
const PUMPPORTAL_API_KEY = '';
const SOL_PRICE_REFRESH_MS = 15000;

const marketCapEl = document.getElementById('marketCapUsd');

let solPriceUsd = 0;
let latestMarketCapSol = 0;
let displayMarketCapUsd = 0;
let animationFrameId = 0;

const usdInteger = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

const formatMarketCapUsd = (value) => {
  if (!Number.isFinite(value) || value <= 0) {
    return '$0';
  }
  if (value >= 100000) {
    const thousands = Math.floor(value / 1000);
    return `$${thousands}k`;
  }
  const floored = Math.floor(value);
  return usdInteger.format(floored);
};

const bumpValue = () => {
  marketCapEl.classList.remove('is-bump');
  void marketCapEl.offsetHeight;
  marketCapEl.classList.add('is-bump');
};

const animateMarketCap = (target) => {
  if (!Number.isFinite(target)) {
    return;
  }
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
  }
  const start = displayMarketCapUsd;
  const delta = target - start;
  const duration = 650;
  const startTime = performance.now();

  const tick = (now) => {
    const progress = Math.min(1, (now - startTime) / duration);
    const eased = 1 - Math.pow(1 - progress, 3);
    displayMarketCapUsd = start + delta * eased;
    marketCapEl.textContent = formatMarketCapUsd(displayMarketCapUsd);
    if (progress < 1) {
      animationFrameId = requestAnimationFrame(tick);
    }
  };

  animationFrameId = requestAnimationFrame(tick);
  bumpValue();
};

const updateMarketCapFromTrade = (marketCapSol) => {
  latestMarketCapSol = marketCapSol;
  if (solPriceUsd > 0) {
    animateMarketCap(marketCapSol * solPriceUsd);
  }
};

const refreshMarketCapFromSolPrice = () => {
  if (latestMarketCapSol > 0 && solPriceUsd > 0) {
    animateMarketCap(latestMarketCapSol * solPriceUsd);
  }
};

const parseSolPrice = (data) => {
  if (typeof data?.price === 'string' || typeof data?.price === 'number') {
    return Number(data.price);
  }
  if (typeof data?.solana?.usd === 'number') {
    return data.solana.usd;
  }
  if (typeof data?.data?.amount === 'string') {
    return Number(data.data.amount);
  }
  return Number.NaN;
};

const fetchSolPrice = async () => {
  try {
    const response = await fetch(SOL_PRICE_API_URL);
    if (!response.ok) {
      console.warn(`SOL price fetch failed: ${response.status}`);
      return;
    }
    const data = await response.json();
    const price = parseSolPrice(data);
    if (!Number.isFinite(price) || price <= 0) {
      console.warn('SOL price fetch returned invalid data');
      return;
    }
    solPriceUsd = price;
    refreshMarketCapFromSolPrice();
  } catch (error) {
    console.warn('SOL price fetch error:', error);
  }
};

const connectPumpPortal = () => {
  if (!PUMP_ROOM_ID || PUMP_ROOM_ID === 'YOUR_PUMP_ROOM_ID') {
    console.warn('[pumpportal] missing PUMP_ROOM_ID');
    return;
  }

  const url = PUMPPORTAL_API_KEY
    ? `wss://pumpportal.fun/api/data?api-key=${PUMPPORTAL_API_KEY}`
    : 'wss://pumpportal.fun/api/data';

  const socket = new WebSocket(url);

  socket.addEventListener('open', () => {
    const payload = {
      method: 'subscribeTokenTrade',
      keys: [PUMP_ROOM_ID],
    };
    socket.send(JSON.stringify(payload));
    console.log('[pumpportal] subscribed');
  });

  socket.addEventListener('message', (event) => {
    try {
      const text = typeof event.data === 'string' ? event.data : event.data.toString();
      const payload = JSON.parse(text);
      if (
        payload?.mint === PUMP_ROOM_ID &&
        typeof payload?.marketCapSol === 'number'
      ) {
        updateMarketCapFromTrade(payload.marketCapSol);
      }
    } catch (error) {
      console.warn('[pumpportal] parse error:', error);
    }
  });

  socket.addEventListener('error', (error) => {
    console.warn('[pumpportal] error:', error);
  });

  socket.addEventListener('close', () => {
    console.warn('[pumpportal] disconnected, retrying in 5s');
    setTimeout(connectPumpPortal, 5000);
  });
};

const initWidget = () => {
  marketCapEl.textContent = '$0';
  fetchSolPrice();
  setInterval(fetchSolPrice, SOL_PRICE_REFRESH_MS);
  connectPumpPortal();
};

initWidget();
