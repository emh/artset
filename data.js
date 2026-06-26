// Hardcoded mock data for the Artset review prototype.
// A fictional high-end residential art placement specification.
// All measurements are in inches. No backend, no persistence.

export const project = {
  id: "project-001",
  name: "West Point Grey Residence",
  clientName: "Private Client",
  propertyName: "West Point Grey Residence",
  city: "Vancouver, BC",
  totalBudget: 42600, // == sum of artPieces prices; UI derives this at render time
};

export const STATUS = {
  SELECTED: "Selected",
  PURCHASED: "Purchased",
  PENDING: "Pending client approval",
  TO_BE_FRAMED: "To be framed",
};

// ---------------------------------------------------------------------------
// Rooms
// ---------------------------------------------------------------------------
export const rooms = [
  {
    id: "room-entry",
    name: "Entry Hall",
    type: "Circulation",
    wallIds: ["wall-entry-north", "wall-entry-east", "wall-entry-west"],
  },
  {
    id: "room-living",
    name: "Living Room",
    type: "Living Space",
    wallIds: [
      "wall-living-north",
      "wall-living-east",
      "wall-living-south",
      "wall-living-west",
    ],
  },
  {
    id: "room-dining",
    name: "Dining Room",
    type: "Dining",
    wallIds: ["wall-dining-north", "wall-dining-east", "wall-dining-south"],
  },
  {
    id: "room-primary",
    name: "Primary Bedroom",
    type: "Bedroom",
    wallIds: ["wall-primary-north", "wall-primary-east", "wall-primary-west"],
  },
  {
    id: "room-stair",
    name: "Stair Hall",
    type: "Circulation",
    wallIds: ["wall-stair-feature", "wall-stair-landing"],
  },
  {
    id: "room-upper",
    name: "Upper Hallway",
    type: "Circulation",
    wallIds: ["wall-upper-long", "wall-upper-end"],
  },
];

