'use client';

import { useEffect, useMemo, useState } from 'react';
import { Layers, MapPin } from 'lucide-react';

type Position = [number, number];
type Geometry =
  | { type: 'Polygon'; coordinates: Position[][] }
  | { type: 'MultiPolygon'; coordinates: Position[][][] };
type Boundary = { type: 'Feature'; properties: { shapeName: string }; geometry: Geometry };
type FeatureCollection = { type: 'FeatureCollection'; features: Boundary[] };
type Incident = {
  id: string;
  stateCode: string | null;
  countyCode: string | null;
  latitude: number;
  longitude: number;
  category: string;
  riskLevel: string;
};
export type IncidentCategoryCount = { category: string; count: number };

const STATE_ALIASES: Record<string, string[]> = {
  'Central Equatoria': ['CES', 'Central Equatoria'],
  'Eastern Equatoria': ['EES', 'Eastern Equatoria'],
  'Western Equatoria': ['WES', 'Western Equatoria'],
  'Western Bahr el Ghazal': ['WBeG', 'Western Bahr el Ghazal'],
  'Northern Bahr el Ghazal': ['NBeG', 'Northern Bahr el Ghazal'],
  'Upper Nile': ['UPN', 'Upper Nile'],
};

const WIDTH = 800;
const HEIGHT = 820;
const PADDING = 30;

function normalize(value: string | null | undefined) {
  return value?.trim().toLocaleLowerCase().replace(/[^a-z0-9]/g, '') ?? '';
}

function getRings(geometry: Geometry): Position[][] {
  return geometry.type === 'Polygon' ? geometry.coordinates : geometry.coordinates.flat();
}

function getOuterRings(feature: Boundary): Position[][] {
  return feature.geometry.type === 'Polygon'
    ? [feature.geometry.coordinates[0]]
    : feature.geometry.coordinates.map(polygon => polygon[0]);
}

function getCenter(feature: Boundary): Position {
  const positions = getOuterRings(feature).flat().filter(Boolean);
  const total = positions.reduce(([lng, lat], point) => [lng + point[0], lat + point[1]], [0, 0]);
  return [total[0] / positions.length, total[1] / positions.length];
}

function pointInRing(point: Position, ring: Position[]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > point[1]) !== (yj > point[1]) && point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

function featureContains(feature: Boundary, point: Position) {
  const polygons = feature.geometry.type === 'Polygon'
    ? [feature.geometry.coordinates]
    : feature.geometry.coordinates;
  return polygons.some(([outer, ...holes]) =>
    pointInRing(point, outer) && !holes.some(hole => pointInRing(point, hole)),
  );
}

function countyStateName(county: Boundary, states: Boundary[]) {
  const points = getOuterRings(county).flatMap(ring => {
    const stride = Math.max(1, Math.ceil(ring.length / 20));
    return ring.filter((_, index) => index % stride === 0);
  });
  let match = '';
  let maxHits = 0;
  for (const state of states) {
    const hits = points.reduce((count, point) => count + Number(featureContains(state, point)), 0);
    if (hits > maxHits) {
      match = state.properties.shapeName;
      maxHits = hits;
    }
  }
  return match;
}

function createProjector(features: Boundary[]) {
  const positions = features.flatMap(feature => getRings(feature.geometry).flat());
  const minLng = Math.min(...positions.map(([lng]) => lng));
  const maxLng = Math.max(...positions.map(([lng]) => lng));
  const minLat = Math.min(...positions.map(([, lat]) => lat));
  const maxLat = Math.max(...positions.map(([, lat]) => lat));
  const scale = Math.min((WIDTH - PADDING * 2) / (maxLng - minLng), (HEIGHT - PADDING * 2) / (maxLat - minLat));
  const offsetX = (WIDTH - (maxLng - minLng) * scale) / 2;
  const offsetY = (HEIGHT - (maxLat - minLat) * scale) / 2;
  return ([lng, lat]: Position): Position => [
    offsetX + (lng - minLng) * scale,
    offsetY + (maxLat - lat) * scale,
  ];
}

