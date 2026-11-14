import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import ClassificacaoPanel from './ClassificacaoPanel';
import useStore from '../../stores/useStore';
import { novaTelemetriaZenkai } from '../../core/zenkai';

// Bloco "Zenkai (esta luta)" na pagina Marcadores & Adaptação: somente leitura + "Zerar (sem aplicar)".
vi.mock('../../stores/useStore');
vi.mock('../../services/firebase-sync', () => ({ salvarFichaSilencioso: vi.fn() }));

function montar(ficha) {
    const state = { minhaFicha: ficha, updateFicha: vi.fn((cb) => cb(ficha)), isMestre: true };
    useStore.mockImplementation((selector) => (selector ? selector(state) : state));
    return state;
}
const irParaMarcadores = () => fireEvent.change(screen.getByRole('combobox'), { target: { value: 'acumulativo' } });
const luta = { ...novaTelemetriaZenkai(), vidaMax: 100000, danoRecebido: 50000, turnos: 10, fadigaPico: 60, razaoSoma: 10, razaoTurnos: 10 };

beforeEach(() => { vi.clearAllMocks(); });
afterEach(cleanup);

describe('ClassificacaoPanel: bloco Zenkai', () => {
    it('nao aparece sem Zenkai ligado', () => {
        montar({ combate: { zenkai: luta } });
        render(<ClassificacaoPanel />); irParaMarcadores();
        expect(screen.queryByTestId('zenkai-bloco')).toBeNull();
    });
    it('ligado e sem luta: avisa que a telemetria comeca com o combate e o botao Zerar fica desabilitado', () => {
        montar({ combate: { zenkaiLigado: true } });
        render(<ClassificacaoPanel />); irParaMarcadores();
        expect(screen.getByText('💥 Zenkai (esta luta)')).toBeTruthy();
        expect(screen.getByText(/telemetria começa quando o combate inicia/)).toBeTruthy();
        expect(screen.getByRole('button', { name: /Zerar \(sem aplicar\)/ }).disabled).toBe(true);
    });
    it('ligado e em luta: mostra os componentes atuais e o percentual projetado (somente leitura)', () => {
        montar({ vida: { atual: 1 }, combate: { zenkaiLigado: true, zenkai: luta } });
        render(<ClassificacaoPanel />); irParaMarcadores();
        const bloco = screen.getByTestId('zenkai-bloco');
        expect(bloco.textContent).toMatch(/Dano recebido50%/);
        expect(bloco.textContent).toMatch(/Duração do combate100%/);
        expect(bloco.textContent).toMatch(/Fadiga acumulada60%/);
        expect(bloco.textContent).toMatch(/Zenkai projetado: \+3,25%/);
        expect(bloco.textContent).toMatch(/teto 5%/);
        expect(bloco.querySelectorAll('input').length).toBe(0);
    });
    it('Zerar apaga a telemetria sem aplicar nenhum ganho', () => {
        const ficha = { vida: { atual: 1 }, combate: { zenkaiLigado: true, zenkai: { ...luta } } };
        const state = montar(ficha);
        render(<ClassificacaoPanel />); irParaMarcadores();
        fireEvent.click(screen.getByRole('button', { name: /Zerar \(sem aplicar\)/ }));
        expect(state.updateFicha).toHaveBeenCalled();
        expect(ficha.combate.zenkai).toBeUndefined();
        expect(ficha.ganhosPermanentes).toBeUndefined();
        expect(ficha.combate.zenkaiLigado).toBe(true);
    });
    it('respeita zenkaiConfig (teto proprio)', () => {
        montar({ vida: { atual: 1 }, combate: { zenkaiLigado: true, zenkai: luta, zenkaiConfig: { teto: 10 } } });
        render(<ClassificacaoPanel />); irParaMarcadores();
        expect(screen.getByTestId('zenkai-bloco').textContent).toMatch(/Zenkai projetado: \+6,5%/);
    });
});