// ---------------------------------------------------------------------------
// Walls — segments mark usable (true) vs unusable (false) zones along length.
// ---------------------------------------------------------------------------
export const walls = [
  // Entry Hall
  {
    id: "wall-entry-north",
    roomId: "room-entry",
    name: "North Wall",
    lengthInches: 120,
    heightInches: 108,
    segments: [
      { start: 0, end: 18, usable: false, reason: "Console table zone" },
      { start: 18, end: 102, usable: true },
      { start: 102, end: 120, usable: false, reason: "Corner clearance" },
    ],
  },
  {
    id: "wall-entry-east",
    roomId: "room-entry",
    name: "East Wall",
    lengthInches: 96,
    heightInches: 108,
    segments: [
      { start: 0, end: 24, usable: false, reason: "Door swing" },
      { start: 24, end: 96, usable: true },
    ],
  },
  {
    id: "wall-entry-west",
    roomId: "room-entry",
    name: "West Wall",
    lengthInches: 96,
    heightInches: 108,
    segments: [{ start: 0, end: 96, usable: true }],
  },

  // Living Room
  {
    id: "wall-living-north",
    roomId: "room-living",
    name: "North Wall",
    lengthInches: 144,
    heightInches: 108,
    segments: [
      { start: 0, end: 12, usable: false, reason: "Corner clearance" },
      { start: 12, end: 48, usable: true },
      { start: 48, end: 72, usable: false, reason: "Fireplace surround" },
      { start: 72, end: 120, usable: true },
      { start: 120, end: 144, usable: false, reason: "Built-in shelving" },
    ],
  },
  {
    id: "wall-living-east",
    roomId: "room-living",
    name: "East Wall",
    lengthInches: 120,
    heightInches: 108,
    segments: [
      { start: 0, end: 30, usable: false, reason: "Window opening" },
      { start: 30, end: 90, usable: true },
      { start: 90, end: 120, usable: false, reason: "Window opening" },
    ],
  },
  {
    id: "wall-living-south",
    roomId: "room-living",
    name: "South Wall",
    lengthInches: 144,
    heightInches: 108,
    segments: [
      { start: 0, end: 60, usable: false, reason: "Sliding door" },
      { start: 60, end: 144, usable: true },
    ],
  },
  {
    id: "wall-living-west",
    roomId: "room-living",
    name: "West Wall",
    lengthInches: 120,
    heightInches: 108,
    segments: [{ start: 0, end: 120, usable: true }],
  },

  // Dining Room
  {
    id: "wall-dining-north",
    roomId: "room-dining",
    name: "North Wall",
    lengthInches: 132,
    heightInches: 108,
    segments: [
      { start: 0, end: 16, usable: false, reason: "Corner clearance" },
      { start: 16, end: 116, usable: true },
      { start: 116, end: 132, usable: false, reason: "Corner clearance" },
    ],
  },
  {
    id: "wall-dining-east",
    roomId: "room-dining",
    name: "East Wall",
    lengthInches: 108,
    heightInches: 108,
    segments: [
      { start: 0, end: 36, usable: true },
      { start: 36, end: 72, usable: false, reason: "Buffet credenza" },
      { start: 72, end: 108, usable: true },
    ],
  },
  {
    id: "wall-dining-south",
    roomId: "room-dining",
    name: "South Wall",
    lengthInches: 132,
    heightInches: 108,
    segments: [
      { start: 0, end: 48, usable: false, reason: "Window opening" },
      { start: 48, end: 132, usable: true },
    ],
  },

  // Primary Bedroom
  {
    id: "wall-primary-north",
    roomId: "room-primary",
    name: "North Wall",
    lengthInches: 156,
    heightInches: 120,
    segments: [
      { start: 0, end: 24, usable: false, reason: "Corner clearance" },
      { start: 24, end: 60, usable: false, reason: "Headboard zone" },
      { start: 60, end: 132, usable: true },
      { start: 132, end: 156, usable: false, reason: "Corner clearance" },
    ],
  },
  {
    id: "wall-primary-east",
    roomId: "room-primary",
    name: "East Wall",
    lengthInches: 120,
    heightInches: 120,
    segments: [
      { start: 0, end: 84, usable: true },
      { start: 84, end: 120, usable: false, reason: "Dresser zone" },
    ],
  },
  {
    id: "wall-primary-west",
    roomId: "room-primary",
    name: "West Wall",
    lengthInches: 120,
    heightInches: 120,
    segments: [
      { start: 0, end: 40, usable: false, reason: "Closet door" },
      { start: 40, end: 120, usable: true },
    ],
  },

  // Stair Hall
  {
    id: "wall-stair-feature",
    roomId: "room-stair",
    name: "Feature Wall",
    lengthInches: 180,
    heightInches: 168,
    segments: [
      { start: 0, end: 24, usable: false, reason: "Stair stringer" },
      { start: 24, end: 156, usable: true },
      { start: 156, end: 180, usable: false, reason: "Landing rail" },
    ],
  },
  {
    id: "wall-stair-landing",
    roomId: "room-stair",
    name: "Landing Wall",
    lengthInches: 96,
    heightInches: 108,
    segments: [{ start: 0, end: 96, usable: true }],
  },

  // Upper Hallway
  {
    id: "wall-upper-long",
    roomId: "room-upper",
    name: "Gallery Wall",
    lengthInches: 192,
    heightInches: 96,
    segments: [
      { start: 0, end: 18, usable: false, reason: "Corner clearance" },
      { start: 18, end: 174, usable: true },
      { start: 174, end: 192, usable: false, reason: "Door swing" },
    ],
  },
  {
    id: "wall-upper-end",
    roomId: "room-upper",
    name: "End Wall",
    lengthInches: 72,
    heightInches: 96,
    segments: [{ start: 0, end: 72, usable: true }],
  },
];

// ---------------------------------------------------------------------------
// Art pieces. imageUrl points to Unsplash stock photography.
// ---------------------------------------------------------------------------
const img = (id) =>
  `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=600&q=80`;

