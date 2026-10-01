import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import AcertoPanel from './AcertoPanel';
import useStore from '../../stores/useStore';
import { calcularAcerto } from '../../core/engine';
import { enviarParaFeed } from '../../services/firebase-sync';

vi.mock('../../stores/useStore');
vi.mock('../../core/engine', () => ({
    calcularAcerto: vi.fn(() => ({ acertoTotal: 25, rolagem: '1d20' }))
}));
vi.mock('../../core/attributes', () => ({
    getPoderesDefesa: vi.fn(() => 0),
    getEfeitosDeClasse: vi.fn(() => [])
}));
vi.mock('../../services/firebase-sync', () => ({
    enviarParaFeed: vi.fn(),
    salvarFichaSilencioso: vi.fn()
}));

describe('AcertoPanel', () => {
    // A origem padrão é 'alvo'. Com alvo (dummie) dentro do alcance rola normalmente ("TENTAR ACERTAR O ALVO").
    // Sem alvo selecionado é uma ROLAGEM LIVRE: o botão ("ROLAR ACERTO LIVRE") fica habilitado,
    // rolarAcerto não avisa "fora de alcance" e o feed recebe alvosArea vazio.
    // Com alvo selecionado mas fora do alcance, o botão fica desabilitado ("MUITO LONGE PARA LANÇAR").
    const montarEstado = (extra = {}) => ({
        minhaFicha: { inventario: [], ataqueConfig: { vantagens: 0, desvantagens: 0 }, posicao: { x: 0, y: 0, z: 0 } },
        meuNome: 'Herói',
        setAbaAtiva: vi.fn(),
        updateFicha: vi.fn(),
        alvoSelecionado: 'd1',
        dummies: { d1: { nome: 'Dummie', valorDefesa: 10, posicao: { x: 0, y: 0, z: 0 } } },
        cenario: {},
        ...extra
    });
    const usarEstado = (extra) => {
        const mockState = montarEstado(extra);
        useStore.mockImplementation(selector => selector ? selector(mockState) : mockState);
    };

    let alertSpy;
    beforeEach(() => {
        vi.clearAllMocks();
        alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
        usarEstado();
    });
    afterEach(() => { cleanup(); alertSpy.mockRestore(); });

    it('deve enviar a rolagem de acerto corretamente para o motor', () => {
        render(<AcertoPanel />);

        const btnRolar = screen.getByText(/TENTAR ACERTAR O ALVO/i);
        fireEvent.click(btnRolar);

        // Verifica se chamou a engine passando os parâmetros
        expect(calcularAcerto).toHaveBeenCalledWith(expect.objectContaining({
            vantagens: 0,
            desvantagens: 0
        }));

        // Verifica se a emissão ocorreu apenas via Firebase (Sem Eco local)
        expect(enviarParaFeed).toHaveBeenCalled();
    });

    describe('sem alvo selecionado (rolagem livre)', () => {
        beforeEach(() => { usarEstado({ alvoSelecionado: null, dummies: {} }); });

        it('o botão ROLAR ACERTO LIVRE está habilitado', () => {
            render(<AcertoPanel />);
            expect(screen.getByRole('button', { name: /ROLAR ACERTO LIVRE/i }).disabled).toBe(false);
        });

        it('clicar chama calcularAcerto e envia ao feed com alvosArea vazio', () => {
            render(<AcertoPanel />);
            fireEvent.click(screen.getByRole('button', { name: /ROLAR ACERTO LIVRE/i }));

            expect(calcularAcerto).toHaveBeenCalledTimes(1);
            expect(enviarParaFeed).toHaveBeenCalledTimes(1);
            expect(enviarParaFeed).toHaveBeenCalledWith(expect.objectContaining({
                tipo: 'acerto',
                nome: 'Herói',
                alvosArea: []
            }));
        });

        it('não dispara window.alert de fora de alcance', () => {
            render(<AcertoPanel />);
            fireEvent.click(screen.getByRole('button', { name: /ROLAR ACERTO LIVRE/i }));
            expect(alertSpy).not.toHaveBeenCalled();
        });

        it('não mostra o aviso FORA DE ALCANCE', () => {
            render(<AcertoPanel />);
            expect(screen.queryByText(/FORA DE ALCANCE/i)).toBeNull();
        });

        it('alvoSelecionado apontando para dummie inexistente também é rolagem livre', () => {
            usarEstado({ alvoSelecionado: 'fantasma', dummies: {} });
            render(<AcertoPanel />);
            expect(screen.getByRole('button', { name: /ROLAR ACERTO LIVRE/i }).disabled).toBe(false);
            expect(screen.queryByText(/FORA DE ALCANCE/i)).toBeNull();
        });
    });

    describe('com alvo selecionado fora do alcance', () => {
        beforeEach(() => {
            usarEstado({ dummies: { d1: { nome: 'Dummie', valorDefesa: 10, posicao: { x: 50, y: 50, z: 0 } } } });
        });

        it('o botão fica desabilitado com MUITO LONGE PARA LANÇAR', () => {
            render(<AcertoPanel />);
            expect(screen.getByRole('button', { name: /MUITO LONGE PARA LANÇAR/i }).disabled).toBe(true);
            expect(screen.queryByRole('button', { name: /ROLAR ACERTO LIVRE/i })).toBeNull();
        });

        it('mostra o aviso FORA DE ALCANCE e não rola ao clicar', () => {
            render(<AcertoPanel />);
            expect(screen.getByText(/FORA DE ALCANCE/i)).toBeTruthy();
            fireEvent.click(screen.getByRole('button', { name: /MUITO LONGE PARA LANÇAR/i }));
            expect(calcularAcerto).not.toHaveBeenCalled();
            expect(enviarParaFeed).not.toHaveBeenCalled();
        });
    });
});
