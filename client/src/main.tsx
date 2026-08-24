import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import './index.css';

// Enforce title & clean favicon
document.title = 'Twine — Couple & Friends Messenger';

const setFavicon = () => {
  const iconSvg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><path d='M42 80 C40 78 16 56 16 38 C16 23 26 14 38 14 C45 14 51 18 47 24 C43 18 49 14 55 14 C67 14 77 23 77 38 C77 56 53 78 42 80 Z' fill='%23ff007f'/><path d='M60 88 C58 86 34 64 40 46 C44 34 52 25 60 25 C67 25 73 29 69 35 C65 29 71 25 77 25 C89 25 99 34 99 49 C99 67 75 86 60 88 Z' fill='%237928ca' opacity='0.85'/><circle cx='80' cy='20' r='4' fill='%23ffffff'/></svg>`;
  const dataUrl = `data:image/svg+xml,${encodeURIComponent(iconSvg)}`;

  const links = document.querySelectorAll<HTMLLinkElement>("link[rel*='icon']");
  links.forEach((l) => {
    l.href = dataUrl;
  });
  if (links.length === 0) {
    const link = document.createElement('link');
    link.rel = 'icon';
    link.type = 'image/svg+xml';
    link.href = dataUrl;
    document.head.appendChild(link);
  }
};

setFavicon();

// Unregister legacy service workers that might cache old names
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    for (const reg of registrations) {
      reg.unregister();
    }
  });
}

// Clean old caches
if ('caches' in window) {
  caches.keys().then((names) => {
    names.forEach((name) => caches.delete(name));
  });
}

// Keep title strictly as Twine
setInterval(() => {
  if (document.title !== 'Twine — Couple & Friends Messenger') {
    document.title = 'Twine — Couple & Friends Messenger';
  }
}, 1000);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
