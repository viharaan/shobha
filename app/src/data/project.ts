import type { Amenity, Hotspot, PoiDistance, Tower, UnitType } from './types';

// ---------------------------------------------------------------------------
// Dimensional conventions. 1 world unit = 1 m. Heights below are NOT in any
// source document; they are documented assumptions exposed as constants.
// ---------------------------------------------------------------------------
export const FLOOR_TO_FLOOR_M = 3.0; // assumed; typical for SOBHA high-rise. Confirm with developer.
export const PODIUM_HEIGHT_M = 8.0; // assumed; ground + first-floor parking levels above grade.
export const WALL_HEIGHT_M = 2.9; // assumed clear interior height used for 1:1 plan extrusion.
export const WALL_THICKNESS_NOTE =
  'Wall thickness comes from the vector plan itself (filled wall polygon), not assumed.';

export const PROJECT = {
  name: 'SOBHA OneWorld',
  residences: 'One Residences',
  developer: 'SOBHA Limited',
  location: 'Greater Whitefield, Old Madras Road (NH-75), Bengaluru, Karnataka 562114',
  siteAreaAcres: 48.38, // 48 acres 15.32 guntas
  totalUnits: 3484,
  totalWings: 14,
  openSpacePct: 80,
  reraApproval: '2026-05-08',
  launch: '2026-06',
  basicRatePerSqft: { preLaunch: 13555, launch: 13999 },
  clubhouse: { name: 'One Club', sqft: 120000, acres: 2.4 },
  retail: { name: 'One Emporium', sqft: 65000 },
  stadium: { name: 'World Stadium', groundDiameterM: 90, runningTrackM: 350, joggingLoopM: 750, trailM: 1070 },
  refugeFloors: [19, 29, 39],
  contact: { phone: '080 4646 4500', email: 'marketing@sobha.com', web: 'sobha.com' },
};

export const PHASES = [
  { phase: 1, wings: [1, 2], handover: '2032-07', rera: 'PRM/KA/RERA/1250/304/PR/080526/008634' },
  { phase: 2, wings: [3, 4], handover: '2032-11', rera: 'PRM/KA/RERA/1250/304/PR/080526/008637' },
  { phase: 3, wings: [5, 6], handover: '2033-09', rera: 'PRM/KA/RERA/1250/304/PR/080526/008635' },
  { phase: 4, wings: [7, 8], handover: '2033-09', rera: 'PRM/KA/RERA/1250/304/PR/080526/008636' },
  { phase: 5, wings: [9, 10, 11], handover: '2033-02', rera: 'PRM/KA/RERA/1250/304/PR/080526/008638' },
  { phase: 6, wings: [12, 13, 14], handover: '2032-08', rera: 'PRM/KA/RERA/1250/304/PR/080526/008639' },
];

export const UNIT_TYPES: UnitType[] = [
  { code: 'A', name: '4 Bed Grande', bedrooms: 4, tier: 'Grande', sbaSqft: 2415.77, carpetSqft: 1488.02, avgPriceCr: 3.86, planId: 'type-a' },
  { code: 'C3', name: '4 Bed Luxe', bedrooms: 4, tier: 'Luxe', sbaSqft: 2096.27, carpetSqft: 1275.75, avgPriceCr: 3.33, planId: 'type-c3' },
  { code: 'F1', name: '3 Bed Grande', bedrooms: 3, tier: 'Grande', sbaSqft: [1735, 1838], carpetSqft: 1102.02, avgPriceCr: 2.81, planId: 'type-f1' },
  { code: 'J8', name: '3 Bed Luxe', bedrooms: 3, tier: 'Luxe', sbaSqft: 1510.7, carpetSqft: 960.04, avgPriceCr: 2.34, planId: 'type-j8' },
  { code: 'K3', name: '2 Bed Grande', bedrooms: 2, tier: 'Grande', sbaSqft: 1204.92, carpetSqft: 743.04, avgPriceCr: 1.85, planId: 'type-k3' },
  { code: 'L5', name: '2 Bed Luxe', bedrooms: 2, tier: 'Luxe', sbaSqft: 1063.23, carpetSqft: 648.32, avgPriceCr: 1.63, planId: 'type-l5' },
  { code: 'M5', name: '1 Bed Residence', bedrooms: 1, tier: 'Residence', sbaSqft: 734.05, carpetSqft: 432.28, avgPriceCr: 1.12, planId: 'type-m5' },
];

