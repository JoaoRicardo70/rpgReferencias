import React from 'react';
import { render, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FichaFormProvider, useFichaForm } from './FichaFormContext';
import useStore from '../../stores/useStore';
import { salvarFichaSilencioso } from '../../services/firebase-sync.js';
import { getMaximo } from '../../core/attributes.js';

// ---------------------------------------------------------------------------
// QA — FichaFormContext.jsx > toggleSerSelado(id) e ativarFormaSer(serId, formaId):
// mesmo bugfix de rescala proporcional de vitais (capturarMaximosAtuais/
// rescalarVitaisProporcional, ver core/vitals.rescalarVitais.test.js) aplicado ao
// toggle de ativação de um "Ser Selado" (Entidade Selada) e à ativação/desativação
// de uma Forma/Modo aninhado dele — nunca drenar ".atual" de um vital cujo máximo
// não mudou, e rescalar proporcionalmente quando muda de fato.
//
// Mesmo padrão de harness (Provider real + componente-probe) de
// ArsenalFormContext.toggleEquiparItem.test.jsx / PoderesFormContext.formas.test.jsx.
// ---------------------------------------------------------------------------

vi.mock('../../stores/useStore');
vi.mock('../../services/firebase-sync.js', () => ({
    salvarFichaSilencioso: vi.fn(),
    salvarFirebaseImediato: vi.fn(() => Promise.resolve()),
    uploadImagem: vi.fn(() => Promise.resolve('https://exemplo.com/img.png')),
}));

let mockState;
function montarStore(overrides = {}) {
    mockState = {
        minhaFicha: { seresSelados: [] },
        personagens: {},
        meuNome: 'Heroi',
        updateFicha: vi.fn((callback) => callback(mockState.minhaFicha)),
        ...overrides,
    };
    useStore.mockImplementation((selector) => (typeof selector === 'function' ? selector(mockState) : mockState));
    return mockState;
}

let probe;
function Harness() {
    probe = useFichaForm();
    return null;
}

afterEach(() => { cleanup(); });
beforeEach(() => { vi.clearAllMocks(); });

describe('FichaFormContext — toggleSerSelado(): ativar/desativar um Ser SEM efeito em vitais nunca drena ".atual"', () => {
    it('ativar um Ser cujos efeitos não tocam vitais mantém ".atual" fracionário intacto', () => {
        const ficha = {
            vida: { base: 100, atual: 79.5 },
            seresSelados: [{ id: 1, nome: 'Espírito Cosmético', ativo: false, efeitos: [{ atributo: 'carisma', propriedade: 'base', valor: 5 }] }],
        };
        montarStore({ minhaFicha: ficha });
        render(<FichaFormProvider><Harness /></FichaFormProvider>);

        act(() => { probe.toggleSerSelado(1); });

        expect(ficha.seresSelados[0].ativo).toBe(true);
        expect(ficha.vida.atual).toBe(79.5);
        expect(salvarFichaSilencioso).toHaveBeenCalledTimes(1);
    });

    it('desativar de volta também não altera ".atual" quando o Ser não afeta vitais', () => {
        const ficha = {
            vida: { base: 100, atual: 42 },
            seresSelados: [{ id: 1, nome: 'Espírito', ativo: true, efeitos: [] }],
        };
        montarStore({ minhaFicha: ficha });
        render(<FichaFormProvider><Harness /></FichaFormProvider>);

        act(() => { probe.toggleSerSelado(1); });

        expect(ficha.seresSelados[0].ativo).toBe(false);
        expect(ficha.vida.atual).toBe(42);
    });
});

