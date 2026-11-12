import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import MarcadosPanel from './Marcados';
import useStore from '../../stores/useStore';
import { calcularPoderAtual } from '../../core/poder';
import { salvarFirebaseImediato } from '../../services/firebase-sync';

vi.mock('../../stores/useStore');
vi.mock('../../services/firebase-sync', () => ({
    uploadImagem: vi.fn(),
    salvarFichaSilencioso: vi.fn(),
    salvarFirebaseImediato: vi.fn(() => Promise.resolve()),
    salvarDivisorPoderMesa: vi.fn(),
}));

// QA - Marcados: linha "Ganhos do combate" (ficha.ganhosCombate), Zerar atomico e Scouter sem contar o fator duas vezes.
function ficha(overrides = {}) {
    return {
        vida: { base: 600 }, mana: { base: 0 }, aura: { base: 0 }, chakra: { base: 0 }, corpo: { base: 0 }, forca: { base: 0 },
        destreza: { base: 0 }, inteligencia: { base: 0 }, sabedoria: { base: 0 }, energiaEsp: { base: 0 }, carisma: { base: 0 },
        stamina: { base: 0 }, constituicao: { base: 0 }, bio: {}, estetica: {}, labels: {}, poderes: [], inventario: [], seresSelados: [],
        ...overrides,
    };
}
function montar(f, extra = {}) {
    const estado = {
        minhaFicha: f, updateFicha: vi.fn((cb) => cb(f)), meuNome: 'Testador', importarDaAbaStatus: vi.fn(),
        isMestre: false, divisorPoderMesa: 1, setDivisorPoderMesa: vi.fn(), ...extra,
    };
    useStore.mockImplementation((sel) => (sel ? sel(estado) : estado));
    return estado;
}
const linha = () => screen.queryByTestId('ganho-combate-poder');
const campoAdit = () => screen.getByLabelText('Ganhos do combate de Poder (Mestre)');
const campoFator = () => screen.getByLabelText('Fator composto de combate (Mestre)');
const zerarCombate = () => screen.getAllByText('Zerar')[1];
const salvouDebounced = (vezes) => { act(() => { vi.advanceTimersByTime(600); }); expect(salvarFirebaseImediato).toHaveBeenCalledTimes(vezes); };

