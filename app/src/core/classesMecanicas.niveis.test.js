import { describe, it, expect, afterEach } from 'vitest';
import {
    registrarResolvedorNivelClasse, getNivelClasse, getEscalaClasse, getEfeitosFixosDeClasse, getFatorPoderDoGolpe,
    getMultiplicadorBonusArma, getBonusAcertoDeClasse, getVantagensDeClasse, calcularFatorBerserker,
    avengerEmFocoOdio, rulerEmFocoProtecao, getTextoMecanica, MECANICA_CLASSE_GRAND, MECANICA_CLASSE_CANDIDATO, MECANICA_CLASSE
} from './classesMecanicas.js';
import { getNivelDaFichaNaClasse } from './attributes.js';
import useStore from '../stores/useStore';

const ficha = (classe, extra = {}) => ({ bio: { classe, mesa: 'presente' }, combate: {}, ...extra });
const valor = (efeitos, atributo, propriedade) => efeitos.filter(e => e.atributo === atributo && e.propriedade === propriedade).map(e => e.valor);

afterEach(() => { registrarResolvedorNivelClasse(getNivelDaFichaNaClasse); });

describe('Focos de Ruler e Avenger', () => {
    it('Avenger: Foco de Ódio soma Vida x10, sem ele só o Poder x10', () => {
        const semFoco = getEfeitosFixosDeClasse(ficha('avenger'));
        expect(valor(semFoco, 'vida', 'munico')).toEqual([]);
        expect(valor(semFoco, 'dano', 'munico')).toEqual([10]);
        const comFoco = getEfeitosFixosDeClasse(ficha('avenger', { combate: { focoOdio: true } }));
        expect(valor(comFoco, 'vida', 'munico')).toEqual([10]);
        expect(valor(comFoco, 'dano', 'munico')).toEqual([10]);
    });

    it('Ruler: Foco de Proteção soma Poder Calculado x10 além da Vida x10', () => {
        const semFoco = getEfeitosFixosDeClasse(ficha('ruler'));
        expect(valor(semFoco, 'dano', 'munico')).toEqual([]);
        expect(valor(semFoco, 'vida', 'munico')).toEqual([10]);
        const comFoco = getEfeitosFixosDeClasse(ficha('ruler', { combate: { focoProtecao: true } }));
        expect(valor(comFoco, 'dano', 'munico')).toEqual([10]);
    });

    it('cada Foco só vale pra sua Classe', () => {
        expect(avengerEmFocoOdio(ficha('ruler', { combate: { focoOdio: true } }))).toBe(false);
        expect(rulerEmFocoProtecao(ficha('avenger', { combate: { focoProtecao: true } }))).toBe(false);
        expect(getEfeitosFixosDeClasse(ficha('saber', { combate: { focoOdio: true, focoProtecao: true } })).some(e => e.atributo === 'vida')).toBe(false);
    });

    it('Alter Ego vestindo Avenger usa o Foco de Ódio', () => {
        const f = { bio: { classe: 'alterego', subClasse: 'avenger' }, combate: { focoOdio: true } };
        expect(avengerEmFocoOdio(f)).toBe(true);
    });
});

describe('Níveis de Classe (Comum / Candidato a Grand / Grand)', () => {
    it('sem resolvedor todo mundo é Comum', () => {
        registrarResolvedorNivelClasse(null);
        expect(getNivelClasse(ficha('ruler'))).toBe('comum');
        expect(getEscalaClasse(ficha('ruler'))).toBe(1);
    });

    it('resolvedor inválido ou que lança cai no Comum', () => {
        registrarResolvedorNivelClasse(() => 'deus');
        expect(getNivelClasse(ficha('ruler'))).toBe('comum');
        registrarResolvedorNivelClasse(() => { throw new Error('x'); });
        expect(getNivelClasse(ficha('ruler'))).toBe('comum');
    });

    it('Candidato fica entre o Comum e o Grand nos multiplicadores', () => {
        const poder = (nivel) => { registrarResolvedorNivelClasse(() => nivel); return valor(getEfeitosFixosDeClasse(ficha('avenger')), 'dano', 'munico')[0]; };
        const comum = poder('comum'), candidato = poder('candidato'), grand = poder('grand');
        expect(comum).toBeLessThan(candidato);
        expect(candidato).toBeLessThan(grand);
        expect(comum).toBe(10);
    });

    it('Foco, golpe, arma, acerto e vantagens também crescem com o nível', () => {
        registrarResolvedorNivelClasse(() => 'grand');
        expect(valor(getEfeitosFixosDeClasse(ficha('ruler', { combate: { focoProtecao: true } })), 'dano', 'munico')).toEqual([20]);
        expect(getFatorPoderDoGolpe(ficha('caster'), { conjuracao: true }).fator).toBe(20);
        expect(getMultiplicadorBonusArma(ficha('saber'), { tipo: 'arma', armaTipo: 'espada' })).toBe(4);
        expect(valor(getEfeitosFixosDeClasse(ficha('saber')), 'espada', 'proficiencia_arma')).toEqual([5]);
        expect(getBonusAcertoDeClasse(ficha('rider', { combate: { montariaPresente: true } }))).toBe(5);
        expect(getVantagensDeClasse(ficha('saber'), ['espada']).vantagens).toBe(2);
        registrarResolvedorNivelClasse(() => 'candidato');
        expect(getVantagensDeClasse(ficha('saber'), ['espada']).vantagens).toBe(1);
        expect(getBonusAcertoDeClasse(ficha('rider', { combate: { montariaPresente: true } }))).toBe(4);
    });

    it('Berserker escala a escada e a redução do Caster respeita o teto', () => {
        expect(calcularFatorBerserker(100, 2)).toBe(calcularFatorBerserker(100) * 2);
        expect(calcularFatorBerserker(5, 2)).toBe(1);
        registrarResolvedorNivelClasse(() => 'grand');
        expect(valor(getEfeitosFixosDeClasse(ficha('caster')), 'mana', 'reducaocusto')).toEqual([40]);
    });

    it('o nível só vale na Classe ativa (sem Classe, Comum)', () => {
        registrarResolvedorNivelClasse(() => 'grand');
        expect(getNivelClasse({ bio: {} })).toBe('comum');
        expect(getNivelClasse(null)).toBe('comum');
    });
});

