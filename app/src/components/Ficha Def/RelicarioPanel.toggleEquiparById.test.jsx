import React from 'react';
import { render, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RelicarioProvider, useRelicario } from './RelicarioPanel';
import useStore from '../../stores/useStore';
import { salvarFichaSilencioso } from '../../services/firebase-sync';
import { getMaximo } from '../../core/attributes';

// ---------------------------------------------------------------------------
// QA — RelicarioPanel.jsx > toggleEquiparById(id): mesmo bugfix de rescala
// proporcional de vitais aplicado em ArsenalFormContext.toggleEquiparItem, só que
// pra este SEGUNDO toggle-de-equip separado (painel "Relicário", mesmo array
// ficha.inventario, mas SEM o efeito colateral de auto-desequipar item do mesmo
// tipo que ArsenalFormContext tem) — ver core/vitals.rescalarVitais.test.js pra
// matemática detalhada de capturarMaximosAtuais/rescalarVitaisProporcional.
//
// Mesmo padrão de harness (Provider real + componente-probe) de
// ArsenalFormContext.toggleEquiparItem.test.jsx.
//
// NOTA: RelicarioProvider tem um useEffect que auto-inicializa
// ficha.armaEspiritual quando ausente, chamando updateFicha + callSave (salvarFichaSilencioso)
// no mount — os testes abaixo já fornecem minhaFicha.armaEspiritual pra evitar esse efeito
// colateral disparar salvarFichaSilencioso() antes da ação sendo testada.
// ---------------------------------------------------------------------------

vi.mock('../../stores/useStore');
vi.mock('../../services/firebase-sync', () => ({
    salvarFichaSilencioso: vi.fn(),
    uploadImagem: vi.fn(() => Promise.resolve('https://exemplo.com/img.png')),
}));

let mockState;
function montarStore(overrides = {}) {
    mockState = {
        minhaFicha: { inventario: [], armaEspiritual: { nome: '', passivas: [], runas: [], formas: [], formasVerdadeiras: [] } },
        meuNome: 'Heroi',
        isMestre: true,
        updateFicha: vi.fn((callback) => callback(mockState.minhaFicha)),
        ...overrides,
    };
    useStore.mockImplementation((selector) => (typeof selector === 'function' ? selector(mockState) : mockState));
    return mockState;
}

let probe;
function Harness() {
    probe = useRelicario();
    return null;
}

afterEach(() => { cleanup(); });
beforeEach(() => { vi.clearAllMocks(); });

describe('RelicarioPanel — toggleEquiparById(): equipar/desequipar SEM efeito em vitais nunca drena ".atual"', () => {
    it('equipar um item cujos efeitos não tocam vitais mantém ".atual" fracionário intacto (regressão do bug de Math.floor)', () => {
        const ficha = {
            armaEspiritual: { nome: '', passivas: [], runas: [], formas: [], formasVerdadeiras: [] },
            vida: { base: 100, atual: 79.5 },
            inventario: [{ id: 1, nome: 'Relíquia Cosmética', tipo: 'acessorio', equipado: false, efeitos: [{ atributo: 'carisma', propriedade: 'base', valor: 5 }] }],
        };
        montarStore({ minhaFicha: ficha });
        render(<RelicarioProvider><Harness /></RelicarioProvider>);

        act(() => { probe.toggleEquiparById(1); });

        expect(ficha.inventario[0].equipado).toBe(true);
        expect(ficha.vida.atual).toBe(79.5);
    });

    it('desequipar de volta também não altera ".atual" quando o item não afeta vitais', () => {
        const ficha = {
            armaEspiritual: { nome: '', passivas: [], runas: [], formas: [], formasVerdadeiras: [] },
            vida: { base: 100, atual: 42 },
            inventario: [{ id: 1, nome: 'Relíquia', tipo: 'acessorio', equipado: true, efeitos: [] }],
        };
        montarStore({ minhaFicha: ficha });
        render(<RelicarioProvider><Harness /></RelicarioProvider>);

        act(() => { probe.toggleEquiparById(1); });

        expect(ficha.inventario[0].equipado).toBe(false);
        expect(ficha.vida.atual).toBe(42);
    });
});

