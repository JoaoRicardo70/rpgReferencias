import { describe, it, expect, beforeEach } from 'vitest';
import useStore from '../stores/useStore.js';
import {
    getClasseAtivaId, getCategoriaArma, classeFavoreceArma, getMultiplicadorBonusArma, riderMontado, racaDeDragao,
    calcularFatorBerserker, calcularGanhoBerserker, getEfeitosFixosDeClasse, removerEfeitosLegados, getVantagensDeClasse,
    golpeEquipado, getFatorPoderDoGolpe, MECANICA_CLASSE, CLASSES_COM_MECANICA
} from './classesMecanicas.js';
import { getEfeitosDeClasse, getBuffs, getMaximo } from './attributes.js';
import { calcularPoderAtual, getGlobalMultipliers } from './poder.js';
import { getPoderParaDisputa } from './disputaPoder.js';
import { calcularAcerto } from './engine.js';

const fichaBase = (bio = {}, extra = {}) => ({
    bio, vida: { base: 1000000, atual: 1000000 }, mana: { base: 10000000, atual: 10000000 }, corpo: { base: 10000000, atual: 10000000 },
    forca: { base: 50000 }, destreza: { base: 50000 }, inteligencia: { base: 50000 }, sabedoria: { base: 50000 },
    energiaEsp: { base: 50000 }, carisma: { base: 50000 }, stamina: { base: 50000 }, constituicao: { base: 50000 },
    divisores: {}, ...extra
});

beforeEach(() => {
    useStore.getState().resetFicha();
    useStore.getState().setIsMestre(false);
    useStore.getState().setPersonagens({});
});

describe('classe ativa', () => {
    it('Alter Ego / Pretender valem pela classe vestida (subClasse); as demais pela própria', () => {
        expect(getClasseAtivaId({ bio: { classe: 'Saber' } })).toBe('saber');
        expect(getClasseAtivaId({ bio: { classe: 'alterego', subClasse: 'archer' } })).toBe('archer');
        expect(getClasseAtivaId({ bio: { classe: 'pretender', subClasse: '' } })).toBe('pretender');
        expect(getClasseAtivaId({ bio: { classe: 'saber', subClasse: 'archer' } })).toBe('saber');
        expect(getClasseAtivaId({})).toBe('');
    });

    it('toda classe com mecânica tem texto de resumo', () => {
        CLASSES_COM_MECANICA.forEach(id => expect(MECANICA_CLASSE[id]).toBeTruthy());
    });
});

describe('armas da classe', () => {
    it('categoria da arma: espada, lança (com acento) e à distância', () => {
        expect(getCategoriaArma('espada')).toBe('espada');
        expect(getCategoriaArma('Lança')).toBe('lanca');
        expect(getCategoriaArma('arco')).toBe('distancia');
        expect(getCategoriaArma('arma de fogo')).toBe('distancia');
        expect(getCategoriaArma('machado')).toBeNull();
        expect(getCategoriaArma('')).toBeNull();
    });

    it('só a classe certa dobra o Mult Poder da arma', () => {
        const saber = { bio: { classe: 'saber' } };
        expect(classeFavoreceArma(saber, 'espada')).toBe(true);
        expect(classeFavoreceArma(saber, 'lança')).toBe(false);
        expect(getMultiplicadorBonusArma(saber, { tipo: 'arma', armaTipo: 'espada' })).toBe(2);
        expect(getMultiplicadorBonusArma(saber, { tipo: 'arma', armaTipo: 'arco' })).toBe(1);
        expect(getMultiplicadorBonusArma({ bio: { classe: 'archer' } }, { tipo: 'arma', armaTipo: 'arco' })).toBe(2);
        expect(getMultiplicadorBonusArma({ bio: { classe: 'lancer' } }, { tipo: 'arma', armaTipo: 'lança' })).toBe(2);
        expect(getMultiplicadorBonusArma({ bio: {} }, { tipo: 'arma', armaTipo: 'espada' })).toBe(1);
    });

    it('Saber com Espada de Mult Poder 10x: o Poder usa 20x (e um personagem sem classe, 10x)', () => {
        const espada = { id: 1, nome: 'Excalibur', tipo: 'arma', armaTipo: 'espada', equipado: true, bonusTipo: 'mult_dano', bonusValor: '10' };
        const saber = fichaBase({ classe: 'saber' }, { inventario: [espada] });
        const mundano = fichaBase({}, { inventario: [espada] });
        expect(getGlobalMultipliers(saber).finalUni).toBe(20);
        expect(getGlobalMultipliers(mundano).finalUni).toBe(10);
    });
});

