import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./firebase-sync', () => ({
    salvarCamposPersonagem: vi.fn(),
    salvarDummie: vi.fn()
}));

import { salvarCamposPersonagem } from './firebase-sync';
import { criarPosGolpe } from './posGolpe';
import useStore from '../stores/useStore';

const F = 1000;
const stat = (atual, base = 1000000) => ({ base, atual, mBase: 1, mGeral: 1, mFormas: 1, mUnico: '1.0', mAbsoluto: 1 });
const ficha = (extra = {}) => ({ vida: stat(1000000), mana: stat(100000), aura: stat(100000), poderes: [], ...extra });
const personagem = (f = ficha(), nome = 'Ana') => ({ isPersonagem: true, personagemNome: nome, nome, ficha: f });
const dummie = () => ({ isPersonagem: false, nome: 'Boneco', vida: 100 });
const dreno = (extra) => ({ tipo: 'drenarEnergiaAlvo', modo: 'fixo', valor: 10, energia: 'mana', origem: 'Sifao', ...extra });
const debuff = (extra) => ({ tipo: 'debuffAlvo', modo: 'fixo', valor: 3, atributo: 'evasiva', duracao: 3, origem: 'Sifao', ...extra });
const cura = { tipo: 'curarAtacante', modo: 'fixo', valor: 5, origem: 'Vamp' };

beforeEach(() => {
    vi.clearAllMocks();
    useStore.setState({ personagens: {} });
});