describe('RelicarioPanel — toggleEquiparById(): item com efeito mformas trava ".atual" (nunca reduz, só clampa se ultrapassar)', () => {
    it('equipar uma relíquia com efeito mformas=2 dobra o máximo de vida, mas NÃO altera ".atual" (correção definitiva: sem rescale proporcional)', () => {
        const ficha = {
            armaEspiritual: { nome: '', passivas: [], runas: [], formas: [], formasVerdadeiras: [] },
            vida: { base: 100, atual: 50, mFormas: 1.0 },
            inventario: [{ id: 1, nome: 'Relíquia Ancestral', tipo: 'acessorio', equipado: false, efeitos: [{ atributo: 'vida', propriedade: 'mformas', valor: 2 }] }],
        };
        montarStore({ minhaFicha: ficha });
        render(<RelicarioProvider><Harness /></RelicarioProvider>);

        const maxAntes = getMaximo(ficha, 'vida');
        act(() => { probe.toggleEquiparById(1); });
        const maxDepois = getMaximo(ficha, 'vida');

        expect(maxDepois).toBeGreaterThan(maxAntes);
        expect(ficha.vida.atual).toBe(50); // valor absoluto intocado, não "dobra" pra 100
    });

    it('desequipar essa mesma relíquia depois NÃO reduz ".atual" — o ciclo completo equipar/desequipar termina exatamente onde começou', () => {
        const ficha = {
            armaEspiritual: { nome: '', passivas: [], runas: [], formas: [], formasVerdadeiras: [] },
            vida: { base: 100, atual: 50, mFormas: 1.0 },
            inventario: [{ id: 1, nome: 'Relíquia Ancestral', tipo: 'acessorio', equipado: false, efeitos: [{ atributo: 'vida', propriedade: 'mformas', valor: 2 }] }],
        };
        montarStore({ minhaFicha: ficha });
        render(<RelicarioProvider><Harness /></RelicarioProvider>);

        act(() => { probe.toggleEquiparById(1); }); // equipa -> máximo dobra, atual intocado (50)
        expect(ficha.vida.atual).toBe(50);

        act(() => { probe.toggleEquiparById(1); }); // desequipa -> máximo volta ao original
        const maxDesequipado = getMaximo(ficha, 'vida');

        // 50 <= maxDesequipado (100) -> sem clamp nenhum, permanece exatamente 50 (o rescale
        // proporcional antigo reduziria pra 25).
        expect(ficha.vida.atual).toBeLessThanOrEqual(maxDesequipado);
        expect(ficha.vida.atual).toBe(50);
    });
});

describe('RelicarioPanel — toggleEquiparById(): NÃO auto-desequipa itens do mesmo tipo (diferente de ArsenalFormContext.toggleEquiparItem)', () => {
    it('equipar uma segunda arma NÃO desequipa a primeira automaticamente (comportamento próprio deste toggle simplificado)', () => {
        const ficha = {
            armaEspiritual: { nome: '', passivas: [], runas: [], formas: [], formasVerdadeiras: [] },
            vida: { base: 100, atual: 100 },
            inventario: [
                { id: 1, nome: 'Espada A', tipo: 'arma', equipado: true, efeitos: [] },
                { id: 2, nome: 'Espada B', tipo: 'arma', equipado: false, efeitos: [] },
            ],
        };
        montarStore({ minhaFicha: ficha });
        render(<RelicarioProvider><Harness /></RelicarioProvider>);

        act(() => { probe.toggleEquiparById(2); });

        expect(ficha.inventario[0].equipado).toBe(true); // Espada A continua equipada
        expect(ficha.inventario[1].equipado).toBe(true); // Espada B agora também equipada
    });
});

