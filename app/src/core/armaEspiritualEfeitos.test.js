import { describe, it, expect } from 'vitest';
import { estadoEfetivoDaArma, blocoEfetivoDaArma, efeitosDaArmaEspiritual, fonteDeEstadosDaArma } from './armaEspiritualEfeitos.js';
import { getBuffs } from './attributes.js';
import { calcularCA } from './engine.js';

const fichaCom = (arma) => ({ destreza: { base: 85 }, poderes: [], inventario: [], armaEspiritual: { nome: 'Excalibur', acessoArma: true, ...arma } });

const efeitosEstados = {
    base: { efeitos: [{ atributo: 'dano', propriedade: 'base', valor: 7 }], aplicaEstados: [{ id: 'sangrando', stacks: 2 }] },
    verdadeira: { efeitos: [{ atributo: 'dano', propriedade: 'base', valor: 40 }, { atributo: 'evasiva', propriedade: 'base', valor: 9 }] },
    fantasma: { efeitos: [{ atributo: 'dano', propriedade: 'base', valor: 900 }] }
};

describe('estadoEfetivoDaArma', () => {
    it('sem arma, sem acesso ou desequipada = null', () => {
        expect(estadoEfetivoDaArma(null)).toBeNull();
        expect(estadoEfetivoDaArma({})).toBeNull();
        expect(estadoEfetivoDaArma(fichaCom({ acessoArma: false }))).toBeNull();
        expect(estadoEfetivoDaArma(fichaCom({ equipada: false }))).toBeNull();
    });

    it('padrão é base e respeita o estado marcado quando liberado', () => {
        expect(estadoEfetivoDaArma(fichaCom({}))).toBe('base');
        expect(estadoEfetivoDaArma(fichaCom({ estadoAtivo: 'verdadeira' }))).toBe('verdadeira');
        expect(estadoEfetivoDaArma(fichaCom({ estadoAtivo: 'fantasma', acessoFantasma: true }))).toBe('fantasma');
    });

    it('sem acesso ao estado marcado, cai um nível', () => {
        expect(estadoEfetivoDaArma(fichaCom({ estadoAtivo: 'fantasma', acessoFantasma: false }))).toBe('verdadeira');
        expect(estadoEfetivoDaArma(fichaCom({ estadoAtivo: 'fantasma', acessoFantasma: false, acessoVerdadeira: false }))).toBe('base');
        expect(estadoEfetivoDaArma(fichaCom({ estadoAtivo: 'verdadeira', acessoVerdadeira: false }))).toBe('base');
    });
});

describe('efeitos só do estado efetivo', () => {
    it('blocoEfetivoDaArma devolve só o bloco do estado em vigor', () => {
        const f = fichaCom({ efeitosEstados, estadoAtivo: 'verdadeira' });
        expect(blocoEfetivoDaArma(f)).toBe(efeitosEstados.verdadeira);
        expect(blocoEfetivoDaArma(fichaCom({ efeitosEstados, equipada: false }))).toEqual({});
    });

    it('efeitosDaArmaEspiritual ignora lixo e outros estados', () => {
        const f = fichaCom({ estadoAtivo: 'base', efeitosEstados: { base: { efeitos: [{ atributo: 'dano', propriedade: 'base', valor: '7' }, { atributo: 'dano' }, null] }, fantasma: efeitosEstados.fantasma } });
        const ef = efeitosDaArmaEspiritual(f);
        expect(ef).toHaveLength(1);
        expect(ef[0]).toMatchObject({ atributo: 'dano', propriedade: 'base', valor: 7, nome: 'Excalibur' });
    });

    it('getBuffs vê o buff do estado em vigor e NÃO o de outro estado', () => {
        const base = getBuffs(fichaCom({ efeitosEstados, estadoAtivo: 'base' }), 'dano');
        const verd = getBuffs(fichaCom({ efeitosEstados, estadoAtivo: 'verdadeira' }), 'dano');
        const semArma = getBuffs(fichaCom({ efeitosEstados, equipada: false }), 'dano');
        expect(base.base).toBe(7);
        expect(verd.base).toBe(40);
        expect(semArma.base).toBe(0);
    });

    it('calcularCA soma só o buff do estado em vigor (entra no total reduzido)', () => {
        // Destreza baixa: o buff +9 precisa pesar dentro da reducao (12 + reduzirComBonus(5, 0) = 15; 12 + reduzirComBonus(5, 9) = 21)
        const ca = (arma) => calcularCA({ ...fichaCom(arma), destreza: { base: 5 } }, 'evasiva');
        const sem = ca({});
        const base = ca({ efeitosEstados, estadoAtivo: 'base' });
        const verd = ca({ efeitosEstados, estadoAtivo: 'verdadeira' });
        expect(sem).toBe(15);
        expect(base).toBe(sem);
        expect(verd).toBe(21);
    });
});

describe('fonteDeEstadosDaArma', () => {
    it('devolve a fonte do estado em vigor e null sem debuffs ou sem arma em uso', () => {
        const f = fichaCom({ efeitosEstados, estadoAtivo: 'base' });
        expect(fonteDeEstadosDaArma(f)).toEqual({ nome: 'Excalibur', aplicaEstados: [{ id: 'sangrando', stacks: 2 }] });
        expect(fonteDeEstadosDaArma(fichaCom({ efeitosEstados, estadoAtivo: 'verdadeira' }))).toBeNull();
        expect(fonteDeEstadosDaArma(fichaCom({ efeitosEstados, equipada: false }))).toBeNull();
        expect(fonteDeEstadosDaArma({})).toBeNull();
    });
});
