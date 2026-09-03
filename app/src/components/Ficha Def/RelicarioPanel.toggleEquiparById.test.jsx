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

describe('RelicarioPanel — toggleEquiparById(): item com efeito mformas rescala ".atual" proporcionalmente', () => {
    it('equipar uma relíquia com efeito mformas=2 dobra o máximo de vida, e dobra ".atual" preservando a fração (50%)', () => {
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
        expect(ficha.vida.atual / maxDepois).toBeCloseTo(0.5, 6);
    });

    it('desequipar essa mesma relíquia depois encolhe ".atual" de volta proporcionalmente, sem deixar acima do novo máximo', () => {
        const ficha = {
            armaEspiritual: { nome: '', passivas: [], runas: [], formas: [], formasVerdadeiras: [] },
            vida: { base: 100, atual: 50, mFormas: 1.0 },
            inventario: [{ id: 1, nome: 'Relíquia Ancestral', tipo: 'acessorio', equipado: false, efeitos: [{ atributo: 'vida', propriedade: 'mformas', valor: 2 }] }],
        };
        montarStore({ minhaFicha: ficha });
        render(<RelicarioProvider><Harness /></RelicarioProvider>);

        act(() => { probe.toggleEquiparById(1); }); // equipa -> máximo dobra, atual dobra
        const maxEquipado = getMaximo(ficha, 'vida');
        const atualEquipado = ficha.vida.atual;

        act(() => { probe.toggleEquiparById(1); }); // desequipa -> máximo volta ao original
        const maxDesequipado = getMaximo(ficha, 'vida');

        expect(ficha.vida.atual).toBeLessThanOrEqual(maxDesequipado);
        expect(ficha.vida.atual / maxDesequipado).toBeCloseTo(atualEquipado / maxEquipado, 6);
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
