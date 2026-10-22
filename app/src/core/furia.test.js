import { describe, it, expect } from 'vitest';
import { calcularMultiplicadorFuriaClasse, calcularPercVidaPerdida, novoPicoFuria } from './furia';

const ef = (valor, propriedade = 'furia_berserker') => ({ atributo: 'dano', propriedade, valor });
const ficha = ({ atual, base = 1000, poderes = [], extra = {} } = {}) => ({
    vida: { base, atual }, poderes, inventario: [], passivas: [], divisores: {}, bio: {}, estetica: {}, labels: {}, combate: {}, ...extra,
});
const poderFuria = (valor = 5, over = {}) => ({ nome: 'P', ativa: true, efeitos: [ef(valor)], ...over });

describe('calcularMultiplicadorFuriaClasse', () => {
    it('null/undefined/ficha vazia => 0', () => {
        expect(calcularMultiplicadorFuriaClasse(null)).toBe(0);
        expect(calcularMultiplicadorFuriaClasse(undefined)).toBe(0);
        expect(calcularMultiplicadorFuriaClasse({})).toBe(0);
    });
    it('poder ativo com furia_berserker', () => {
        expect(calcularMultiplicadorFuriaClasse(ficha({ poderes: [poderFuria(7)] }))).toBe(7);
    });
    it('poder inativo nao conta; efeitosPassivos contam mesmo inativo', () => {
        expect(calcularMultiplicadorFuriaClasse(ficha({ poderes: [poderFuria(7, { ativa: false })] }))).toBe(0);
        expect(calcularMultiplicadorFuriaClasse(ficha({ poderes: [{ ativa: false, efeitos: [], efeitosPassivos: [ef(3)] }] }))).toBe(3);
    });
    it('retorna o maior valor entre varias fontes', () => {
        const f = ficha({
            poderes: [poderFuria(4)],
            extra: { inventario: [{ equipado: true, efeitos: [ef(9)] }, { equipado: false, efeitos: [ef(50)] }], passivas: [{ efeitos: [ef(6)] }] },
        });
        expect(calcularMultiplicadorFuriaClasse(f)).toBe(9);
    });
    it('item equipado via efeitosPassivos; nao equipado ignorado', () => {
        expect(calcularMultiplicadorFuriaClasse(ficha({ extra: { inventario: [{ equipado: true, efeitosPassivos: [ef(2)] }] } }))).toBe(2);
        expect(calcularMultiplicadorFuriaClasse(ficha({ extra: { inventario: [{ equipado: false, efeitosPassivos: [ef(2)] }] } }))).toBe(0);
    });
    it('propriedade normalizada (caixa, acento, espacos)', () => {
        expect(calcularMultiplicadorFuriaClasse(ficha({ poderes: [{ ativa: true, efeitos: [ef(5, '  FURIA_Berserker ')] }] }))).toBe(5);
        expect(calcularMultiplicadorFuriaClasse(ficha({ poderes: [{ ativa: true, efeitos: [ef(5, 'fúria_berserker')] }] }))).toBe(5);
    });
    it('outras propriedades, valor invalido e entradas nulas sao ignorados sem quebrar', () => {
        const f = ficha({ poderes: [null, { ativa: true, efeitos: [null, ef(5, 'outra'), ef('abc'), ef(-3)] }], extra: { inventario: [null], passivas: [{}] } });
        expect(calcularMultiplicadorFuriaClasse(f)).toBe(0);
    });
    it('valor em string numerica e aceito', () => {
        expect(calcularMultiplicadorFuriaClasse(ficha({ poderes: [poderFuria('12')] }))).toBe(12);
    });
});

describe('calcularPercVidaPerdida', () => {
    it('Vida cheia => 0', () => expect(calcularPercVidaPerdida(ficha({ atual: 1000 }))).toBe(0));
    it('metade perdida => 50', () => expect(calcularPercVidaPerdida(ficha({ atual: 500 }))).toBe(50));
    it('arredonda para baixo', () => expect(calcularPercVidaPerdida(ficha({ atual: 667 }))).toBe(33));
    it('Vida zerada => 100', () => expect(calcularPercVidaPerdida(ficha({ atual: 0 }))).toBe(100));
    it('atual acima do maximo nunca da negativo', () => expect(calcularPercVidaPerdida(ficha({ atual: 5000 }))).toBe(0));
    it('atual ausente => 0 (assume cheia)', () => expect(calcularPercVidaPerdida(ficha({ atual: undefined }))).toBe(0));
    it('ficha null => 0', () => expect(calcularPercVidaPerdida(null)).toBe(0));
});

describe('novoPicoFuria', () => {
    it('ficha null => null', () => expect(novoPicoFuria(null)).toBeNull());
    it('sem efeito de furia => null mesmo perdendo vida', () => {
        expect(novoPicoFuria(ficha({ atual: 100 }))).toBeNull();
    });
    it('com furia e vida perdida maior que o pico => novo pico', () => {
        expect(novoPicoFuria(ficha({ atual: 400, poderes: [poderFuria()] }))).toBe(60);
    });
    it('pico igual ou maior ja gravado => null', () => {
        const f = ficha({ atual: 400, poderes: [poderFuria()], extra: { combate: { furiaMax: 60 } } });
        expect(novoPicoFuria(f)).toBeNull();
        f.combate.furiaMax = 80;
        expect(novoPicoFuria(f)).toBeNull();
    });
    it('pico menor gravado => sobe', () => {
        expect(novoPicoFuria(ficha({ atual: 400, poderes: [poderFuria()], extra: { combate: { furiaMax: 10 } } }))).toBe(60);
    });
    it('vida cheia (0%) => null', () => {
        expect(novoPicoFuria(ficha({ atual: 1000, poderes: [poderFuria()] }))).toBeNull();
    });
    it('sem objeto combate => trata pico como 0', () => {
        const f = ficha({ atual: 900, poderes: [poderFuria()] });
        delete f.combate;
        expect(novoPicoFuria(f)).toBe(10);
    });
});
