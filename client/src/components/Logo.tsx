import { useState } from 'react';

// Renders the RLR logo. Tries the official PNG first, falls back to the bundled
// SVG, then a text mark — so the UI never shows a broken image before
// rlr-logo.png is added to /client/public.
export function Logo({
  className = '',
  alt = 'RLR Sales and Services',
}: {
  className?: string;
  alt?: string;
}) {
  const [src, setSrc] = useState('/rlr-logo.png');
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div className={`flex items-center justify-center rounded bg-white font-bold text-navy ${className}`}>
        RLR
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      onError={() => {
        if (src !== '/rlr-logo.svg') {
          setSrc('/rlr-logo.svg');
        } else {
          setFailed(true);
        }
      }}
    />
  );
}