describe('efeitos fixos de classe', () => {
    it('Avenger: Poder x10 (o Poder Calculado é 10x o de quem não tem a classe)', () => {
        const sem = calcularPoderAtual(fichaBase({}), 1).poderExato;
        const com = calcularPoderAtual(fichaBase({ classe: 'avenger' }), 1).poderExato;
        expect(com / sem).toBeCloseTo(10, 6);
    });

    it('Ruler: Vida x10', () => {
        expect(getMaximo(fichaBase({ classe: 'ruler' }), 'vida')).toBe(getMaximo(fichaBase({}), 'vida') * 10);
    });

    it('Rider: x10 só com a Montaria (Dragão é passivo) e Acerto/Vantagem junto', () => {
        const semMontaria = fichaBase({ classe: 'rider' });
        const montado = fichaBase({ classe: 'rider' }, { combate: { montariaPresente: true } });
        const dragao = fichaBase({ classe: 'rider', raca: 'Dragão Ancião' });
        expect(riderMontado(semMontaria)).toBe(false);
        expect(riderMontado(montado)).toBe(true);
        expect(racaDeDragao(dragao)).toBe(true);
        expect(riderMontado(dragao)).toBe(true);
        const base = calcularPoderAtual(fichaBase({}), 1).poderExato;
        expect(calcularPoderAtual(semMontaria, 1).poderExato / base).toBeCloseTo(1, 6);
        expect(calcularPoderAtual(montado, 1).poderExato / base).toBeCloseTo(10, 6);
        expect(getVantagensDeClasse(montado, []).vantagens).toBe(1);
        expect(getVantagensDeClasse(semMontaria, []).vantagens).toBe(0);
    });

    it('Foreigner: x15 só em contato com o Vazio', () => {
        const base = calcularPoderAtual(fichaBase({}), 1).poderExato;
        expect(calcularPoderAtual(fichaBase({ classe: 'foreigner' }), 1).poderExato / base).toBeCloseTo(1, 6);
        expect(calcularPoderAtual(fichaBase({ classe: 'foreigner' }, { combate: { contatoVazio: true } }), 1).poderExato / base).toBeCloseTo(15, 6);
    });

    it('Caster: reduz o custo de Mana/Aura/Chakra', () => {
        expect(getBuffs(fichaBase({ classe: 'caster' }), 'mana').reducaoCusto).toBeGreaterThan(0);
        expect(getBuffs(fichaBase({}), 'mana').reducaoCusto).toBe(0);
        expect(getBuffs(fichaBase({ classe: 'caster' }), 'corpo').reducaoCusto).toBe(0);
    });

    it('Saber/Lancer/Archer: bônus de Acerto na arma da classe', () => {
        const efs = getEfeitosFixosDeClasse({ bio: { classe: 'saber' } });
        expect(efs.some(e => e.propriedade === 'proficiencia_arma' && e.atributo === 'espada')).toBe(true);
        expect(getEfeitosFixosDeClasse({ bio: { classe: 'archer' } }).some(e => e.atributo === 'arco')).toBe(true);
    });

    it('Alter Ego usando Avenger ganha o x10 da classe vestida', () => {
        const base = calcularPoderAtual(fichaBase({}), 1).poderExato;
        expect(calcularPoderAtual(fichaBase({ classe: 'alterego', subClasse: 'avenger' }), 1).poderExato / base).toBeCloseTo(10, 6);
        expect(calcularPoderAtual(fichaBase({ classe: 'alterego', subClasse: '' }), 1).poderExato / base).toBeCloseTo(1, 6);
    });
});

