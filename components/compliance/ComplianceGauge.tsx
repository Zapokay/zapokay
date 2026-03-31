'use client'

import { useEffect, useRef } from 'react'

interface ComplianceGaugeProps {
  percentage: number
  size?: number
}

function getGaugeColor(pct: number): string {
  if (pct >= 80) return '#2E5425' // succès vert
  if (pct >= 40) return '#F5B91E' // amber
  return '#6B1E1E'                 // bordeaux
}

export default function ComplianceGauge({ percentage, size = 120 }: ComplianceGaugeProps) {
  const clampedPct = Math.max(0, Math.min(100, percentage))
  const strokeWidth = size * 0.083 // ~10px pour size=120
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const color = getGaugeColor(clampedPct)

  // Ref pour l'animation CSS
  const circleRef = useRef<SVGCircleElement>(null)

  useEffect(() => {
    const circle = circleRef.current
    if (!circle) return

    const targetOffset = circumference - (clampedPct / 100) * circumference

    // Partir de 0 (cercle vide)
    circle.style.strokeDashoffset = String(circumference)
    circle.style.transition = 'none'

    // Forcer reflow pour que la transition parte bien de 0
    void circle.getBoundingClientRect()

    // Animer vers la cible
    requestAnimationFrame(() => {
      circle.style.transition = 'stroke-dashoffset 800ms ease-out'
      circle.style.strokeDashoffset = String(targetOffset)
    })
  }, [clampedPct, circumference])

  const center = size / 2
  const labelFontSize = Math.round(size * 0.22)   // ~26px pour size=120
  const sublabelFontSize = Math.round(size * 0.1)  // ~12px pour size=120

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      aria-label={`Taux de conformité : ${clampedPct}%`}
      role="img"
    >
      {/* Cercle de fond */}
      <circle
        cx={center}
        cy={center}
        r={radius}
        fill="none"
        stroke="#E0D9CE"
        strokeWidth={strokeWidth}
      />

      {/* Cercle de progression */}
      <circle
        ref={circleRef}
        cx={center}
        cy={center}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={circumference}
        transform={`rotate(-90 ${center} ${center})`}
        style={{ willChange: 'stroke-dashoffset' }}
      />

      {/* Pourcentage centré */}
      <text
        x={center}
        y={center - sublabelFontSize * 0.6}
        textAnchor="middle"
        dominantBaseline="middle"
        fill="#070E1C"
        fontFamily="'Sora', sans-serif"
        fontWeight="700"
        fontSize={labelFontSize}
      >
        {clampedPct}%
      </text>

      {/* Sous-libellé */}
      <text
        x={center}
        y={center + labelFontSize * 0.55}
        textAnchor="middle"
        dominantBaseline="middle"
        fill="#7A7066"
        fontFamily="'DM Sans', sans-serif"
        fontWeight="400"
        fontSize={sublabelFontSize}
      >
        conformité
      </text>
    </svg>
  )
}
