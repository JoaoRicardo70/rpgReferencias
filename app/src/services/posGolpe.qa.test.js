import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./firebase-sync', () => ({
    salvarCamposPersonagem: vi.fn(), salvarDummie: vi.fn(),
    aplicarDanoDireto: vi.fn(), aplicarFadigaDireta: vi.fn(), aplicarElementoDireto: vi.fn(), aplicarElementoNivelDireto: vi.fn(),
}));

import { salvarCamposPersonagem, aplicarDanoDireto } from './firebase-sync';
import { criarPosGolpe } from './posGolpe';
import { absorverEmPersonagem } from './danoAlvo';
import useStore from '../stores/useStore';

// QA - posGolpe.aplicar com God Mode (Imunidade total) no alvo-personagem: ignora Reflexo, estados, 'Ao acertar', escudo e atingiuComDano.

const F = 1000;
const stat = (atual, base = 1000000) => ({ base, atual, mBase: 1, mGeral: 1, mFormas: 1, mUnico: '1.0', mAbsoluto: 1 });
const REFLEXO = { id: 'r', nome: 'Espelho', ativa: true, reflexo: { modo: 'devolver', mult: 100, automatico: true, energia: 'mana', custoPercentual: 10 } };
const GOD = { turnosRestantes: 1, origem: 'x' };
const ficha = (extra = {}) => ({ vida: stat(1000000), mana: stat(100000), aura: stat(100000), poderes: [REFLEXO], escudos: [{ id: 'a', nome: 'Domo', valor: 100, tipo: 'escudo' }], ...extra });
const alvo = (f, nome = 'Ana') => ({ isPersonagem: true, personagemNome: nome, nome, ficha: f });
const AO_ACERTAR = [
    { tipo: 'drenarEnergiaAlvo', modo: 'fixo', valor: 10, energia: 'mana', origem: 'Sifao' },
    { tipo: 'debuffAlvo', modo: 'fixo', valor: 3, atributo: 'evasiva', duracao: 3, origem: 'Sifao' },
    { tipo: 'curarAtacante', modo: 'fixo', valor: 5, origem: 'Vamp' },
];
const golpe = () => criarPosGolpe({ estados: [{ id: 'sangrando', stacks: 2 }], critico: false, danoOriginal: 80, nomeAtacante: 'Vegeta', aoAcertar: AO_ACERTAR });

beforeEach(() => { vi.clearAllMocks(); useStore.setState({ personagens: {} }); });

