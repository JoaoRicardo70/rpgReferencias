import { describe, it, expect } from 'vitest';
import { normalizarMarcos, efeitosDoEstagio } from './estagios';
import { getPoderDiretoMultiplier } from './poder';

const mult = (extra) => ({ nome: 'm', atributo: 'poder_direto', propriedade: 'mgeral', valor: '3', fixo: true, ...extra });
const ficha = (estagio, efeitosMarco, iniciativa) => ({
    iniciativa, inventario: [],
    poderes: [{ id: 'p', nome: 'P', ativa: true, estagioAtual: estagio, estagios: { habilitado: true, maximo: 3, marcos: [{ estagio: 2, efeitos: efeitosMarco }] }, efeitos: [] }],
});

describe('marcos de estagio preservam quando e escopo', () => {
    it('normalizarMarcos mantem quando/escopo e nao cria chaves vazias', () => {
        const [m] = normalizarMarcos([{ estagio: 2, efeitos: [
            mult({ quando: 'em_combate' }),
            { nome: 'v', atributo: 'vantagem', propriedade: 'x', valor: '1', escopo: 'ataque' },
            mult({ quando: '', escopo: undefined }),
        ] }]);
        expect(m.efeitos[0].quando).toBe('em_combate');
        expect(m.efeitos[1].escopo).toBe('ataque');
        expect('quando' in m.efeitos[2]).toBe(false);
        expect('escopo' in m.efeitos[2]).toBe(false);
        expect(m.efeitos[2]).toEqual({ nome: 'm', atributo: 'poder_direto', propriedade: 'mgeral', valor: '3', fixo: true });
    });
    it('marco com multiplicador em_combate so vale em combate (mesmo funil)', () => {
        const efs = normalizarMarcos([{ estagio: 2, efeitos: [mult({ quando: 'em_combate' })] }])[0].efeitos;
        const p = (n) => ficha(n, efs, n === 2 ? 0 : 0).poderes[0];
        expect(efeitosDoEstagio([], p(2), 2)[0].quando).toBe('em_combate');
        expect(getPoderDiretoMultiplier(ficha(2, efs, 0))).toBe(1);
        expect(getPoderDiretoMultiplier(ficha(2, efs, 5))).toBe(4);
    });
    it('marco sem quando = igual ao de antes', () => {
        const efs = normalizarMarcos([{ estagio: 2, efeitos: [mult()] }])[0].efeitos;
        expect(getPoderDiretoMultiplier(ficha(2, efs, 0))).toBe(4);
    });
});
