import { useEffect, useRef, useState } from 'react';

type Species = {
  species: string;
  class: string | null;
  prob_threatened: number | null;
  pred_threatened: number | null;
  lat_centroid: number;
  lon_centroid: number;
  iucn_categoria: string | null;
  is_exotic?: boolean;
};

type LayerDef = {
  id: string;
  label: string;
  color: string;
  file: string;
  type: 'polygon' | 'line';
  defaultOn: boolean;
};

// Bolivia bounding box
const BOLIVIA_BOUNDS: [[number, number], [number, number]] = [[-22.9, -69.7], [-9.6, -57.5]];

// Photos for spotlight species
const SPECIES_PHOTOS: Record<string, string> = {
  'Pteronura brasiliensis': '/img/especies/foto_pteronura.jpg',
  'Ateles chamek': '/img/especies/foto_ateles_chamek.jpg',
  'Inia geoffrensis': '/img/especies/foto_inia_geoffrensis.jpg',
  'Crax globulosa': '/img/especies/foto_crax_globulosa.jpg',
  'Cinclodes aricomae': '/img/especies/foto_cinclodes_aricomae.jpg',
  'Pauxi unicornis': '/img/especies/foto_pauxi_unicornis.jpg',
  'Charadrius alticola': '/img/especies/foto_charadrius_alticola.jpg',
  'Taoniscus nanus': '/img/especies/foto_taoniscus_nanus.jpg',
  'Catagonus wagneri': '/img/especies/foto_catagonus_wagneri.jpg',
  'Dasypterus ega': '/img/especies/foto_dasypterus_ega.jpg',
};

const SPECIES_COMMON: Record<string, string> = {
  'Pteronura brasiliensis': 'Nutria gigante',
  'Ateles chamek': 'Marimono negro',
  'Inia geoffrensis': 'Delfín rosado',
  'Crax globulosa': 'Paujil carunculado',
  'Cinclodes aricomae': 'Churrete del Atacama',
  'Pauxi unicornis': 'Paujil de El Sira',
  'Charadrius alticola': 'Chorlo de la Puna',
  'Taoniscus nanus': 'Tinamú enano',
  'Catagonus wagneri': 'Pecarí del Chaco',
  'Dasypterus ega': 'Murciélago vespertino amarillo',
};

const SPECIES_DESC: Record<string, string> = {
  'Pteronura brasiliensis': 'El mayor mustélido del mundo. Habita ríos amazónicos y es sensible a la contaminación por mercurio.',
  'Ateles chamek': 'Mono araña amazónico, indicador clave de la salud del bosque. Los incendios de 2019 destruyeron gran parte de su hábitat.',
  'Inia geoffrensis': 'Único delfín de río rosado del mundo. Habita los ríos Mamoré, Beni e Iténez.',
  'Crax globulosa': 'Ave galliforme de los bosques inundables amazónicos, reconocible por su carúncula roja.',
  'Cinclodes aricomae': 'Posiblemente el ave más amenazada de Bolivia, con menos de 50 individuos conocidos en bofedales andinos.',
  'Pauxi unicornis': 'Ave con prominente protuberancia córnea. Habita bosques montanos del piedemonte andino.',
  'Charadrius alticola': 'Limícola especialista de salares altiplánicos sobre los 3,600 m, sin evaluación IUCN formal.',
  'Taoniscus nanus': 'El tinamú más pequeño del mundo. Habita pastizales de Cerrado en el oriente de Bolivia.',
  'Catagonus wagneri': 'Considerado extinto hasta 1975. Único artiodáctilo grande endémico del Gran Chaco.',
  'Dasypterus ega': 'Murciélago de pelaje amarillo-anaranjado. Con muy pocos registros en Bolivia, posiblemente subestimado.',
};

