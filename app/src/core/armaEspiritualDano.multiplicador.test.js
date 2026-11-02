import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { calcularDano, getPoderDeLutaStatus } from './engine.js';
import { getMaximo } from './attributes.js';
import { danoDaArmaEspiritual } from './armaEspiritualDano.js';

// Math.random=0 => todo dado rola 1 (floor(0*faces)+1). Assim NdF = N, exato.
beforeEach(() => { vi.spyOn(Math, 'random').mockReturnValue(0); });
afterEach(() => { vi.restoreAllMocks(); });

const attr = (base) => ({ nome: '', base, atual: base });
const fichaBase = (arma = {}, extra = {}) => ({
    armaEspiritual: { acessoArma: true, nome: 'Excalibur', danoBase: '10d8', ...arma },
    forca: { ...attr(0), nome: 'Força' },
    destreza: { ...attr(0), nome: 'Destreza' },
    sabedoria: { ...attr(0), nome: 'Sabedoria' },
    bio: {},
    ...extra,
});
const rolar = (ficha, itensEquipados = [], extra = {}) =>
    calcularDano({ minhaFicha: ficha, configArma: null, configHabilidades: [], itensEquipados, isCriticoNormal: false, isCriticoFatal: false, ...extra });

// Valor exibido do atributo, calculado do mesmo jeito que a Ficha mostra (descoberto empiricamente por sonda abaixo).
const exibido = (ficha, k) => Math.floor(getMaximo(ficha, k) / 1000);

describe('EA com atributo multiplicador (Math.random = 0, dados = 1)', () => {
    it('sonda: valor exibido de Destreza 5000 base e 5', () => {
        const f = fichaBase({}, { destreza: { ...attr(5000), nome: 'Destreza' } });
        expect(exibido(f, 'destreza')).toBe(5);
    });

    it('10d8 x Destreza(5) = 50', () => {
        const f = fichaBase({ danoAtributos: [{ atributo: 'destreza', multiplica: true }] }, { destreza: { ...attr(5000), nome: 'Destreza' } });
        const r = rolar(f);
        expect(r.erro).toBeUndefined();
        expect(r.dano).toBe(10 * 5);
        expect(r.detalheConta).toContain('Destreza x5');
    });

    it('fator 3 multiplica o valor exibido: 10 * 5 * 3 = 150', () => {
        const f = fichaBase({ danoAtributos: [{ atributo: 'destreza', multiplica: true, fator: 3 }] }, { destreza: { ...attr(5000), nome: 'Destreza' } });
        expect(rolar(f).dano).toBe(150);
    });

    it('fator fracionario 0.5: floor(10 * 2.5) = 25', () => {
        const f = fichaBase({ danoAtributos: [{ atributo: 'destreza', multiplica: true, fator: 0.5 }] }, { destreza: { ...attr(5000), nome: 'Destreza' } });
        expect(rolar(f).dano).toBe(25);
    });

    it('fator invalido/0/negativo/NaN e ignorado (vale 1)', () => {
        const d = { destreza: { ...attr(5000), nome: 'Destreza' } };
        for (const fator of [0, -2, 'abc', NaN, null, undefined]) {
            const f = fichaBase({ danoAtributos: [{ atributo: 'destreza', multiplica: true, fator }] }, d);
            expect(rolar(f).dano, `fator=${String(fator)}`).toBe(50);
        }
    });

    it('atributo SEM multiplica so soma: 10 (dados) + 5 (Destreza) = 15', () => {
        const f = fichaBase({ danoAtributos: [{ atributo: 'destreza', multiplica: false }] }, { destreza: { ...attr(5000), nome: 'Destreza' } });
        const r = rolar(f);
        expect(r.dano).toBe(15);
    });

    it('fator em atributo que so soma e ignorado', () => {
        const f = fichaBase({ danoAtributos: [{ atributo: 'destreza', multiplica: false, fator: 100 }] }, { destreza: { ...attr(5000), nome: 'Destreza' } });
        expect(rolar(f).dano).toBe(15);
    });

    it('varios atributos: multiplicadores se compoem e somadores somam depois', () => {
        const f = fichaBase({
            danoAtributos: [
                { atributo: 'destreza', multiplica: true },            // x5
                { atributo: 'sabedoria', multiplica: true, fator: 2 }, // x(3*2)=6
                { atributo: 'forca', multiplica: false },              // +4
            ]
        }, {
            destreza: { ...attr(5000), nome: 'Destreza' },
            sabedoria: { ...attr(3000), nome: 'Sabedoria' },
            forca: { ...attr(4000), nome: 'Força' },
        });
        // dados 10 * 5 * 6 = 300; + Força 4 = 304
        expect(rolar(f).dano).toBe(304);
    });

    it('multiplicador com atributo valendo 0 zera os dados da EA', () => {
        const f = fichaBase({ danoAtributos: [{ atributo: 'destreza', multiplica: true }] });
        const r = rolar(f);
        expect(r.erro).toBeUndefined();
        expect(r.dano).toBe(0);
    });

    it('atributo inexistente na ficha nao quebra (valor 0)', () => {
        const f = fichaBase({ danoAtributos: [{ atributo: 'naoExiste', multiplica: true }] });
        expect(() => rolar(f)).not.toThrow();
        expect(rolar(f).dano).toBe(0);
    });

    it('critico normal dobra o resultado multiplicado', () => {
        const f = fichaBase({ danoAtributos: [{ atributo: 'destreza', multiplica: true }] }, { destreza: { ...attr(5000), nome: 'Destreza' } });
        expect(rolar(f, [], { isCriticoNormal: true }).dano).toBe(100);
    });
});