describe('RelicarioPanel — removeItemById(): destruir um item EQUIPADO/boostando um vital clampa ".atual" se ultrapassar o novo (menor) máximo, mas nunca reduz proporcionalmente', () => {
    beforeEach(() => {
        vi.spyOn(window, 'confirm').mockReturnValue(true);
    });

    it('destruir uma relíquia EQUIPADA com efeito mformas=2 (dobrava o máximo) some com o boost, mas ".atual" só é clampado se de fato ultrapassar o novo teto', () => {
        const ficha = {
            armaEspiritual: { nome: '', passivas: [], runas: [], formas: [], formasVerdadeiras: [] },
            vida: { base: 100, atual: 150, mFormas: 1.0 },
            inventario: [{ id: 1, nome: 'Relíquia Ancestral', tipo: 'acessorio', equipado: true, efeitos: [{ atributo: 'vida', propriedade: 'mformas', valor: 2 }] }],
        };
        montarStore({ minhaFicha: ficha });
        render(<RelicarioProvider><Harness /></RelicarioProvider>);

        expect(getMaximo(ficha, 'vida')).toBe(200);

        act(() => { probe.removeItemById(1); });

        expect(ficha.inventario.length).toBe(0);
        const maxDepois = getMaximo(ficha, 'vida');
        expect(maxDepois).toBe(100);
        // 150 ultrapassa o novo teto (100) -> clampado exatamente em 100 (rescale proporcional
        // antigo daria 150*(100/200)=75).
        expect(ficha.vida.atual).toBe(100);
    });

    it('destruir uma relíquia EQUIPADA cujo ".atual" NÃO ultrapassa o novo máximo mais baixo não é alterado', () => {
        const ficha = {
            armaEspiritual: { nome: '', passivas: [], runas: [], formas: [], formasVerdadeiras: [] },
            vida: { base: 100, atual: 60, mFormas: 1.0 },
            inventario: [{ id: 1, nome: 'Relíquia Ancestral', tipo: 'acessorio', equipado: true, efeitos: [{ atributo: 'vida', propriedade: 'mformas', valor: 2 }] }],
        };
        montarStore({ minhaFicha: ficha });
        render(<RelicarioProvider><Harness /></RelicarioProvider>);

        act(() => { probe.removeItemById(1); });

        expect(ficha.inventario.length).toBe(0);
        expect(getMaximo(ficha, 'vida')).toBe(100);
        expect(ficha.vida.atual).toBe(60); // rescale proporcional antigo daria 30
    });

    it('destruir um item NÃO equipado (sem efeito no máximo atual) deixa ".atual" completamente intocado', () => {
        const ficha = {
            armaEspiritual: { nome: '', passivas: [], runas: [], formas: [], formasVerdadeiras: [] },
            vida: { base: 100, atual: 79.5, mFormas: 1.0 },
            inventario: [{ id: 1, nome: 'Relíquia Guardada', tipo: 'acessorio', equipado: false, efeitos: [{ atributo: 'vida', propriedade: 'mformas', valor: 2 }] }],
        };
        montarStore({ minhaFicha: ficha });
        render(<RelicarioProvider><Harness /></RelicarioProvider>);

        expect(getMaximo(ficha, 'vida')).toBe(100); // item desequipado -> efeito não conta

        act(() => { probe.removeItemById(1); });

        expect(ficha.inventario.length).toBe(0);
        expect(ficha.vida.atual).toBe(79.5); // fracionário intocado
    });

    it('destruir um item qualquer sem efeito em vitais é um no-op total pros vitais, mesmo havendo outros itens no inventário', () => {
        const ficha = {
            armaEspiritual: { nome: '', passivas: [], runas: [], formas: [], formasVerdadeiras: [] },
            vida: { base: 100, atual: 33, mFormas: 1.0 },
            inventario: [
                { id: 1, nome: 'Anel Cosmético', tipo: 'acessorio', equipado: true, efeitos: [] },
                { id: 2, nome: 'Outra Relíquia', tipo: 'acessorio', equipado: false, efeitos: [] },
            ],
        };
        montarStore({ minhaFicha: ficha });
        render(<RelicarioProvider><Harness /></RelicarioProvider>);

        act(() => { probe.removeItemById(1); });

        expect(ficha.inventario.length).toBe(1);
        expect(ficha.inventario[0].id).toBe(2);
        expect(ficha.vida.atual).toBe(33);
    });

    it('cancelar a confirmação (window.confirm=false) não deleta o item nem toca nos vitais', () => {
        window.confirm.mockReturnValue(false);
        const ficha = {
            armaEspiritual: { nome: '', passivas: [], runas: [], formas: [], formasVerdadeiras: [] },
            vida: { base: 100, atual: 150, mFormas: 1.0 },
            inventario: [{ id: 1, nome: 'Relíquia Ancestral', tipo: 'acessorio', equipado: true, efeitos: [{ atributo: 'vida', propriedade: 'mformas', valor: 2 }] }],
        };
        montarStore({ minhaFicha: ficha });
        render(<RelicarioProvider><Harness /></RelicarioProvider>);

        act(() => { probe.removeItemById(1); });

        expect(ficha.inventario.length).toBe(1);
        expect(ficha.vida.atual).toBe(150);
    });
});