/** Floor Rise Charge, ₹ per sq ft SBA, by floor band (sales sheet 08.08.26). */
export const FLOOR_RISE: { from: number; to: number; rate: number }[] = [
  { from: 2, to: 4, rate: 0 },
  { from: 5, to: 9, rate: 60 },
  { from: 10, to: 14, rate: 120 },
  { from: 15, to: 19, rate: 180 },
  { from: 20, to: 24, rate: 250 },
  { from: 25, to: 29, rate: 320 },
  { from: 30, to: 34, rate: 400 },
  { from: 35, to: 39, rate: 480 },
  { from: 40, to: 47, rate: 570 },
];

/** Preferred Location Charge, ₹ per sq ft SBA (sales sheet). Per-unit tier assignment is not in the collateral. */
export const PLC_TIERS = [
  { tier: 'Select', rate: 0 },
  { tier: 'Prime', rate: 222 },
  { tier: 'Prime+', rate: 444, only: '4 BHK' },
  { tier: 'Elite', rate: 444 },
  { tier: 'Elite+', rate: 666, only: '4 BHK' },
  { tier: 'Grande+', rate: 888, only: '4 BHK' },
];

const towerProv = (extra?: string) => ({
  status: 'approximate' as const,
  source: 'SOBHA_OneWorld_Masterplan.pdf (raster site plan) + sales sheet 08.08.26',
  note: `Footprint traced from the raster site plan (cream roof segmentation at 3 px/m, ±1 px ≈ ±0.3 m on top of the georeference error); shared podium blocks split per wing along the bisector between wing centres, approximating the dashed lines on the sales sheet. Not from CAD.${extra ? ' ' + extra : ''}`,
});