describe('EA: danoBase invalido e dado com resto', () => {
    it.each(['abc', '', '   ', undefined, null, 'd8', '0d8', '10d0'])('danoBase %j = sem fonte, sem quebrar', (danoBase) => {
        const f = fichaBase({ danoBase });
        expect(danoDaArmaEspiritual(f)).toBeNull();
        let r;
        expect(() => { r = rolar(f); }).not.toThrow();
        expect(r.erro).toMatch(/Nenhuma fonte de dano/);
    });

    it('"250d8 + 10": so o dado vale (250), o +10 e ignorado', () => {
        const f = fichaBase({ danoBase: '250d8 + 10' });
        const r = rolar(f);
        expect(r.dano).toBe(250);
    });
});

describe('EA + arma do inventario', () => {
    const arma = { id: 1, nome: 'Espada', tipo: 'arma', equipado: true, dadosQtd: 7, dadosFaces: 6 };

    it('somam: 10 (EA) + 7 (arma) = 17', () => {
        const r = rolar(fichaBase(), [arma]);
        expect(r.dano).toBe(17);
        expect(r.armaStr).toContain('Excalibur');
        expect(r.armaStr).toContain('Espada');
    });

    it('EA desequipada: so a arma comum', () => {
        expect(rolar(fichaBase({ equipada: false }), [arma]).dano).toBe(7);
    });

    it('EA sem acesso: so a arma comum', () => {
        expect(rolar(fichaBase({ acessoArma: false }), [arma]).dano).toBe(7);
    });

    it('EA multiplicada soma com a arma comum (a arma nao e multiplicada)', () => {
        const f = fichaBase({ danoAtributos: [{ atributo: 'destreza', multiplica: true }] }, { destreza: { ...attr(5000), nome: 'Destreza' } });
        // EA 10*5=50 + arma 7 + Forca padrao da arma (sels default ['forca'] = 0)
        expect(rolar(f, [arma]).dano).toBe(57);
    });
});

describe('EA: estados superiores', () => {
    const extra = { destreza: { ...attr(5000), nome: 'Destreza' }, forca: { ...attr(2000), nome: 'Força' } };
    const sup = { acessoVerdadeira: true, acessoFantasma: true };

    it('verdadeira herda dado e atributos da Base', () => {
        const f = fichaBase({ ...sup, estadoAtivo: 'verdadeira', danoAtributos: [{ atributo: 'destreza', multiplica: true }] }, extra);
        expect(rolar(f).dano).toBe(50);
    });

    it('verdadeira sobrescreve dado; atributos herdados', () => {
        const f = fichaBase({ ...sup, estadoAtivo: 'verdadeira', danoBaseVerdadeira: '20d10', danoAtributos: [{ atributo: 'destreza', multiplica: true }] }, extra);
        expect(rolar(f).dano).toBe(100);
    });

    it('fantasma sobrescreve atributos (Forca soma em vez de multiplicar Destreza)', () => {
        const f = fichaBase({
            ...sup, estadoAtivo: 'fantasma', danoBaseFantasma: '30d4',
            danoAtributos: [{ atributo: 'destreza', multiplica: true }],
            danoAtributosFantasma: [{ atributo: 'forca', multiplica: false }],
        }, extra);
        expect(rolar(f).dano).toBe(32); // 30 + Forca 2
    });

    it('danoBase proprio invalido no estado cai para a Base', () => {
        const f = fichaBase({ ...sup, estadoAtivo: 'fantasma', danoBaseFantasma: 'xyz' }, extra);
        expect(rolar(f).dano).toBe(10);
    });

    it('estado sem acesso volta a Base', () => {
        const f = fichaBase({ acessoVerdadeira: false, estadoAtivo: 'verdadeira', danoBaseVerdadeira: '99d6' }, extra);
        expect(rolar(f).dano).toBe(10);
    });
});

describe('Ficha SEM EA continua igual (regressao)', () => {
    // Referencia independente: 7d6 com random=0 = 7, + Forca exibida (3).
    const arma = { id: 1, nome: 'Espada', tipo: 'arma', equipado: true, dadosQtd: 7, dadosFaces: 6 };
    const forca = { ...attr(3000), nome: 'Força' };

    it.each([
        ['sem chave armaEspiritual', {}],
        ['armaEspiritual vazia', { armaEspiritual: {} }],
        ['armaEspiritual sem acesso e com dano', { armaEspiritual: { acessoArma: false, danoBase: '999d20' } }],
        ['armaEspiritual desequipada', { armaEspiritual: { acessoArma: true, equipada: false, danoBase: '999d20' } }],
    ])('%s: resultado identico ao de referencia', (_n, extra) => {
        const f = { forca, bio: {}, ...extra };
        const r = rolar(f, [arma], {
            configArma: null,
        });
        expect(r.dano).toBe(7 + 3);
        expect(r.armaStr).not.toContain('Excalibur');
        expect(r.rolagem).not.toContain('999');
        expect(r.rolagem).toBe('Arma: 7d6: [1, 1, 1, 1, 1, 1, 1] = 7');
    });

    it('sem nenhuma fonte, erro igual ao anterior', () => {
        expect(rolar({ forca, bio: {} }).erro).toMatch(/Nenhuma fonte de dano/);
    });

    it('getPoderDeLutaStatus nao e afetado (sanidade)', () => {
        expect(typeof getPoderDeLutaStatus({ forca }, 'forca')).toBe('number');
    });
});
