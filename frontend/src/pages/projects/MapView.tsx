/**
 * MapView — the workspace "Map" tab.
 *
 * Lists the project's Land-Acquisition-checklist KMZ files (from
 * GET /projects/{id}/map/kmz-files), each downloaded and converted to GeoJSON
 * in the browser (JSZip + togeojson). Files are shown in a tree — tick/untick a
 * file, or an individual geometry type within it, to show/hide it on the map.
 * The northern boundary is a fixed reference layer, always drawn. No uploads
 * here; KMZ files are uploaded on the record's checklist.
 */

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Spin, Empty, Alert } from 'antd';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import JSZip from 'jszip';
import { kml as kmlToGeoJson } from '@tmcw/togeojson';

import { fetchProjectKmzFiles, type ProjectKmzFile } from '@api/projects';
import { getAttachmentDownloadUrl } from '@api/attachments';
import northernBoundary from '@/assets/northernBoundary.json';

type Geom = 'polygon' | 'line' | 'point';
const GEOM_LABEL: Record<Geom, string> = { polygon: 'Polygons', line: 'Lines', point: 'Points' };
// One colour per geometry TYPE (shared across all files). Orange is deliberately
// avoided — it reads as the OpenRailwayMap network overlay.
const GEOM_COLOR: Record<Geom, string> = { polygon: '#2563eb', line: '#db2777', point: '#7c3aed' };

interface KmzGroup { geom: Geom; color: string; data: GeoJSON.FeatureCollection; on: boolean; }
interface KmzLayer { id: string; name: string; recordName: string | null; groups: KmzGroup[] }

// Shared styling for the top-right map overlay toggles (OSM rail network, Hillshade).
const CHECKBOX_LABEL_STYLE: CSSProperties = {
  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, height: 29, padding: '0 10px',
  background: 'var(--ant-color-bg-container)', border: '1px solid var(--ant-color-border)',
  borderRadius: 4, fontSize: 12.5, fontWeight: 500, color: 'var(--ant-color-text)',
  boxShadow: '0 1px 4px rgba(15,23,42,.18)', whiteSpace: 'nowrap', userSelect: 'none',
};
const CHECKBOX_INPUT_STYLE: CSSProperties = {
  width: 14, height: 14, cursor: 'pointer', accentColor: 'var(--ant-color-primary)',
};

function geomBucket(t?: string): Geom | null {
  if (!t) return null;
  if (t.includes('Polygon')) return 'polygon';
  if (t.includes('LineString')) return 'line';
  if (t.includes('Point')) return 'point';
  return null;
}

// Flatten a feature into one-or-more single-geometry features. togeojson emits a
// GeometryCollection for KML <MultiGeometry> placemarks (mixed polygon/line/point);
// those were previously dropped entirely. Split them so every geometry is drawn.
function explodeFeature(f: GeoJSON.Feature): GeoJSON.Feature[] {
  if (f.geometry?.type === 'GeometryCollection') {
    return (f.geometry.geometries ?? []).map((geom) => ({
      type: 'Feature',
      properties: { ...(f.properties ?? {}) },
      geometry: geom,
    }));
  }
  return f.geometry ? [f] : [];
}

// Download a KMZ/KML attachment and convert it to grouped GeoJSON.
async function parseKmz(file: ProjectKmzFile): Promise<KmzLayer> {
  const { presignedUrl } = await getAttachmentDownloadUrl(file.attachmentId);
  const buf = await (await fetch(presignedUrl)).arrayBuffer();

  let kmlText: string;
  if (file.filename.toLowerCase().endsWith('.kml')) {
    kmlText = new TextDecoder().decode(buf);
  } else {
    const zip = await JSZip.loadAsync(buf);
    const entry = Object.keys(zip.files).find((n) => n.toLowerCase().endsWith('.kml'));
    if (!entry) throw new Error(`No .kml inside ${file.filename}`);
    kmlText = await zip.files[entry].async('text');
  }

  const dom = new DOMParser().parseFromString(kmlText, 'text/xml');
  const geojson = kmlToGeoJson(dom) as GeoJSON.FeatureCollection;
  const byGeom: Record<Geom, GeoJSON.Feature[]> = { polygon: [], line: [], point: [] };
  for (const raw of geojson.features) {
    for (const f of explodeFeature(raw)) {
      const b = geomBucket(f.geometry?.type);
      if (b) byGeom[b].push(f);
    }
  }
  const groups: KmzGroup[] = (['polygon', 'line', 'point'] as Geom[])
    .filter((g) => byGeom[g].length > 0)
    .map((g) => ({ geom: g, color: GEOM_COLOR[g], on: true, data: { type: 'FeatureCollection', features: byGeom[g] } }));
  return { id: file.attachmentId, name: file.filename, recordName: file.recordName, groups };
}