// imagePx (footprint centroid) and footprintPx (outline, clockwise in image space) are pixel coordinates on
// app/public/media/site/masterplan.jpg (2682 × 2123). Traced 2026-10-18; re-trace if the raster changes.
export const TOWERS: Tower[] = [
  { wing: 1, phase: 1, typicalFloors: 46, handover: '2032-07', rera: PHASES[0].rera, imagePx: [1491, 842],
    footprintPx: [[1492, 772], [1504, 803], [1505, 820], [1521, 834], [1538, 829], [1556, 837], [1554, 848], [1539, 848], [1537, 869], [1548, 875], [1546, 885], [1524, 884], [1520, 878], [1506, 876], [1478, 908], [1464, 898], [1474, 886], [1467, 874], [1459, 872], [1448, 884], [1435, 873], [1463, 845], [1463, 839], [1458, 824], [1452, 823], [1442, 796]], samplePlanId: 'type-a',
    typicalFloor: [
      { unit: 1, facing: 'E', typeCode: 'F1' }, { unit: 2, facing: 'W' }, { unit: 3, facing: 'W', typeCode: 'F1' },
      { unit: 4, facing: 'W' }, { unit: 5, facing: 'N' }, { unit: 6, facing: 'N', typeCode: 'A' },
    ], provenance: towerProv('Unit facings 1E 2W 3W 4W 5N 6N read from the sales sheet.') },
  { wing: 2, phase: 1, typicalFloors: 46, handover: '2032-07', rera: PHASES[0].rera, imagePx: [1450, 732],
    footprintPx: [[1466, 663], [1477, 672], [1471, 681], [1476, 692], [1487, 701], [1498, 693], [1505, 696], [1481, 727], [1479, 739], [1492, 772], [1442, 796], [1436, 778], [1434, 757], [1390, 744], [1392, 731], [1398, 728], [1409, 734], [1416, 727], [1414, 713], [1396, 710], [1402, 695], [1436, 696], [1443, 701], [1442, 694], [1452, 690], [1452, 678], [1457, 681], [1468, 670]], samplePlanId: 'type-f1',
    typicalFloor: [{ unit: 1, facing: 'E', typeCode: 'F1' }, { unit: 2, facing: 'W', typeCode: 'F1' }, { unit: 5, facing: 'W' }, { unit: 6, facing: 'E' }],
    provenance: towerProv('Partial facings legible on sales sheet.') },
  { wing: 3, phase: 2, typicalFloors: 45, handover: '2032-11', rera: PHASES[1].rera, imagePx: [1673, 578],
    footprintPx: [[1669, 530], [1680, 531], [1679, 545], [1684, 551], [1693, 551], [1693, 540], [1708, 544], [1696, 575], [1709, 584], [1713, 599], [1716, 601], [1686, 627], [1680, 616], [1672, 612], [1666, 591], [1659, 590], [1654, 599], [1629, 602], [1626, 587], [1639, 584], [1640, 579], [1637, 572], [1626, 572], [1624, 556], [1628, 560], [1646, 559], [1647, 554], [1656, 558], [1663, 534]], provenance: towerProv() },
  { wing: 4, phase: 2, typicalFloors: 45, handover: '2032-11', rera: PHASES[1].rera, imagePx: [1719, 650],
    footprintPx: [[1716, 601], [1727, 610], [1737, 630], [1752, 630], [1748, 647], [1756, 666], [1738, 672], [1727, 699], [1714, 695], [1716, 683], [1709, 677], [1700, 687], [1685, 682], [1695, 670], [1693, 664], [1702, 648], [1693, 642], [1686, 627]], provenance: towerProv() },
  { wing: 5, phase: 3, typicalFloors: 45, handover: '2033-09', rera: PHASES[2].rera, imagePx: [1750, 821],
    footprintPx: [[1765, 772], [1776, 777], [1770, 788], [1777, 796], [1789, 801], [1799, 795], [1804, 799], [1805, 804], [1794, 819], [1785, 822], [1783, 830], [1790, 846], [1751, 879], [1743, 851], [1732, 841], [1688, 834], [1693, 825], [1714, 821], [1712, 805], [1696, 797], [1699, 788], [1706, 784], [1712, 789], [1727, 787], [1748, 800], [1750, 784], [1757, 785]], provenance: towerProv() },
  { wing: 6, phase: 3, typicalFloors: 45, handover: '2033-09', rera: PHASES[2].rera, imagePx: [1793, 926],
    footprintPx: [[1790, 846], [1797, 848], [1814, 896], [1815, 914], [1819, 920], [1847, 920], [1852, 926], [1850, 937], [1837, 935], [1834, 944], [1833, 956], [1845, 962], [1843, 974], [1800, 964], [1798, 971], [1803, 976], [1797, 991], [1782, 1005], [1774, 999], [1779, 990], [1768, 975], [1760, 973], [1753, 981], [1744, 976], [1750, 960], [1755, 961], [1757, 953], [1763, 957], [1762, 951], [1770, 949], [1772, 928], [1761, 915], [1751, 879]], provenance: towerProv() },
  { wing: 7, phase: 4, typicalFloors: 45, handover: '2033-09', rera: PHASES[3].rera, imagePx: [1821, 1159],
    footprintPx: [[1799, 1099], [1800, 1104], [1809, 1104], [1809, 1111], [1817, 1117], [1822, 1113], [1830, 1118], [1835, 1117], [1835, 1104], [1842, 1099], [1847, 1104], [1848, 1099], [1850, 1123], [1837, 1140], [1849, 1165], [1845, 1206], [1794, 1209], [1795, 1160], [1801, 1156], [1796, 1124]], provenance: towerProv() },
  { wing: 8, phase: 4, typicalFloors: 45, handover: '2033-09', rera: PHASES[3].rera, imagePx: [1815, 1256],
    footprintPx: [[1845, 1206], [1842, 1240], [1850, 1247], [1855, 1242], [1872, 1254], [1866, 1266], [1850, 1264], [1844, 1281], [1853, 1289], [1847, 1300], [1826, 1291], [1823, 1282], [1814, 1281], [1799, 1299], [1776, 1308], [1772, 1295], [1778, 1297], [1784, 1280], [1777, 1271], [1758, 1275], [1754, 1266], [1765, 1261], [1764, 1254], [1772, 1248], [1788, 1249], [1791, 1236], [1799, 1233], [1794, 1214], [1794, 1209]], samplePlanId: 'type-c3', provenance: towerProv() },
  { wing: 9, phase: 5, typicalFloors: 46, handover: '2033-02', rera: PHASES[4].rera, imagePx: [1663, 1361],
    footprintPx: [[1635, 1325], [1648, 1336], [1661, 1339], [1662, 1334], [1669, 1347], [1677, 1344], [1684, 1351], [1711, 1353], [1708, 1368], [1696, 1366], [1692, 1371], [1695, 1381], [1703, 1383], [1698, 1394], [1653, 1380], [1635, 1367], [1616, 1365]], samplePlanId: 'type-j8', provenance: towerProv() },
  { wing: 10, phase: 5, typicalFloors: 46, handover: '2033-02', rera: PHASES[4].rera, imagePx: [1596, 1319],
    footprintPx: [[1633, 1230], [1634, 1232], [1616, 1249], [1609, 1250], [1607, 1252], [1615, 1317], [1631, 1322], [1635, 1325], [1615, 1364], [1607, 1358], [1581, 1378], [1575, 1371], [1581, 1365], [1579, 1355], [1569, 1350], [1562, 1356], [1554, 1346], [1554, 1342], [1562, 1342], [1561, 1336], [1572, 1336], [1576, 1326], [1576, 1316], [1571, 1314], [1575, 1307], [1572, 1285], [1571, 1282]], samplePlanId: 'type-l5', provenance: towerProv() },
  { wing: 11, phase: 5, typicalFloors: 46, handover: '2033-02', rera: PHASES[4].rera, imagePx: [1584, 1240],
    footprintPx: [[1609, 1200], [1616, 1211], [1607, 1220], [1617, 1230], [1628, 1223], [1633, 1230], [1609, 1250], [1607, 1250], [1607, 1252], [1571, 1282], [1565, 1271], [1568, 1263], [1536, 1250], [1544, 1240], [1557, 1245], [1557, 1230], [1547, 1226], [1554, 1218], [1553, 1211], [1574, 1223], [1587, 1224], [1594, 1214], [1591, 1209]], provenance: towerProv() },
  { wing: 12, phase: 6, typicalFloors: 46, handover: '2032-08', rera: PHASES[5].rera, imagePx: [1473, 1121],
    footprintPx: [[1456, 1100], [1460, 1103], [1458, 1097], [1465, 1096], [1466, 1088], [1485, 1072], [1493, 1080], [1487, 1092], [1496, 1102], [1506, 1092], [1515, 1100], [1501, 1119], [1490, 1125], [1498, 1155], [1484, 1159], [1480, 1149], [1472, 1149], [1468, 1152], [1471, 1162], [1456, 1167], [1446, 1138], [1431, 1134]], provenance: towerProv() },
  { wing: 13, phase: 6, typicalFloors: 46, handover: '2032-08', rera: PHASES[5].rera, imagePx: [1391, 1105],
    footprintPx: [[1385, 1058], [1385, 1060], [1393, 1071], [1391, 1083], [1402, 1092], [1408, 1085], [1409, 1090], [1425, 1092], [1426, 1097], [1442, 1092], [1456, 1100], [1431, 1134], [1387, 1124], [1366, 1146], [1354, 1136], [1362, 1135], [1356, 1119], [1346, 1126], [1337, 1121], [1333, 1116], [1353, 1102], [1354, 1094], [1349, 1079]], samplePlanId: 'type-k3', provenance: towerProv() },
  { wing: 14, phase: 6, typicalFloors: 46, handover: '2032-08', rera: PHASES[5].rera, imagePx: [1355, 1034],
    footprintPx: [[1362, 987], [1373, 1008], [1370, 1023], [1377, 1028], [1374, 1034], [1382, 1041], [1385, 1058], [1349, 1079], [1324, 1004], [1335, 996], [1342, 1006], [1353, 1009], [1353, 990], [1361, 993]], samplePlanId: 'type-m5',
    typicalFloor: [{ unit: 1, facing: 'E', typeCode: 'J8' }, { unit: 2, facing: 'W' }, { unit: 3, facing: 'N', typeCode: 'M5' }, { unit: 4, facing: 'N', typeCode: 'M5' }],
    provenance: towerProv('Partial facings legible on sales sheet.') },
];