describe('RelicarioPanel — toggleEquiparById(): robustez', () => {
    it('id inexistente é um no-op completo, sem lançar', () => {
        const ficha = {
            armaEspiritual: { nome: '', passivas: [], runas: [], formas: [], formasVerdadeiras: [] },
            vida: { base: 100, atual: 50 },
            inventario: [{ id: 1, nome: 'X', tipo: 'arma', equipado: false, efeitos: [] }],
        };
        montarStore({ minhaFicha: ficha });
        render(<RelicarioProvider><Harness /></RelicarioProvider>);

        expect(() => { act(() => { probe.toggleEquiparById(999); }); }).not.toThrow();
        expect(ficha.vida.atual).toBe(50);
        expect(ficha.inventario[0].equipado).toBe(false);
    });

    it('inventario VAZIO (id não encontrado) é um no-op completo, sem lançar (fichaPadrao sempre inicializa inventario=[])', () => {
        montarStore({ minhaFicha: { armaEspiritual: { nome: '', passivas: [], runas: [], formas: [], formasVerdadeiras: [] }, inventario: [] } });
        render(<RelicarioProvider><Harness /></RelicarioProvider>);

        expect(() => { act(() => { probe.toggleEquiparById(1); }); }).not.toThrow();
    });

    // 🔥 BUG PRÉ-EXISTENTE DOCUMENTADO (não introduzido por esta sessão — a linha
    // `f.inventario.find(...)` já não tinha guarda antes do bugfix de rescala de vitais, ver
    // git diff): sem NENHUM `ficha.inventario` (nem []), toggleEquiparById lança TypeError. Na
    // prática impossível de acontecer (fichaPadrao em useStore.js sempre inicializa inventario=[]),
    // mas documentado aqui como um gap de blindagem — diferente de ArsenalFormContext.toggleEquiparItem,
    // que TEM a guarda `if (!ficha.inventario) return;`.
    it('DOCUMENTADO: sem ficha.inventario nenhum (nem array vazio), lança TypeError — diferente de ArsenalFormContext.toggleEquiparItem, que é blindado contra este caso', () => {
        montarStore({ minhaFicha: { armaEspiritual: { nome: '', passivas: [], runas: [], formas: [], formasVerdadeiras: [] } } });
        render(<RelicarioProvider><Harness /></RelicarioProvider>);

        expect(() => { act(() => { probe.toggleEquiparById(1); }); }).toThrow();
    });

    it('chama salvarFichaSilencioso (via callSave) exatamente uma vez por toggle', () => {
        const ficha = {
            armaEspiritual: { nome: '', passivas: [], runas: [], formas: [], formasVerdadeiras: [] },
            vida: { base: 100, atual: 50 },
            inventario: [{ id: 1, nome: 'X', tipo: 'arma', equipado: false, efeitos: [] }],
        };
        montarStore({ minhaFicha: ficha });
        render(<RelicarioProvider><Harness /></RelicarioProvider>);
        vi.clearAllMocks(); // descarta qualquer chamada do useEffect de inicialização no mount

        act(() => { probe.toggleEquiparById(1); });

        expect(salvarFichaSilencioso).toHaveBeenCalledTimes(1);
    });
});