describe('posGolpe.aplicar - God Mode', () => {
    it('alvo imune: dano 0, nada gravado, sem Reflexo, estados, Ao acertar nem escudo; atacante nao ganha efeito de dano; feed avisa', () => {
        const f = ficha({ combate: { imunidadeTotal: { ...GOD } } });
        useStore.setState({ personagens: { Ana: f } });
        const p = golpe();
        expect(p.aplicar('pj:Ana', alvo(f), 80)).toBe(0);
        expect(salvarCamposPersonagem).not.toHaveBeenCalled();
        expect(aplicarDanoDireto).not.toHaveBeenCalled();
        const r = p.resultado();
        expect(r.textos).toEqual(['Ana está com Imunidade total: o golpe não surtiu efeito']);
        expect(r.aoAcertar).toEqual([]);
        expect(r.danoAtacante).toBe(0);
        expect(f.escudos[0].valor).toBe(100);
        expect(f.mana.atual).toBe(100000);
    });
    it('usa a ficha mais FRESCA do store (snapshot do clique sem imunidade, store com)', () => {
        useStore.setState({ personagens: { Ana: ficha({ combate: { imunidadeTotal: { ...GOD } } }) } });
        const p = golpe();
        expect(p.aplicar('pj:Ana', alvo(ficha()), 80)).toBe(0);
        expect(salvarCamposPersonagem).not.toHaveBeenCalled();
    });
    it('sem snapshot no store usa a ficha do alvo', () => {
        const p = golpe();
        expect(p.aplicar('pj:Ana', alvo(ficha({ combate: { imunidadeTotal: { ...GOD } } })), 80)).toBe(0);
    });
    it('imunidade vencida (0 turnos): tudo igual ao de antes (Reflexo devolve, estados, Ao acertar, escudo)', () => {
        const f = ficha({ combate: { imunidadeTotal: { turnosRestantes: 0, origem: 'x' } }, poderes: [] });
        useStore.setState({ personagens: { Ana: f } });
        const p = golpe();
        const dano = p.aplicar('pj:Ana', alvo(f), 80);
        expect(dano).toBe(0); // escudo 100 absorveu os 80
        expect(salvarCamposPersonagem).toHaveBeenCalled();
        const r = p.resultado();
        expect(r.aoAcertar).toEqual(AO_ACERTAR);
        expect(r.textos.join(' ')).not.toContain('Imunidade total');
        expect(r.textos.join(' ')).toContain('absorveu 80');
    });
    it('sem imunidade e com Reflexo automatico: o Reflexo roda e cobra mana (regressao)', () => {
        const f = ficha();
        useStore.setState({ personagens: { Ana: f } });
        const p = golpe();
        p.aplicar('pj:Ana', alvo(f), 80);
        const campos = salvarCamposPersonagem.mock.calls.map(c => c[1]);
        expect(campos.some(c => c['mana/atual'] < 100000), JSON.stringify(campos)).toBe(true);
        expect(p.resultado().danoAtacante).toBe(80);
    });
    it('golpe em area: um alvo imune e outro nao — so o segundo sofre efeitos e o atacante so ganha por ele', () => {
        const imune = ficha({ combate: { imunidadeTotal: { ...GOD } } });
        const normal = ficha({ poderes: [] });
        useStore.setState({ personagens: { Ana: imune, Bia: normal } });
        const p = golpe();
        expect(p.aplicar('pj:Ana', alvo(imune, 'Ana'), 80)).toBe(0);
        expect(p.resultado().aoAcertar).toEqual([]);
        const dBia = p.aplicar('pj:Bia', alvo(normal, 'Bia'), 80);
        expect(dBia).toBe(0); // escudo da Bia absorve
        expect(salvarCamposPersonagem.mock.calls.every(c => c[0] === 'Bia')).toBe(true);
        const r = p.resultado();
        expect(r.aoAcertar).toEqual(AO_ACERTAR);
        expect(r.textos.filter(t => t.includes('Imunidade total'))).toHaveLength(1);
    });
    it('Dummie nunca e imune por este caminho', () => {
        const p = golpe();
        expect(p.aplicar('d1', { isPersonagem: false, nome: 'Boneco', vida: 100 }, 80)).toBe(80);
    });
});

describe('absorverEmPersonagem - escudosNovos enumeravel', () => {
    it('o retorno mantem a lista ao espalhar e ao serializar; campos de sempre iguais', () => {
        const f = ficha({ poderes: [] });
        useStore.setState({ personagens: { Ana: f } });
        const r = absorverEmPersonagem('Ana', f, 30, 'Ana');
        expect(Object.keys(r)).toContain('escudosNovos');
        expect({ ...r }.escudosNovos).toEqual([{ id: 'a', nome: 'Domo', valor: 70, valorMax: 100, tipo: 'escudo' }]);
        expect(JSON.parse(JSON.stringify(r)).escudosNovos).toHaveLength(1);
        expect(r).toMatchObject({ restante: 0, absorvido: 30, texto: 'Ana absorveu 30 (restam 70)' });
        expect(salvarCamposPersonagem).toHaveBeenCalledWith('Ana', { escudos: r.escudosNovos });
    });
    it('sem absorcao nao ha escudosNovos; escudo zerado grava null e a lista vazia', () => {
        const f = ficha({ poderes: [], escudos: undefined });
        delete f.escudos;
        useStore.setState({ personagens: { Ana: f } });
        expect(absorverEmPersonagem('Ana', f, 30, 'Ana')).toEqual({ restante: 30, absorvido: 0, texto: '' });
        const g = ficha({ poderes: [] });
        useStore.setState({ personagens: { Ana: g } });
        const r = absorverEmPersonagem('Ana', g, 100, 'Ana');
        expect(r.escudosNovos).toEqual([]);
        expect(salvarCamposPersonagem).toHaveBeenCalledWith('Ana', { escudos: null });
    });
});