export const HOTSPOTS: Hotspot[] = [
  { id: 'ground', label: 'World Stadium — 90 m cricket / football ground', kind: 'amenity', imagePx: [1635, 1040],
    description: 'Sunken sports hub in the podium with a 350 m running loop. Diameter is the scale reference for the site plan.',
    provenance: { status: 'source', source: 'Sales sheet "~90 Meter Dia"; master plan legend W' } },
  { id: 'club', label: 'One Club — 1,20,000 sq ft clubhouse (CA site)', kind: 'club', imagePx: [1073, 924],
    description: 'Three-tiered leisure destination on 2.4 acres: work, recreation, wellness, celebration, dining and learning.',
    provenance: { status: 'approximate', source: 'Master plan "ONE CLUB (CA SITE)" parcel' } },
  { id: 'entrance', label: 'Entrance gateway & roundabout', kind: 'access', imagePx: [1267, 1065],
    description: 'Wave-like canopy and green roundabout from the 60 m wide Old Madras Road service road.',
    provenance: { status: 'approximate', source: 'Master plan access points 1–3' } },
  { id: 'future-n', label: 'Future development (north parcel)', kind: 'future', imagePx: [1500, 430],
    provenance: { status: 'approximate', source: 'Master plan' } },
  { id: 'future-se', label: 'Future development (south-east parcel)', kind: 'future', imagePx: [1900, 1600],
    provenance: { status: 'approximate', source: 'Master plan' } },
  { id: 'courts', label: 'Continental Grounds — tennis, pickleball, multi-sport courts', kind: 'amenity', imagePx: [2000, 980],
    provenance: { status: 'approximate', source: 'Master plan legend Y–AD' } },
];

