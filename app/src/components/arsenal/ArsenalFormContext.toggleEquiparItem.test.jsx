import React from 'react';
import { render, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ArsenalFormProvider, useArsenalForm } from './ArsenalFormContext';
import useStore from '../../stores/useStore';
import { salvarFichaSilencioso } from '../../services/firebase-sync';
import { getMaximo } from '../../core/attributes';

// ---------------------------------------------------------------------------
// QA — ArsenalFormContext.jsx > toggleEquiparItem(id): novo bugfix de rescala
// proporcional de vitais (capturarMaximosAtuais/rescalarVitaisProporcional, ver
// core/vitals.rescalarVitais.test.js pra matemática detalhada). Equipar/desequipar
// QUALQUER item do inventário (incluindo o efeito colateral de auto-desequipar um
// item do MESMO tipo ao equipar uma nova arma/armadura) nunca deve drenar/inflar
// ".atual" de um vital cujo máximo NÃO mudou, e deve rescalar proporcionalmente
// quando o máximo muda de fato (item com efeito em mFormas/mGeral/etc).
//
// Mesmo padrão de harness (Provider real + componente-probe) de
// PoderesFormContext.formas.test.jsx.
// ---------------------------------------------------------------------------

vi.mock('../../stores/useStore');
vi.mock('../../services/firebase-sync', () => ({
    salvarFichaSilencioso: vi.fn(),
}));

let mockState;
function montarStore(overrides = {}) {
    mockState = {
        minhaFicha: { inventario: [] },
        meuNome: 'Heroi',
        isMestre: true,
        updateFicha: vi.fn((callback) => callback(mockState.minhaFicha)),
        itemEditandoId: null,
        setItemEditandoId: vi.fn(),
        efeitosTempArsenal: [],
        setEfeitosTempArsenal: vi.fn(),
        efeitosTempPassivosArsenal: [],
        setEfeitosTempPassivosArsenal: vi.fn(),
        ...overrides,
    };
    useStore.mockImplementation((selector) => (typeof selector === 'function' ? selector(mockState) : mockState));
    return mockState;
}

let probe;
function Harness() {
    probe = useArsenalForm();
    return null;
}

afterEach(() => { cleanup(); });
beforeEach(() => { vi.clearAllMocks(); });

describe('ArsenalFormContext — toggleEquiparItem(): equipar/desequipar um item SEM efeito em vitais nunca drena ".atual"', () => {
    it('equipar um item cujos efeitos não tocam vida/mana/etc mantém ".atual" fracionário intacto (regressão do bug de Math.floor)', () => {
        const ficha = {
            vida: { base: 100, atual: 79.5 },
            inventario: [{ id: 1, nome: 'Anel Cosmético', tipo: 'acessorio', equipado: false, efeitos: [{ atributo: 'carisma', propriedade: 'base', valor: 5 }] }],
        };
        montarStore({ minhaFicha: ficha });
        render(<ArsenalFormProvider><Harness /></ArsenalFormProvider>);

        act(() => { probe.toggleEquiparItem(1); });

        expect(ficha.inventario[0].equipado).toBe(true);
        expect(ficha.vida.atual).toBe(79.5);
        expect(salvarFichaSilencioso).toHaveBeenCalledTimes(1);
    });

    it('desequipar de volta também não altera ".atual" quando o item não afeta vitais', () => {
        const ficha = {
            vida: { base: 100, atual: 42 },
            inventario: [{ id: 1, nome: 'Anel', tipo: 'acessorio', equipado: true, efeitos: [] }],
        };
        montarStore({ minhaFicha: ficha });
        render(<ArsenalFormProvider><Harness /></ArsenalFormProvider>);

        act(() => { probe.toggleEquiparItem(1); });

        expect(ficha.inventario[0].equipado).toBe(false);
        expect(ficha.vida.atual).toBe(42);
    });
});

