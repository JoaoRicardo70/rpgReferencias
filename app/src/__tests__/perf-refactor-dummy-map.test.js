/**
 * QA — Regression test for the dummyMap grouping optimization
 * (app/src/components/mapa/MapaFormContext.jsx + MapaGrelha.jsx)
 *
 * Before: for every grid cell, MapaGrelha filtered over ALL dummies
 * (O(cells * dummies)):
 *
 *   Object.entries(dummies || {}).filter(([id, d]) => {
 *       const isOculto = cenario?.tokensOcultos?.includes(id);
 *       if (!isMestre && isOculto) return false;
 *       const dCena = d.cenaId || 'default';
 *       return d.posicao?.x === cell.x && d.posicao?.y === cell.y && dCena === cenaRenderId;
 *   });
 *
 * After: dummies are grouped once into a `dummyMap` keyed by "x,y" (already
 * filtered by scene), and each cell does a cheap object lookup + a small
 * "isOculto" filter:
 *
 *   dummyMap = { "x,y": [[id, dummy], ...] }   // grouped by cenaRenderId
 *   cellDummies = (dummyMap[key] || []).filter(([id]) => isMestre || !isOculto(id));
 *
 * This test implements BOTH algorithms verbatim as pure functions and
 * proves they produce the exact same visible dummy set, per cell, for a
 * scenario with multiple dummies spread across different cells AND
 * different scenes ("cenas"), for both isMestre=true and isMestre=false.
 */
import { describe, it, expect } from 'vitest';

// ---------------------------------------------------------------------------
// OLD algorithm — verbatim port of the pre-refactor per-cell filter in
// MapaGrelha.jsx (O(cells * dummies))
// ---------------------------------------------------------------------------
function oldCellDummies(dummies, cell, cenaRenderId, cenario, isMestre) {
    return Object.entries(dummies || {}).filter(([id, d]) => {
        const isOculto = cenario?.tokensOcultos?.includes(id);
        if (!isMestre && isOculto) return false;
        const dCena = d.cenaId || 'default';
        return d.posicao?.x === cell.x && d.posicao?.y === cell.y && dCena === cenaRenderId;
    });
}

// ---------------------------------------------------------------------------
// NEW algorithm — verbatim port of dummyMap construction (MapaFormContext.jsx)
// + the new per-cell filter (MapaGrelha.jsx)
// ---------------------------------------------------------------------------
function buildDummyMap(dummies, cenaRenderId) {
    const map = {};
    if (dummies) {
        const dIds = Object.keys(dummies);
        for (let i = 0; i < dIds.length; i++) {
            const id = dIds[i];
            const d = dummies[id];
            const dCena = d.cenaId || 'default';
            if (d.posicao?.x === undefined || dCena !== cenaRenderId) continue;
            const key = `${d.posicao.x},${d.posicao.y}`;
            if (!map[key]) map[key] = [];
            map[key].push([id, d]);
        }
    }
    return map;
}

function newCellDummies(dummyMap, cell, cenario, isMestre) {
    const key = `${cell.x},${cell.y}`;
    return (dummyMap[key] || []).filter(([id]) => {
        const isOculto = cenario?.tokensOcultos?.includes(id);
        return isMestre || !isOculto;
    });
}

// Normalize a filtered dummy list (array of [id, dummy] tuples) into a
// sorted array of ids for order-independent comparison.
function idsOf(list) {
    return list.map(([id]) => id).sort();
}

