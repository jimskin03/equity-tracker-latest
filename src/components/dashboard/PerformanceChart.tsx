import { useEffect, useMemo, useState } from 'react'
import type { Holding, PortfolioPerformancePoint } from '../../types'
import { buildPerformanceSeries } from '../../api/marketHistory'

interface PerformanceChartProps {
  holdings: Holding[]
}

type Period = '1M' | '3M' | '6M' | '1Y' | '5Y' | 'ALL'

// Chart coordinates calculation
const width = 680
const height = 260
const padLeft = 55
const padRight = 20
const padTop = 20
const padBottom = 35

const plotW = width - padLeft - padRight
const plotH = height - padTop - padBottom

// Fixed visual range matching mock (-10% to +30%)
const minY = -10
const maxY = 30

function getY(val: number): number {
  const clamped = Math.max(minY, Math.min(maxY, val))
  const ratio = (clamped - minY) / (maxY - minY)
  return padTop + plotH - ratio * plotH
}

function getX(idx: number, count: number): number {
  if (count <= 1) return padLeft + plotW / 2
  return padLeft + (idx / (count - 1)) * plotW
}

export function PerformanceChart({ holdings }: PerformanceChartProps) {
  const [period, setPeriod] = useState<Period>('1Y')
  const [data, setData] = useState<PortfolioPerformancePoint[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)

  useEffect(() => {
    let active = true
    setIsLoading(true)

    buildPerformanceSeries(holdings, period)
      .then((points) => {
        if (active) {
          setData(points)
          setIsLoading(false)
        }
      })
      .catch((err) => {
        console.warn('[PerformanceChart] error building series:', err)
        if (active) setIsLoading(false)
      })

    return () => {
      active = false
    }
  }, [holdings, period])

  const portfolioPath = useMemo(() => {
    if (data.length === 0) return ''
    return data
      .map((pt, i) => {
        const x = getX(i, data.length)
        const y = getY(pt.portfolioReturn)
        return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`
      })
      .join(' ')
  }, [data])

  const portfolioAreaPath = useMemo(() => {
    if (data.length === 0) return ''
    const baseLine = getY(minY)
    const firstX = getX(0, data.length)
    const lastX = getX(data.length - 1, data.length)
    return `${portfolioPath} L ${lastX.toFixed(1)} ${baseLine.toFixed(1)} L ${firstX.toFixed(1)} ${baseLine.toFixed(1)} Z`
  }, [data, portfolioPath])

  const klciPath = useMemo(() => {
    if (data.length === 0) return ''
    return data
      .map((pt, i) => {
        const x = getX(i, data.length)
        const y = getY(pt.klciReturn)
        return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`
      })
      .join(' ')
  }, [data])

  const latestPoint = data[data.length - 1] || { portfolioReturn: 8.42, klciReturn: 5.16 }
  const activePoint = hoveredIndex !== null && data[hoveredIndex] ? data[hoveredIndex] : latestPoint

  // Y-axis tick values: +30%, +20%, +10%, 0%, -10%
  const yTicks = [30, 20, 10, 0, -10]

  return (
    <article className="chart-card">
      <div className="chart-header">
        <div>
          <h2 className="card-title">Portfolio Performance</h2>
        </div>
        <div className="period-pills" role="tablist" aria-label="Select timeframe">
          {(['1M', '3M', '6M', '1Y', '5Y', 'ALL'] as const).map((item) => (
            <button
              key={item}
              type="button"
              role="tab"
              aria-selected={period === item}
              className={`period-pill ${period === item ? 'active' : ''}`}
              onClick={() => setPeriod(item)}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      <div className="chart-svg-container" style={{ position: 'relative' }}>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="performance-svg"
          preserveAspectRatio="none"
          onMouseLeave={() => setHoveredIndex(null)}
        >
          <defs>
            <linearGradient id="portfolioGlow" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10b981" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Grid lines and Y-axis labels */}
          {yTicks.map((tick) => {
            const y = getY(tick)
            return (
              <g key={tick} className="grid-group">
                <line
                  x1={padLeft}
                  y1={y}
                  x2={width - padRight}
                  y2={y}
                  stroke="rgba(148, 163, 184, 0.12)"
                  strokeDasharray={tick === 0 ? undefined : '4 4'}
                  strokeWidth={tick === 0 ? 1.5 : 1}
                />
                <text
                  x={padLeft - 8}
                  y={y + 4}
                  textAnchor="end"
                  className="axis-label"
                  fill="rgba(148, 163, 184, 0.65)"
                  fontSize="11"
                >
                  {tick > 0 ? `+${tick}%` : `${tick}%`}
                </text>
              </g>
            )
          })}

          {/* Area fill under portfolio line */}
          {portfolioAreaPath && (
            <path d={portfolioAreaPath} fill="url(#portfolioGlow)" />
          )}

          {/* FBM KLCI line (blue) */}
          {klciPath && (
            <path
              d={klciPath}
              fill="none"
              stroke="#38bdf8"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity="0.85"
            />
          )}

          {/* Portfolio line (green) */}
          {portfolioPath && (
            <path
              d={portfolioPath}
              fill="none"
              stroke="#10b981"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* Interactive Hover columns & dots */}
          {data.map((pt, i) => {
            const x = getX(i, data.length)
            const yP = getY(pt.portfolioReturn)
            const yK = getY(pt.klciReturn)
            const isHovered = hoveredIndex === i

            return (
              <g key={i} onMouseEnter={() => setHoveredIndex(i)}>
                {/* Invisible wide hit area */}
                <rect
                  x={x - (plotW / data.length / 2)}
                  y={padTop}
                  width={plotW / data.length}
                  height={plotH}
                  fill="transparent"
                  cursor="pointer"
                />
                {isHovered && (
                  <>
                    <line
                      x1={x}
                      y1={padTop}
                      x2={x}
                      y2={padTop + plotH}
                      stroke="rgba(255, 255, 255, 0.2)"
                      strokeDasharray="2 2"
                    />
                    <circle cx={x} cy={yP} r="4.5" fill="#10b981" stroke="#020617" strokeWidth="2" />
                    <circle cx={x} cy={yK} r="4" fill="#38bdf8" stroke="#020617" strokeWidth="2" />
                  </>
                )}
              </g>
            )
          })}

          {/* X-axis date labels */}
          {data.map((pt, i) => {
            // Show ~6-7 evenly spaced labels
            const step = Math.max(1, Math.floor(data.length / 6))
            const isVisible = i % step === 0 || i === data.length - 1
            if (!isVisible) return null

            const x = getX(i, data.length)
            return (
              <text
                key={i}
                x={x}
                y={height - 10}
                textAnchor="middle"
                className="axis-label"
                fill="rgba(148, 163, 184, 0.7)"
                fontSize="11"
              >
                {pt.date}
              </text>
            )
          })}
        </svg>

        {isLoading && (
          <div className="chart-loading-overlay">Updating performance data�</div>
        )}
      </div>

      {/* Legend & Hover values footer */}
      <div className="chart-legend">
        <div className="legend-item">
          <span className="legend-dot portfolio-dot" />
          <span className="legend-label">Portfolio</span>
          <strong className={`legend-val ${activePoint.portfolioReturn >= 0 ? 'pos' : 'neg'}`}>
            {activePoint.portfolioReturn >= 0 ? '+' : ''}{activePoint.portfolioReturn.toFixed(2)}%
          </strong>
        </div>

        <div className="legend-item">
          <span className="legend-dot klci-dot" />
          <span className="legend-label">FBM KLCI</span>
          <strong className={`legend-val ${activePoint.klciReturn >= 0 ? 'pos' : 'neg'}`}>
            {activePoint.klciReturn >= 0 ? '+' : ''}{activePoint.klciReturn.toFixed(2)}%
          </strong>
        </div>

        {hoveredIndex !== null && data[hoveredIndex] && (
          <div className="legend-date-chip">{data[hoveredIndex].date}</div>
        )}
      </div>
    </article>
  )
}