describe('getNivelDaFichaNaClasse (Compêndio da mesa)', () => {
    const montarMesa = (grands, fichaDeCada) => {
        useStore.setState({ meuNome: 'Eu', minhaFicha: fichaDeCada.Eu, personagens: { ...fichaDeCada, Mestre: { compendioOverrides: { grands } } } });
    };

    it('titular do trono é Grand; candidato é Candidato; o resto é Comum', () => {
        const eu = ficha('ruler'), ana = ficha('ruler'), bia = ficha('ruler');
        montarMesa({ ruler_presente: 'Ana', ruler_presente_candidatos: ['Eu'] }, { Eu: eu, Ana: ana, Bia: bia });
        expect(getNivelDaFichaNaClasse(ana, 'ruler')).toBe('grand');
        expect(getNivelDaFichaNaClasse(eu, 'ruler')).toBe('candidato');
        expect(getNivelDaFichaNaClasse(bia, 'ruler')).toBe('comum');
    });

    it('o trono é por Classe e por mesa', () => {
        const ana = { bio: { classe: 'ruler', mesa: 'futuro' }, combate: {} };
        montarMesa({ ruler_presente: 'Ana' }, { Eu: ficha('saber'), Ana: ana });
        expect(getNivelDaFichaNaClasse(ana, 'ruler')).toBe('comum');
        expect(getNivelDaFichaNaClasse(ana, 'avenger')).toBe('comum');
    });

    it('NPC nomeado em qualquer mesa vale como Grand', () => {
        const npc = { bio: { classe: 'ruler', mesa: 'npc' }, combate: {} };
        montarMesa({ ruler_futuro: 'Boss' }, { Eu: ficha('saber'), Boss: npc });
        expect(getNivelDaFichaNaClasse(npc, 'ruler')).toBe('grand');
    });

    it('reconhece a ficha pelo bio mesmo numa cópia do objeto', () => {
        const ana = ficha('ruler');
        montarMesa({ ruler_presente: 'Ana' }, { Eu: ficha('saber'), Ana: ana });
        expect(getNivelDaFichaNaClasse({ ...ana, extra: 1 }, 'ruler')).toBe('grand');
    });

    it('nome com caractere inválido no Firebase ainda casa (nomes sanitizados)', () => {
        const eu = ficha('ruler');
        useStore.setState({ meuNome: 'Dr. Ana', minhaFicha: eu, personagens: { Mestre: { compendioOverrides: { grands: { ruler_presente: 'Dr_ Ana' } } } } });
        expect(getNivelDaFichaNaClasse(eu, 'ruler')).toBe('grand');
    });

    it('ficha fora da mesa ou sem Classe é Comum', () => {
        montarMesa({ ruler_presente: 'Ana' }, { Eu: ficha('saber') });
        expect(getNivelDaFichaNaClasse(ficha('ruler'), 'ruler')).toBe('comum');
        expect(getNivelDaFichaNaClasse(null, 'ruler')).toBe('comum');
        expect(getNivelDaFichaNaClasse(ficha('ruler'), '')).toBe('comum');
    });

    it('integra: um Grand Avenger recebe o Poder x20 pelo resolvedor real', () => {
        const ana = ficha('avenger');
        montarMesa({ avenger_presente: 'Ana' }, { Eu: ficha('saber'), Ana: ana });
        expect(valor(getEfeitosFixosDeClasse(ana), 'dano', 'munico')).toEqual([20]);
    });
});

describe('Textos por nível', () => {
    it('Ruler e Avenger citam o Foco e o Grand cita números maiores', () => {
        expect(MECANICA_CLASSE.ruler).toContain('Foco de Proteção');
        expect(MECANICA_CLASSE.avenger).toContain('Foco de Ódio');
        expect(MECANICA_CLASSE_GRAND.avenger).toContain('x20');
        expect(MECANICA_CLASSE_CANDIDATO.avenger).toContain('x15');
    });

    it('getTextoMecanica cai no Comum quando falta o nível ou a Classe', () => {
        expect(getTextoMecanica('ruler', 'grand')).toBe(MECANICA_CLASSE_GRAND.ruler);
        expect(getTextoMecanica('ruler', 'qualquer')).toBe(MECANICA_CLASSE.ruler);
        expect(getTextoMecanica('inexistente', 'grand')).toBe('');
    });
});
