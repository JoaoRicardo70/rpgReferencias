import { describe, it, expect } from 'vitest';
import { chaveEntidadeTurno, ordenarOrdemTurno, moverChaveNaOrdem, recalcularIndiceTurno } from './turnos';

// ---------------------------------------------------------------------------
// QA — core/turnos.js: ordem de turno manual (drag and drop do Mestre) sobre
// a ordem por iniciativa. Funções puras, sem React/Firebase.
// ---------------------------------------------------------------------------

describe('chaveEntidadeTurno', () => {
    it('gera chave "p:<id>" para jogador/NPC (isDummie falsy)', () => {
        expect(chaveEntidadeTurno({ id: 'Heroi', isDummie: false })).toBe('p:Heroi');
    });

    it('gera chave "d:<id>" para dummie', () => {
        expect(chaveEntidadeTurno({ id: 'filler', isDummie: true })).toBe('d:filler');
    });

    it('retorna string vazia para entidade nula/undefined (defensivo)', () => {
        expect(chaveEntidadeTurno(null)).toBe('');
        expect(chaveEntidadeTurno(undefined)).toBe('');
    });
});

describe('ordenarOrdemTurno', () => {
    it('sem ordem manual: ordena só pela iniciativa (maior primeiro)', () => {
        const lista = [
            { id: 'a', nome: 'A', iniciativa: 10, isDummie: false },
            { id: 'b', nome: 'B', iniciativa: 30, isDummie: false },
            { id: 'c', nome: 'C', iniciativa: 20, isDummie: true },
        ];
        const resultado = ordenarOrdemTurno(lista, undefined);
        expect(resultado.map(e => e.id)).toEqual(['b', 'c', 'a']);
    });

    it('ordem manual vazia ([]) também cai no fallback por iniciativa', () => {
        const lista = [
            { id: 'a', nome: 'A', iniciativa: 5, isDummie: false },
            { id: 'b', nome: 'B', iniciativa: 15, isDummie: false },
        ];
        expect(ordenarOrdemTurno(lista, []).map(e => e.id)).toEqual(['b', 'a']);
    });

    it('com ordem manual completa: respeita a ordem manual, ignorando a iniciativa', () => {
        const lista = [
            { id: 'a', nome: 'A', iniciativa: 10, isDummie: false },
            { id: 'b', nome: 'B', iniciativa: 30, isDummie: false },
            { id: 'c', nome: 'C', iniciativa: 20, isDummie: true },
        ];
        const ordemManual = ['p:a', 'd:c', 'p:b'];
        expect(ordenarOrdemTurno(lista, ordemManual).map(e => e.id)).toEqual(['a', 'c', 'b']);
    });

    it('recém-chegado (fora da ordem manual) é encaixado pela iniciativa, antes do primeiro com iniciativa menor', () => {
        const ordemManual = ['p:a', 'p:b']; // a=30, b=10
        const lista = [
            { id: 'a', nome: 'A', iniciativa: 30, isDummie: false },
            { id: 'b', nome: 'B', iniciativa: 10, isDummie: false },
            { id: 'novo', nome: 'Novo', iniciativa: 20, isDummie: false }, // entra entre a(30) e b(10)
        ];
        expect(ordenarOrdemTurno(lista, ordemManual).map(e => e.id)).toEqual(['a', 'novo', 'b']);
    });

    it('recém-chegado com iniciativa maior que todos na ordem manual vai para o início', () => {
        const ordemManual = ['p:a', 'p:b']; // a=30, b=10
        const lista = [
            { id: 'a', nome: 'A', iniciativa: 30, isDummie: false },
            { id: 'b', nome: 'B', iniciativa: 10, isDummie: false },
            { id: 'novo', nome: 'Novo', iniciativa: 99, isDummie: false },
        ];
        expect(ordenarOrdemTurno(lista, ordemManual).map(e => e.id)).toEqual(['novo', 'a', 'b']);
    });

    it('recém-chegado com iniciativa menor que todos na ordem manual vai para o fim', () => {
        const ordemManual = ['p:a', 'p:b']; // a=30, b=10
        const lista = [
            { id: 'a', nome: 'A', iniciativa: 30, isDummie: false },
            { id: 'b', nome: 'B', iniciativa: 10, isDummie: false },
            { id: 'novo', nome: 'Novo', iniciativa: 1, isDummie: false },
        ];
        expect(ordenarOrdemTurno(lista, ordemManual).map(e => e.id)).toEqual(['a', 'b', 'novo']);
    });

    it('múltiplos recém-chegados são todos encaixados, cada um pela sua iniciativa', () => {
        const ordemManual = ['p:a']; // a=30
        const lista = [
            { id: 'a', nome: 'A', iniciativa: 30, isDummie: false },
            { id: 'x', nome: 'X', iniciativa: 40, isDummie: false }, // antes de a
            { id: 'y', nome: 'Y', iniciativa: 5, isDummie: false }, // depois de a
        ];
        expect(ordenarOrdemTurno(lista, ordemManual).map(e => e.id)).toEqual(['x', 'a', 'y']);
    });

    it('chaves obsoletas na ordem manual (entidades que não estão mais na lista) são ignoradas', () => {
        const ordemManual = ['p:fantasma', 'p:a', 'd:c'];
        const lista = [
            { id: 'a', nome: 'A', iniciativa: 10, isDummie: false },
        ];
        expect(ordenarOrdemTurno(lista, ordemManual).map(e => e.id)).toEqual(['a']);
    });

    it('lista vazia retorna lista vazia, com ou sem ordem manual', () => {
        expect(ordenarOrdemTurno([], undefined)).toEqual([]);
        expect(ordenarOrdemTurno([], ['p:a'])).toEqual([]);
    });

    it('lista undefined/null é tratada como vazia (defensivo)', () => {
        expect(ordenarOrdemTurno(undefined, undefined)).toEqual([]);
        expect(ordenarOrdemTurno(null, ['p:a'])).toEqual([]);
    });

    it('trata iniciativa não numérica/ausente como 0 tanto na ordenação quanto no encaixe', () => {
        const ordemManual = ['p:a']; // a = NaN -> 0
        const lista = [
            { id: 'a', nome: 'A', iniciativa: 'abc', isDummie: false },
            { id: 'novo', nome: 'Novo', iniciativa: 5, isDummie: false },
        ];
        // novo(5) > a(0) => entra antes de a
        expect(ordenarOrdemTurno(lista, ordemManual).map(e => e.id)).toEqual(['novo', 'a']);
    });

    it('chave duplicada na ordem manual usa a primeira ocorrência (posicaoManual.has guarda a primeira)', () => {
        const ordemManual = ['p:b', 'p:a', 'p:b'];
        const lista = [
            { id: 'a', nome: 'A', iniciativa: 10, isDummie: false },
            { id: 'b', nome: 'B', iniciativa: 20, isDummie: false },
        ];
        expect(ordenarOrdemTurno(lista, ordemManual).map(e => e.id)).toEqual(['b', 'a']);
    });
});

