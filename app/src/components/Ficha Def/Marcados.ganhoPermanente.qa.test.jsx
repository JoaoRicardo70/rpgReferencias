import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import MarcadosPanel from './Marcados';
import useStore from '../../stores/useStore';

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
const campo = () => screen.getByLabelText('Ganhos permanentes de Poder (Mestre)');
const linha = () => screen.queryByTestId('ganho-permanente-poder');

describe('Marcados: linha Ganhos permanentes', () => {
    beforeEach(() => { vi.clearAllMocks(); window.confirm = vi.fn(() => true); window.alert = vi.fn(); });
    afterEach(cleanup);

    it('jogador sem ganho (campo ausente, 0, negativo, NaN, string lixo): linha oculta', () => {
        for (const v of [undefined, 0, -3, NaN, 'abc', null]) {
            cleanup();
            montar(ficha(v === undefined ? {} : { ganhosPermanentes: { poderCalculado: v } }));
            render(<MarcadosPanel />);
            expect(linha()).toBeNull();
        }
    });
    it('jogador com ganho > 0: linha visível, sem input nem Zerar', () => {
        montar(ficha({ ganhosPermanentes: { poderCalculado: 9 } }));
        render(<MarcadosPanel />);
        expect(linha()).not.toBeNull();
        expect(linha().textContent).toContain('+9');
        expect(screen.queryByLabelText('Ganhos permanentes de Poder (Mestre)')).toBeNull();
        expect(screen.queryByText('Zerar')).toBeNull();
    });
    it('formata decimais em pt-BR e limita a 6 casas', () => {
        montar(ficha({ ganhosPermanentes: { poderCalculado: 0.1234567891 } }));
        render(<MarcadosPanel />);
        expect(linha().textContent).toContain('+0,123457');
    });
    it('string numérica vinda do Firebase é lida', () => {
        montar(ficha({ ganhosPermanentes: { poderCalculado: '4' } }));
        render(<MarcadosPanel />);
        expect(linha().textContent).toContain('+4');
    });
    it('Mestre vê a linha mesmo com 0, com input e Zerar', () => {
        montar(ficha(), { isMestre: true });
        render(<MarcadosPanel />);
        expect(linha()).not.toBeNull();
        expect(campo().value).toBe('0');
        expect(screen.getAllByText('Zerar')[0]).toBeTruthy();
    });
    it('Mestre via ficha.isMestre também vê', () => {
        montar(ficha({ isMestre: true }));
        render(<MarcadosPanel />);
        expect(linha()).not.toBeNull();
    });
    it('input só grava no blur: digitar (change) não grava', () => {
        const est = montar(ficha({ ganhosPermanentes: { poderCalculado: 2 } }), { isMestre: true });
        render(<MarcadosPanel />);
        fireEvent.change(campo(), { target: { value: '7' } });
        expect(est.minhaFicha.ganhosPermanentes.poderCalculado).toBe(2);
        fireEvent.blur(campo());
        expect(est.minhaFicha.ganhosPermanentes.poderCalculado).toBe(7);
    });
    it('Enter dispara blur e grava', () => {
        const est = montar(ficha({ ganhosPermanentes: { poderCalculado: 2 } }), { isMestre: true });
        render(<MarcadosPanel />);
        campo().focus();
        fireEvent.change(campo(), { target: { value: '5.5' } });
        fireEvent.keyDown(campo(), { key: 'Enter' });
        expect(est.minhaFicha.ganhosPermanentes.poderCalculado).toBe(5.5);
    });
    it('outras teclas não gravam', () => {
        const est = montar(ficha({ ganhosPermanentes: { poderCalculado: 2 } }), { isMestre: true });
        render(<MarcadosPanel />);
        fireEvent.change(campo(), { target: { value: '9' } });
        fireEvent.keyDown(campo(), { key: 'a' });
        expect(est.minhaFicha.ganhosPermanentes.poderCalculado).toBe(2);
    });
    it('blur sem mudança não grava (updateFicha não é chamado)', () => {
        const est = montar(ficha({ ganhosPermanentes: { poderCalculado: 2 } }), { isMestre: true });
        render(<MarcadosPanel />);
        fireEvent.blur(campo());
        expect(est.updateFicha).not.toHaveBeenCalled();
    });
    it('blur com negativo, vazio e lixo grava 0; acima de 1e9 limita a 1e9', () => {
        const casos = [['-5', 0], ['', 0], ['0', 0], ['1e12', 1e9], ['1000000000', 1e9]];
        for (const [entrada, esperado] of casos) {
            cleanup();
            const est = montar(ficha({ ganhosPermanentes: { poderCalculado: 2 } }), { isMestre: true });
            render(<MarcadosPanel />);
            fireEvent.change(campo(), { target: { value: entrada } });
            fireEvent.blur(campo());
            expect(est.minhaFicha.ganhosPermanentes.poderCalculado).toBe(esperado);
        }
    });
    it('grava criando ganhosPermanentes quando a ficha não tem o objeto', () => {
        const est = montar(ficha(), { isMestre: true });
        render(<MarcadosPanel />);
        fireEvent.change(campo(), { target: { value: '3' } });
        fireEvent.blur(campo());
        expect(est.minhaFicha.ganhosPermanentes).toEqual({ poderCalculado: 3 });
    });
    it('Zerar grava 0 imediatamente', () => {
        const est = montar(ficha({ ganhosPermanentes: { poderCalculado: 12 } }), { isMestre: true });
        render(<MarcadosPanel />);
        fireEvent.click(screen.getAllByText('Zerar')[0]);
        expect(est.minhaFicha.ganhosPermanentes.poderCalculado).toBe(0);
        expect(est.updateFicha).toHaveBeenCalledTimes(1);
    });
    it('Zerar com valor já 0 ainda não quebra', () => {
        const est = montar(ficha(), { isMestre: true });
        render(<MarcadosPanel />);
        expect(() => fireEvent.click(screen.getAllByText('Zerar')[0])).not.toThrow();
        expect(est.minhaFicha.ganhosPermanentes.poderCalculado).toBe(0);
    });
});