export const artPieces = [
  {
    id: "art-001",
    title: "Blue Fragment Study",
    artist: "Mara Ellison",
    medium: "Acrylic on canvas",
    imageUrl: img("1502759683299-cdcd6974244f"),
    widthInches: 36,
    heightInches: 48,
    price: 3200,
    status: STATUS.SELECTED,
    roomId: "room-living",
    wallId: "wall-living-north",
    placement: { startInches: 12, centerHeightInches: 60 },
  },
  {
    id: "art-002",
    title: "Ochre Window",
    artist: "Tomas Reier",
    medium: "Oil on linen",
    imageUrl: img("1536924940846-227afb31e2a5"),
    widthInches: 24,
    heightInches: 30,
    price: 2400,
    status: STATUS.PENDING,
    roomId: "room-living",
    wallId: "wall-living-north",
    placement: { startInches: 84, centerHeightInches: 58 },
  },
  {
    id: "art-003",
    title: "Tidewater No. 4",
    artist: "Mara Ellison",
    medium: "Mixed media on panel",
    imageUrl: img("1515405295579-ba7b45403062"),
    widthInches: 40,
    heightInches: 40,
    price: 4100,
    status: STATUS.PURCHASED,
    roomId: "room-living",
    wallId: "wall-living-west",
    placement: { startInches: 40, centerHeightInches: 62 },
  },
  {
    id: "art-004",
    title: "Coastline Drift",
    artist: "Ines Vautier",
    medium: "Archival pigment print",
    imageUrl: img("1554907984-15263bfd63bd"),
    widthInches: 30,
    heightInches: 20,
    price: 1800,
    status: STATUS.TO_BE_FRAMED,
    roomId: "room-living",
    wallId: "wall-living-east",
    placement: { startInches: 42, centerHeightInches: 60 },
  },
  {
    id: "art-005",
    title: "Marble Threshold",
    artist: "Johan Pek",
    medium: "Plaster relief",
    imageUrl: img("1578926375605-eaf7559b1458"),
    widthInches: 28,
    heightInches: 36,
    price: 3600,
    status: STATUS.SELECTED,
    roomId: "room-entry",
    wallId: "wall-entry-north",
    placement: { startInches: 46, centerHeightInches: 60 },
  },
  {
    id: "art-006",
    title: "Folded Light",
    artist: "Ines Vautier",
    medium: "Gelatin silver print",
    imageUrl: img("1552083375-1447ce886485"),
    widthInches: 20,
    heightInches: 24,
    price: 1500,
    status: STATUS.TO_BE_FRAMED,
    roomId: "room-entry",
    wallId: "wall-entry-west",
    placement: { startInches: 38, centerHeightInches: 58 },
  },
  {
    id: "art-007",
    title: "Vessel Series II",
    artist: "Aiko Mori",
    medium: "Glazed ceramic wall object",
    imageUrl: img("1551913902-c92207136625"),
    widthInches: 18,
    heightInches: 18,
    price: 2200,
    status: STATUS.PURCHASED,
    roomId: "room-dining",
    wallId: "wall-dining-north",
    placement: { startInches: 40, centerHeightInches: 56 },
  },
  {
    id: "art-008",
    title: "Harvest Table Study",
    artist: "Tomas Reier",
    medium: "Oil on linen",
    imageUrl: img("1547826039-bfc35e0f1ea8"),
    widthInches: 48,
    heightInches: 36,
    price: 5200,
    status: STATUS.SELECTED,
    roomId: "room-dining",
    wallId: "wall-dining-north",
    placement: { startInches: 64, centerHeightInches: 58 },
  },
  {
    id: "art-009",
    title: "Quiet Field",
    artist: "Mara Ellison",
    medium: "Acrylic on canvas",
    imageUrl: img("1543857778-c4a1a3e0b2eb"),
    widthInches: 30,
    heightInches: 30,
    price: 2900,
    status: STATUS.PENDING,
    roomId: "room-dining",
    wallId: "wall-dining-south",
    placement: { startInches: 80, centerHeightInches: 60 },
  },
  {
    id: "art-010",
    title: "Linen Horizon",
    artist: "Sora Pell",
    medium: "Hand-woven textile",
    imageUrl: img("1574182245530-967d9b3831af"),
    widthInches: 42,
    heightInches: 54,
    price: 4800,
    status: STATUS.SELECTED,
    roomId: "room-primary",
    wallId: "wall-primary-north",
    placement: { startInches: 78, centerHeightInches: 66 },
  },
  {
    id: "art-011",
    title: "Morning Index",
    artist: "Johan Pek",
    medium: "Graphite on paper",
    imageUrl: img("1577083552431-6e5fd01aa342"),
    widthInches: 22,
    heightInches: 28,
    price: 1700,
    status: STATUS.TO_BE_FRAMED,
    roomId: "room-primary",
    wallId: "wall-primary-east",
    placement: { startInches: 30, centerHeightInches: 64 },
  },
  {
    id: "art-012",
    title: "Cascade",
    artist: "Aiko Mori",
    medium: "Bronze wall sculpture",
    imageUrl: img("1531913764164-f85c52e6e654"),
    widthInches: 54,
    heightInches: 72,
    price: 6400,
    status: STATUS.PURCHASED,
    roomId: "room-stair",
    wallId: "wall-stair-feature",
    placement: { startInches: 64, centerHeightInches: 84 },
  },
  {
    id: "art-013",
    title: "Passage Study I",
    artist: "Ines Vautier",
    medium: "Archival pigment print",
    imageUrl: img("1558865869-c93f6f8482af"),
    widthInches: 20,
    heightInches: 24,
    price: 1400,
    status: STATUS.SELECTED,
    roomId: "room-upper",
    wallId: "wall-upper-long",
    placement: { startInches: 36, centerHeightInches: 54 },
  },
  {
    id: "art-014",
    title: "Passage Study II",
    artist: "Ines Vautier",
    medium: "Archival pigment print",
    imageUrl: img("1541961017774-22349e4a1262"),
    widthInches: 20,
    heightInches: 24,
    price: 1400,
    status: STATUS.PENDING,
    roomId: "room-upper",
    wallId: "wall-upper-long",
    placement: { startInches: 96, centerHeightInches: 54 },
  },
];