describe('moverChaveNaOrdem', () => {
    it('move uma chave existente para a direita', () => {
        const chaves = ['a', 'b', 'c', 'd'];
        expect(moverChaveNaOrdem(chaves, 'a', 2)).toEqual(['b', 'c', 'a', 'd']);
    });

    it('move uma chave existente para a esquerda', () => {
        const chaves = ['a', 'b', 'c', 'd'];
        expect(moverChaveNaOrdem(chaves, 'd', 1)).toEqual(['a', 'd', 'b', 'c']);
    });

    it('insere uma chave nova (não presente antes) na posição pedida', () => {
        const chaves = ['a', 'b'];
        expect(moverChaveNaOrdem(chaves, 'novo', 1)).toEqual(['a', 'novo', 'b']);
    });

    it('índice negativo é grampeado para 0 (início)', () => {
        const chaves = ['a', 'b', 'c'];
        expect(moverChaveNaOrdem(chaves, 'c', -5)).toEqual(['c', 'a', 'b']);
    });

    it('índice maior que o tamanho é grampeado para o fim', () => {
        const chaves = ['a', 'b', 'c'];
        expect(moverChaveNaOrdem(chaves, 'a', 999)).toEqual(['b', 'c', 'a']);
    });

    it('mover uma chave para a MESMA posição relativa não a duplica', () => {
        const chaves = ['a', 'b', 'c'];
        const resultado = moverChaveNaOrdem(chaves, 'b', 1);
        expect(resultado).toEqual(['a', 'b', 'c']);
        expect(resultado.filter(c => c === 'b').length).toBe(1);
    });

    it('índice não numérico (NaN) cai para 0 (Math.floor(NaN)||0 -> 0)', () => {
        const chaves = ['a', 'b', 'c'];
        expect(moverChaveNaOrdem(chaves, 'c', 'abc')).toEqual(['c', 'a', 'b']);
    });

    it('lista vazia: insere a única chave na posição 0', () => {
        expect(moverChaveNaOrdem([], 'a', 0)).toEqual(['a']);
        expect(moverChaveNaOrdem([], 'a', 10)).toEqual(['a']);
    });

    it('lista undefined/null é tratada como vazia (defensivo)', () => {
        expect(moverChaveNaOrdem(undefined, 'a', 0)).toEqual(['a']);
        expect(moverChaveNaOrdem(null, 'a', 0)).toEqual(['a']);
    });
});

