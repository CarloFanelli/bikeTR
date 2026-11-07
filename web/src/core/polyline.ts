// Il percorso di un'attività come lo dà Strava: una "encoded polyline" di Google,
// testo che racchiude la lista dei punti [latitudine, longitudine].

export type LatLng = [number, number];

export function decodePolyline(encoded: string): LatLng[] {
  let index = 0, lat = 0, lng = 0;
  const coords: LatLng[] = [];
  // Ogni numero è scritto a gruppi di 5 bit: un gruppo con il bit 0x20 acceso ne ha un altro dopo.
  const next = (): number => {
    let b, shift = 0, result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    return (result & 1) ? ~(result >> 1) : (result >> 1);
  };
  while (index < encoded.length) {
    lat += next();
    lng += next();
    coords.push([lat * 1e-5, lng * 1e-5]);
  }
  return coords;
}