const LAYERS: LayerDef[] = [
  { id: 'anp', label: 'Áreas protegidas nac.', color: '#1A6B3C', file: '/data/anp_nacional.geojson', type: 'polygon', defaultOn: true },
  { id: 'anp_dep', label: 'Áreas protegidas dep.', color: '#2EA043', file: '/data/anp_departamental.geojson', type: 'polygon', defaultOn: false },
  { id: 'ti', label: 'Territorios indígenas', color: '#8957E5', file: '/data/territorios_indigenas.geojson', type: 'polygon', defaultOn: false },
  { id: 'petroleo', label: 'Bloques petroleros', color: '#D4A017', file: '/data/petroleo.geojson', type: 'polygon', defaultOn: false },
  { id: 'mineria_ilegal', label: 'Minería ilegal', color: '#C0392B', file: '/data/mineria_ilegal.geojson', type: 'polygon', defaultOn: false },
  { id: 'zonas_mineras', label: 'Concesiones mineras', color: '#E67E22', file: '/data/zonas_mineras.geojson', type: 'polygon', defaultOn: false },
  { id: 'vias', label: 'Vías nacionales', color: '#8B949E', file: '/data/vias.geojson', type: 'line', defaultOn: false },
  { id: 'quemas', label: 'Incendios 2020', color: '#E74C3C', file: '/data/quemas.geojson', type: 'polygon', defaultOn: false },
];

function getThreatColor(sp: Species): string {
  if (sp.is_exotic) return '#8B949E';
  if (sp.pred_threatened === 1) {
    if ((sp.prob_threatened ?? 0) > 0.15) return '#C0392B';
    return '#D4A017';
  }
  if (sp.iucn_categoria === 'VU' || sp.iucn_categoria === 'EN' || sp.iucn_categoria === 'CR') {
    return '#D4A017';
  }
  return '#1A6B3C';
}

function buildPopupHTML(sp: Species): string {
  const prob = sp.prob_threatened !== null ? `${(sp.prob_threatened * 100).toFixed(1)}%` : '—';
  const iucn = sp.iucn_categoria ?? 'Sin eval.';
  const cls = sp.class === 'Aves' ? 'Ave' : sp.class === 'Mammalia' ? 'Mamífero' : (sp.class ?? '—');
  const photo = SPECIES_PHOTOS[sp.species] ?? null;
  const commonName = SPECIES_COMMON[sp.species] ?? null;
  const desc = SPECIES_DESC[sp.species] ?? null;
  const color = getThreatColor(sp);

  const isExotic = sp.is_exotic
    ? '<span style="background:#8B949E;color:white;padding:2px 6px;font-size:9px;border-radius:2px;font-weight:700;letter-spacing:1px">EXÓTICA</span>'
    : '';
  const threatened = sp.pred_threatened === 1 && !sp.is_exotic
    ? '<span style="background:#C0392B;color:white;padding:2px 6px;font-size:9px;border-radius:2px;font-weight:700;letter-spacing:1px">PRED. AMENAZADA</span>'
    : '';
  const iucnThreat = (iucn === 'VU' || iucn === 'EN' || iucn === 'CR') && sp.pred_threatened !== 1
    ? `<span style="background:${iucn === 'CR' ? '#C0392B' : iucn === 'EN' ? '#E74C3C' : '#D4A017'};color:white;padding:2px 6px;font-size:9px;border-radius:2px;font-weight:700;letter-spacing:1px">IUCN ${iucn}</span>`
    : '';

  const photoHTML = photo
    ? `<div style="width:100%;height:140px;overflow:hidden;position:relative;background:#E0DDD5">
        <img src="${photo}" alt="${sp.species}" style="width:100%;height:100%;object-fit:cover;display:block"/>
        <div style="position:absolute;inset:0;background:linear-gradient(to top,rgba(26,26,26,0.7) 0%,transparent 55%)"></div>
        <div style="position:absolute;bottom:8px;left:10px;right:10px">
          ${commonName ? `<p style="font-size:12px;font-weight:700;color:white;line-height:1.2;margin:0 0 2px">${commonName}</p>` : ''}
          <p style="font-size:10px;font-style:italic;color:rgba(255,255,255,0.8);line-height:1.2;margin:0">${sp.species}</p>
        </div>
      </div>`
    : '';

  return `
    <div style="width:260px;font-family:Inter,sans-serif;overflow:hidden;border-radius:2px">
      ${photoHTML}
      <div style="padding:${photo ? '10px 12px 12px' : '14px 12px 14px'}">
        ${!photo && commonName ? `<p style="font-size:13px;font-weight:700;color:#1A1A1A;margin-bottom:1px;line-height:1.2">${commonName}</p>` : ''}
        ${!photo ? `<p style="font-size:11px;font-style:italic;color:#6B6B6B;margin-bottom:6px;line-height:1.3">${sp.species}</p>` : ''}
        ${!photo && !commonName ? `<p style="font-size:12px;font-weight:600;font-style:italic;color:#1A1A1A;margin-bottom:6px;line-height:1.3">${sp.species}</p>` : ''}
        <p style="font-size:10px;color:#8B949E;margin-bottom:7px">${cls}</p>

        ${desc ? `<p style="font-size:11px;color:#6B6B6B;line-height:1.55;margin-bottom:10px;border-left:2px solid #E0DDD5;padding-left:7px">${desc}</p>` : ''}

        <div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:${sp.prob_threatened !== null ? '10px' : '0'}">
          <span style="background:#E0DDD5;color:#1A1A1A;padding:2px 6px;font-size:9px;border-radius:2px;font-weight:600">IUCN: ${iucn}</span>
          ${threatened}${iucnThreat}${isExotic}
        </div>

        ${sp.prob_threatened !== null ? `
          <div>
            <div style="display:flex;justify-content:space-between;margin-bottom:4px">
              <span style="font-size:9px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#6B6B6B">Prob. amenaza</span>
              <span style="font-size:9px;font-weight:700;color:${color}">${prob}</span>
            </div>
            <div style="height:2px;background:#E0DDD5;border-radius:1px">
              <div style="height:100%;width:${Math.min((sp.prob_threatened ?? 0) * 100, 100)}%;background:${color};border-radius:1px"></div>
            </div>
          </div>
        ` : ''}
      </div>
    </div>
  `;
}