// ---------------------------------------------------------------------------
// Floorplans — simple plan geometry per room, in inches.
// Coordinate space: x increases right, y increases down, North is up (min y).
// `outline` is the floor polygon (for fill + bounds). `walls` maps each wall
// to its edge segment. `openings` are unwalled edges (doorways / open sides),
// drawn dashed.
// ---------------------------------------------------------------------------
export const floorplans = {
  "room-entry": {
    outline: [[0, 0], [120, 0], [120, 96], [0, 96]],
    walls: {
      "wall-entry-north": [[0, 0], [120, 0]],
      "wall-entry-east": [[120, 0], [120, 96]],
      "wall-entry-west": [[0, 0], [0, 96]],
    },
    openings: [[[0, 96], [120, 96]]],
  },
  "room-living": {
    outline: [[0, 0], [144, 0], [144, 120], [0, 120]],
    walls: {
      "wall-living-north": [[0, 0], [144, 0]],
      "wall-living-east": [[144, 0], [144, 120]],
      "wall-living-south": [[0, 120], [144, 120]],
      "wall-living-west": [[0, 0], [0, 120]],
    },
    openings: [],
  },
  "room-dining": {
    outline: [[0, 0], [132, 0], [132, 108], [0, 108]],
    walls: {
      "wall-dining-north": [[0, 0], [132, 0]],
      "wall-dining-east": [[132, 0], [132, 108]],
      "wall-dining-south": [[0, 108], [132, 108]],
    },
    openings: [[[0, 0], [0, 108]]],
  },
  "room-primary": {
    outline: [[0, 0], [156, 0], [156, 120], [0, 120]],
    walls: {
      "wall-primary-north": [[0, 0], [156, 0]],
      "wall-primary-east": [[156, 0], [156, 120]],
      "wall-primary-west": [[0, 0], [0, 120]],
    },
    openings: [[[0, 120], [156, 120]]],
  },
  "room-stair": {
    outline: [[0, 0], [180, 0], [180, 96], [0, 96]],
    walls: {
      "wall-stair-feature": [[0, 96], [180, 96]],
      "wall-stair-landing": [[0, 0], [0, 96]],
    },
    openings: [[[0, 0], [180, 0]], [[180, 0], [180, 96]]],
  },
  "room-upper": {
    outline: [[0, 0], [192, 0], [192, 72], [0, 72]],
    walls: {
      "wall-upper-long": [[0, 0], [192, 0]],
      "wall-upper-end": [[192, 0], [192, 72]],
    },
    openings: [[[0, 72], [192, 72]], [[0, 0], [0, 72]]],
  },
};

// ---------------------------------------------------------------------------
// Home layout — positions each room's floorplan within a floor plate so the
// rooms stitch together into a building plan. Each room's geometry comes from
// floorplans[roomId].outline (local, starting at 0,0); (x, y) translates it
// into floor coordinates. Offsets are chosen so room rectangles don't overlap.
// ---------------------------------------------------------------------------
export const homeLayout = {
  floors: [
    {
      name: "Main Floor",
      rooms: [
        { roomId: "room-entry", x: 0, y: 0 },
        { roomId: "room-living", x: 120, y: 0 },
        { roomId: "room-dining", x: 120, y: 120 },
        { roomId: "room-stair", x: 264, y: 0 },
      ],
    },
    {
      name: "Upper Floor",
      rooms: [
        { roomId: "room-upper", x: 0, y: 0 },
        { roomId: "room-primary", x: 0, y: 72 },
      ],
    },
  ],
};

export const data = {
  project,
  rooms,
  walls,
  artPieces,
  STATUS,
  floorplans,
  homeLayout,
};