// maplibre layer ids for one file's geometry group.
function layerIdsFor(layerId: string, geom: Geom): string[] {
  const base = `k-${layerId}-${geom}`;
  if (geom === 'polygon') return [`${base}-fill`, `${base}-line`];
  if (geom === 'line') return [`${base}-line`];
  return [`${base}-pt`, `${base}-lbl`];
}

export function MapView({ projectId }: { projectId: string }) {
  const kmzQuery = useQuery({ queryKey: ['kmzFiles', projectId], queryFn: () => fetchProjectKmzFiles(projectId) });
  const files = kmzQuery.data;

  const layersQuery = useQuery({
    queryKey: ['kmzLayers', projectId, (files ?? []).map((f) => f.attachmentId).join(',')],
    queryFn: () => Promise.all((files ?? []).map((f) => parseKmz(f))),
    enabled: !!files && files.length > 0,
  });

  const [layers, setLayers] = useState<KmzLayer[]>([]);
  useEffect(() => {
    if (layersQuery.data) setLayers(layersQuery.data.map((l) => ({ ...l, groups: l.groups.map((g) => ({ ...g })) })));
  }, [layersQuery.data]);

  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const addedRef = useRef<Set<string>>(new Set());
  const [mapReady, setMapReady] = useState(false);
  const [railwayOn, setRailwayOn] = useState(true);
  const [hillshadeOn, setHillshadeOn] = useState(false);

  // ── Init the map once ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapEl.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: mapEl.current,
      style: {
        version: 8,
        sources: {
          osm: { type: 'raster', tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256, attribution: '© OpenStreetMap contributors' },
          orm: {
            type: 'raster',
            tiles: ['https://a.tiles.openrailwaymap.org/standard/{z}/{x}/{y}.png', 'https://b.tiles.openrailwaymap.org/standard/{z}/{x}/{y}.png', 'https://c.tiles.openrailwaymap.org/standard/{z}/{x}/{y}.png'],
            tileSize: 256, attribution: '© OpenRailwayMap (CC-BY-SA)',
          },
        },
        layers: [
          { id: 'osm', type: 'raster', source: 'osm' },
          { id: 'orm', type: 'raster', source: 'orm', paint: { 'raster-opacity': 0.9 } },
        ],
      },
      center: [78.9, 22.6],
      zoom: 4,
    });
    // visualizePitch: the compass also reflects tilt, and its "reset north" click
    // calls resetNorthPitch() — resetting bearing AND pitch back to flat.
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
    map.addControl(new maplibregl.ScaleControl());
    map.on('load', () => {
      // AWS Terrain DEM (Terrarium-encoded) — drives both hillshade and 3D terrain.
      map.addSource('terrain-dem', {
        type: 'raster-dem',
        tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
        encoding: 'terrarium',
        tileSize: 256,
        maxzoom: 15,
        attribution: '© AWS Terrain Tiles / Mapzen',
      });
      // Hillshade overlay — off by default, toggled by the Hillshade checkbox.
      map.addLayer({ id: 'hillshade', type: 'hillshade', source: 'terrain-dem', layout: { visibility: 'none' } });

      // Northern boundary — fixed reference line, always on.
      map.addSource('northern-boundary', { type: 'geojson', data: northernBoundary as GeoJSON.FeatureCollection });
      map.addLayer({ id: 'nb-casing', type: 'line', source: 'northern-boundary', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#ffffff', 'line-width': 5 } });
      map.addLayer({ id: 'nb-line', type: 'line', source: 'northern-boundary', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#9ca3af', 'line-width': 2.5 } });

      // 3D-terrain button — sits under the zoom controls (top-right). 1.0× is true
      // scale but reads flat except when zoomed into hills; 1.5× keeps relief visible.
      map.addControl(new maplibregl.TerrainControl({ source: 'terrain-dem', exaggeration: 1.0 }), 'top-right');
      setMapReady(true);
    });
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; addedRef.current.clear(); };
  }, []);

  // ── Toggle the OpenRailwayMap overlay ──────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    if (map.getLayer('orm')) map.setLayoutProperty('orm', 'visibility', railwayOn ? 'visible' : 'none');
  }, [railwayOn, mapReady]);

  // ── Toggle the hillshade overlay ───────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    if (map.getLayer('hillshade')) map.setLayoutProperty('hillshade', 'visibility', hillshadeOn ? 'visible' : 'none');
  }, [hillshadeOn, mapReady]);

  // ── Add parsed KMZ layers to the map (once each) ───────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    let addedAny = false;
    for (const layer of layers) {
      for (const g of layer.groups) {
        const src = `k-${layer.id}-${g.geom}`;
        if (addedRef.current.has(src)) continue;
        map.addSource(src, { type: 'geojson', data: g.data });
        const visibility = g.on ? 'visible' : 'none';
        // One colour per geometry type (g.color = GEOM_COLOR[geom]).
        if (g.geom === 'polygon') {
          map.addLayer({ id: `${src}-fill`, type: 'fill', source: src, layout: { visibility }, paint: { 'fill-color': g.color, 'fill-opacity': 0.3 } });
          map.addLayer({ id: `${src}-line`, type: 'line', source: src, layout: { visibility }, paint: { 'line-color': g.color, 'line-width': 2.5 } });
        } else if (g.geom === 'line') {
          map.addLayer({ id: `${src}-line`, type: 'line', source: src, layout: { visibility, 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': g.color, 'line-width': 4 } });
        } else {
          map.addLayer({ id: `${src}-pt`, type: 'circle', source: src, layout: { visibility }, paint: { 'circle-radius': 6, 'circle-color': g.color, 'circle-stroke-width': 1.5, 'circle-stroke-color': '#fff' } });
          map.addLayer({ id: `${src}-lbl`, type: 'symbol', source: src, layout: { visibility, 'text-field': ['get', 'name'], 'text-size': 11, 'text-offset': [0, 1.2], 'text-anchor': 'top' }, paint: { 'text-color': '#1f2937', 'text-halo-color': '#fff', 'text-halo-width': 1.4 } });
        }
        addedRef.current.add(src);
        addedAny = true;
      }
    }
    if (addedAny) fitToVisible();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layers, mapReady]);

  function setGroupVisibility(g: KmzGroup, layerId: string) {
    const map = mapRef.current;
    if (!map) return;
    layerIdsFor(layerId, g.geom).forEach((id) => map.getLayer(id) && map.setLayoutProperty(id, 'visibility', g.on ? 'visible' : 'none'));
  }

  function toggleGroup(layerId: string, geom: Geom, on: boolean) {
    setLayers((prev) =>
      prev.map((l) => {
        if (l.id !== layerId) return l;
        const groups = l.groups.map((g) => (g.geom === geom ? { ...g, on } : g));
        groups.forEach((g) => g.geom === geom && setGroupVisibility(g, layerId));
        return { ...l, groups };
      }),
    );
  }

  function toggleFile(layerId: string, on: boolean) {
    setLayers((prev) =>
      prev.map((l) => {
        if (l.id !== layerId) return l;
        const groups = l.groups.map((g) => ({ ...g, on }));
        groups.forEach((g) => setGroupVisibility(g, layerId));
        return { ...l, groups };
      }),
    );
  }

  function fitToVisible() {
    const map = mapRef.current;
    if (!map) return;
    const b = new maplibregl.LngLatBounds();
    const walk = (c: unknown): void => {
      if (Array.isArray(c) && typeof c[0] === 'number') b.extend(c as [number, number]);
      else if (Array.isArray(c)) c.forEach(walk);
    };
    for (const l of layers) for (const g of l.groups) if (g.on) g.data.features.forEach((f) => f.geometry && 'coordinates' in f.geometry && walk((f.geometry as { coordinates: unknown }).coordinates));
    if (!b.isEmpty()) map.fitBounds(b, { padding: 70, maxZoom: 14, duration: 700 });
  }

  async function download(file: KmzLayer) {
    const { presignedUrl } = await getAttachmentDownloadUrl(file.id);
    const a = document.createElement('a');
    a.href = presignedUrl;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  const loading = kmzQuery.isLoading || layersQuery.isLoading;

  return (
    <div style={{ display: 'flex', height: '100%', minHeight: 0 }}>
      {/* Left: KMZ file list */}
      <div style={{ width: 308, flexShrink: 0, background: 'var(--ant-color-bg-container)', borderRight: '1px solid var(--ant-color-border)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--ant-color-border)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>Map layers</h3>
          {layers.length > 0 && (
            <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--ant-color-text-secondary)', background: 'var(--ant-color-fill-tertiary)', borderRadius: 12, padding: '1px 9px' }}>
              {layers.filter((l) => l.groups.some((g) => g.on)).length}/{layers.length} shown
            </span>
          )}
        </div>
        <div style={{ flex: 1, overflow: 'auto', padding: '8px 8px 12px' }}>
          {loading ? (
            <Spin style={{ display: 'block', margin: '32px auto' }} />
          ) : kmzQuery.isError ? (
            <Alert type="error" showIcon message="Failed to load KMZ files" style={{ margin: 8 }} />
          ) : layersQuery.isError ? (
            <Alert type="error" showIcon message="Failed to parse a KMZ file" style={{ margin: 8 }} />
          ) : layers.length === 0 ? (
            <Empty description="No KMZ files uploaded yet" style={{ marginTop: 32 }} image={Empty.PRESENTED_IMAGE_SIMPLE} />
          ) : (
            layers.map((l) => <FileRow key={l.id} layer={l} onToggleFile={toggleFile} onToggleGroup={toggleGroup} onDownload={download} />)
          )}
        </div>
      </div>

      {/* Right: map */}
      <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
        <button
          onClick={fitToVisible}
          title="Fit map to ticked layers"
          style={{ position: 'absolute', top: 12, left: 12, zIndex: 3, cursor: 'pointer', background: 'var(--ant-color-bg-container)', border: '1px solid var(--ant-color-border)', borderRadius: 8, padding: '7px 12px', fontSize: 13, fontWeight: 600, color: 'var(--ant-color-primary)', boxShadow: '0 2px 8px rgba(15,23,42,.16)' }}
        >
          ⤢ Fit to layers
        </button>
        {/* Overlay toggles — labelled checkboxes stacked top-right, just left of the zoom buttons. */}
        <div style={{ position: 'absolute', top: 10, right: 52, zIndex: 3, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
          <label
            title="Show / hide the OpenRailwayMap network overlay"
            style={CHECKBOX_LABEL_STYLE}
          >
            <input
              type="checkbox"
              checked={railwayOn}
              onChange={(e) => setRailwayOn(e.target.checked)}
              style={CHECKBOX_INPUT_STYLE}
            />
            OSM rail network
          </label>
          <label
            title="Show / hide terrain hillshade (AWS Terrain DEM)"
            style={CHECKBOX_LABEL_STYLE}
          >
            <input
              type="checkbox"
              checked={hillshadeOn}
              onChange={(e) => setHillshadeOn(e.target.checked)}
              style={CHECKBOX_INPUT_STYLE}
            />
            Hillshade
          </label>
        </div>
        <div ref={mapEl} style={{ position: 'absolute', inset: 0 }} />
      </div>
    </div>
  );
}

// ── One KMZ file row (expandable feature-type tree) ────────────────────────────
function FileRow({ layer, onToggleFile, onToggleGroup, onDownload }: {
  layer: KmzLayer;
  onToggleFile: (id: string, on: boolean) => void;
  onToggleGroup: (id: string, geom: Geom, on: boolean) => void;
  onDownload: (l: KmzLayer) => void;
}) {
  const [open, setOpen] = useState(false);
  const onCount = layer.groups.filter((g) => g.on).length;
  const allOn = onCount === layer.groups.length;
  const someOn = onCount > 0 && !allOn;
  const cbRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (cbRef.current) cbRef.current.indeterminate = someOn; }, [someOn]);

  return (
    <div style={{ marginBottom: 4, border: `1px solid ${onCount > 0 ? 'var(--ant-color-border)' : 'transparent'}`, borderRadius: 8, background: onCount > 0 ? 'var(--ant-color-fill-quaternary)' : undefined }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 8px' }}>
        <span onClick={() => setOpen((o) => !o)} style={{ width: 18, textAlign: 'center', cursor: 'pointer', fontSize: 18, lineHeight: 1, color: 'var(--ant-color-text-secondary)', transform: open ? 'rotate(90deg)' : undefined, transition: 'transform .12s' }}>▸</span>
        <input ref={cbRef} type="checkbox" checked={allOn} onChange={(e) => onToggleFile(layer.id, e.target.checked)} style={{ width: 15, height: 15, cursor: 'pointer', flexShrink: 0, accentColor: 'var(--ant-color-primary)' }} />
        <span onClick={() => setOpen((o) => !o)} title={layer.recordName ?? undefined} style={{ flex: 1, minWidth: 0, fontWeight: 600, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{layer.name}</span>
        <button onClick={() => onDownload(layer)} title="Download KMZ" style={{ flexShrink: 0, width: 26, height: 26, border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--ant-color-text-tertiary)', borderRadius: 5, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="3" x2="12" y2="14" /><polyline points="7 9.5 12 14.5 17 9.5" /><polyline points="5 15 5 20 19 20 19 15" />
          </svg>
        </button>
      </div>
      {open && (
        <div style={{ padding: '2px 8px 8px 30px' }}>
          {layer.groups.map((g) => (
            <label key={g.geom} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 4px', fontSize: 12.5, cursor: 'pointer' }}>
              <input type="checkbox" checked={g.on} onChange={(e) => onToggleGroup(layer.id, g.geom, e.target.checked)} style={{ width: 14, height: 14, cursor: 'pointer', flexShrink: 0, accentColor: 'var(--ant-color-primary)' }} />
              <span style={{ width: 12, height: 12, borderRadius: 3, flexShrink: 0, background: g.color }} />
              <span>{GEOM_LABEL[g.geom]} <span style={{ color: 'var(--ant-color-text-tertiary)' }}>({g.data.features.length})</span></span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
