/**
 * Encuentra una posición de inicio transitable en el mapa generado.
 * @param {import('../../map/TileMap.js').TileMap|null} tileMap
 * @returns {{ x: number, y: number }}
 */
export function genStartPos(tileMap) {
  if (!tileMap) return { x: 5, y: 5 };

  for (let y = 1; y < tileMap.height - 1; y++) {
    for (let x = 1; x < tileMap.width - 1; x++) {
      const tile = tileMap.getTile(x, y);
      if (tile && tile.id === 1) {
        return { x, y };
      }
    }
  }

  return { x: 5, y: 5 };
}