describe('Marcados: linha Ganhos do combate (visibilidade)', () => {
    beforeEach(() => { vi.useFakeTimers(); vi.clearAllMocks(); window.confirm = vi.fn(() => true); window.alert = vi.fn(); });
    afterEach(() => { cleanup(); vi.useRealTimers(); });

    it.each([
        ['sem campo', undefined],
        ['neutro 0/1', { poderCalculado: 0, fatorPoder: 1 }],
        ['NaN/string', { poderCalculado: NaN, fatorPoder: 'abc' }],
        ['negativo', { poderCalculado: -4, fatorPoder: -2 }],
        ['Infinity', { poderCalculado: Infinity, fatorPoder: Infinity }],
        ['objeto vazio', {}],
        ['nulo', null],
    ])('jogador com ganhosCombate %s: linha oculta', (_n, v) => {
        montar(ficha(v === undefined ? {} : { ganhosCombate: v }));
        render(<MarcadosPanel />);
        expect(linha()).toBeNull();
    });
    it('jogador com aditivo > 0: linha visivel, mostra valor e %, sem inputs nem Zerar de combate', () => {
        montar(ficha({ ganhosCombate: { poderCalculado: 0.02, fatorPoder: 1 } }));
        render(<MarcadosPanel />);
        expect(linha()).not.toBeNull();
        expect(linha().textContent).toContain('Ganhos do combate');
        expect(linha().textContent).toContain('+0,02');
        expect(linha().textContent).toContain('+2%');
        expect(screen.queryByLabelText('Ganhos do combate de Poder (Mestre)')).toBeNull();
        expect(screen.queryByLabelText('Fator composto de combate (Mestre)')).toBeNull();
        expect(screen.queryByText('Zerar')).toBeNull();
    });
    it('jogador so com fator (2,69): linha visivel com o fator, sem percentual aditivo', () => {
        montar(ficha({ ganhosCombate: { fatorPoder: 2.69 } }));
        render(<MarcadosPanel />);
        expect(linha()).not.toBeNull();
        expect(linha().textContent).toContain('×2,69');
        expect(linha().textContent).not.toMatch(/\(\+\d/);
    });
    it('string numerica vinda do Firebase e lida', () => {
        montar(ficha({ ganhosCombate: { poderCalculado: '0.5', fatorPoder: '3' } }));
        render(<MarcadosPanel />);
        expect(linha().textContent).toContain('+0,5');
        expect(linha().textContent).toContain('×3');
    });
    it('aparece independente do permanente (os dois coexistem, cada um na sua linha)', () => {
        montar(ficha({ ganhosPermanentes: { poderCalculado: 1 }, ganhosCombate: { poderCalculado: 2 } }));
        render(<MarcadosPanel />);
        expect(screen.getByTestId('ganho-permanente-poder').textContent).toContain('+1');
        expect(linha().textContent).toContain('+2');
        expect(linha().textContent).not.toContain('permanente');
    });
    it('Mestre ve a linha mesmo sem ganho, com os dois inputs (0 e 1) e dois botoes Zerar (permanente primeiro)', () => {
        montar(ficha(), { isMestre: true });
        render(<MarcadosPanel />);
        expect(linha()).not.toBeNull();
        expect(campoAdit().value).toBe('0');
        expect(campoFator().value).toBe('1');
        expect(screen.getAllByText('Zerar')).toHaveLength(2);
        expect(screen.getAllByText('Zerar')[1].closest('[data-testid="ganho-combate-poder"]')).toBe(linha());
        expect(screen.getAllByText('Zerar')[0].closest('[data-testid="ganho-permanente-poder"]')).not.toBeNull();
    });
    it('Mestre via ficha.isMestre tambem ve', () => {
        montar(ficha({ isMestre: true }));
        render(<MarcadosPanel />);
        expect(linha()).not.toBeNull();
    });
});

describe('Marcados: Mestre edita ganhos de combate', () => {
    beforeEach(() => { vi.useFakeTimers(); vi.clearAllMocks(); window.confirm = vi.fn(() => true); window.alert = vi.fn(); });
    afterEach(() => { cleanup(); vi.useRealTimers(); });

    it('aditivo grava so no blur (nao no change) em ganhosCombate.poderCalculado', () => {
        const est = montar(ficha({ ganhosCombate: { poderCalculado: 2, fatorPoder: 1 } }), { isMestre: true });
        render(<MarcadosPanel />);
        fireEvent.change(campoAdit(), { target: { value: '7' } });
        expect(est.minhaFicha.ganhosCombate.poderCalculado).toBe(2);
        fireEvent.blur(campoAdit());
        expect(est.minhaFicha.ganhosCombate.poderCalculado).toBe(7);
        expect(est.minhaFicha.ganhosPermanentes).toBeUndefined(); // nao vaza para o permanente
    });
    it('Enter dispara blur e grava (aditivo e fator)', () => {
        const est = montar(ficha({ ganhosCombate: { poderCalculado: 2, fatorPoder: 1 } }), { isMestre: true });
        render(<MarcadosPanel />);
        campoAdit().focus();
        fireEvent.change(campoAdit(), { target: { value: '5.5' } });
        fireEvent.keyDown(campoAdit(), { key: 'Enter' });
        expect(est.minhaFicha.ganhosCombate.poderCalculado).toBe(5.5);
        campoFator().focus();
        fireEvent.change(campoFator(), { target: { value: '2.5' } });
        fireEvent.keyDown(campoFator(), { key: 'Enter' });
        expect(est.minhaFicha.ganhosCombate.fatorPoder).toBe(2.5);
    });
    it('aditivo invalido (vazio, negativo, texto) vira 0; valor igual ao atual nao grava', () => {
        for (const v of ['', '-3', 'abc']) {
            cleanup();
            const est = montar(ficha({ ganhosCombate: { poderCalculado: 4, fatorPoder: 1 } }), { isMestre: true });
            render(<MarcadosPanel />);
            fireEvent.change(campoAdit(), { target: { value: v } });
            fireEvent.blur(campoAdit());
            expect(est.minhaFicha.ganhosCombate.poderCalculado).toBe(0);
        }
        cleanup();
        const est = montar(ficha({ ganhosCombate: { poderCalculado: 4, fatorPoder: 1 } }), { isMestre: true });
        render(<MarcadosPanel />);
        fireEvent.blur(campoAdit());
        expect(est.updateFicha).not.toHaveBeenCalled();
    });
    it('aditivo acima de 1e9 e preso', () => {
        const est = montar(ficha({ ganhosCombate: { poderCalculado: 1, fatorPoder: 1 } }), { isMestre: true });
        render(<MarcadosPanel />);
        fireEvent.change(campoAdit(), { target: { value: '99999999999' } });
        fireEvent.blur(campoAdit());
        expect(est.minhaFicha.ganhosCombate.poderCalculado).toBe(1e9);
    });
    it('fator: preso entre FATOR_PODER_MIN (1e-6) e MAX (1e12); invalido vira 1', () => {
        const casos = [['1e20', 1e12], ['0.0000000001', 1e-6], ['abc', 1], ['-2', 1], ['', 1]];
        for (const [entrada, esperado] of casos) {
            cleanup();
            const est = montar(ficha({ ganhosCombate: { poderCalculado: 0, fatorPoder: 3 } }), { isMestre: true });
            render(<MarcadosPanel />);
            fireEvent.change(campoFator(), { target: { value: entrada } });
            fireEvent.blur(campoFator());
            expect(est.minhaFicha.ganhosCombate.fatorPoder).toBe(esperado);
        }
    });
    it('fator sem ganhosCombate previo cria o objeto', () => {
        const est = montar(ficha(), { isMestre: true });
        render(<MarcadosPanel />);
        fireEvent.change(campoFator(), { target: { value: '2' } });
        fireEvent.blur(campoFator());
        expect(est.minhaFicha.ganhosCombate.fatorPoder).toBe(2);
    });
    it('Zerar (combate): UMA updateFicha, aditivo 0 e fator 1, permanente intocado, e chama callSave (debounced)', () => {
        const est = montar(ficha({ ganhosPermanentes: { poderCalculado: 9, fatorPoder: 1.5 }, ganhosCombate: { poderCalculado: 3, fatorPoder: 2.69 } }), { isMestre: true });
        render(<MarcadosPanel />);
        fireEvent.click(zerarCombate());
        expect(est.updateFicha).toHaveBeenCalledTimes(1);
        expect(est.minhaFicha.ganhosCombate).toEqual({ poderCalculado: 0, fatorPoder: 1 });
        expect(est.minhaFicha.ganhosPermanentes).toEqual({ poderCalculado: 9, fatorPoder: 1.5 });
        salvouDebounced(1);
    });
    it('Zerar do PERMANENTE (primeiro botao) nao mexe nos ganhos de combate', () => {
        const est = montar(ficha({ ganhosPermanentes: { poderCalculado: 9, fatorPoder: 1.5 }, ganhosCombate: { poderCalculado: 3, fatorPoder: 2.69 } }), { isMestre: true });
        render(<MarcadosPanel />);
        fireEvent.click(screen.getAllByText('Zerar')[0]);
        expect(est.minhaFicha.ganhosPermanentes.poderCalculado).toBe(0);
        expect(est.minhaFicha.ganhosCombate).toEqual({ poderCalculado: 3, fatorPoder: 2.69 });
    });
    it('Zerar sem objeto ou com ganhosCombate corrompido cria {0, 1}', () => {
        for (const v of [undefined, 'abc', null, 5, { poderCalculado: 'x', fatorPoder: NaN }]) {
            cleanup(); vi.clearAllMocks();
            const est = montar(ficha(v === undefined ? {} : { ganhosCombate: v }), { isMestre: true });
            render(<MarcadosPanel />);
            expect(() => fireEvent.click(zerarCombate())).not.toThrow();
            expect(est.minhaFicha.ganhosCombate).toEqual({ poderCalculado: 0, fatorPoder: 1 });
            salvouDebounced(1);
        }
    });
    it('jogador (nao Mestre) nao edita: sem Zerar e sem inputs, mesmo com ganhos', () => {
        const est = montar(ficha({ ganhosCombate: { poderCalculado: 3, fatorPoder: 2 } }));
        render(<MarcadosPanel />);
        expect(screen.queryByText('Zerar')).toBeNull();
        expect(screen.queryByLabelText('Ganhos do combate de Poder (Mestre)')).toBeNull();
        expect(est.updateFicha).not.toHaveBeenCalled();
    });
});

describe('Marcados: Scouter usa o fator de combate uma unica vez (paridade com calcularPoderAtual)', () => {
    beforeEach(() => { vi.clearAllMocks(); });
    afterEach(cleanup);
    const base = () => ficha({
        vida: { base: 100000000 }, mana: { base: 1000000000 }, aura: { base: 1000000000 }, chakra: { base: 1000000000 }, corpo: { base: 1000000000 },
        forca: { base: 1000000 }, destreza: { base: 1000000 }, inteligencia: { base: 1000000 }, sabedoria: { base: 1000000 },
        energiaEsp: { base: 1000000 }, carisma: { base: 1000000 }, stamina: { base: 1000000 }, constituicao: { base: 1000000 },
        divisores: {}, ataquesElementais: [],
    });
    const scouter = (f) => {
        montar(f);
        render(<MarcadosPanel />);
        const span = screen.getByText((_, el) => el?.tagName === 'SPAN' && /^-?\d+(\.\d+)?E-?\d+$/.test(el.textContent || ''));
        const txt = span.textContent;
        cleanup();
        return txt;
    };
    const comoScouter = (n) => Number(n).toExponential(2).replace('+', '').toUpperCase();
    it.each([
        ['sem ganhos', {}],
        ['aditivo combate 2', { ganhosCombate: { poderCalculado: 2 } }],
        ['fator combate 2', { ganhosCombate: { fatorPoder: 2 } }],
        ['fator combate 1,02^50 (50 acertos)', { ganhosCombate: { fatorPoder: 1.02 ** 50 } }],
        ['combate + permanente (aditivo e fator)', { ganhosCombate: { poderCalculado: 1, fatorPoder: 2.69 }, ganhosPermanentes: { poderCalculado: 2, fatorPoder: 1.5 } }],
        ['combate corrompido', { ganhosCombate: { poderCalculado: 'abc', fatorPoder: NaN } }],
    ])('%s: Scouter == calcularPoderAtual.poderGlobal', (_n, extra) => {
        const f = { ...base(), ...extra };
        expect(scouter(f)).toBe(comoScouter(calcularPoderAtual(f, 1).poderGlobal));
    });
    it('o fator de combate nao e contado duas vezes: razao com/sem = fator no motor', () => {
        const sem = calcularPoderAtual(base(), 1).poderExato;
        const com = calcularPoderAtual({ ...base(), ganhosCombate: { fatorPoder: 2.69 } }, 1).poderExato;
        expect(com / sem).toBeCloseTo(2.69, 6);
        const ambos = calcularPoderAtual({ ...base(), ganhosPermanentes: { fatorPoder: 1.5 }, ganhosCombate: { fatorPoder: 2.69 } }, 1).poderExato;
        expect(ambos / sem).toBeCloseTo(1.5 * 2.69, 6);
    });
    it('ganho de combate muda o Scouter em relacao ao sem ganho e zerar volta ao valor original', () => {
        const a = scouter(base());
        const b = scouter({ ...base(), ganhosCombate: { fatorPoder: 1000 } });
        expect(b).not.toBe(a);
        expect(scouter({ ...base(), ganhosCombate: { poderCalculado: 0, fatorPoder: 1 } })).toBe(a);
    });
});
