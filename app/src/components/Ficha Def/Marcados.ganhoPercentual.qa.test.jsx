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
// callSave do Marcados e debounced (400ms) e chama salvarFirebaseImediato.
const salvouDebounced = (vezes) => { act(() => { vi.advanceTimersByTime(600); }); expect(salvarFirebaseImediato).toHaveBeenCalledTimes(vezes); };
const campoAdit = () => screen.getByLabelText('Ganhos permanentes de Poder (Mestre)');
const campoFator = () => screen.getByLabelText('Fator composto de Poder (Mestre)');
const linha = () => screen.queryByTestId('ganho-permanente-poder');
const fatorSpan = () => Array.from(linha().querySelectorAll('span')).find(s => /^×/.test(s.textContent));

describe('Marcados: linha Ganhos permanentes (formato)', () => {
    beforeEach(() => { vi.clearAllMocks(); window.confirm = vi.fn(() => true); window.alert = vi.fn(); });
    afterEach(cleanup);

    it('aditivo 1 mostra "+1 (+100%)"', () => {
        montar(ficha({ ganhosPermanentes: { poderCalculado: 1 } }));
        render(<MarcadosPanel />);
        expect(linha().textContent).toContain('+1 (+100%)');
    });
    it('aditivo 0,02 mostra "+0,02 (+2%)" em pt-BR', () => {
        montar(ficha({ ganhosPermanentes: { poderCalculado: 0.02 } }));
        render(<MarcadosPanel />);
        expect(linha().textContent).toContain('+0,02 (+2%)');
    });
    it('aditivo grande usa separador de milhar pt-BR no % equivalente', () => {
        montar(ficha({ ganhosPermanentes: { poderCalculado: 12.5 } }));
        render(<MarcadosPanel />);
        expect(linha().textContent).toContain('+12,5 (+1.250%)');
    });
    it('aditivo 0,001 (Verg, 1 golpe) = +0,1%', () => {
        montar(ficha({ ganhosPermanentes: { poderCalculado: 0.001 } }));
        render(<MarcadosPanel />);
        expect(linha().textContent).toContain('(+0,1%)');
    });
    it('fator composto 1,02^50 mostra "×2,6916"; fator 2,69 mostra "×2,69"', () => {
        montar(ficha({ ganhosPermanentes: { fatorPoder: 1.02 ** 50 } }));
        render(<MarcadosPanel />);
        expect(fatorSpan().textContent).toBe('×2,6916');
        cleanup();
        montar(ficha({ ganhosPermanentes: { poderCalculado: 1, fatorPoder: 2.69 } }));
        render(<MarcadosPanel />);
        expect(fatorSpan().textContent).toBe('×2,69');
        expect(linha().textContent).toContain('+1 (+100%)');
    });
    it('fator 1 (ou ausente/invalido) nao mostra o "×"', () => {
        for (const v of [1, undefined, NaN, 'abc', 0, -2, null]) {
            cleanup();
            montar(ficha({ ganhosPermanentes: { poderCalculado: 1, fatorPoder: v } }));
            render(<MarcadosPanel />);
            expect(fatorSpan()).toBeUndefined();
        }
    });
    it('jogador: so fator != 1 (aditivo 0) faz a linha aparecer', () => {
        montar(ficha({ ganhosPermanentes: { fatorPoder: 2 } }));
        render(<MarcadosPanel />);
        expect(linha()).not.toBeNull();
        expect(fatorSpan().textContent).toBe('×2');
    });
    it('jogador sem nada: linha oculta; com aditivo 0 e fator 1 tambem', () => {
        montar(ficha({ ganhosPermanentes: { poderCalculado: 0, fatorPoder: 1 } }));
        render(<MarcadosPanel />);
        expect(linha()).toBeNull();
    });
    it('aditivo 0 nao mostra o parentese de %', () => {
        montar(ficha({ ganhosPermanentes: { fatorPoder: 2 } }), { isMestre: true });
        render(<MarcadosPanel />);
        expect(linha().textContent).not.toMatch(/\(\+/);
    });
    it('fator fora da faixa (1e20) aparece preso em 1e12 (sem NaN/Infinity)', () => {
        montar(ficha({ ganhosPermanentes: { fatorPoder: 1e20 } }));
        render(<MarcadosPanel />);
        expect(fatorSpan().textContent).not.toMatch(/NaN|Infinity/);
        expect(fatorSpan().textContent).toMatch(/^×1\.000\.000\.000\.000/);
    });
    it('fator minusculo (1e-6) arredonda a 4 casas e mostra ×0 sem quebrar', () => {
        montar(ficha({ ganhosPermanentes: { fatorPoder: 1e-6 } }));
        render(<MarcadosPanel />);
        expect(fatorSpan().textContent).toMatch(/^×0/);
    });
});

describe('Marcados: Mestre x jogador', () => {
    beforeEach(() => { vi.useFakeTimers(); vi.clearAllMocks(); window.confirm = vi.fn(() => true); window.alert = vi.fn(); });
    afterEach(() => { cleanup(); vi.useRealTimers(); });

    it('jogador nao ve inputs nem Zerar mesmo com fator', () => {
        montar(ficha({ ganhosPermanentes: { poderCalculado: 1, fatorPoder: 2 } }));
        render(<MarcadosPanel />);
        expect(screen.queryByLabelText('Ganhos permanentes de Poder (Mestre)')).toBeNull();
        expect(screen.queryByLabelText('Fator composto de Poder (Mestre)')).toBeNull();
        expect(screen.queryByText('Zerar')).toBeNull();
    });
    it('Mestre ve os dois campos (fator padrao 1) e Zerar', () => {
        montar(ficha(), { isMestre: true });
        render(<MarcadosPanel />);
        expect(campoAdit().value).toBe('0');
        expect(campoFator().value).toBe('1');
        expect(screen.getAllByText('Zerar')[0]).toBeTruthy();
    });
    it('campo do fator: limites min/max do input', () => {
        montar(ficha(), { isMestre: true });
        render(<MarcadosPanel />);
        expect(Number(campoFator().getAttribute('min'))).toBe(1e-6);
        expect(Number(campoFator().getAttribute('max'))).toBe(1e12);
    });
    it('digitar nao grava; blur grava o fator', () => {
        const est = montar(ficha({ ganhosPermanentes: { fatorPoder: 2 } }), { isMestre: true });
        render(<MarcadosPanel />);
        fireEvent.change(campoFator(), { target: { value: '3.5' } });
        expect(est.minhaFicha.ganhosPermanentes.fatorPoder).toBe(2);
        fireEvent.blur(campoFator());
        expect(est.minhaFicha.ganhosPermanentes.fatorPoder).toBe(3.5);
        salvouDebounced(1);
    });
    it('Enter dispara o blur e grava o fator', () => {
        const est = montar(ficha({ ganhosPermanentes: { fatorPoder: 2 } }), { isMestre: true });
        render(<MarcadosPanel />);
        campoFator().focus();
        fireEvent.change(campoFator(), { target: { value: '4' } });
        fireEvent.keyDown(campoFator(), { key: 'Enter' });
        expect(est.minhaFicha.ganhosPermanentes.fatorPoder).toBe(4);
    });
    it('blur sem mudanca nao grava', () => {
        const est = montar(ficha({ ganhosPermanentes: { fatorPoder: 2 } }), { isMestre: true });
        render(<MarcadosPanel />);
        fireEvent.blur(campoFator());
        expect(est.updateFicha).not.toHaveBeenCalled();
        salvouDebounced(0);
    });
    it('fator invalido (0, negativo, vazio, texto) grava 1; acima de 1e12 e preso; abaixo de 1e-6 e preso', () => {
        const casos = [['0', 1], ['-3', 1], ['', 1], ['1e20', 1e12], ['1e-9', 1e-6], ['0.1234567891234', 0.123456789]];
        for (const [entrada, esperado] of casos) {
            cleanup();
            const est = montar(ficha({ ganhosPermanentes: { fatorPoder: 2 } }), { isMestre: true });
            render(<MarcadosPanel />);
            fireEvent.change(campoFator(), { target: { value: entrada } });
            fireEvent.blur(campoFator());
            expect(est.minhaFicha.ganhosPermanentes.fatorPoder).toBe(esperado);
        }
    });
    it('gravar o fator cria ganhosPermanentes e nao mexe no aditivo', () => {
        const est = montar(ficha(), { isMestre: true });
        render(<MarcadosPanel />);
        fireEvent.change(campoFator(), { target: { value: '2' } });
        fireEvent.blur(campoFator());
        expect(est.minhaFicha.ganhosPermanentes).toEqual({ fatorPoder: 2 });
    });
    it('editar o aditivo preserva o fator', () => {
        const est = montar(ficha({ ganhosPermanentes: { poderCalculado: 1, fatorPoder: 2 } }), { isMestre: true });
        render(<MarcadosPanel />);
        fireEvent.change(campoAdit(), { target: { value: '5' } });
        fireEvent.blur(campoAdit());
        expect(est.minhaFicha.ganhosPermanentes).toEqual({ poderCalculado: 5, fatorPoder: 2 });
    });
    it('Zerar: UMA updateFicha, aditivo 0 e fator 1, e chama callSave (save debounced)', () => {
        const est = montar(ficha({ ganhosPermanentes: { poderCalculado: 12, fatorPoder: 2.69, outro: 'x' } }), { isMestre: true });
        render(<MarcadosPanel />);
        fireEvent.click(screen.getAllByText('Zerar')[0]);
        expect(est.updateFicha).toHaveBeenCalledTimes(1);
        expect(est.minhaFicha.ganhosPermanentes).toEqual({ poderCalculado: 0, fatorPoder: 1, outro: 'x' });
        salvouDebounced(1);
    });
    it('Zerar sem objeto ganhosPermanentes (ou corrompido) cria {0, 1}', () => {
        for (const lixo of [undefined, null, 'abc', 5]) {
            cleanup(); vi.clearAllMocks();
            const est = montar(ficha(lixo === undefined ? {} : { ganhosPermanentes: lixo }), { isMestre: true });
            render(<MarcadosPanel />);
            expect(() => fireEvent.click(screen.getAllByText('Zerar')[0])).not.toThrow();
            expect(est.minhaFicha.ganhosPermanentes).toEqual({ poderCalculado: 0, fatorPoder: 1 });
            salvouDebounced(1);
        }
    });
    it('apos Zerar com fator corrompido ("abc") o campo do Mestre mostra 1', () => {
        montar(ficha({ ganhosPermanentes: { fatorPoder: 'abc' } }), { isMestre: true });
        render(<MarcadosPanel />);
        expect(campoFator().value).toBe('1');
    });
});

describe('Marcados: Scouter usa o fator uma unica vez (paridade com calcularPoderAtual)', () => {
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
        ['sem ganhos', undefined],
        ['so aditivo 2 (3x)', { poderCalculado: 2 }],
        ['so fator 2', { fatorPoder: 2 }],
        ['so fator 1,02^50', { fatorPoder: 1.02 ** 50 }],
        ['ambos aditivo 2 + fator 2,69', { poderCalculado: 2, fatorPoder: 2.69 }],
        ['fator corrompido', { fatorPoder: 'abc' }],
    ])('%s: Scouter == calcularPoderAtual.poderGlobal', (_n, gpv) => {
        const f = gpv ? { ...base(), ganhosPermanentes: gpv } : base();
        const esperado = comoScouter(calcularPoderAtual(f, 1).poderGlobal);
        expect(scouter(f)).toBe(esperado);
    });
    it('o fator nao e contado duas vezes: razao fator-so / sem = fator no motor', () => {
        const sem = calcularPoderAtual(base(), 1).poderExato;
        const com = calcularPoderAtual({ ...base(), ganhosPermanentes: { fatorPoder: 2 } }, 1).poderExato;
        expect(com / sem).toBeCloseTo(2, 6);
    });
});