describe('Compêndio da mesa inteira (bug do Poder diferente na Ficha e no Mapa)', () => {
    it('os efeitos cadastrados em QUALQUER ficha da mesa valem, não só os da primeira/do Mestre', () => {
        const efeito = { atributo: 'dano', propriedade: 'munico', valor: 3 };
        useStore.getState().setPersonagens({
            Ana: { bio: {} },
            Mestre: { compendioOverrides: { classes: { shielder: { efeitosMatematicos: [efeito] } } } }
        });
        useStore.getState().setIsMestre(true);
        useStore.getState().updateFicha(f => { f.compendioOverrides = { condicoes: {} }; });
        expect(getEfeitosDeClasse({ bio: { classe: 'shielder' } })).toEqual([efeito]);
    });

    it('cópia salva do efeito antigo do Avenger não conta em dobro', () => {
        const antigos = [{ atributo: 'dano', propriedade: 'munico', valor: 10 }, { atributo: 'todos_status', propriedade: 'munico', valor: 10 }];
        useStore.getState().setIsMestre(true);
        useStore.getState().updateFicha(f => { f.compendioOverrides = { classes: { avenger: { efeitosMatematicos: antigos } } }; });
        const ficha = fichaBase({ classe: 'avenger' });
        expect(getEfeitosDeClasse(ficha).filter(e => e.propriedade === 'munico')).toHaveLength(1);
        const base = calcularPoderAtual(fichaBase({}), 1).poderExato;
        expect(calcularPoderAtual(ficha, 1).poderExato / base).toBeCloseTo(10, 6);
        expect(removerEfeitosLegados('avenger', antigos)).toEqual([]);
        expect(removerEfeitosLegados('saber', antigos)).toEqual(antigos);
    });
});

describe('Berserker', () => {
    it('escada de 10% em 10%: x1,5 no primeiro degrau, x20 em 100%', () => {
        expect(calcularFatorBerserker(0)).toBe(1);
        expect(calcularFatorBerserker(9)).toBe(1);
        expect(calcularFatorBerserker(10)).toBe(1.5);
        expect(calcularFatorBerserker(100)).toBe(20);
        expect(calcularFatorBerserker(55)).toBeGreaterThan(calcularFatorBerserker(45));
        expect(calcularFatorBerserker(150)).toBe(20);
        expect(calcularGanhoBerserker(10)).toBe(0.5);
    });

    it('o Poder acompanha a Vida perdida e o máximo já atingido (furiaMax) não volta ao curar', () => {
        const poderCom = (atual, furiaMax) => calcularPoderAtual(fichaBase({ classe: 'berserker' }, { vida: { base: 1000000, atual }, combate: { furiaMax } }), 1).poderExato;
        const cheio = poderCom(1000000, 0);
        const em50 = poderCom(500000, 0);
        const curado = poderCom(1000000, 50);
        expect(em50 / cheio).toBeCloseTo(calcularFatorBerserker(50), 5);
        expect(curado).toBeCloseTo(em50, 5);
        expect(poderCom(0, 0) / cheio).toBeCloseTo(20, 5);
    });
});

