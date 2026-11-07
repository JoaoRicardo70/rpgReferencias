import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./firebase-sync', () => ({
    salvarCamposPersonagem: vi.fn(),
    salvarDummie: vi.fn(),
}));

import { salvarCamposPersonagem } from './firebase-sync';
import { criarPosGolpe } from './posGolpe';
import { absorverEmPersonagem } from './danoAlvo';
import useStore from '../stores/useStore';

const esc = (id, nome, valor, tipo = 'escudo') => ({ id, nome, valor, tipo });
const personagem = (f, nome = 'Ana') => ({ isPersonagem: true, personagemNome: nome, nome, ficha: f });

beforeEach(() => {
    vi.clearAllMocks();
    useStore.setState({ personagens: {} });
});

describe('absorverEmPersonagem', () => {
    it('absorve, grava so o campo escudos e devolve o texto do feed', () => {
        const r = absorverEmPersonagem('Ana', { escudos: [esc('a', 'Domo', 100)] }, 40, 'Ana');
        expect(r).toEqual({ restante: 0, absorvido: 40, texto: 'Ana absorveu 40 (restam 60)' });
        expect(salvarCamposPersonagem).toHaveBeenCalledWith('Ana', { escudos: [expect.objectContaining({ valor: 60 })] });
    });
    it('usa a ficha mais recente do store quando existe', () => {
        useStore.setState({ personagens: { Ana: { escudos: [esc('a', 'Domo', 10)] } } });
        const r = absorverEmPersonagem('Ana', { escudos: [esc('a', 'Domo', 1000)] }, 50);
        expect(r.absorvido).toBe(10);
        expect(r.restante).toBe(40);
        expect(salvarCamposPersonagem).toHaveBeenCalledWith('Ana', { escudos: null });
    });
    it('sem escudos nao grava nada', () => {
        expect(absorverEmPersonagem('Ana', {}, 30)).toEqual({ restante: 30, absorvido: 0, texto: '' });
        expect(salvarCamposPersonagem).not.toHaveBeenCalled();
    });
});

describe('posGolpe - escudos do alvo-personagem', () => {
    it('aplicar devolve so o que sobra, com texto no feed; dummie nao e afetado', () => {
        const p = criarPosGolpe({});
        expect(p.aplicar('pj:Ana', personagem({ escudos: [esc('a', 'Domo', 30)] }), 100)).toBe(70);
        expect(p.resultado().textos).toEqual(['Ana absorveu 30 (restam 0)']);
        const q = criarPosGolpe({});
        expect(q.aplicar('d1', { isPersonagem: false, nome: 'Boneco', escudos: [esc('a', 'X', 30)] }, 100)).toBe(100);
        expect(q.resultado().textos).toEqual([]);
    });
    it('efeitos ao acertar valem mesmo se o escudo absorveu tudo', () => {
        const p = criarPosGolpe({ aoAcertar: [{ tipo: 'reduzirCuraAlvo', fator: 0.5, duracao: 1, origem: 'EA' }], nomeAtacante: 'Vegeta' });
        const dano = p.aplicar('pj:Ana', personagem({ escudos: [esc('a', 'Domo', 500)] }), 100);
        expect(dano).toBe(0);
        const campos = salvarCamposPersonagem.mock.calls.map(c => c[1]);
        expect(campos.some(c => c.buffsTemporarios)).toBe(true);
        expect(p.resultado().aoAcertar).toHaveLength(1);
        expect(p.resultado().textos.join(' ')).toContain('cura do alvo reduzida a 50%');
    });
    it('aviso unico para Dummie sem ficha menciona cura reduzida', () => {
        const p = criarPosGolpe({ aoAcertar: [{ tipo: 'reduzirCuraAlvo', fator: 0.5, duracao: 1 }] });
        p.aplicar('d1', { isPersonagem: false, nome: 'Boneco' }, 10);
        p.aplicar('d2', { isPersonagem: false, nome: 'Boneco2' }, 10);
        expect(p.resultado().textos.filter(t => t.includes('não tem ficha'))).toHaveLength(1);
        expect(p.resultado().textos[0]).toContain('cura reduzida');
    });
});
