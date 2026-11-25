import React from 'react';

// SVG colour-matrix filter (id "tvc-temperature") that previews the
// converter's temperature adjustment on the source image via CSS
// `filter: url(#tvc-temperature)`. Same channel gains as applyColorBalance().
const TemperatureFilter: React.FC<{ temperature: number }> = ({ temperature }) => {
  const t = Math.max(-100, Math.min(100, temperature)) / 100;
  const kr = 1 + 0.25 * t, kg = 1 + 0.05 * t, kb = 1 - 0.25 * t;
  return (
    <svg width="0" height="0" className="absolute" aria-hidden="true">
      <filter id="tvc-temperature" colorInterpolationFilters="sRGB">
        <feColorMatrix type="matrix" values={`${kr} 0 0 0 0  0 ${kg} 0 0 0  0 0 ${kb} 0 0  0 0 0 1 0`} />
      </filter>
    </svg>
  );
};

export default TemperatureFilter;
