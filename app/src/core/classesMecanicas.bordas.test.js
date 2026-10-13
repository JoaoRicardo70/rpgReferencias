import { describe, it, expect, beforeEach } from 'vitest';
import useStore from '../stores/useStore.js';
import {
    getClasseAtivaId, classeFavoreceArma, getMultiplicadorBonusArma, riderMontado, racaDeDragao,
    calcularFatorBerserker, calcularGanhoBerserker, getEfeitosFixosDeClasse, removerEfeitosLegados, getVantagensDeClasse,
    golpeEquipado, getFatorPoderDoGolpe, MECANICA_CLASSE
} from './classesMecanicas.js';
import { getEfeitosDeClasse } from './attributes.js';
import { calcularPoderAtual } from './poder.js';

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

describe('bordas (QA)', () => {
    it('ficha sem bio / nula / classe desconhecida não quebra nem dá efeito', () => {
        expect(getClasseAtivaId(null)).toBe('');
        expect(getClasseAtivaId(undefined)).toBe('');
        expect(getClasseAtivaId({ bio: null })).toBe('');
        expect(getEfeitosFixosDeClasse({})).toEqual([]);
        expect(getEfeitosFixosDeClasse(null)).toEqual([]);
        expect(getEfeitosFixosDeClasse({ bio: { classe: 'shielder' } })).toEqual([]);
        expect(getVantagensDeClasse({}, undefined)).toEqual({ vantagens: 0, motivos: [] });
        expect(getVantagensDeClasse({ bio: { classe: 'saber' } }, null).vantagens).toBe(0);
        expect(getMultiplicadorBonusArma({}, null)).toBe(1);
        expect(getMultiplicadorBonusArma({ bio: { classe: 'saber' } }, { tipo: 'armadura', armaTipo: 'espada' })).toBe(1);
        expect(riderMontado({})).toBe(false);
        expect(getFatorPoderDoGolpe({}, undefined)).toEqual({ fator: 1, motivos: [] });
        expect(golpeEquipado(null)).toEqual({ conjuracao: false, textos: [] });
        expect(MECANICA_CLASSE.shielder).toBeUndefined();
    });

    it('Alter Ego com subClasse recebe os efeitos da classe vestida; sem subClasse ou desconhecida, nenhum', () => {
        expect(getEfeitosFixosDeClasse({ bio: { classe: 'alterego', subClasse: 'ruler' } }).some(e => e.atributo === 'vida' && e.valor === 10)).toBe(true);
        expect(getEfeitosFixosDeClasse({ bio: { classe: 'alterego', subClasse: '' } })).toEqual([]);
        expect(getEfeitosFixosDeClasse({ bio: { classe: 'alterego', subClasse: 'inexistente' } })).toEqual([]);
        expect(getEfeitosFixosDeClasse({ bio: { classe: 'alterego', subClasse: 'Lancer' } }).some(e => e.propriedade === 'proficiencia_arma')).toBe(true);
    });

    it('Pretender com subClasse veste a classe; sem, não tem efeito', () => {
        const base = calcularPoderAtual(fichaBase({}), 1).poderExato;
        expect(calcularPoderAtual(fichaBase({ classe: 'pretender', subClasse: 'avenger' }), 1).poderExato / base).toBeCloseTo(10, 6);
        expect(calcularPoderAtual(fichaBase({ classe: 'pretender' }), 1).poderExato / base).toBeCloseTo(1, 6);
        expect(getVantagensDeClasse({ bio: { classe: 'pretender', subClasse: 'saber' } }, ['espada']).vantagens).toBe(1);
        expect(classeFavoreceArma({ bio: { classe: 'pretender', subClasse: 'lancer' } }, 'lança')).toBe(true);
    });

    it('Alter Ego/Pretender vestindo Caster/Assassin/Moon Cancer usam o fator do golpe', () => {
        expect(getFatorPoderDoGolpe({ bio: { classe: 'alterego', subClasse: 'caster' } }, { conjuracao: true, textos: [] }).fator).toBe(10);
        expect(getFatorPoderDoGolpe({ bio: { classe: 'alterego', subClasse: 'assassin' }, ocultacaoPoder: 5 }, { textos: [] }).fator).toBe(10);
        expect(getFatorPoderDoGolpe({ bio: { classe: 'pretender', subClasse: 'mooncancer' }, combate: { arautoAtivo: true } }, { textos: [] }).fator).toBe(10);
    });

    it('Moon Cancer sem arauto (vazio, espaços) e sem marcação: fator 1; sem golpe também', () => {
        expect(getFatorPoderDoGolpe({ bio: { classe: 'mooncancer', arauto: '   ' } }, { textos: ['fogo'] }).fator).toBe(1);
        expect(getFatorPoderDoGolpe({ bio: { classe: 'mooncancer' } }, undefined).fator).toBe(1);
        expect(getFatorPoderDoGolpe({ bio: { classe: 'mooncancer' } }, { textos: [] }).motivos).toEqual([]);
        expect(getFatorPoderDoGolpe({ bio: { classe: 'mooncancer', arauto: 'Fogo' } }, undefined).fator).toBe(1);
    });

    it('Moon Cancer: arauto sem acento/caixa casa; arauto contendo o texto do golpe (>=3 letras) casa', () => {
        expect(getFatorPoderDoGolpe({ bio: { classe: 'mooncancer', arauto: 'LUA' } }, { textos: ['lua cheia'] }).fator).toBe(10);
        expect(getFatorPoderDoGolpe({ bio: { classe: 'mooncancer', arauto: 'Senhor do Tempo' } }, { textos: ['tempo'] }).fator).toBe(10);
        expect(getFatorPoderDoGolpe({ bio: { classe: 'mooncancer', arauto: 'Senhor do Tempo' } }, { textos: ['de'] }).fator).toBe(1);
    });

    it('Caster sem conjuração e Assassin com ocultação inválida não ganham fator', () => {
        expect(getFatorPoderDoGolpe({ bio: { classe: 'caster' } }, undefined).fator).toBe(1);
        expect(getFatorPoderDoGolpe({ bio: { classe: 'assassin' }, ocultacaoPoder: 'abc' }, { textos: [] }).fator).toBe(1);
        expect(getFatorPoderDoGolpe({ bio: { classe: 'assassin' }, ocultacaoPoder: -5 }, { textos: [] }).fator).toBe(1);
        expect(getFatorPoderDoGolpe({ bio: { classe: 'saber' }, ocultacaoPoder: 50 }, { textos: [] }).fator).toBe(1);
    });

    it('golpeEquipado: ignora não equipados, armadura e suporte; coleta nomes/elementos normalizados', () => {
        const f = {
            inventario: [
                { nome: 'Espada Sagrada', tipo: 'arma', armaTipo: 'Espada', equipado: true },
                { nome: 'Escudo', tipo: 'armadura', equipado: true },
                { nome: 'Adaga', tipo: 'arma', equipado: false },
                null
            ],
            poderes: [{ nome: 'Fúria', elemento: 'Fogo', ativa: true }, { nome: 'Off', ativa: false }],
            ataquesElementais: [{ nome: 'Cura', equipado: true, tipoMecanica: 'suporte' }, { nome: 'Raio', elemento: 'Elétrico', equipado: true }, null]
        };
        const g = golpeEquipado(f);
        expect(g.conjuracao).toBe(true);
        expect(g.textos).toContain('espada sagrada');
        expect(g.textos).toContain('furia');
        expect(g.textos).toContain('eletrico');
        expect(g.textos).not.toContain('escudo');
        expect(g.textos).not.toContain('adaga');
        expect(g.textos).not.toContain('cura');
        expect(golpeEquipado({ ataquesElementais: [{ nome: 'Cura', equipado: true, tipoMecanica: 'suporte' }] }).conjuracao).toBe(false);
    });

    it('Berserker: entradas inválidas, degraus intermediários e monotonia', () => {
        [NaN, undefined, null, 'abc', -10, Infinity].forEach(v => expect(calcularFatorBerserker(v)).toBe(1));
        expect(calcularFatorBerserker('50')).toBe(calcularFatorBerserker(50));
        expect(calcularFatorBerserker(99.9)).toBe(calcularFatorBerserker(90));
        expect(calcularFatorBerserker(20)).toBeCloseTo(1.5 + 18.5 / 9, 3);
        let ant = 0;
        for (let p = 0; p <= 100; p += 10) { const v = calcularFatorBerserker(p); expect(v).toBeGreaterThanOrEqual(ant); ant = v; }
        expect(calcularGanhoBerserker(0)).toBe(0);
        expect(calcularGanhoBerserker(100)).toBe(19);
    });

    it('Berserker: efeito fixo de fúria e cópia legada removida', () => {
        const efs = getEfeitosFixosDeClasse({ bio: { classe: 'berserker' } });
        expect(efs.filter(e => e.propriedade === 'furia_berserker')).toHaveLength(1);
        const antigos = [{ atributo: 'dano', propriedade: 'furia_berserker', valor: 1.5 }, { atributo: 'todos_status', propriedade: 'furia_berserker', valor: 1.5 }, { atributo: 'dano', propriedade: 'munico', valor: 3 }];
        expect(removerEfeitosLegados('berserker', antigos)).toEqual([antigos[2]]);
        expect(removerEfeitosLegados('berserker', null)).toEqual([]);
        expect(removerEfeitosLegados('berserker', [null])).toEqual([null]);
        expect(removerEfeitosLegados('avenger', [{ atributo: 'Dano', propriedade: 'Munico', valor: '10' }])).toEqual([]);
    });

    it('Berserker: furiaMax acima da vida perdida mantém o ganho; furiaMax menor não reduz', () => {
        const poder = (atual, furiaMax) => calcularPoderAtual(fichaBase({ classe: 'berserker' }, { vida: { base: 1000000, atual }, combate: { furiaMax } }), 1).poderExato;
        expect(poder(1000000, 100) / poder(1000000, 0)).toBeCloseTo(20, 5);
        expect(poder(500000, 10)).toBeCloseTo(poder(500000, 0), 5);
        expect(poder(1000000, undefined)).toBeCloseTo(poder(1000000, 0), 5);
    });

    it('Berserker via Alter Ego vestido ganha fúria', () => {
        const f = fichaBase({ classe: 'alterego', subClasse: 'berserker' }, { vida: { base: 1000000, atual: 0 } });
        const base = calcularPoderAtual(fichaBase({}, { vida: { base: 1000000, atual: 0 } }), 1).poderExato;
        expect(calcularPoderAtual(f, 1).poderExato / base).toBeCloseTo(20, 4);
    });

    it('Rider: Dragão só vale pra Rider; raças de dragão', () => {
        expect(riderMontado({ bio: { classe: 'saber', raca: 'Dragão' } })).toBe(false);
        expect(riderMontado({ bio: { classe: 'alterego', subClasse: 'rider' }, combate: { montariaPresente: true } })).toBe(true);
        expect(racaDeDragao({})).toBe(false);
        expect(racaDeDragao({ bio: { raca: 'Draconiano' } })).toBe(true);
        expect(racaDeDragao({ bio: { raca: 'Dragon' } })).toBe(true);
        expect(racaDeDragao({ bio: { raca: 'Humano' } })).toBe(false);
    });

    it('getEfeitosDeClasse: ficha vazia/nula e subClasse', () => {
        expect(getEfeitosDeClasse({})).toEqual([]);
        expect(getEfeitosDeClasse(null)).toEqual([]);
        expect(getEfeitosDeClasse({ bio: { classe: 'avenger' } }).some(e => e.propriedade === 'munico' && e.valor === 10)).toBe(true);
        expect(getEfeitosDeClasse({ bio: { classe: 'alterego', subClasse: 'avenger' } }).some(e => e.propriedade === 'munico' && e.valor === 10)).toBe(true);
    });
});
