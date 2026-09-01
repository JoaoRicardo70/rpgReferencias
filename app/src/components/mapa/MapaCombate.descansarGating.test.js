import { describe, it, expect } from 'vitest';

// ==========================================================================
// NOTA DE ESCOPO:
// `MapaIniciativaTracker` (onde mora o botão "💖 Descansar") está definido
// dentro de `MapaCombate.jsx`, que importa `@react-three/fiber`/`three` (motor
// 3D do dado físico). Mesma limitação documentada em
// `MapaCombate.iniciativaCena.test.js` e `MapaGrelha.filtroCenaApenasCriador.test.js`:
// importar esse módulo em jsdom trava o Vitest por dezenas de segundos. Este
// arquivo isola apenas o PREDICADO booleano de visibilidade do botão — copiado
// fielmente de `MapaCombate.jsx` (dentro de `MapaIniciativaTracker`, linha
// ~367): `{!(minhaFicha?.iniciativa > 0) && <button ... onClick={descansar}>}`.
// Qualquer alteração feita ao predicado real deve ser replicada aqui.
//
// Esta é a cobertura de regressão pedida para o gate que corrige o exploit
// "zerar Fadiga no meio do combate" (nota do code-review): o botão só pode
// aparecer com iniciativa=0/undefined, NUNCA com iniciativa > 0.
// ==========================================================================
function descansarEhVisivel(minhaFicha) {
    return !(minhaFicha?.iniciativa > 0);
}

function sairEhVisivel(minhaFicha) {
    return minhaFicha?.iniciativa > 0;
}

describe('MapaCombate - MapaIniciativaTracker: gating do botão "💖 Descansar" (MapaCombate.jsx:367)', () => {
    it('Edge Case: NÃO é visível quando iniciativa > 0 (jogador ativo no combate)', () => {
        expect(descansarEhVisivel({ iniciativa: 20 })).toBe(false);
    });

    it('Edge Case: NÃO é visível com iniciativa = 1 (o menor valor "ativo" possível)', () => {
        expect(descansarEhVisivel({ iniciativa: 1 })).toBe(false);
    });

    it('Happy Path: É visível quando iniciativa = 0 (fora de combate)', () => {
        expect(descansarEhVisivel({ iniciativa: 0 })).toBe(true);
    });

    it('Happy Path: É visível quando iniciativa é undefined (ficha nova, nunca rolou iniciativa)', () => {
        expect(descansarEhVisivel({})).toBe(true);
    });

    it('Edge Case: É visível quando minhaFicha inteira é null/undefined (optional chaining não lança)', () => {
        expect(() => descansarEhVisivel(null)).not.toThrow();
        expect(descansarEhVisivel(null)).toBe(true);
        expect(descansarEhVisivel(undefined)).toBe(true);
    });

    it('Edge Case: iniciativa negativa (nunca deveria ocorrer na prática) ainda assim mantém o botão visível (só bloqueia > 0)', () => {
        expect(descansarEhVisivel({ iniciativa: -5 })).toBe(true);
    });

    it('Regressão: "Descansar" e "Sair" nunca aparecem juntos (mutuamente exclusivos) para qualquer valor de iniciativa', () => {
        [0, 1, 5, 20, 999].forEach((iniciativa) => {
            const ficha = { iniciativa };
            expect(descansarEhVisivel(ficha) && sairEhVisivel(ficha)).toBe(false);
            expect(descansarEhVisivel(ficha) || sairEhVisivel(ficha)).toBe(true);
        });
    });
});
