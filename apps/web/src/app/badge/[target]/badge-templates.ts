export const badgeTemplates = {
  "serp-dr-v3": `<svg width="153" height="44" viewBox="0 0 153 44" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <style>@import url('https://fonts.googleapis.com/css2?family=Inter:wght@500;700;900&amp;display=swap');</style>
      </defs>
      <!-- Background -->
      <rect x="1" y="1" width="151" height="42" rx="5" fill="#ffffff" stroke="#e5e7eb" stroke-width="1"/>

      <!-- Logo/Icon -->
      <svg x="5" y="7" width="30" height="30" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg">
    <path fill="#000"  d=" M 127.62 540.68 C 255.64 429.97 383.70 319.31 511.76 208.65 C 639.74 319.23 767.70 429.86 895.69 540.45 C 895.70 631.71 895.73 722.97 895.64 814.23 C 719.72 662.17 543.76 510.14 367.81 358.10 C 398.86 414.80 429.83 471.54 460.92 528.22 C 349.85 623.79 238.69 719.27 127.67 814.91 C 127.66 723.50 127.67 632.09 127.62 540.68 Z" />
    </svg>

      <!-- Text -->
      <text x="39" y="18" font-family="Inter, system-ui, sans-serif" font-size="10" font-weight="500" fill="#000000" opacity="0.8">VERIFIED</text>

      <!-- Site name -->
      <text x="39" y="33" font-family="Inter, system-ui, sans-serif" font-size="15" font-weight="900" fill="#000000">SERP DR</text>

      <!-- Separator -->

      <!-- DR Score: ring + number -->
      <svg x="112" y="3" width="33" height="38" viewBox="0 0 33 38">
        <!-- Track (gray, 300° horseshoe) center(16.5,18) r=13 -->
        <path d="M 10 29.26 A 13 13 0 1 1 23 29.26" fill="none" stroke="#e5e7eb" stroke-width="5" stroke-linecap="butt"/>
        <!-- Fill arc: __DR_DASHARRAY__ computed as (score/100 * 68.07) (68.07 - filled) -->
        <path d="M 10 29.26 A 13 13 0 1 1 23 29.26" fill="none" stroke="#36d984" stroke-width="6" stroke-linecap="butt" stroke-dasharray="__DR_DASHARRAY__"/>
        <!-- Score number -->
        <text x="16" y="19" text-anchor="middle" dominant-baseline="middle" font-family="Inter, system-ui, sans-serif" font-size="12" font-weight="900" fill="#111" letter-spacing="-0.5">__DR__</text>
      </svg>
</svg>`,
  "serp-dr-v2": `<svg
  xmlns="http://www.w3.org/2000/svg"
  width="200"
  height="50"
  viewBox="0 0 200 50"
>
  <!-- Outer container -->
  <rect
    x="1"
    y="1"
    width="198"
    height="48"
    rx="8"
    fill="#ffffff"
    stroke="#059669"
    stroke-width="2"
  />

  <!-- Verified check -->
  <circle cx="32" cy="25" r="16" fill="#059669" />
  <g transform="translate(20 13)">
    <path
      d="M20 6 9 17l-5-5"
      fill="none"
      stroke="#ffffff"
      stroke-width="3"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </g>

  <!-- Label -->
  <text
    x="60"
    y="25"
    font-family="Inter, Arial, sans-serif"
    font-size="13"
    font-weight="700"
    dominant-baseline="middle"
  >
    <tspan fill="#111827">VERIFIED DR</tspan>
    <tspan fill="#9ca3af"> | </tspan>
  </text>
  <text
    x="148"
    y="26"
    font-family="Inter, Arial, sans-serif"
    font-size="16"
    font-weight="900"
    dominant-baseline="middle"
    fill="#111827"
  >__DR__</text>
</svg>`,
} as const

export type BadgeTemplateKey = keyof typeof badgeTemplates
