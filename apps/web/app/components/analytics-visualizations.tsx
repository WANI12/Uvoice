function format(value: string) {
  return value.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, char => char.toUpperCase());
}

export function TrendChart({ rows }: { rows: { period: string; count: number }[] }) {
  const width = 800;
  const height = 250;
  const padding = { top: 18, right: 18, bottom: 42, left: 38 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const max = Math.max(1, ...rows.map(row => row.count));
  const points = rows.map((row, index) => ({
    ...row,
    x: padding.left + (rows.length === 1 ? plotWidth / 2 : index / (rows.length - 1) * plotWidth),
    y: padding.top + plotHeight - row.count / max * plotHeight,
  }));
  const labelIndexes = [...new Set([0, Math.floor((rows.length - 1) / 2), rows.length - 1])];

  return <div className="analytics-trend-chart">
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Incident reports over time">
      <title>Incident reporting trend</title>
      <desc>Reports received per selected time interval. Highest value: {max}.</desc>
      {[0, 0.5, 1].map(fraction => {
        const y = padding.top + plotHeight * fraction;
        const value = Math.round(max * (1 - fraction));
        return <g key={fraction}><line className="analytics-trend-gridline" x1={padding.left} x2={width - padding.right} y1={y} y2={y}/><text className="analytics-trend-axis-label" x={padding.left - 9} y={y + 4} textAnchor="end">{value}</text></g>;
      })}
      {points.length > 1 && <polyline className="analytics-trend-line" points={points.map(point => `${point.x},${point.y}`).join(' ')}/>}
      {points.map(point => <circle key={point.period} className="analytics-trend-point" cx={point.x} cy={point.y} r={points.length > 45 ? 2 : 3.5}>
        <title>{new Date(point.period).toLocaleDateString()}: {point.count} reports</title>
      </circle>)}
      {labelIndexes.map(index => {
        const point = points[index];
        return <text key={point.period} className="analytics-trend-axis-label" x={point.x} y={height - 12} textAnchor={index === 0 ? 'start' : index === rows.length - 1 ? 'end' : 'middle'}>
          {new Date(point.period).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
        </text>;
      })}
    </svg>
  </div>;
}

export function StateRiskComparison({ rows }: { rows: { state: string; riskLevel: string; count: number }[] }) {
  const levels = [
    { key: 'CRITICAL', className: 'critical' },
    { key: 'HIGH', className: 'high' },
    { key: 'MODERATE', className: 'moderate' },
    { key: 'LOW', className: 'low' },
  ];
  const states = [...new Set(rows.map(row => row.state))]
    .map(state => ({
      state,
      values: levels.map(level => rows.find(row => row.state === state && row.riskLevel === level.key)?.count ?? 0),
    }))
    .map(item => ({ ...item, total: item.values.reduce((sum, count) => sum + count, 0) }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);
  const maximum = Math.max(1, ...states.map(item => item.total));

  return <div className="analytics-state-risk">
    <div className="analytics-risk-legend">{levels.map(level => <span key={level.key}><i className={`risk-swatch ${level.className}`}/>{format(level.key)}</span>)}</div>
    {states.map(item => <div className="analytics-state-risk-row" key={item.state}>
      <div className="analytics-state-risk-label"><span>{item.state}</span><strong>{item.total}</strong></div>
      <div className="analytics-state-risk-track" role="img" aria-label={`${item.state}: ${item.total} cases`}>
        {item.values.map((count, index) => count > 0 && <span key={levels[index].key} className={`analytics-state-risk-segment ${levels[index].className}`} style={{ width: `${count / maximum * 100}%` }} title={`${format(levels[index].key)}: ${count}`}>
          {count / maximum > 0.08 && count}
        </span>)}
      </div>
    </div>)}
  </div>;
}