describe('perf refactor — dummyMap grouping matches the old O(n) per-cell filter', () => {
    // Scenario: dummies spread across several cells and two different scenes
    // ("cena-a" the currently rendered one, "cena-b" a different one that
    // must NOT show up), plus one dummy hidden from players via tokensOcultos.
    const dummies = {
        d1: { nome: 'Goblin', posicao: { x: 2, y: 3 }, cenaId: 'cena-a' },
        d2: { nome: 'Orc', posicao: { x: 2, y: 3 }, cenaId: 'cena-a' }, // same cell as d1
        d3: { nome: 'Slime', posicao: { x: 5, y: 5 }, cenaId: 'cena-a' },
        d4: { nome: 'Boss Oculto', posicao: { x: 5, y: 5 }, cenaId: 'cena-a' }, // hidden
        d5: { nome: 'Dragao Outra Cena', posicao: { x: 2, y: 3 }, cenaId: 'cena-b' }, // different scene, same coords
        d6: { nome: 'Sem Posicao' }, // no posicao.x -> should never appear anywhere
        d7: { nome: 'Cena Default', posicao: { x: 0, y: 0 } }, // no cenaId -> defaults to 'default'
    };

    const cenario = { tokensOcultos: ['d4'] };

    const cellsToCheck = [
        { x: 2, y: 3 },
        { x: 5, y: 5 },
        { x: 0, y: 0 },
        { x: 9, y: 9 }, // empty cell, nothing should be there
    ];

    it('produces identical visible dummy sets per cell for isMestre=true (cena-a)', () => {
        const cenaRenderId = 'cena-a';
        const dummyMap = buildDummyMap(dummies, cenaRenderId);

        cellsToCheck.forEach((cell) => {
            const oldResult = idsOf(oldCellDummies(dummies, cell, cenaRenderId, cenario, true));
            const newResult = idsOf(newCellDummies(dummyMap, cell, cenario, true));
            expect(newResult).toEqual(oldResult);
        });

        // Sanity: mestre sees the hidden boss too
        const bossCell = { x: 5, y: 5 };
        expect(idsOf(newCellDummies(dummyMap, bossCell, cenario, true))).toContain('d4');
    });

    it('produces identical visible dummy sets per cell for isMestre=false (cena-a)', () => {
        const cenaRenderId = 'cena-a';
        const dummyMap = buildDummyMap(dummies, cenaRenderId);

        cellsToCheck.forEach((cell) => {
            const oldResult = idsOf(oldCellDummies(dummies, cell, cenaRenderId, cenario, false));
            const newResult = idsOf(newCellDummies(dummyMap, cell, cenario, false));
            expect(newResult).toEqual(oldResult);
        });

        // Sanity: non-mestre does NOT see the hidden boss
        const bossCell = { x: 5, y: 5 };
        const visible = idsOf(newCellDummies(dummyMap, bossCell, cenario, false));
        expect(visible).not.toContain('d4');
        expect(visible).toContain('d3');
    });

    it('produces identical results when rendering the OTHER scene (cena-b)', () => {
        const cenaRenderId = 'cena-b';
        const dummyMap = buildDummyMap(dummies, cenaRenderId);

        cellsToCheck.forEach((cell) => {
            const oldResult = idsOf(oldCellDummies(dummies, cell, cenaRenderId, cenario, true));
            const newResult = idsOf(newCellDummies(dummyMap, cell, cenario, true));
            expect(newResult).toEqual(oldResult);
        });

        // Only d5 belongs to cena-b, at (2,3)
        expect(idsOf(newCellDummies(dummyMap, { x: 2, y: 3 }, cenario, true))).toEqual(['d5']);
    });

    it('dummy without posicao never appears in any cell (both algorithms agree)', () => {
        const cenaRenderId = 'cena-a';
        const dummyMap = buildDummyMap(dummies, cenaRenderId);

        // Sweep a wider synthetic grid to be thorough
        for (let x = 0; x < 10; x++) {
            for (let y = 0; y < 10; y++) {
                const cell = { x, y };
                const oldResult = idsOf(oldCellDummies(dummies, cell, cenaRenderId, cenario, true));
                const newResult = idsOf(newCellDummies(dummyMap, cell, cenario, true));
                expect(newResult).toEqual(oldResult);
                expect(oldResult).not.toContain('d6');
                expect(newResult).not.toContain('d6');
            }
        }
    });

    it('handles empty dummies object identically', () => {
        const cenaRenderId = 'cena-a';
        const dummyMap = buildDummyMap({}, cenaRenderId);
        const cell = { x: 0, y: 0 };
        expect(idsOf(newCellDummies(dummyMap, cell, cenario, true))).toEqual([]);
        expect(idsOf(oldCellDummies({}, cell, cenaRenderId, cenario, true))).toEqual([]);
    });

    it('handles null/undefined dummies identically', () => {
        const cenaRenderId = 'cena-a';
        const dummyMap = buildDummyMap(null, cenaRenderId);
        const cell = { x: 0, y: 0 };
        expect(idsOf(newCellDummies(dummyMap, cell, cenario, true))).toEqual([]);
        expect(idsOf(oldCellDummies(null, cell, cenaRenderId, cenario, true))).toEqual([]);
    });
});