describe('ArsenalFormContext — toggleEquiparItem(): item com efeito em mFormas trava ".atual" (nunca reduz, só clampa se ultrapassar)', () => {
    it('equipar uma armadura com efeito mformas=2 dobra o máximo de vida, mas NÃO altera ".atual" (correção definitiva: sem rescale proporcional)', () => {
        const ficha = {
            vida: { base: 100, atual: 50, mFormas: 1.0 }, // 50% de 100
            inventario: [{ id: 1, nome: 'Armadura Mística', tipo: 'armadura', equipado: false, efeitos: [{ atributo: 'vida', propriedade: 'mformas', valor: 2 }] }],
        };
        montarStore({ minhaFicha: ficha });
        render(<ArsenalFormProvider><Harness /></ArsenalFormProvider>);

        const maxAntes = getMaximo(ficha, 'vida');
        act(() => { probe.toggleEquiparItem(1); });
        const maxDepois = getMaximo(ficha, 'vida');

        expect(maxDepois).toBeGreaterThan(maxAntes);
        expect(ficha.vida.atual).toBe(50); // valor absoluto intocado, não "dobra" pra 100
    });

    it('desequipar essa mesma armadura depois NÃO reduz ".atual" — o ciclo completo equipar/desequipar termina exatamente onde começou', () => {
        const ficha = {
            vida: { base: 100, atual: 50, mFormas: 1.0 },
            inventario: [{ id: 1, nome: 'Armadura Mística', tipo: 'armadura', equipado: false, efeitos: [{ atributo: 'vida', propriedade: 'mformas', valor: 2 }] }],
        };
        montarStore({ minhaFicha: ficha });
        render(<ArsenalFormProvider><Harness /></ArsenalFormProvider>);

        act(() => { probe.toggleEquiparItem(1); }); // equipa -> máximo dobra, atual intocado (50)
        expect(ficha.vida.atual).toBe(50);

        act(() => { probe.toggleEquiparItem(1); }); // desequipa -> máximo volta ao original
        const maxDesequipado = getMaximo(ficha, 'vida');

        // 50 <= maxDesequipado (100) -> sem clamp nenhum, permanece exatamente 50 (o rescale
        // proporcional antigo reduziria pra 25).
        expect(ficha.vida.atual).toBeLessThanOrEqual(maxDesequipado);
        expect(ficha.vida.atual).toBe(50);
    });

    it('equipar quando "atual" já estava cheio no teto antigo, e desequipar depois, clampa exatamente no teto antigo de volta (nunca abaixo dele)', () => {
        const ficha = {
            vida: { base: 100, atual: 100, mFormas: 1.0 }, // 100% cheio
            inventario: [{ id: 1, nome: 'Armadura Mística', tipo: 'armadura', equipado: false, efeitos: [{ atributo: 'vida', propriedade: 'mformas', valor: 2 }] }],
        };
        montarStore({ minhaFicha: ficha });
        render(<ArsenalFormProvider><Harness /></ArsenalFormProvider>);

        act(() => { probe.toggleEquiparItem(1); }); // equipa -> máximo 100 -> 200, atual continua 100
        expect(ficha.vida.atual).toBe(100);
        expect(getMaximo(ficha, 'vida')).toBe(200);

        act(() => { probe.toggleEquiparItem(1); }); // desequipa -> máximo volta a 100, atual(100) não ultrapassa
        expect(ficha.vida.atual).toBe(100);
        expect(getMaximo(ficha, 'vida')).toBe(100);
    });
});

describe('ArsenalFormContext — toggleEquiparItem(): auto-desequipar item do MESMO tipo (arma/armadura) também rescala corretamente', () => {
    it('equipar uma NOVA arma desequipa automaticamente a arma anterior do mesmo tipo, e a rescala reflete o efeito COMBINADO (perde o efeito da antiga, ganha o da nova)', () => {
        const ficha = {
            vida: { base: 100, atual: 100, mFormas: 1.0 },
            inventario: [
                { id: 1, nome: 'Espada Velha', tipo: 'arma', equipado: true, efeitos: [{ atributo: 'vida', propriedade: 'mformas', valor: 2 }] }, // máximo atual = 200
                { id: 2, nome: 'Espada Nova', tipo: 'arma', equipado: false, efeitos: [] }, // sem efeito nenhum
            ],
        };
        montarStore({ minhaFicha: ficha });
        render(<ArsenalFormProvider><Harness /></ArsenalFormProvider>);

        // Antes de equipar a nova: máximo=200 (efeito da Espada Velha), atual=100 (50%).
        expect(getMaximo(ficha, 'vida')).toBe(200);

        act(() => { probe.toggleEquiparItem(2); }); // equipa a Espada Nova -> desequipa a Velha automaticamente

        expect(ficha.inventario[0].equipado).toBe(false); // Espada Velha desequipada
        expect(ficha.inventario[1].equipado).toBe(true); // Espada Nova equipada
        // Máximo volta a 100 (perdeu o efeito da Espada Velha, a Nova não tem efeito nenhum).
        const maxDepois = getMaximo(ficha, 'vida');
        expect(maxDepois).toBe(100);
        // atual=100 (100%) foi rescalado pra caber no novo máximo (100) -> permanece 100, sem
        // "vazar" nem ficar acima do teto.
        expect(ficha.vida.atual).toBeLessThanOrEqual(maxDepois);
    });

    it('itens de tipos DIFERENTES (arma vs armadura) nunca se auto-desequipam entre si', () => {
        const ficha = {
            vida: { base: 100, atual: 100 },
            inventario: [
                { id: 1, nome: 'Espada', tipo: 'arma', equipado: true, efeitos: [] },
                { id: 2, nome: 'Armadura', tipo: 'armadura', equipado: false, efeitos: [] },
            ],
        };
        montarStore({ minhaFicha: ficha });
        render(<ArsenalFormProvider><Harness /></ArsenalFormProvider>);

        act(() => { probe.toggleEquiparItem(2); });

        expect(ficha.inventario[0].equipado).toBe(true); // Espada continua equipada
        expect(ficha.inventario[1].equipado).toBe(true); // Armadura agora também equipada
    });
});