function featurePath(feature: Boundary, project: (point: Position) => Position) {
  return getRings(feature.geometry).map(ring =>
    `${ring.map((point, index) => {
      const [x, y] = project(point);
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ')} Z`,
  ).join(' ');
}

function canonicalState(value: string | null | undefined, states: Boundary[]) {
  const key = normalize(value);
  return states.find(state =>
    normalize(state.properties.shapeName) === key ||
    (STATE_ALIASES[state.properties.shapeName] ?? []).some(alias => normalize(alias) === key),
  )?.properties.shapeName ?? '';
}

function riskIsHigh(level: string) {
  return level === 'HIGH' || level === 'CRITICAL';
}

export default function GisMap({
  api,
  phase,
  embedded = false,
  selectedCategories,
  onCategoryCounts,
  searchTerm = '',
  selectedRisk,
  refreshKey = 0,
}: {
  api: string;
  phase: string;
  embedded?: boolean;
  selectedCategories?: string[];
  onCategoryCounts?: (categories: IncidentCategoryCount[]) => void;
  searchTerm?: string;
  selectedRisk?: string;
  refreshKey?: number;
}) {
  const [states, setStates] = useState<Boundary[]>([]);
  const [counties, setCounties] = useState<Boundary[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [state, setState] = useState('');
  const [county, setCounty] = useState('');
  const [category, setCategory] = useState('');
  const [risk, setRisk] = useState('');
  const [showStates, setShowStates] = useState(true);
  const [showCounties, setShowCounties] = useState(true);
  const [showHotspots, setShowHotspots] = useState(true);
  const [boundaryError, setBoundaryError] = useState('');
  const [incidentError, setIncidentError] = useState('');
  const [boundariesLoading, setBoundariesLoading] = useState(true);
  const [incidentsLoading, setIncidentsLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    async function loadBoundaries() {
      try {
        const [stateResponse, countyResponse] = await Promise.all([
          fetch('/geo/south-sudan-states.geojson', { signal: controller.signal }),
          fetch('/geo/south-sudan-counties.geojson', { signal: controller.signal }),
        ]);
        if (!stateResponse.ok || !countyResponse.ok) throw new Error('Administrative boundary data is unavailable.');
        const [stateData, countyData] = await Promise.all([
          stateResponse.json() as Promise<FeatureCollection>,
          countyResponse.json() as Promise<FeatureCollection>,
        ]);
        setStates(stateData.features);
        setCounties(countyData.features);
      } catch (e) {
        if (!controller.signal.aborted) setBoundaryError(e instanceof Error ? e.message : 'Unable to load administrative boundaries.');
      } finally {
        if (!controller.signal.aborted) setBoundariesLoading(false);
      }
    }
    void loadBoundaries();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    async function loadIncidents() {
      setIncidentsLoading(true);
      setIncidentError('');
      try {
        const params = new URLSearchParams();
        if (phase) params.set('phase', phase);
        if (state) params.set('state', state);
        if (county) params.set('county', county);
        const suffix = params.size ? `?${params}` : '';
        const response = await fetch(`${api}/operations/map-points${suffix}`, {
          credentials: 'include',
          signal: controller.signal,
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || 'Map data unavailable.');
        setIncidents(data);
      } catch (e) {
        if (!controller.signal.aborted) setIncidentError(e instanceof Error ? e.message : 'Unable to load incident locations.');
      } finally {
        if (!controller.signal.aborted) setIncidentsLoading(false);
      }
    }
    void loadIncidents();
    return () => controller.abort();
  }, [api, phase, state, county, refreshKey]);

  const project = useMemo(() => states.length ? createProjector(states) : null, [states]);
  const countiesByState = useMemo(() => new Map(
    counties.map(feature => [feature.properties.shapeName, countyStateName(feature, states)]),
  ), [counties, states]);
  const error = incidentError || boundaryError;
  const visibleCounties = useMemo(() => {
    if (!state) return counties;
    return counties.filter(feature => countiesByState.get(feature.properties.shapeName) === state);
  }, [counties, countiesByState, state]);
  const filteredIncidents = useMemo(() => incidents.filter(item =>
    (selectedCategories === undefined ? !category || item.category === category : selectedCategories.includes(item.category)) &&
    (!(selectedRisk === undefined ? risk : selectedRisk) || item.riskLevel === (selectedRisk === undefined ? risk : selectedRisk)) &&
    (!searchTerm || `${item.category} ${item.stateCode || ''} ${item.countyCode || ''}`.toLowerCase().includes(searchTerm.toLowerCase())),
  ), [category, incidents, risk, searchTerm, selectedCategories, selectedRisk]);
  const stateCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of filteredIncidents) {
      const name = canonicalState(item.stateCode, states);
      if (name) counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    return counts;
  }, [filteredIncidents, states]);
  const countyCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of filteredIncidents) {
      const name = normalize(item.countyCode);
      if (name) counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    return counts;
  }, [filteredIncidents]);
  const hotspots = useMemo(() => {
    const buckets = new Map<string, { longitude: number; latitude: number; count: number; highRisk: number }>();
    for (const item of filteredIncidents) {
      const x = Math.floor(item.longitude / 0.18);
      const y = Math.floor(item.latitude / 0.18);
      const key = `${x}:${y}`;
      const bucket = buckets.get(key) ?? {
        longitude: (x + 0.5) * 0.18,
        latitude: (y + 0.5) * 0.18,
        count: 0,
        highRisk: 0,
      };
      bucket.count += 1;
      if (riskIsHigh(item.riskLevel)) bucket.highRisk += 1;
      buckets.set(key, bucket);
    }
    return [...buckets.values()];
  }, [filteredIncidents]);
  const categories = useMemo(() => [...new Set(incidents.map(item => item.category))].sort(), [incidents]);
  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    incidents.forEach(item => counts.set(item.category, (counts.get(item.category) ?? 0) + 1));
    return [...counts.entries()].map(([value, count]) => ({ category: value, count }));
  }, [incidents]);

  useEffect(() => { onCategoryCounts?.(categoryCounts); }, [categoryCounts, onCategoryCounts]);

  function selectState(value: string) {
    setState(value);
    setCounty('');
  }

  return (
    <section className={`card gis-card${embedded ? ' gis-card-embedded' : ''}`} aria-labelledby={embedded ? undefined : 'gis-title'} aria-label={embedded ? 'South Sudan incident map' : undefined}>
      {!embedded && <div className="gis-heading">
        <div>
          <div className="eyebrow">INTERACTIVE GEOGRAPHIC VIEW</div>
          <h2 id="gis-title">South Sudan incident map</h2>
          <p className="muted">Explore report density by administrative area. Hotspots are grouped to protect precise locations.</p>
        </div>
        <div className="gis-count"><MapPin size={17}/><strong>{filteredIncidents.length}</strong><span>reports shown</span></div>
      </div>}
      <div className="gis-controls">
        <label>State
          <select value={state} onChange={event => selectState(event.target.value)}>
            <option value="">All states</option>
            {states.map(feature => <option key={feature.properties.shapeName} value={feature.properties.shapeName}>{feature.properties.shapeName}</option>)}
          </select>
        </label>
        <label>County
          <select value={county} onChange={event => setCounty(event.target.value)} disabled={!state}>
            <option value="">All counties</option>
            {visibleCounties.map(feature => <option key={feature.properties.shapeName} value={feature.properties.shapeName}>{feature.properties.shapeName}</option>)}
          </select>
        </label>
        {selectedCategories === undefined && <label>Category
          <select value={category} onChange={event => setCategory(event.target.value)}>
            <option value="">All categories</option>
            {categories.map(value => <option key={value} value={value}>{value.replaceAll('_', ' ')}</option>)}
          </select>
        </label>}
        {selectedRisk === undefined && <label>Risk level
          <select value={risk} onChange={event => setRisk(event.target.value)}>
            <option value="">All risk levels</option>
            {['CRITICAL', 'HIGH', 'MODERATE', 'LOW'].map(value => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>}
      </div>
      <div className="gis-layout">
        <div className="gis-map-wrap">
          <div className="gis-map-toolbar" aria-label="Map layers">
            <span><Layers size={15}/> Layers</span>
            <label><input type="checkbox" checked={showStates} onChange={event => setShowStates(event.target.checked)}/> States</label>
            <label><input type="checkbox" checked={showCounties} onChange={event => setShowCounties(event.target.checked)}/> Counties</label>
            <label><input type="checkbox" checked={showHotspots} onChange={event => setShowHotspots(event.target.checked)}/> Hotspots</label>
          </div>
          {error && <p className="error gis-error" role="alert">{error}</p>}
          {boundariesLoading ? <div className="gis-placeholder">Loading administrative boundaries…</div> : project && (
            <svg className="gis-map" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-labelledby="gis-map-title gis-map-description">
              <title id="gis-map-title">South Sudan state and county incident map</title>
              <desc id="gis-map-description">Administrative boundaries shaded by report volume. Incident hotspots show grouped report counts.</desc>
              {showStates && states.map(feature => {
                const count = stateCounts.get(feature.properties.shapeName) ?? 0;
                return <path key={feature.properties.shapeName} className="gis-state"
                  d={featurePath(feature, project)} fill={count ? count >= 10 ? '#77b99b' : '#badbc9' : '#edf3ef'}>
                  <title>{feature.properties.shapeName}: {count} reports</title>
                </path>;
              })}
              {showCounties && counties.map(feature => {
                const count = countyCounts.get(normalize(feature.properties.shapeName)) ?? 0;
                return <path key={feature.properties.shapeName} className="gis-county"
                  d={featurePath(feature, project)} fill={count ? count >= 5 ? '#70ae91' : '#c2dfd0' : 'transparent'}>
                  <title>{feature.properties.shapeName}: {count} reports</title>
                </path>;
              })}
              {showStates && states.map(feature => {
                const [x, y] = project(getCenter(feature));
                return <text key={feature.properties.shapeName} className="gis-state-label" x={x} y={y}>{feature.properties.shapeName}</text>;
              })}
              {showCounties && state && visibleCounties.map(feature => {
                const [x, y] = project(getCenter(feature));
                return <text key={feature.properties.shapeName} className="gis-county-label" x={x} y={y}>{feature.properties.shapeName}</text>;
              })}
              {showHotspots && hotspots.map(bucket => {
                const [x, y] = project([bucket.longitude, bucket.latitude]);
                const radius = Math.min(20, 7 + Math.sqrt(bucket.count) * 2);
                return <g key={`${bucket.longitude}:${bucket.latitude}`} className={bucket.highRisk ? 'gis-hotspot high-risk' : 'gis-hotspot'}>
                  <circle cx={x} cy={y} r={radius}><title>{bucket.count} grouped report{bucket.count === 1 ? '' : 's'}{bucket.highRisk ? `, ${bucket.highRisk} high or critical risk` : ''}</title></circle>
                  {bucket.count > 1 && <text x={x} y={y + 3.5}>{bucket.count}</text>}
                </g>;
              })}
            </svg>
          )}
          {incidentsLoading && <div className="gis-loading">Refreshing incident locations…</div>}
          {!incidentsLoading && !filteredIncidents.length && !error && <div className="gis-empty">No geolocated reports match these filters.</div>}
        </div>
        {!embedded && <aside className="gis-legend">
          <h3>Map key</h3>
          <div><i className="legend-state"/> State boundary</div>
          <div><i className="legend-county"/> County boundary</div>
          <div><i className="legend-fill"/> Reports in area</div>
          <div><i className="legend-hotspot"/> Incident hotspot</div>
          <div><i className="legend-hotspot critical"/> High / critical risk</div>
          <p className="muted">Hotspots group nearby reports into approximate 20 km cells. They are not precise incident locations.</p>
          <p className="muted">Boundary data: geoBoundaries, South Sudan ADM1/ADM2 (2020), CC BY 3.0 IGO.</p>
        </aside>}
      </div>
      <p className="gis-footnote">{incidentsLoading ? 'Loading reports…' : `${filteredIncidents.length} geolocated reports · ${hotspots.length} grouped hotspot areas`} · Electoral phase filter follows the selection above.</p>
    </section>
  );
}
