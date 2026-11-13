// Barcode scanning. Uses the browser's BarcodeDetector when it exists (Chrome/Android);
// iPhone Safari doesn't have it, so we lazy-load the vendored ZXing library there.
// Resolves with the barcode string, or null if cancelled.

const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'qr_code'];
let zxingLoad;

function loadZxing() {
  if (window.ZXing) return Promise.resolve(window.ZXing);
  zxingLoad ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = './vendor/zxing.min.js';
    s.onload = () => resolve(window.ZXing);
    s.onerror = () => reject(new Error('Scanner failed to load'));
    document.head.append(s);
  });
  return zxingLoad;
}

export function scanBarcode() {
  return new Promise((resolve) => {
    const d = document.getElementById('scanner');
    d.innerHTML = `
      <div class="scan-wrap">
        <video playsinline muted></video>
        <div class="scan-frame"></div>
        <div class="scan-top"><span class="scan-msg">Point at a barcode</span>
          <button type="button" class="icon-btn" data-cancel aria-label="Close scanner">✕</button></div>
        <form class="scan-manual"><input inputmode="numeric" placeholder="Or type the number" aria-label="Barcode number"><button class="btn">Use</button></form>
      </div>`;
    const video = d.querySelector('video');
    const msg = d.querySelector('.scan-msg');
    let stream, stop = () => {}, finished = false;

    const finish = (code) => {
      if (finished) return;
      finished = true;
      stop();
      stream?.getTracks().forEach((t) => t.stop());
      if (d.open) d.close();
      resolve(code || null);
    };
    d.querySelector('[data-cancel]').onclick = () => finish(null);
    d.oncancel = (e) => { e.preventDefault(); finish(null); };
    d.querySelector('.scan-manual').onsubmit = (e) => {
      e.preventDefault();
      const v = e.target.querySelector('input').value.replace(/\D/g, '');
      if (v) finish(v);
    };
    d.showModal();

    (async () => {
      try {
        if ('BarcodeDetector' in window) {
          const supported = await BarcodeDetector.getSupportedFormats();
          const det = new BarcodeDetector({ formats: FORMATS.filter((f) => supported.includes(f)) });
          stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
          video.srcObject = stream;
          await video.play();
          let raf;
          const tick = async () => {
            if (finished) return;
            try {
              const codes = await det.detect(video);
              if (codes[0]?.rawValue) return finish(codes[0].rawValue);
            } catch {}
            raf = setTimeout(tick, 150);
          };
          stop = () => clearTimeout(raf);
          tick();
        } else {
          msg.textContent = 'Starting camera…';
          const ZXing = await loadZxing();
          if (finished) return;
          const hints = new Map();
          const F = ZXing.BarcodeFormat;
          hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, [F.EAN_13, F.EAN_8, F.UPC_A, F.UPC_E, F.CODE_128, F.CODE_39, F.QR_CODE]);
          const reader = new ZXing.BrowserMultiFormatReader(hints, 200);
          stop = () => reader.reset();
          await reader.decodeFromConstraints({ video: { facingMode: 'environment' }, audio: false }, video, (result) => {
            if (result) finish(result.getText());
          });
          msg.textContent = 'Point at a barcode';
        }
      } catch (err) {
        msg.textContent = err?.name === 'NotAllowedError' ? 'Camera access denied — type the number below' : 'Camera unavailable — type the number below';
      }
    })();
  });
}