describe('ArsenalFormContext — deletarItem(): destruir um item EQUIPADO/boostando um vital clampa ".atual" se ultrapassar o novo (menor) máximo, mas nunca reduz proporcionalmente', () => {
    beforeEach(() => {
        vi.spyOn(window, 'confirm').mockReturnValue(true);
    });

    it('destruir um item EQUIPADO com efeito mformas=2 (dobrava o máximo) some com o boost, mas ".atual" só é clampado se de fato ultrapassar o novo teto', () => {
        const ficha = {
            vida: { base: 100, atual: 150, mFormas: 1.0 }, // 150 só é possível enquanto o item está equipado (máximo=200)
            inventario: [{ id: 1, nome: 'Armadura Mística', tipo: 'armadura', equipado: true, efeitos: [{ atributo: 'vida', propriedade: 'mformas', valor: 2 }] }],
        };
        montarStore({ minhaFicha: ficha });
        render(<ArsenalFormProvider><Harness /></ArsenalFormProvider>);

        expect(getMaximo(ficha, 'vida')).toBe(200);

        act(() => { probe.deletarItem(1); });

        expect(ficha.inventario.length).toBe(0);
        const maxDepois = getMaximo(ficha, 'vida');
        expect(maxDepois).toBe(100);
        // 150 ultrapassa o novo teto (100) -> clampado exatamente em 100, NUNCA numa fração
        // proporcional (o rescale proporcional antigo daria 150*(100/200)=75).
        expect(ficha.vida.atual).toBe(100);
        expect(window.confirm).toHaveBeenCalledTimes(1);
        expect(salvarFichaSilencioso).toHaveBeenCalledTimes(1);
    });

    it('destruir um item EQUIPADO cujo ".atual" NÃO ultrapassa o novo máximo mais baixo não é alterado (nunca encolhe proporcionalmente)', () => {
        const ficha = {
            vida: { base: 100, atual: 60, mFormas: 1.0 }, // 60 <= 100 (novo máximo depois de remover o item)
            inventario: [{ id: 1, nome: 'Armadura Mística', tipo: 'armadura', equipado: true, efeitos: [{ atributo: 'vida', propriedade: 'mformas', valor: 2 }] }],
        };
        montarStore({ minhaFicha: ficha });
        render(<ArsenalFormProvider><Harness /></ArsenalFormProvider>);

        act(() => { probe.deletarItem(1); });

        expect(ficha.inventario.length).toBe(0);
        expect(getMaximo(ficha, 'vida')).toBe(100);
        // Rescale proporcional antigo daria 60*(100/200)=30 — comportamento atual: intocado.
        expect(ficha.vida.atual).toBe(60);
    });

    it('destruir um item NÃO equipado (sem efeito no máximo atual) deixa ".atual" completamente intocado, mesmo que o item tenha efeitos em vitais', () => {
        const ficha = {
            vida: { base: 100, atual: 79.5, mFormas: 1.0 },
            inventario: [{ id: 1, nome: 'Armadura Guardada', tipo: 'armadura', equipado: false, efeitos: [{ atributo: 'vida', propriedade: 'mformas', valor: 2 }] }],
        };
        montarStore({ minhaFicha: ficha });
        render(<ArsenalFormProvider><Harness /></ArsenalFormProvider>);

        expect(getMaximo(ficha, 'vida')).toBe(100); // item desequipado -> efeito não conta

        act(() => { probe.deletarItem(1); });

        expect(ficha.inventario.length).toBe(0);
        expect(getMaximo(ficha, 'vida')).toBe(100); // nada muda, item já não boostava nada
        expect(ficha.vida.atual).toBe(79.5); // fracionário intocado, sem nenhum arredondamento
    });

    it('destruir um item qualquer (sem efeito em vitais nenhum, equipado ou não) é um no-op total pros vitais, mesmo havendo outros itens no inventário', () => {
        const ficha = {
            vida: { base: 100, atual: 33, mFormas: 1.0 },
            inventario: [
                { id: 1, nome: 'Anel Cosmético', tipo: 'acessorio', equipado: true, efeitos: [] },
                { id: 2, nome: 'Outra Relíquia', tipo: 'acessorio', equipado: false, efeitos: [{ atributo: 'carisma', propriedade: 'base', valor: 5 }] },
            ],
        };
        montarStore({ minhaFicha: ficha });
        render(<ArsenalFormProvider><Harness /></ArsenalFormProvider>);

        act(() => { probe.deletarItem(1); });

        expect(ficha.inventario.length).toBe(1);
        expect(ficha.inventario[0].id).toBe(2);
        expect(ficha.vida.atual).toBe(33);
    });

    it('cancelar a confirmação (window.confirm=false) não deleta o item nem toca nos vitais', () => {
        window.confirm.mockReturnValue(false);
        const ficha = {
            vida: { base: 100, atual: 150, mFormas: 1.0 },
            inventario: [{ id: 1, nome: 'Armadura Mística', tipo: 'armadura', equipado: true, efeitos: [{ atributo: 'vida', propriedade: 'mformas', valor: 2 }] }],
        };
        montarStore({ minhaFicha: ficha });
        render(<ArsenalFormProvider><Harness /></ArsenalFormProvider>);

        act(() => { probe.deletarItem(1); });

        expect(ficha.inventario.length).toBe(1);
        expect(ficha.vida.atual).toBe(150);
        expect(salvarFichaSilencioso).not.toHaveBeenCalled();
    });
});

