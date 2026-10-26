/**
 * Solar position (NOAA General Solar Position calculation, as in the NOAA solar calculator
 * spreadsheet). Accuracy ≈ ±0.1° in elevation for 1950–2050 — plenty for lighting a 3-D scene.
 * No refraction correction (it only matters within ~1° of the horizon).
 */

const RAD = Math.PI / 180;

export interface SunPosition {
  /** Degrees clockwise from true north (0 = N, 90 = E, 180 = S). */
  azimuthDeg: number;
  /** Degrees above the horizon (negative = below). */
  altitudeDeg: number;
}

export function sunPosition(date: Date, lat: number, lng: number): SunPosition {
  const jd = date.getTime() / 86400000 + 2440587.5;
  const jc = (jd - 2451545) / 36525; // Julian century

  const L0 = (((280.46646 + jc * (36000.76983 + jc * 0.0003032)) % 360) + 360) % 360; // mean longitude
  const M = 357.52911 + jc * (35999.05029 - 0.0001537 * jc); // mean anomaly
  const e = 0.016708634 - jc * (0.000042037 + 0.0000001267 * jc); // orbit eccentricity
  const C =
    Math.sin(M * RAD) * (1.914602 - jc * (0.004817 + 0.000014 * jc)) +
    Math.sin(2 * M * RAD) * (0.019993 - 0.000101 * jc) +
    Math.sin(3 * M * RAD) * 0.000289; // equation of centre
  const omega = 125.04 - 1934.136 * jc;
  const lambda = L0 + C - 0.00569 - 0.00478 * Math.sin(omega * RAD); // apparent longitude
  const eps0 = 23 + (26 + (21.448 - jc * (46.815 + jc * (0.00059 - jc * 0.001813))) / 60) / 60;
  const eps = eps0 + 0.00256 * Math.cos(omega * RAD); // corrected obliquity
  const decl = Math.asin(Math.sin(eps * RAD) * Math.sin(lambda * RAD));

  const y = Math.tan((eps / 2) * RAD) ** 2;
  const eot =
    4 /
    RAD *
    (y * Math.sin(2 * L0 * RAD) -
      2 * e * Math.sin(M * RAD) +
      4 * e * y * Math.sin(M * RAD) * Math.cos(2 * L0 * RAD) -
      0.5 * y * y * Math.sin(4 * L0 * RAD) -
      1.25 * e * e * Math.sin(2 * M * RAD)); // equation of time, minutes

  const utcMin = date.getUTCHours() * 60 + date.getUTCMinutes() + date.getUTCSeconds() / 60;
  const tst = (((utcMin + eot + 4 * lng) % 1440) + 1440) % 1440; // true solar time, minutes
  const ha = (tst / 4 - 180) * RAD; // hour angle

  const phi = lat * RAD;
  const cosZen = Math.sin(phi) * Math.sin(decl) + Math.cos(phi) * Math.cos(decl) * Math.cos(ha);
  const zen = Math.acos(Math.min(1, Math.max(-1, cosZen)));
  const az = Math.atan2(Math.sin(ha), Math.cos(ha) * Math.sin(phi) - Math.tan(decl) * Math.cos(phi)) / RAD + 180;
  return { azimuthDeg: ((az % 360) + 360) % 360, altitudeDeg: 90 - zen / RAD };
}

/** India Standard Time (UTC+5:30) wall-clock `hours` on the IST calendar day of `day` → Date. */
export function istDate(day: Date, hours: number): Date {
  const ist = new Date(day.getTime() + 5.5 * 3600000); // shift so getUTC* reads the IST calendar day
  const midnightUtc = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()) - 5.5 * 3600000;
  return new Date(midnightUtc + hours * 3600000);
}

/** Current IST wall-clock time in hours (0–24). */
export function istHoursNow(now = new Date()): number {
  const ist = new Date(now.getTime() + 5.5 * 3600000);
  return ist.getUTCHours() + ist.getUTCMinutes() / 60;
}

/** Unit direction towards the sun in site 3-D (X east, Y up, Z = −north). */
export function sunDirSite3D({ azimuthDeg, altitudeDeg }: SunPosition): [number, number, number] {
  const az = azimuthDeg * RAD;
  const alt = altitudeDeg * RAD;
  return [Math.sin(az) * Math.cos(alt), Math.sin(alt), -Math.cos(az) * Math.cos(alt)];
}

/** 'YYYY-MM-DD' (IST calendar day) → a Date at IST noon of that day (for istDate / sunTimes). */
export function istDay(ymd: string): Date {
  const d = new Date(`${ymd}T12:00:00+05:30`);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

/** Today's IST calendar date as 'YYYY-MM-DD'. */
export function istTodayYmd(now = new Date()): string {
  return new Date(now.getTime() + 5.5 * 3600000).toISOString().slice(0, 10);
}

/**
 * Sunrise / sunset (IST hours) on the IST day of `day`: upper limb on the horizon with standard
 * refraction (altitude −0.833°), found by a 5-minute scan + linear interpolation. null = no crossing.
 */
export function sunTimes(day: Date, lat: number, lng: number): { sunrise: number | null; sunset: number | null } {
  const H0 = -0.833;
  let sunrise: number | null = null;
  let sunset: number | null = null;
  let prevH = 0;
  let prevA = sunPosition(istDate(day, 0), lat, lng).altitudeDeg - H0;
  for (let k = 1; k <= 288; k++) {
    const h = k / 12;
    const a = sunPosition(istDate(day, h), lat, lng).altitudeDeg - H0;
    if (prevA < 0 && a >= 0 && sunrise == null) sunrise = prevH + (h - prevH) * (-prevA / (a - prevA));
    if (prevA >= 0 && a < 0 && sunset == null) sunset = prevH + (h - prevH) * (prevA / (prevA - a));
    prevH = h;
    prevA = a;
  }
  return { sunrise, sunset };
}