describe('posGolpe - Ao acertar no alvo', () => {
    it('dreno em alvo-personagem com dano grava mana/atual e texto com o nome do alvo', () => {
        const p = criarPosGolpe({ aoAcertar: [dreno()], nomeAtacante: 'Vegeta' });
        expect(p.aplicar('pj:Ana', personagem(), 50)).toBe(50);
        expect(salvarCamposPersonagem).toHaveBeenCalledTimes(1);
        expect(salvarCamposPersonagem).toHaveBeenCalledWith('Ana', { 'mana/atual': 100000 - 10 * F });
        const t = p.resultado().textos;
        expect(t).toHaveLength(1);
        expect(t[0].startsWith('Ana: ')).toBe(true);
        expect(t[0]).toContain('mana');
    });
    it('debuff grava buffsTemporarios com fonte = nomeAtacante', () => {
        const p = criarPosGolpe({ aoAcertar: [debuff()], nomeAtacante: 'Vegeta' });
        p.aplicar('pj:Ana', personagem(), 50);
        const [nome, campos] = salvarCamposPersonagem.mock.calls[0];
        expect(nome).toBe('Ana');
        expect(Object.keys(campos)).toEqual(['buffsTemporarios']);
        expect(campos.buffsTemporarios[0]).toMatchObject({ nome: 'Enfraquecido (Evasiva)', fonte: 'Vegeta', restantes: 3 });
        expect(campos.buffsTemporarios[0].efeitos[0].valor).toBe(-3);
    });
    it('dreno + debuff juntos: uma unica gravacao com campos e buffs', () => {
        const p = criarPosGolpe({ aoAcertar: [dreno(), debuff()], nomeAtacante: 'V' });
        p.aplicar('pj:Ana', personagem(), 10);
        expect(salvarCamposPersonagem).toHaveBeenCalledTimes(1);
        expect(Object.keys(salvarCamposPersonagem.mock.calls[0][1]).sort()).toEqual(['buffsTemporarios', 'mana/atual']);
    });
    it('dano 0 nao grava nem avisa', () => {
        const p = criarPosGolpe({ aoAcertar: [dreno(), debuff()] });
        p.aplicar('pj:Ana', personagem(), 0);
        p.aplicar('d', dummie(), 0);
        expect(salvarCamposPersonagem).not.toHaveBeenCalled();
        expect(p.resultado().textos).toEqual([]);
    });
    it('varios alvos-personagem: cada um e gravado com a sua ficha', () => {
        const p = criarPosGolpe({ aoAcertar: [dreno({ valor: 5 })], nomeAtacante: 'V' });
        p.aplicar('pj:Ana', personagem(ficha({ mana: stat(50000) }), 'Ana'), 10);
        p.aplicar('pj:Bia', personagem(ficha({ mana: stat(20000) }), 'Bia'), 10);
        expect(salvarCamposPersonagem).toHaveBeenCalledTimes(2);
        expect(salvarCamposPersonagem).toHaveBeenCalledWith('Ana', { 'mana/atual': 50000 - 5 * F });
        expect(salvarCamposPersonagem).toHaveBeenCalledWith('Bia', { 'mana/atual': 20000 - 5 * F });
        const t = p.resultado().textos;
        expect(t.filter(x => x.startsWith('Ana: '))).toHaveLength(1);
        expect(t.filter(x => x.startsWith('Bia: '))).toHaveLength(1);
    });
    it('so o alvo que sofreu dano e gravado', () => {
        const p = criarPosGolpe({ aoAcertar: [dreno()] });
        p.aplicar('pj:Ana', personagem(ficha(), 'Ana'), 0);
        p.aplicar('pj:Bia', personagem(ficha(), 'Bia'), 7);
        expect(salvarCamposPersonagem).toHaveBeenCalledTimes(1);
        expect(salvarCamposPersonagem.mock.calls[0][0]).toBe('Bia');
    });
    it('Dummie recebe UM aviso por golpe (varios Dummies e varias entradas)', () => {
        const p = criarPosGolpe({ aoAcertar: [dreno(), debuff()] });
        p.aplicar('a', dummie(), 10);
        p.aplicar('b', dummie(), 10);
        p.aplicar('c', dummie(), 10);
        const avisos = p.resultado().textos.filter(t => t.includes('Entidade do Mapa não tem ficha'));
        expect(avisos).toHaveLength(1);
        expect(salvarCamposPersonagem).not.toHaveBeenCalled();
    });
    it('personagem sem ficha tambem recebe o aviso e nao grava', () => {
        const p = criarPosGolpe({ aoAcertar: [debuff()] });
        p.aplicar('pj:Ana', { isPersonagem: true, personagemNome: 'Ana', nome: 'Ana' }, 10);
        expect(salvarCamposPersonagem).not.toHaveBeenCalled();
        expect(p.resultado().textos.some(t => t.includes('não tem ficha'))).toBe(true);
    });
    it('Dummie + personagem: personagem e gravado e o aviso aparece uma vez', () => {
        const p = criarPosGolpe({ aoAcertar: [dreno()] });
        p.aplicar('d', dummie(), 10);
        p.aplicar('pj:Ana', personagem(), 10);
        expect(salvarCamposPersonagem).toHaveBeenCalledTimes(1);
        expect(p.resultado().textos.filter(t => t.includes('não tem ficha'))).toHaveLength(1);
    });
    it('so cura do atacante: nao grava e nao avisa; cura segue no resultado', () => {
        const p = criarPosGolpe({ aoAcertar: [cura] });
        p.aplicar('a', dummie(), 10);
        p.aplicar('pj:Ana', personagem(), 10);
        expect(salvarCamposPersonagem).not.toHaveBeenCalled();
        expect(p.resultado().textos).toEqual([]);
        expect(p.resultado().aoAcertar).toEqual([cura]);
    });
    it('efeitos do atacante continuam independentes dos do alvo', () => {
        const lista = [cura, dreno()];
        const p = criarPosGolpe({ aoAcertar: lista });
        p.aplicar('pj:Ana', personagem(), 10);
        expect(p.resultado().aoAcertar).toEqual(lista);
        expect(salvarCamposPersonagem).toHaveBeenCalledTimes(1);
    });
    it('apenasCritico respeita o critico do golpe', () => {
        const a = criarPosGolpe({ aoAcertar: [dreno({ apenasCritico: true })], critico: false });
        a.aplicar('pj:Ana', personagem(), 10);
        expect(salvarCamposPersonagem).not.toHaveBeenCalled();
        const b = criarPosGolpe({ aoAcertar: [dreno({ apenasCritico: true })], critico: true });
        b.aplicar('pj:Ana', personagem(), 10);
        expect(salvarCamposPersonagem).toHaveBeenCalledTimes(1);
    });
    it('energia ausente na ficha: nao grava nada', () => {
        const f = ficha(); delete f.mana;
        const p = criarPosGolpe({ aoAcertar: [dreno()] });
        p.aplicar('pj:Ana', personagem(f), 10);
        expect(salvarCamposPersonagem).not.toHaveBeenCalled();
    });
    it('usa a ficha MAIS RECENTE do store quando difere de alvo.ficha', () => {
        useStore.setState({ personagens: { Ana: ficha({ mana: stat(30000) }) } });
        const p = criarPosGolpe({ aoAcertar: [dreno({ valor: 5 })] });
        p.aplicar('pj:Ana', personagem(ficha({ mana: stat(100000) })), 10);
        expect(salvarCamposPersonagem).toHaveBeenCalledWith('Ana', { 'mana/atual': 30000 - 5 * F });
    });
    it('buffs novos no store sao preservados (debuff soma sobre a lista fresca)', () => {
        const velho = { id: 'x', nome: 'Escudo', fonte: 'Z', efeitos: [{ atributo: 'forca', propriedade: 'base', valor: 2 }], restantes: 2 };
        useStore.setState({ personagens: { Ana: ficha({ buffsTemporarios: [velho] }) } });
        const p = criarPosGolpe({ aoAcertar: [debuff()], nomeAtacante: 'V' });
        p.aplicar('pj:Ana', personagem(ficha()), 10);
        const lista = salvarCamposPersonagem.mock.calls[0][1].buffsTemporarios;
        expect(lista.map(b => b.nome)).toEqual(['Escudo', 'Enfraquecido (Evasiva)']);
    });
    it('personagem ausente do store: cai no alvo.ficha', () => {
        useStore.setState({ personagens: { Outra: ficha() } });
        const p = criarPosGolpe({ aoAcertar: [dreno({ valor: 5 })] });
        p.aplicar('pj:Ana', personagem(ficha({ mana: stat(40000) })), 10);
        expect(salvarCamposPersonagem).toHaveBeenCalledWith('Ana', { 'mana/atual': 40000 - 5 * F });
    });
    it('store com personagens indefinido: cai no alvo.ficha sem quebrar', () => {
        useStore.setState({ personagens: undefined });
        const p = criarPosGolpe({ aoAcertar: [dreno({ valor: 5 })] });
        expect(() => p.aplicar('pj:Ana', personagem(ficha({ mana: stat(40000) })), 10)).not.toThrow();
        expect(salvarCamposPersonagem).toHaveBeenCalledTimes(1);
    });
});