describe('FichaFormContext — toggleSerSelado(): Ser com efeito em mFormas trava ".atual" (nunca reduz, só clampa se ultrapassar)', () => {
    it('ativar um Ser Selado com efeito mformas expande o máximo de vida, mas NÃO altera ".atual" (correção definitiva: sem rescale proporcional)', () => {
        const ficha = {
            vida: { base: 100, atual: 50, mFormas: 1.0 }, // 50% de 100
            seresSelados: [{ id: 1, nome: 'Bijuu', ativo: false, efeitos: [{ atributo: 'vida', propriedade: 'mformas', valor: 2 }] }],
        };
        montarStore({ minhaFicha: ficha });
        render(<FichaFormProvider><Harness /></FichaFormProvider>);

        const maxAntes = getMaximo(ficha, 'vida');
        act(() => { probe.toggleSerSelado(1); });
        const maxDepois = getMaximo(ficha, 'vida');

        expect(maxDepois).toBeGreaterThan(maxAntes);
        expect(ficha.vida.atual).toBe(50); // valor absoluto intocado, não "cresce" pra 100
    });

    it('desativar esse mesmo Ser depois NÃO reduz ".atual" — o ciclo completo ativar/desativar termina exatamente onde começou', () => {
        const ficha = {
            vida: { base: 100, atual: 50, mFormas: 1.0 },
            seresSelados: [{ id: 1, nome: 'Bijuu', ativo: false, efeitos: [{ atributo: 'vida', propriedade: 'mformas', valor: 2 }] }],
        };
        montarStore({ minhaFicha: ficha });
        render(<FichaFormProvider><Harness /></FichaFormProvider>);

        act(() => { probe.toggleSerSelado(1); }); // ativa -> máximo cresce, atual intocado (50)
        expect(ficha.vida.atual).toBe(50);

        act(() => { probe.toggleSerSelado(1); }); // desativa -> máximo volta ao original
        const maxInativo = getMaximo(ficha, 'vida');

        // 50 <= maxInativo (100) -> sem clamp nenhum, permanece exatamente 50 (o rescale
        // proporcional antigo reduziria pra 25).
        expect(ficha.vida.atual).toBeLessThanOrEqual(maxInativo);
        expect(ficha.vida.atual).toBe(50);
    });
});

