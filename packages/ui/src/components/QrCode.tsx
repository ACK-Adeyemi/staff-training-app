import qrcode from 'qrcode-generator';

export interface QrCodeProps {
  value: string;
  alt: string;
  /** The same information as text, for people who cannot scan. Always shown. */
  textAlternative: string;
  textAlternativeLabel?: string;
}

const QUIET = 4;

/** Drawn on the device from `value`; no network. Always black on white so scanners can read it in dark mode. */
export function QrCode({ value, alt, textAlternative, textAlternativeLabel }: QrCodeProps) {
  const qr = qrcode(0, 'M');
  qr.addData(value);
  qr.make();
  const n = qr.getModuleCount();
  let d = '';
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (qr.isDark(r, c)) d += `M${c + QUIET} ${r + QUIET}h1v1h-1z`;
    }
  }
  const size = n + QUIET * 2;
  return (
    <div className="flex flex-col items-start gap-2">
      <svg
        role="img"
        aria-label={alt}
        viewBox={`0 0 ${size} ${size}`}
        shapeRendering="crispEdges"
        width={192}
        height={192}
        className="max-w-full border-2 border-[var(--color-border)]"
      >
        <rect width={size} height={size} fill="#ffffff" />
        <path d={d} fill="#000000" />
      </svg>
      {textAlternativeLabel ? <p className="m-0 text-sm font-semibold">{textAlternativeLabel}</p> : null}
      <p className="m-0 font-mono text-lg break-all">{textAlternative}</p>
    </div>
  );
}
