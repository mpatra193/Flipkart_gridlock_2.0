import { mapplsToken } from "./api";

export function waitFor(cond: () => boolean, tries = 80): Promise<void> {
  return new Promise((resolve, reject) => {
    let n = 0;
    const tick = () => {
      if (cond()) return resolve();
      if (n++ > tries) return reject(new Error("Mappls SDK not ready"));
      setTimeout(tick, 100);
    };
    tick();
  });
}

export function loadSdk(): Promise<void> {
  const w = window as any;
  if (w.mappls && w.mappls.Map) return Promise.resolve();
  if (document.getElementById("mappls-sdk")) {
    return waitFor(() => !!(w.mappls && w.mappls.Map));
  }
  return mapplsToken().then(
    (token) =>
      new Promise<void>((resolve, reject) => {
        const s = document.createElement("script");
        s.id = "mappls-sdk";
        s.src = `https://apis.mappls.com/advancedmaps/api/${token}/map_sdk?layer=vector&v=3.0`;
        s.async = true;
        s.onload = () => resolve();
        s.onerror = () => reject(new Error("Mappls SDK failed to load"));
        document.head.appendChild(s);
      })
  );
}