describe('FichaFormContext — removeSerSelado(): exilar um Ser ATIVO/boostando um vital clampa ".atual" se ultrapassar o novo (menor) máximo, mas nunca reduz proporcionalmente', () => {
    beforeEach(() => {
        vi.spyOn(window, 'confirm').mockReturnValue(true);
    });

    it('exilar um Ser Selado ATIVO com efeito mformas=2 (dobrava o máximo) some com o boost, mas ".atual" só é clampado se de fato ultrapassar o novo teto', () => {
        const ficha = {
            vida: { base: 100, atual: 150, mFormas: 1.0 }, // 150 só é possível enquanto o Ser está ativo (máximo=200)
            seresSelados: [{ id: 1, nome: 'Bijuu', ativo: true, efeitos: [{ atributo: 'vida', propriedade: 'mformas', valor: 2 }] }],
        };
        montarStore({ minhaFicha: ficha });
        render(<FichaFormProvider><Harness /></FichaFormProvider>);

        expect(getMaximo(ficha, 'vida')).toBe(200);

        act(() => { probe.removeSerSelado(1); });

        expect(ficha.seresSelados.length).toBe(0);
        const maxDepois = getMaximo(ficha, 'vida');
        expect(maxDepois).toBe(100);
        // 150 ultrapassa o novo teto (100) -> clampado exatamente em 100 (rescale proporcional
        // antigo daria 150*(100/200)=75).
        expect(ficha.vida.atual).toBe(100);
        expect(window.confirm).toHaveBeenCalledTimes(1);
        expect(salvarFichaSilencioso).toHaveBeenCalledTimes(1);
    });

    it('exilar um Ser Selado ATIVO cujo ".atual" NÃO ultrapassa o novo máximo mais baixo não é alterado (nunca encolhe proporcionalmente)', () => {
        const ficha = {
            vida: { base: 100, atual: 60, mFormas: 1.0 }, // 60 <= 100 (novo máximo depois de remover o Ser)
            seresSelados: [{ id: 1, nome: 'Bijuu', ativo: true, efeitos: [{ atributo: 'vida', propriedade: 'mformas', valor: 2 }] }],
        };
        montarStore({ minhaFicha: ficha });
        render(<FichaFormProvider><Harness /></FichaFormProvider>);

        act(() => { probe.removeSerSelado(1); });

        expect(ficha.seresSelados.length).toBe(0);
        expect(getMaximo(ficha, 'vida')).toBe(100);
        // Rescale proporcional antigo daria 60*(100/200)=30 — comportamento atual: intocado.
        expect(ficha.vida.atual).toBe(60);
    });

    it('exilar um Ser Selado INATIVO (sem efeito no máximo atual) deixa ".atual" completamente intocado, mesmo que o Ser tenha efeitos em vitais', () => {
        const ficha = {
            vida: { base: 100, atual: 79.5, mFormas: 1.0 },
            seresSelados: [{ id: 1, nome: 'Bijuu Adormecido', ativo: false, efeitos: [{ atributo: 'vida', propriedade: 'mformas', valor: 2 }] }],
        };
        montarStore({ minhaFicha: ficha });
        render(<FichaFormProvider><Harness /></FichaFormProvider>);

        expect(getMaximo(ficha, 'vida')).toBe(100); // Ser inativo -> efeito não conta

        act(() => { probe.removeSerSelado(1); });

        expect(ficha.seresSelados.length).toBe(0);
        expect(getMaximo(ficha, 'vida')).toBe(100); // nada muda, o Ser já não boostava nada
        expect(ficha.vida.atual).toBe(79.5); // fracionário intocado, sem nenhum arredondamento
    });

    it('exilar um Ser Selado qualquer (sem efeito em vitais nenhum, ativo ou não) é um no-op total pros vitais, mesmo havendo outros Seres', () => {
        const ficha = {
            vida: { base: 100, atual: 33, mFormas: 1.0 },
            seresSelados: [
                { id: 1, nome: 'Espírito Cosmético', ativo: true, efeitos: [] },
                { id: 2, nome: 'Outro Ser', ativo: false, efeitos: [{ atributo: 'carisma', propriedade: 'base', valor: 5 }] },
            ],
        };
        montarStore({ minhaFicha: ficha });
        render(<FichaFormProvider><Harness /></FichaFormProvider>);

        act(() => { probe.removeSerSelado(1); });

        expect(ficha.seresSelados.length).toBe(1);
        expect(ficha.seresSelados[0].id).toBe(2);
        expect(ficha.vida.atual).toBe(33);
    });

    it('cancelar a confirmação (window.confirm=false) não exila o Ser nem toca nos vitais', () => {
        window.confirm.mockReturnValue(false);
        const ficha = {
            vida: { base: 100, atual: 150, mFormas: 1.0 },
            seresSelados: [{ id: 1, nome: 'Bijuu', ativo: true, efeitos: [{ atributo: 'vida', propriedade: 'mformas', valor: 2 }] }],
        };
        montarStore({ minhaFicha: ficha });
        render(<FichaFormProvider><Harness /></FichaFormProvider>);

        act(() => { probe.removeSerSelado(1); });

        expect(ficha.seresSelados.length).toBe(1);
        expect(ficha.vida.atual).toBe(150);
        expect(salvarFichaSilencioso).not.toHaveBeenCalled();
    });

    it('ficha sem seresSelados nenhum não lança (guarda explícita `if (!f.seresSelados) return;`)', () => {
        montarStore({ minhaFicha: { vida: { base: 100, atual: 50 } } });
        render(<FichaFormProvider><Harness /></FichaFormProvider>);

        expect(() => { act(() => { probe.removeSerSelado(1); }); }).not.toThrow();
    });
});

describe('FichaFormContext — toggleSerSelado(): robustez', () => {
    it('id inexistente é um no-op completo, sem lançar', () => {
        const ficha = { vida: { base: 100, atual: 50 }, seresSelados: [{ id: 1, nome: 'X', ativo: false, efeitos: [] }] };
        montarStore({ minhaFicha: ficha });
        render(<FichaFormProvider><Harness /></FichaFormProvider>);

        expect(() => { act(() => { probe.toggleSerSelado(999); }); }).not.toThrow();
        expect(ficha.vida.atual).toBe(50);
    });

    it('ficha sem seresSelados nenhum não lança (guarda explícita `if (!f.seresSelados) return;`)', () => {
        montarStore({ minhaFicha: { vida: { base: 100, atual: 50 } } });
        render(<FichaFormProvider><Harness /></FichaFormProvider>);

        expect(() => { act(() => { probe.toggleSerSelado(1); }); }).not.toThrow();
    });
});