export const ZONES: { id: string; name: string; theme: string }[] = [
  { id: 'temperate', name: 'Temperate Enclave', theme: 'Urban calm of the Americas: layered native trees, broad plazas, modern seating' },
  { id: 'mediterranean', name: 'Mediterranean Serenity', theme: 'Olive-like trees, stone planters, dry gardens, rustic hardscape' },
  { id: 'tropical', name: 'Tropical Zen', theme: 'Lush tropical softscape, water, mist, grove-like retreat' },
  { id: 'stadium', name: 'World Stadium', theme: 'Sunken sports hub: 90 m ground, 350 m running loop, 750 m / 1,070 m trails' },
  { id: 'continental', name: 'Continental Grounds', theme: 'Ground-level courts, lawns, pet park beside residential movement' },
  { id: 'club', name: 'One Club', theme: '1,20,000 sq ft three-tiered clubhouse around a central green plaza' },
];

export const AMENITIES: Amenity[] = [
  { key: 'A', name: 'OneWorld Plaza', zone: 'temperate' }, { key: 'B', name: 'Festival Lawn', zone: 'temperate' },
  { key: 'C', name: 'Activity Deck', zone: 'temperate' }, { key: 'D', name: 'Wellness Gardens', zone: 'temperate' },
  { key: 'E', name: 'Observation Deck', zone: 'temperate' }, { key: 'F', name: 'Leisure Pool', zone: 'temperate' },
  { key: 'G', name: "Kids' Pool", zone: 'temperate' },
  { key: 'H', name: 'Oasis Trail', zone: 'mediterranean' }, { key: 'I', name: 'Dry Stream', zone: 'mediterranean' },
  { key: 'J', name: 'Tuscan Gardens', zone: 'mediterranean' }, { key: 'K', name: 'Exhibition Square', zone: 'mediterranean' },
  { key: 'L', name: 'Amphitheatre', zone: 'mediterranean' },
  { key: 'M', name: 'Tranquillity Falls', zone: 'tropical' }, { key: 'N', name: 'Lagoon Cove', zone: 'tropical' },
  { key: 'O', name: 'Reflexology Walk', zone: 'tropical' }, { key: 'P', name: 'Rainforest Field', zone: 'tropical' },
  { key: 'Q', name: 'Yoga Lawn', zone: 'tropical' }, { key: 'R', name: 'Zen Courtyard', zone: 'tropical' },
  { key: 'S', name: 'Play Park', zone: 'tropical' }, { key: 'T', name: 'Skating Rink', zone: 'tropical' },
  { key: 'U', name: 'Tropicana Gardens', zone: 'tropical' },
  { key: 'V', name: '750 m Jogging / Cycling Track', zone: 'stadium' }, { key: 'W', name: '90 m Cricket Ground & Football Field', zone: 'stadium' },
  { key: 'X', name: '350 m Running Track', zone: 'stadium' },
  { key: 'Y', name: 'Pickleball Courts (3)', zone: 'continental' }, { key: 'Z', name: 'Play Lawn', zone: 'continental' },
  { key: 'AA', name: 'Tennis Courts (2)', zone: 'continental' }, { key: 'AB', name: 'Multi-sport Court', zone: 'continental' },
  { key: 'AC', name: 'Fitness Lawn', zone: 'continental' }, { key: 'AD', name: 'Pet Park', zone: 'continental' },
];