export default function MapIsland() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const leafletLayersRef = useRef<Record<string, any>>({});
  const [activeLayers, setActiveLayers] = useState<Set<string>>(
    new Set(LAYERS.filter(l => l.defaultOn).map(l => l.id))
  );
  const [loading, setLoading] = useState(true);
  const [speciesFilter, setSpeciesFilter] = useState<'all' | 'threatened' | 'predicted'>('all');
  const speciesLayerRef = useRef<any>(null);
  const allSpeciesRef = useRef<Species[]>([]);
  const versionCleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (mapRef.current || !containerRef.current) return;

    import('leaflet').then((L) => {
      const map = L.map(containerRef.current!, {
        minZoom: 6,
        maxZoom: 13,
        zoomControl: false,
        maxBounds: BOLIVIA_BOUNDS,
        maxBoundsViscosity: 1.0,
      });

      // Fit map to Bolivia on init
      map.fitBounds(BOLIVIA_BOUNDS, { padding: [24, 24] });

      L.control.zoom({ position: 'bottomright' }).addTo(map);

      // CartoDB Voyager — claro y minimalista
      L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> © <a href="https://carto.com">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 19,
      }).addTo(map);

      mapRef.current = map;

      // Load species points (respect saved version if present)
      const savedFile = localStorage.getItem('bioalerta_version_file');
      const allFile = savedFile
        ? savedFile.replace('species_', 'species_all_').replace(/^species_all_v/, 'species_all_v')
        : '/data/species_all.json';
      // Fallback: if versioned all-file doesn't exist, use default
      const fetchAll = (file: string) =>
        fetch(file).then(r => r.ok ? r.json() : fetch('/data/species_all.json').then(r => r.json()));

      fetchAll(savedFile ? `/data/${allFile}` : '/data/species_all.json')
        .then((data: Species[]) => {
          allSpeciesRef.current = data;
          renderSpeciesLayer(L, map, data, speciesFilter);
          setLoading(false);
        });

      // Load default-on layer (ANP nacional)
      loadGeoJSONLayer(L, map, LAYERS[0]);

      // Listen for version changes from nav
      const onVersionChange = (e: Event) => {
        const { file } = (e as CustomEvent).detail as { file: string; version: string };
        // Derive all-species filename: species_v2.0.json → species_all_v2.0.json
        const allF = `/data/${file.replace(/^species_/, 'species_all_')}`;
        fetch(allF)
          .then(r => r.ok ? r.json() : fetch('/data/species_all.json').then(r => r.json()))
          .then((data: Species[]) => {
            allSpeciesRef.current = data;
            renderSpeciesLayer(L, map, data, 'all');
          });
      };
      window.addEventListener('bioalerta:version-change', onVersionChange);
      versionCleanupRef.current = () => window.removeEventListener('bioalerta:version-change', onVersionChange);
    });

    return () => { versionCleanupRef.current?.(); };
  }, []);

  function renderSpeciesLayer(L: any, map: any, data: Species[], filter: string) {
    if (speciesLayerRef.current) {
      map.removeLayer(speciesLayerRef.current);
    }

    const filtered = filter === 'threatened'
      ? data.filter(s => s.iucn_categoria === 'VU' || s.iucn_categoria === 'EN' || s.iucn_categoria === 'CR')
      : filter === 'predicted'
      ? data.filter(s => s.pred_threatened === 1 && !s.is_exotic)
      : data;

    const layer = L.layerGroup();

    filtered.forEach(sp => {
      if (!sp.lat_centroid || !sp.lon_centroid) return;
      const color = getThreatColor(sp);
      const radius = (sp.pred_threatened === 1 && !sp.is_exotic) ? 7 : 5;

      const circle = L.circleMarker([sp.lat_centroid, sp.lon_centroid], {
        radius,
        fillColor: color,
        color: 'white',
        weight: 1,
        opacity: 1,
        fillOpacity: 0.85,
      });
      circle.bindPopup(buildPopupHTML(sp), { maxWidth: 260, minWidth: 240, className: 'bioalerta-popup' });
      layer.addLayer(circle);
    });

    layer.addTo(map);
    speciesLayerRef.current = layer;
  }

  function loadGeoJSONLayer(L: any, map: any, layerDef: LayerDef) {
    fetch(layerDef.file)
      .then(r => r.json())
      .then(data => {
        const style = layerDef.type === 'line'
          ? { color: layerDef.color, weight: 1.5, opacity: 0.6 }
          : { color: layerDef.color, weight: 1, opacity: 0.8, fillColor: layerDef.color, fillOpacity: 0.12 };

        const geojsonLayer = L.geoJSON(data, {
          style,
          onEachFeature: (feature: any, layer: any) => {
            const props = feature.properties || {};
            const name = props.nombre || props.tipo_miner || props.pais || layerDef.label;
            if (name) layer.bindTooltip(name, { sticky: true, className: 'leaflet-tooltip-custom' });
          },
        });

        leafletLayersRef.current[layerDef.id] = geojsonLayer;
        geojsonLayer.addTo(map);
      })
      .catch(() => {
        console.warn(`Layer ${layerDef.id} not available yet`);
      });
  }

  const toggleLayer = (layerId: string) => {
    if (!mapRef.current) return;

    import('leaflet').then(L => {
      const newActive = new Set(activeLayers);

      if (newActive.has(layerId)) {
        newActive.delete(layerId);
        if (leafletLayersRef.current[layerId]) {
          mapRef.current.removeLayer(leafletLayersRef.current[layerId]);
        }
      } else {
        newActive.add(layerId);
        const layerDef = LAYERS.find(l => l.id === layerId)!;
        if (leafletLayersRef.current[layerId]) {
          leafletLayersRef.current[layerId].addTo(mapRef.current);
        } else {
          loadGeoJSONLayer(L, mapRef.current, layerDef);
        }
      }

      setActiveLayers(newActive);
    });
  };

  const changeFilter = (filter: 'all' | 'threatened' | 'predicted') => {
    setSpeciesFilter(filter);
    if (mapRef.current && allSpeciesRef.current.length > 0) {
      import('leaflet').then(L => {
        renderSpeciesLayer(L, mapRef.current, allSpeciesRef.current, filter);
      });
    }
  };

  return (
    <div style={{ display: 'flex', height: '100%', position: 'relative' }}>
      {/* Sidebar */}
      <div style={{
        width: '280px',
        height: '100%',
        background: 'var(--color-bg)',
        borderRight: '1px solid var(--color-border)',
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 10,
        flexShrink: 0,
      }}>
        {/* Species filter */}
        <div style={{ padding: '1.5rem 1.25rem', borderBottom: '1px solid var(--color-border)' }}>
          <p style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-secondary)', marginBottom: '0.75rem' }}>
            Especies
          </p>
          {(['all', 'threatened', 'predicted'] as const).map(f => (
            <button
              key={f}
              onClick={() => changeFilter(f)}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '0.5rem 0.75rem',
                marginBottom: '0.25rem',
                border: '1px solid',
                borderColor: speciesFilter === f ? 'var(--color-accent)' : 'var(--color-border)',
                background: speciesFilter === f ? 'var(--color-accent-light)' : 'transparent',
                color: speciesFilter === f ? 'var(--color-accent)' : 'var(--color-secondary)',
                fontSize: '0.8rem',
                fontWeight: speciesFilter === f ? 600 : 400,
                borderRadius: '2px',
                cursor: 'pointer',
                transition: 'all 0.15s',
                fontFamily: 'Inter, sans-serif',
              }}
            >
              {f === 'all' ? 'Todas (1,704)' : f === 'threatened' ? 'Con IUCN amenaza' : 'Predichas amenazadas (44)'}
            </button>
          ))}
        </div>

        {/* Layer toggles */}
        <div style={{ padding: '1.5rem 1.25rem', flex: 1 }}>
          <p style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-secondary)', marginBottom: '0.75rem' }}>
            Capas ambientales
          </p>
          {LAYERS.map(layer => (
            <button
              key={layer.id}
              onClick={() => toggleLayer(layer.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.6rem',
                width: '100%',
                textAlign: 'left',
                padding: '0.5rem 0.75rem',
                marginBottom: '0.25rem',
                border: '1px solid',
                borderColor: activeLayers.has(layer.id) ? layer.color : 'var(--color-border)',
                background: activeLayers.has(layer.id) ? `${layer.color}18` : 'transparent',
                borderRadius: '2px',
                cursor: 'pointer',
                transition: 'all 0.15s',
                fontFamily: 'Inter, sans-serif',
              }}
            >
              <span style={{
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                background: layer.color,
                flexShrink: 0,
                opacity: activeLayers.has(layer.id) ? 1 : 0.35,
              }} />
              <span style={{
                fontSize: '0.78rem',
                color: activeLayers.has(layer.id) ? 'var(--color-text)' : 'var(--color-secondary)',
                fontWeight: activeLayers.has(layer.id) ? 500 : 400,
              }}>
                {layer.label}
              </span>
            </button>
          ))}
        </div>

        {/* Legend */}
        <div style={{ padding: '1rem 1.25rem', borderTop: '1px solid var(--color-border)' }}>
          <p style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-secondary)', marginBottom: '0.6rem' }}>
            Leyenda de riesgo
          </p>
          {[
            { color: '#C0392B', label: 'Alta probabilidad (>15%)' },
            { color: '#D4A017', label: 'Media probabilidad (5-15%)' },
            { color: '#1A6B3C', label: 'Sin predicción / segura' },
            { color: '#8B949E', label: 'Especie exótica' },
          ].map(item => (
            <div key={item.color} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: item.color, flexShrink: 0 }} />
              <span style={{ fontSize: '0.72rem', color: 'var(--color-secondary)' }}>{item.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Map */}
      <div style={{ flex: 1, position: 'relative' }}>
        {loading && (
          <div style={{
            position: 'absolute', inset: 0, zIndex: 5,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'var(--color-surface)',
          }}>
            <p style={{ color: 'var(--color-secondary)', fontSize: '0.875rem' }}>Cargando mapa...</p>
          </div>
        )}
        <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
      </div>
    </div>
  );
}