describe('Poder no golpe (Disputa)', () => {
    it('Caster: Conjuração (magia ofensiva equipada) vale x10 só no golpe, não no Poder exibido', () => {
        const caster = fichaBase({ classe: 'caster' }, { ataquesElementais: [{ id: 1, nome: 'Bola de Fogo', elemento: 'Fogo', equipado: true }] });
        const puro = getPoderParaDisputa(caster, 1);
        expect(getPoderParaDisputa(caster, 1, golpeEquipado(caster)) / puro).toBeCloseTo(10, 6);
        expect(getPoderParaDisputa(caster, 1, { conjuracao: false, textos: [] }) / puro).toBeCloseTo(1, 6);
        expect(getFatorPoderDoGolpe(fichaBase({}), { conjuracao: true, textos: [] }).fator).toBe(1);
    });

    it('Assassin só com a Presença Ocultada', () => {
        expect(getFatorPoderDoGolpe({ bio: { classe: 'assassin' }, ocultacaoPoder: 0 }, { textos: [] }).fator).toBe(1);
        expect(getFatorPoderDoGolpe({ bio: { classe: 'assassin' }, ocultacaoPoder: 60 }, { textos: [] }).fator).toBe(10);
    });

    it('Moon Cancer: golpe ligado ao arauto (por nome/elemento ou marcação manual)', () => {
        const mc = { bio: { classe: 'mooncancer', arauto: 'Fogo' } };
        expect(getFatorPoderDoGolpe(mc, { textos: ['bola de fogo'] }).fator).toBe(10);
        expect(getFatorPoderDoGolpe(mc, { textos: ['espada de gelo'] }).fator).toBe(1);
        expect(getFatorPoderDoGolpe({ bio: { classe: 'mooncancer' }, combate: { arautoAtivo: true } }, { textos: [] }).fator).toBe(10);
        expect(getFatorPoderDoGolpe({ bio: { classe: 'mooncancer' } }, { textos: ['fogo'] }).fator).toBe(1);
    });
});

describe('Acerto e Vantagem de classe', () => {
    it('Saber com Espada soma o bônus de Acerto e ganha Vantagem (texto da rolagem)', () => {
        const espada = { id: 1, nome: 'Excalibur', tipo: 'arma', armaTipo: 'espada', equipado: true };
        const clone = (classe) => fichaBase({ classe }, { inventario: [espada] });
        const r = calcularAcerto({ qD: 1, fD: 1, prof: 0, bonus: 0, sels: ['destreza'], minhaFicha: clone('saber'), itensEquipados: [espada] });
        const sem = calcularAcerto({ qD: 1, fD: 1, prof: 0, bonus: 0, sels: ['destreza'], minhaFicha: clone(''), itensEquipados: [espada] });
        expect(r.acertoTotal - sem.acertoTotal).toBe(3);
        expect(r.profBonusTexto).toContain('Vantagem de SABER');
        expect(sem.profBonusTexto).not.toContain('Vantagem');
        // arma de outro tipo: sem bônus
        const machado = { ...espada, armaTipo: 'machado' };
        const m = calcularAcerto({ qD: 1, fD: 1, prof: 0, bonus: 0, sels: ['destreza'], minhaFicha: fichaBase({ classe: 'saber' }, { inventario: [machado] }), itensEquipados: [machado] });
        expect(m.acertoTotal).toBe(sem.acertoTotal);
    });

    it('Vantagem de classe: a arma da classe, e só ela', () => {
        expect(getVantagensDeClasse({ bio: { classe: 'lancer' } }, ['lanca']).vantagens).toBe(1);
        expect(getVantagensDeClasse({ bio: { classe: 'lancer' } }, ['espada']).vantagens).toBe(0);
        expect(getVantagensDeClasse({ bio: {} }, ['espada']).vantagens).toBe(0);
    });
});

describe('Rider: Acerto', () => {
    it('montado soma o bônus de Acerto de classe; sem Montaria não', () => {
        const rolar = (f) => calcularAcerto({ qD: 1, fD: 1, prof: 0, bonus: 0, sels: ['destreza'], minhaFicha: f, itensEquipados: [] });
        const sem = rolar(fichaBase({}));
        expect(rolar(fichaBase({ classe: 'rider' }, { combate: { montariaPresente: true } })).acertoTotal - sem.acertoTotal).toBe(3);
        expect(rolar(fichaBase({ classe: 'rider' })).acertoTotal).toBe(sem.acertoTotal);
    });
});
