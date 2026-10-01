import { describe, it, expect } from 'vitest';
import { capturarMaximosAtuais, rescalarVitaisProporcional, getTetoExibidoComFator, aplicarRegeneracaoDeTurno } from './vitals';
import { calcularFatorMultiplicadorForca } from './poder';

// Regressão: equipar/desequipar a arma (Mapa/Arsenal) drenava Vida e Energias de personagens com
// Multiplicador de Força > 1 — o travamento clampava "atual" contra o teto SEM o fator, enquanto a
// Ficha/Regeneração gravam "atual" contra o teto COM o fator.
function statBase(base, extra = {}) {
    return { base, mBase: 1.0, mGeral: 1.0, mFormas: 1.0, mUnico: '1.0', mAbsoluto: 1.0, ...extra };
}
function criarFicha() {
    return {
        vida: { ...statBase(100000000), atual: 1, regeneracao: 1e15 },
        mana: { ...statBase(100000000), atual: 1, regeneracao: 1e15 },
        aura: { ...statBase(100000000), atual: 1, regeneracao: 1e15 },
        chakra: { ...statBase(100000000), atual: 1, regeneracao: 1e15 },
        corpo: { ...statBase(100000000), atual: 1, regeneracao: 1e15 },
        forca: statBase(1000000), destreza: statBase(1000000), inteligencia: statBase(1000000),
        sabedoria: statBase(1000000), energiaEsp: statBase(1000000), carisma: statBase(1000000),
        stamina: statBase(1000000), constituicao: statBase(1000000),
        inventario: [{ id: 1, nome: 'Espada', tipo: 'arma', equipado: false, efeitos: [{ atributo: 'forca', propriedade: 'base', valor: 10 }] }],
    };
}
function toggle(ficha) {
    const old = capturarMaximosAtuais(ficha);
    ficha.inventario[0].equipado = !ficha.inventario[0].equipado;
    rescalarVitaisProporcional(ficha, old);
}

describe('core/vitals — equipar/desequipar com Multiplicador de Força > 1 não drena', () => {
    it('vitais cheios (teto com fator) continuam cheios após equipar e desequipar', () => {
        const ficha = criarFicha();
        expect(calcularFatorMultiplicadorForca(ficha, 'vida')).toBeGreaterThan(1);
        aplicarRegeneracaoDeTurno(ficha);
        const antes = {};
        ['vida', 'mana', 'aura', 'chakra', 'corpo'].forEach(k => {
            expect(ficha[k].atual).toBe(getTetoExibidoComFator(k, ficha));
            antes[k] = ficha[k].atual;
        });
        toggle(ficha);
        toggle(ficha);
        ['vida', 'mana', 'aura', 'chakra', 'corpo'].forEach(k => expect(ficha[k].atual).toBe(antes[k]));
    });
});

const VITAIS = ['vida', 'mana', 'aura', 'chakra', 'corpo'];

function criarFichaComForma(extra = {}) {
    const ficha = criarFicha();
    ficha.poderes = [{
        id: 'f1', nome: 'Modo Duplo', categoria: 'forma', ativa: false,
        efeitos: [{ atributo: 'mana', propriedade: 'mformas', valor: 2 }],
    }];
    return Object.assign(ficha, extra);
}
function toggleForma(ficha) {
    const old = capturarMaximosAtuais(ficha);
    ficha.poderes[0].ativa = !ficha.poderes[0].ativa;
    rescalarVitaisProporcional(ficha, old);
}

describe('core/vitals — Forma (mformas) com Multiplicador de Força > 1 não drena barras cheias', () => {
    it('ligar e desligar uma Forma mantém Vida/Energias cheias (teto com fator) exatamente cheias', () => {
        const ficha = criarFichaComForma();
        expect(calcularFatorMultiplicadorForca(ficha, 'vida')).toBeGreaterThan(1);
        aplicarRegeneracaoDeTurno(ficha);
        const antes = {};
        VITAIS.forEach(k => { antes[k] = ficha[k].atual; expect(antes[k]).toBe(getTetoExibidoComFator(k, ficha)); });

        toggleForma(ficha); // liga
        VITAIS.forEach(k => expect(ficha[k].atual).toBeGreaterThanOrEqual(antes[k] - 1));
        toggleForma(ficha); // desliga
        VITAIS.forEach(k => expect(ficha[k].atual).toBe(antes[k]));
    });

    it('Vida (que a Forma não toca) nunca muda de valor ao alternar a Forma', () => {
        const ficha = criarFichaComForma();
        aplicarRegeneracaoDeTurno(ficha);
        const vida = ficha.vida.atual;
        toggleForma(ficha);
        expect(ficha.vida.atual).toBe(vida);
        toggleForma(ficha);
        expect(ficha.vida.atual).toBe(vida);
    });
});

describe('core/vitals — personagem com fator === 1 continua se comportando como antes', () => {
    function fichaFator1() {
        const f = criarFichaComForma();
        ['vida', 'mana', 'aura', 'chakra', 'corpo'].forEach(k => { f[k] = { ...statBase(100), atual: 100 }; });
        f.forca = statBase(100);
        return f;
    }

    it('o fator é 1 neste fixture', () => {
        const f = fichaFator1();
        VITAIS.forEach(k => expect(calcularFatorMultiplicadorForca(f, k)).toBe(1));
    });

    it('equipar e desequipar sem efeito nos vitais não altera "atual"', () => {
        const f = fichaFator1();
        f.mana.atual = 77;
        toggle(f);
        expect(f.mana.atual).toBe(77);
        toggle(f);
        expect(f.mana.atual).toBe(77);
    });

    it('ligar a Forma não reduz "atual" e desligar clampa ao teto original (100)', () => {
        const f = fichaFator1();
        toggleForma(f);
        expect(f.mana.atual).toBe(100);
        f.mana.atual = 150; // só possível com a Forma ligada
        toggleForma(f);
        expect(f.mana.atual).toBe(100);
    });

    it('capturarMaximosAtuais devolve o máximo estável sem fator extra', () => {
        const f = fichaFator1();
        expect(capturarMaximosAtuais(f, ['mana']).mana).toBe(100);
    });
});

describe('core/vitals — desequipar de verdade que REDUZ o máximo ainda clampa (com fator > 1)', () => {
    it('item com mbase de mana: desequipado, "atual" cheio cai pro novo teto menor e não passa dele', () => {
        const ficha = criarFicha();
        ficha.inventario = [{ id: 7, nome: 'Anel de Mana', tipo: 'acessorio', equipado: true, efeitos: [{ atributo: 'mana', propriedade: 'mbase', valor: 3 }] }];
        const tetoCom = getTetoExibidoComFator('mana', ficha);
        ficha.mana.atual = tetoCom; // cheio com o item
        const old = capturarMaximosAtuais(ficha);
        ficha.inventario[0].equipado = false;
        rescalarVitaisProporcional(ficha, old);
        const tetoSem = getTetoExibidoComFator('mana', ficha);
        expect(tetoSem).toBeLessThan(tetoCom);
        expect(ficha.mana.atual).toBeLessThanOrEqual(tetoSem);
        expect(ficha.mana.atual).toBeGreaterThan(0);
    });
});
