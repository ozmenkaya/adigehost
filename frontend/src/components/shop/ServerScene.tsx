/**
 * Hero görseli — animasyonlu "veri çekirdeği".
 * Yörüngede dönen halkalar, süzülen sunucu rafları, parlayan bulut ve
 * yükselen veri parçacıkları. Tamamı SVG + CSS animasyonu (bağımlılık yok).
 */
export default function ServerScene() {
  return (
    <div className="relative mx-auto aspect-square w-full max-w-[520px]">
      {/* Arka plan ışıması */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-1/2 top-1/2 h-3/4 w-3/4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-500/30 blur-[90px] animate-glow-pulse" />
        <div className="absolute left-[62%] top-[30%] h-40 w-40 -translate-x-1/2 -translate-y-1/2 rounded-full bg-neon-violet/30 blur-[70px] animate-glow-pulse [animation-delay:1.5s]" />
      </div>

      <svg viewBox="0 0 520 520" className="h-full w-full overflow-visible" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="rack" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#1e2a4d" />
            <stop offset="1" stopColor="#0c1226" />
          </linearGradient>
          <linearGradient id="rackTop" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#2f3f6e" />
            <stop offset="1" stopColor="#1a2340" />
          </linearGradient>
          <linearGradient id="cloud" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#7dd3fc" />
            <stop offset="0.5" stopColor="#60a5fa" />
            <stop offset="1" stopColor="#a78bfa" />
          </linearGradient>
          <radialGradient id="core" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor="#e0f2fe" />
            <stop offset="0.5" stopColor="#38bdf8" />
            <stop offset="1" stopColor="#3b82f6" stopOpacity="0" />
          </radialGradient>
          <filter id="soft" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="4" />
          </filter>
        </defs>

        {/* Yörünge halkaları */}
        <g className="animate-spinslow" style={{ transformOrigin: '260px 260px' }}>
          <ellipse cx="260" cy="260" rx="230" ry="92" fill="none" stroke="#3b82f6" strokeOpacity="0.35" strokeWidth="1.5" />
          <circle cx="490" cy="260" r="4" fill="#22d3ee" />
          <circle cx="30" cy="260" r="3" fill="#a78bfa" />
        </g>
        <g className="animate-spinslow-rev" style={{ transformOrigin: '260px 260px' }}>
          <ellipse cx="260" cy="260" rx="170" ry="200" fill="none" stroke="#8b5cf6" strokeOpacity="0.28" strokeWidth="1.5" />
          <circle cx="260" cy="60" r="3.5" fill="#60a5fa" />
        </g>
        <g className="animate-spinslow" style={{ transformOrigin: '260px 260px', animationDuration: '40s' }}>
          <ellipse cx="260" cy="260" rx="120" ry="150" fill="none" stroke="#22d3ee" strokeOpacity="0.22" strokeWidth="1.5" transform="rotate(35 260 260)" />
        </g>

        {/* Merkez çekirdek parıltısı */}
        <circle cx="260" cy="240" r="120" fill="url(#core)" opacity="0.55" className="animate-glow-pulse" style={{ transformOrigin: '260px 240px' }} />

        {/* Süzülen bulut */}
        <g className="animate-float" style={{ transformOrigin: '260px 150px' }}>
          <g filter="url(#soft)" opacity="0.5">
            <ellipse cx="260" cy="150" rx="86" ry="40" fill="#38bdf8" />
          </g>
          <path
            d="M206 168c-20 0-34-14-34-31 0-16 13-29 30-30 5-19 22-32 43-32 20 0 37 12 43 30 3-1 6-1 9-1 18 0 32 14 32 31 0 18-15 33-33 33H206z"
            fill="url(#cloud)"
          />
          <path
            d="M258 120v40m0 0-13-13m13 13 13-13"
            stroke="#0a0d1c"
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity="0.75"
          />
        </g>

        {/* İzometrik sunucu rafı yığını */}
        <g className="animate-float-slow" style={{ transformOrigin: '260px 330px' }}>
          {[0, 1, 2].map((i) => {
            const y = 300 + i * 56;
            return (
              <g key={i}>
                {/* Sol yüz */}
                <path d={`M190 ${y} 260 ${y + 34} 260 ${y + 74} 190 ${y + 40}z`} fill="url(#rack)" />
                {/* Sağ yüz */}
                <path d={`M330 ${y} 260 ${y + 34} 260 ${y + 74} 330 ${y + 40}z`} fill="#0b1024" />
                {/* Üst yüz */}
                <path d={`M190 ${y} 260 ${y - 34} 330 ${y} 260 ${y + 34}z`} fill="url(#rackTop)" />
                {/* LED'ler */}
                <circle cx={210} cy={y + 20} r="3.4" fill="#22d3ee" className="animate-blink" style={{ animationDelay: `${i * 0.3}s` }} />
                <circle cx="223" cy={y + 26} r="3.4" fill="#34d399" className="animate-blink" style={{ animationDelay: `${i * 0.3 + 0.5}s` }} />
                <rect x="284" y={y + 14} width="34" height="3" rx="1.5" fill="#3b82f6" opacity="0.7" />
                <rect x="284" y={y + 22} width="26" height="3" rx="1.5" fill="#8b5cf6" opacity="0.6" />
              </g>
            );
          })}
        </g>

        {/* Yükselen veri parçacıkları */}
        {[
          { x: 120, y: 360, d: '0s', c: '#22d3ee' },
          { x: 400, y: 320, d: '1.2s', c: '#a78bfa' },
          { x: 150, y: 220, d: '0.6s', c: '#60a5fa' },
          { x: 385, y: 200, d: '1.8s', c: '#38bdf8' },
          { x: 300, y: 430, d: '0.9s', c: '#22d3ee' },
        ].map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r="3.5"
            fill={p.c}
            className="animate-float"
            style={{ animationDelay: p.d, animationDuration: `${5 + i}s` }}
          />
        ))}
      </svg>
    </div>
  );
}