describe('ArsenalFormContext — toggleEquiparItem(): robustez', () => {
    it('id inexistente é um no-op completo, sem lançar e sem chamar salvarFichaSilencioso indevidamente', () => {
        const ficha = { vida: { base: 100, atual: 50 }, inventario: [{ id: 1, nome: 'X', tipo: 'arma', equipado: false, efeitos: [] }] };
        montarStore({ minhaFicha: ficha });
        render(<ArsenalFormProvider><Harness /></ArsenalFormProvider>);

        expect(() => { act(() => { probe.toggleEquiparItem(999); }); }).not.toThrow();
        expect(ficha.vida.atual).toBe(50);
        expect(ficha.inventario[0].equipado).toBe(false);
    });

    it('ficha sem inventario nenhum não lança', () => {
        montarStore({ minhaFicha: {} });
        render(<ArsenalFormProvider><Harness /></ArsenalFormProvider>);

        expect(() => { act(() => { probe.toggleEquiparItem(1); }); }).not.toThrow();
    });

    it('desequipar um item com formaAtivaId/configAtivaId ativos limpa os dois campos junto com a rescala', () => {
        const ficha = {
            vida: { base: 100, atual: 200, mFormas: 2 },
            inventario: [{
                id: 1, nome: 'Arma com Formas', tipo: 'arma', equipado: true,
                formaAtivaId: 'f1', configAtivaId: 'c1',
                efeitos: [{ atributo: 'vida', propriedade: 'mformas', valor: 1 }],
            }],
        };
        montarStore({ minhaFicha: ficha });
        render(<ArsenalFormProvider><Harness /></ArsenalFormProvider>);

        act(() => { probe.toggleEquiparItem(1); });

        expect(ficha.inventario[0].equipado).toBe(false);
        expect(ficha.inventario[0].formaAtivaId).toBeNull();
        expect(ficha.inventario[0].configAtivaId).toBeNull();
    });
});