describe('recalcularIndiceTurno', () => {
    it('quem estava na vez continua com a vez depois de uma reordenação (índice muda para acompanhar a chave)', () => {
        const antes = ['a', 'b', 'c'];
        const depois = ['c', 'a', 'b']; // 'b' era o da vez (índice 1), agora está no índice 2
        expect(recalcularIndiceTurno(antes, depois, 1)).toBe(2);
    });

    it('quando a ordem não muda, o índice permanece o mesmo', () => {
        const antes = ['a', 'b', 'c'];
        expect(recalcularIndiceTurno(antes, antes, 1)).toBe(1);
    });

    it('quando quem estava na vez é removido, o PRÓXIMO da fila antiga (ainda presente) assume', () => {
        const antes = ['a', 'b', 'c'];
        const depois = ['a', 'c']; // 'b' (índice 1, da vez) saiu; próximo era 'c'
        expect(recalcularIndiceTurno(antes, depois, 1)).toBe(1); // 'c' agora está no índice 1
    });

    it('quando quem estava na vez é removido e o próximo IMEDIATO também não existe mais, pula para o seguinte que ainda está presente (com wraparound)', () => {
        const antes = ['a', 'b', 'c', 'd'];
        const depois = ['a', 'd']; // 'b' (da vez, índice 1) e 'c' saíram; próximo presente é 'd'
        expect(recalcularIndiceTurno(antes, depois, 1)).toBe(1); // 'd' está no índice 1 de depois
    });

    it('quando todos depois de quem tinha a vez (com wraparound) saíram, mas alguém antes continua, esse assume', () => {
        const antes = ['a', 'b', 'c'];
        const depois = ['a']; // 'b' tinha a vez e saiu; 'c' também saiu; só sobrou 'a'
        expect(recalcularIndiceTurno(antes, depois, 1)).toBe(0); // 'a' está no índice 0 de depois
    });

    it('lista "depois" vazia retorna 0', () => {
        expect(recalcularIndiceTurno(['a', 'b'], [], 1)).toBe(0);
        expect(recalcularIndiceTurno(['a', 'b'], undefined, 1)).toBe(0);
    });

    it('lista "antes" vazia retorna 0 (nada para recalcular a partir de)', () => {
        expect(recalcularIndiceTurno([], ['a'], 0)).toBe(0);
        expect(recalcularIndiceTurno(undefined, ['a'], 0)).toBe(0);
    });

    it('índice atual fora dos limites de "antes" é normalizado (módulo) antes do cálculo', () => {
        const antes = ['a', 'b', 'c'];
        const depois = ['c', 'a', 'b'];
        // indiceAtual = 4 -> 4 % 3 = 1 -> 'b', que está no índice 2 de depois
        expect(recalcularIndiceTurno(antes, depois, 4)).toBe(2);
    });

    it('índice atual negativo é normalizado corretamente (módulo positivo)', () => {
        const antes = ['a', 'b', 'c'];
        const depois = ['c', 'a', 'b'];
        // indiceAtual = -1 -> ((-1 % 3) + 3) % 3 = 2 -> 'c', que está no índice 0 de depois
        expect(recalcularIndiceTurno(antes, depois, -1)).toBe(0);
    });

    it('índice atual não numérico é tratado como 0 (defensivo)', () => {
        const antes = ['a', 'b', 'c'];
        const depois = ['b', 'c', 'a'];
        expect(recalcularIndiceTurno(antes, depois, 'x')).toBe(2); // 'a' (índice 0 antes) está no índice 2 depois
    });
});
