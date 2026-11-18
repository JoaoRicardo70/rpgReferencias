import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./firebase-sync', () => ({ salvarCamposPersonagem: vi.fn(), salvarDummie: vi.fn() }));

import { criarPosGolpe } from './posGolpe';
import useStore from '../stores/useStore';

const stat = (atual, base = 1000000) => ({ base, atual, mBase: 1, mGeral: 1, mFormas: 1, mUnico: '1.0', mAbsoluto: 1 });
const pers = (nome, mana) => ({ isPersonagem: true, personagemNome: nome, nome, ficha: { vida: stat(1000000), mana: stat(mana), aura: stat(100000), poderes: [] } });
const dreno = (extra) => ({ tipo: 'drenarEnergiaAlvo', modo: 'fixo', valor: 10, energia: 'mana', origem: 'S', ...extra });
beforeEach(() => { vi.clearAllMocks(); useStore.setState({ personagens: {} }); });

describe('posGolpe - roubar', () => {
    it('varios alvos acumulam em resultado().roubado', () => {
        const p = criarPosGolpe({ aoAcertar: [dreno({ roubar: true })], nomeAtacante: 'A' });
        p.aplicar('pj:X', pers('X', 100000), 5);
        p.aplicar('pj:Y', pers('Y', 100000), 5);
        expect(p.resultado().roubado).toEqual({ mana: 20000 });
    });
    it('alvo com pouca energia entra so com o que tinha', () => {
        const p = criarPosGolpe({ aoAcertar: [dreno({ roubar: true })], nomeAtacante: 'A' });
        p.aplicar('pj:X', pers('X', 4000), 5);
        p.aplicar('pj:Y', pers('Y', 100000), 5);
        expect(p.resultado().roubado).toEqual({ mana: 14000 });
    });
    it('sem roubar: resultado sem chave roubado', () => {
        const p = criarPosGolpe({ aoAcertar: [dreno()], nomeAtacante: 'A' });
        p.aplicar('pj:X', pers('X', 100000), 5);
        expect('roubado' in p.resultado()).toBe(false);
    });
    it('alvo sem dano nao rouba', () => {
        const p = criarPosGolpe({ aoAcertar: [dreno({ roubar: true })], nomeAtacante: 'A' });
        p.aplicar('pj:X', pers('X', 100000), 0);
        expect('roubado' in p.resultado()).toBe(false);
    });
    it('dummie (sem ficha) nao rouba', () => {
        const p = criarPosGolpe({ aoAcertar: [dreno({ roubar: true })], nomeAtacante: 'A' });
        p.aplicar('d1', { isPersonagem: false, nome: 'Boneco', vida: 100 }, 5);
        expect('roubado' in p.resultado()).toBe(false);
    });
});
