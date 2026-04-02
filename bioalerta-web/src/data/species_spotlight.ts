export type SpotlightSpecies = {
  scientificName: string;
  commonNameEs: string;
  class: 'Aves' | 'Mammalia';
  photo: string;
  iucn: 'VU' | 'EN' | 'CR' | 'LC' | 'NT' | null;
  probThreatened: number;
  description: string;
  threats: string[];
  lat: number;
  lon: number;
};

export const SPOTLIGHT: SpotlightSpecies[] = [
  {
    scientificName: 'Pteronura brasiliensis',
    commonNameEs: 'Nutria gigante',
    class: 'Mammalia',
    photo: '/img/especies/foto_pteronura.jpg',
    iucn: 'VU',
    probThreatened: 0.267,
    description:
      'El mayor mustélido del mundo alcanza hasta 1.8 m de longitud. Habita los ríos de la cuenca amazónica boliviana y es altamente sensible a la contaminación mercurial derivada de la minería ilegal.',
    threats: ['Contaminación por mercurio', 'Pesca ilegal', 'Deforestación ribereña'],
    lat: -13.5,
    lon: -63.8,
  },
  {
    scientificName: 'Ateles chamek',
    commonNameEs: 'Marimono negro',
    class: 'Mammalia',
    photo: '/img/especies/foto_ateles_chamek.jpg',
    iucn: 'EN',
    probThreatened: 0.220,
    description:
      'Mono araña de la Amazonia boliviana y uno de los primates más vulnerables del continente. Requiere bosque maduro continuo y es indicador clave de la salud del ecosistema. Los incendios de 2019 destruyeron gran parte de su hábitat.',
    threats: ['Fragmentación forestal', 'Incendios 2019', 'Cacería furtiva'],
    lat: -14.0,
    lon: -65.2,
  },
  {
    scientificName: 'Inia geoffrensis',
    commonNameEs: 'Delfín rosado',
    class: 'Mammalia',
    photo: '/img/especies/foto_inia_geoffrensis.jpg',
    iucn: 'EN',
    probThreatened: 0.187,
    description:
      'El único delfín de río rosado del mundo habita los ríos Mamoré, Beni e Iténez en Bolivia. Su color característico se intensifica con la edad. La sobrepesca y el mercurio de la minería ilegal son sus principales amenazas.',
    threats: ['Mercurio por minería', 'Sobrepesca', 'Captura incidental'],
    lat: -12.0,
    lon: -64.5,
  },
  {
    scientificName: 'Crax globulosa',
    commonNameEs: 'Paujil carunculado',
    class: 'Aves',
    photo: '/img/especies/foto_crax_globulosa.jpg',
    iucn: 'EN',
    probThreatened: 0.237,
    description:
      'Ave galliforme de los bosques inundables amazónicos, reconocible por su llamativa carúncula roja. Es una de las aves más amenazadas de Bolivia, con poblaciones dispersas y muy reducidas a lo largo del Río Mamoré.',
    threats: ['Pérdida de bosques de várzea', 'Cacería', 'Inundaciones atípicas'],
    lat: -11.5,
    lon: -65.8,
  },
  {
    scientificName: 'Cinclodes aricomae',
    commonNameEs: 'Churrete del Atacama',
    class: 'Aves',
    photo: '/img/especies/foto_cinclodes_aricomae.jpg',
    iucn: 'CR',
    probThreatened: 0.230,
    description:
      'Uno de los paseriformes más raros de Bolivia, restringido a bofedales y turberas de alta montaña en los Andes del sur. Con posiblemente menos de 50 individuos conocidos, es el ave más amenazada del país.',
    threats: ['Degradación de bofedales', 'Sobrepastoreo', 'Cambio climático'],
    lat: -21.5,
    lon: -68.0,
  },
  {
    scientificName: 'Pauxi unicornis',
    commonNameEs: 'Paujil de El Sira',
    class: 'Aves',
    photo: '/img/especies/foto_pauxi_unicornis.jpg',
    iucn: 'VU',
    probThreatened: 0.180,
    description:
      'Ave galliforme con una prominente protuberancia córnea en el pico, de aspecto prehistórico. Habita los bosques montanos del piedemonte andino en el departamento de Cochabamba y Santa Cruz.',
    threats: ['Deforestación en piedemonte', 'Cacería de subsistencia', 'Expansión agrícola'],
    lat: -17.5,
    lon: -65.0,
  },
  {
    scientificName: 'Charadrius alticola',
    commonNameEs: 'Chorlo de la Puna',
    class: 'Aves',
    photo: '/img/especies/foto_charadrius_alticola.jpg',
    iucn: null,
    probThreatened: 0.227,
    description:
      'Limícola especialista de salares y lagunas altiplánicas por encima de los 3,600 m. Sin evaluación formal de la IUCN, el modelo lo identifica como una de las aves con mayor probabilidad de riesgo, posiblemente afectado por la reducción de humedales de altura.',
    threats: ['Desecación de salares', 'Minería de litio', 'Cambio climático'],
    lat: -22.0,
    lon: -67.5,
  },
  {
    scientificName: 'Taoniscus nanus',
    commonNameEs: 'Tinamú enano',
    class: 'Aves',
    photo: '/img/especies/foto_taoniscus_nanus.jpg',
    iucn: 'VU',
    probThreatened: 0.173,
    description:
      'El tinamú más pequeño del mundo, apenas mayor que un gorrión. Habitante críptico de los pastizales de Cerrado en el oriente de Bolivia, su tamaño reducido y comportamiento esquivo lo hacen difícil de detectar y monitorear.',
    threats: ['Conversión de Cerrado a soya', 'Fuegos estacionales', 'Ganadería extensiva'],
    lat: -17.0,
    lon: -60.5,
  },
  {
    scientificName: 'Catagonus wagneri',
    commonNameEs: 'Pecarí del Chaco',
    class: 'Mammalia',
    photo: '/img/especies/foto_catagonus_wagneri.jpg',
    iucn: 'VU',
    probThreatened: 0.117,
    description:
      'Considerado extinto hasta su redescubrimiento en 1975, el pecarí chaqueño es el único artiodáctilo grande endémico del Gran Chaco. Bolivia alberga una fracción crítica de la población mundial.',
    threats: ['Deforestación del Chaco', 'Expansión ganadera', 'Cacería'],
    lat: -20.5,
    lon: -62.0,
  },
  {
    scientificName: 'Dasypterus ega',
    commonNameEs: 'Murciélago vespertino amarillo',
    class: 'Mammalia',
    photo: '/img/especies/foto_dasypterus_ega.jpg',
    iucn: null,
    probThreatened: 0.283,
    description:
      'Murciélago insectívoro de pelaje amarillo-anaranjado que habita bosques riparios y zonas arboladas. Con muy pocos registros en Bolivia, el modelo lo señala como de alto riesgo potencial, posiblemente subestimado en los inventarios actuales.',
    threats: ['Pérdida de bosques riparios', 'Contaminación lumínica', 'Insecticidas agrícolas'],
    lat: -16.5,
    lon: -64.0,
  },
];

export function toSlug(scientificName: string): string {
  return scientificName.toLowerCase().replace(/ /g, '-');
}

export const SPOTLIGHT_MAP: Record<string, SpotlightSpecies> = Object.fromEntries(
  SPOTLIGHT.map((s) => [s.scientificName, s])
);