describe('FichaFormContext — ativarFormaSer(serId, formaId): ativar/desativar uma Forma/Modo do Ser trava ".atual" (nunca reduz, só clampa se ultrapassar)', () => {
    it('ativar uma Forma/Modo do Ser com efeito em mFormas expande o máximo, mas NÃO altera ".atual" (correção definitiva: sem rescale proporcional)', () => {
        const ficha = {
            vida: { base: 100, atual: 50, mFormas: 1.0 },
            seresSelados: [{
                id: 1, nome: 'Bijuu', ativo: true, formaAtivaId: null, efeitos: [],
                formas: [{ id: 'modo1', nome: 'Modo Furioso', efeitos: [{ atributo: 'vida', propriedade: 'mformas', valor: 2 }] }],
            }],
        };
        montarStore({ minhaFicha: ficha });
        render(<FichaFormProvider><Harness /></FichaFormProvider>);

        const maxAntes = getMaximo(ficha, 'vida');
        act(() => { probe.ativarFormaSer(1, 'modo1'); });
        const maxDepois = getMaximo(ficha, 'vida');

        expect(ficha.seresSelados[0].formaAtivaId).toBe('modo1');
        expect(maxDepois).toBeGreaterThan(maxAntes);
        expect(ficha.vida.atual).toBe(50); // valor absoluto intocado
    });

    it('ativar a MESMA Forma de novo (toggle) desativa (formaAtivaId volta a null) e NÃO reduz ".atual" — ciclo completo termina onde começou', () => {
        const ficha = {
            vida: { base: 100, atual: 50, mFormas: 1.0 },
            seresSelados: [{
                id: 1, nome: 'Bijuu', ativo: true, formaAtivaId: null, efeitos: [],
                formas: [{ id: 'modo1', nome: 'Modo Furioso', efeitos: [{ atributo: 'vida', propriedade: 'mformas', valor: 2 }] }],
            }],
        };
        montarStore({ minhaFicha: ficha });
        render(<FichaFormProvider><Harness /></FichaFormProvider>);

        act(() => { probe.ativarFormaSer(1, 'modo1'); }); // ativa
        expect(ficha.vida.atual).toBe(50);

        act(() => { probe.ativarFormaSer(1, 'modo1'); }); // desativa (toggle)
        const maxInativo = getMaximo(ficha, 'vida');

        expect(ficha.seresSelados[0].formaAtivaId).toBeNull();
        // 50 <= maxInativo (100) -> sem clamp nenhum, permanece exatamente 50 (o rescale
        // proporcional antigo reduziria pra 25).
        expect(ficha.vida.atual).toBeLessThanOrEqual(maxInativo);
        expect(ficha.vida.atual).toBe(50);
    });

    it('ativar uma Forma num Ser ainda INATIVO (ativo=false) também ativa o Ser junto (s.ativo=true) e rescala considerando os dois efeitos combinados', () => {
        const ficha = {
            vida: { base: 100, atual: 100, mFormas: 1.0 },
            seresSelados: [{
                id: 1, nome: 'Bijuu', ativo: false, formaAtivaId: null, efeitos: [],
                formas: [{ id: 'modo1', nome: 'Modo Furioso', efeitos: [{ atributo: 'vida', propriedade: 'mformas', valor: 2 }] }],
            }],
        };
        montarStore({ minhaFicha: ficha });
        render(<FichaFormProvider><Harness /></FichaFormProvider>);

        act(() => { probe.ativarFormaSer(1, 'modo1'); });

        expect(ficha.seresSelados[0].ativo).toBe(true);
        expect(ficha.seresSelados[0].formaAtivaId).toBe('modo1');
        // Máximo agora reflete o efeito da Forma (que só se aplica com o Ser ativo).
        expect(getMaximo(ficha, 'vida')).toBeGreaterThan(100);
        expect(ficha.vida.atual).toBeLessThanOrEqual(getMaximo(ficha, 'vida'));
    });

    it('id de Ser inexistente é um no-op completo, sem lançar', () => {
        const ficha = { vida: { base: 100, atual: 50 }, seresSelados: [] };
        montarStore({ minhaFicha: ficha });
        render(<FichaFormProvider><Harness /></FichaFormProvider>);

        expect(() => { act(() => { probe.ativarFormaSer(999, 'modoX'); }); }).not.toThrow();
        expect(ficha.vida.atual).toBe(50);
    });
});
