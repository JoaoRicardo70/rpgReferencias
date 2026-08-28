import { describe, it, expect } from 'vitest';

// ==========================================================================
// NOTA DE ESCOPO:
// `MapaIniciativaTracker` está definido dentro de `MapaCombate.jsx`, um
// componente grande que importa `@react-three/fiber`/`three` (motor 3D do
// dado físico) e depende do Context `useMapaForm()` (dezenas de campos vindos
// de `MapaFormContext.jsx`). Montar o componente inteiro em jsdom para testar
// só a filtragem de `todasEntidades` exigiria mockar Canvas/WebGL e reproduzir
// todo o contrato do contexto, o que é frágil e caro para o que queremos
// validar aqui.
//
// Em vez disso, este teste isola a função pura `estaNaCena(f)` — copiada
// fielmente de `MapaCombate.jsx` (dentro de `MapaIniciativaTracker`,
// aproximadamente linhas 330-334) — e valida diretamente sua lógica de
// fallback entre o sistema novo de posição por cena (`f.posicoes[cenaId]`) e
// o sistema antigo (`f.posicao.cenaId`). Qualquer alteração feita à função
// real deve ser replicada aqui.
// ==========================================================================
function criarEstaNaCena(cenaRenderId) {
    return function estaNaCena(f) {
        const pos = f.posicoes ? f.posicoes[cenaRenderId] : null;
        if (pos) return true;
        return !!(f.posicao && (f.posicao.cenaId || 'default') === cenaRenderId);
    };
}

describe('MapaCombate - MapaIniciativaTracker.estaNaCena (filtro de entidades por cena)', () => {
    it('sistema novo: jogador com posicoes["cena-b"] aparece quando cenaRenderId = "cena-b"', () => {
        const jogador = { posicoes: { 'cena-b': { x: 1, y: 1 } } };
        const estaNaCena = criarEstaNaCena('cena-b');
        expect(estaNaCena(jogador)).toBe(true);
    });

    it('sistema novo: o mesmo jogador NÃO aparece quando cenaRenderId = "cena-a" (outra cena)', () => {
        const jogador = { posicoes: { 'cena-b': { x: 1, y: 1 } } };
        const estaNaCena = criarEstaNaCena('cena-a');
        expect(estaNaCena(jogador)).toBe(false);
    });

    it('sistema antigo (fallback): jogador com posicao.cenaId = "cena-a" aparece só na cena-a', () => {
        const jogador = { posicao: { x: 0, y: 0, cenaId: 'cena-a' } };
        expect(criarEstaNaCena('cena-a')(jogador)).toBe(true);
        expect(criarEstaNaCena('cena-b')(jogador)).toBe(false);
    });

    it('sistema antigo sem cenaId definido cai no fallback "default"', () => {
        const jogador = { posicao: { x: 0, y: 0 } };
        expect(criarEstaNaCena('default')(jogador)).toBe(true);
        expect(criarEstaNaCena('cena-a')(jogador)).toBe(false);
    });

    it('jogador sem posicoes nem posicao não aparece em nenhuma cena', () => {
        const jogador = {};
        expect(criarEstaNaCena('cena-a')(jogador)).toBe(false);
        expect(criarEstaNaCena('default')(jogador)).toBe(false);
    });

    it('regressão: filtrar uma lista mista (sistema novo + antigo) retorna só quem pertence à cena-b', () => {
        const jogadores = {
            'Jogador Novo': { posicoes: { 'cena-b': { x: 1, y: 1 } } },
            'Jogador Antigo Cena A': { posicao: { x: 0, y: 0, cenaId: 'cena-a' } },
            'Jogador Antigo Cena B': { posicao: { x: 2, y: 2, cenaId: 'cena-b' } },
        };
        const estaNaCena = criarEstaNaCena('cena-b');
        const resultado = Object.entries(jogadores)
            .filter(([, f]) => estaNaCena(f))
            .map(([nome]) => nome);

        expect(resultado).toEqual(['Jogador Novo', 'Jogador Antigo Cena B']);
    });
});