/** Brochure distance ladder. Straight-line vs road distance is not stated; bearings are unknown. */
export const POI_DISTANCES: PoiDistance[] = [
  { name: 'VIBGYOR High School', category: 'education', km: 2 }, { name: 'Orion Uptown Mall', category: 'leisure', km: 2 },
  { name: 'EuroKids PreSchool', category: 'education', km: 3 }, { name: 'Bearys Global Research', category: 'corporate', km: 3 },
  { name: 'Decathlon OMR', category: 'leisure', km: 4 }, { name: 'Motherhood Clinic', category: 'healthcare', km: 4 },
  { name: 'Brigade Signature Towers', category: 'corporate', km: 4 }, { name: 'Chrysalis High School', category: 'education', km: 5 },
  { name: 'Klay BST', category: 'education', km: 5 }, { name: 'MVJ Hospital', category: 'healthcare', km: 6 },
  { name: 'New Baldwin Intl. School', category: 'education', km: 6 }, { name: 'Oracle Public School', category: 'education', km: 7 },
  { name: 'East Point Hospital', category: 'healthcare', km: 8 }, { name: 'National Public School', category: 'education', km: 8 },
  { name: 'GR Tech Park', category: 'corporate', km: 10 }, { name: 'DPS Whitefield Mallasandra', category: 'education', km: 10 },
  { name: 'ITPL (Intl. Tech Park Bangalore)', category: 'corporate', km: 11 }, { name: 'Vydehi Hospital', category: 'healthcare', km: 13 },
  { name: 'Manipal Hospital ITPL', category: 'healthcare', km: 13 }, { name: 'Aster Whitefield Hospital', category: 'healthcare', km: 13 },
  { name: 'Phoenix Marketcity', category: 'leisure', km: 14 }, { name: 'RMZ Infinity', category: 'corporate', km: 15 },
  { name: 'Bagmane World Technology Centre', category: 'corporate', km: 15 }, { name: 'Focus Academy Global School', category: 'education', km: 15 },
  { name: 'KIADB Aerospace Park', category: 'corporate', km: 20 },
];

export const INFRASTRUCTURE = [
  { name: 'Bengaluru Business Corridor (PRR + NICE Road)', detail: '116 km bypass, ~8 min west', status: 'proposed' },
  { name: 'Satellite Town Ring Road', detail: 'Connects 12 satellite towns, ~10 min east', status: 'under construction' },
  { name: 'Bengaluru–Chennai Expressway', detail: '~10 min; Chennai in ~3 h; launch early 2027', status: 'scheduled' },
  { name: 'Purple Line extension KR Puram → Hoskote', detail: 'Proposed 16 km; station near Hoskote toll gate', status: 'proposed' },
];
