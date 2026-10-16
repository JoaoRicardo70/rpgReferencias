import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MapaAtalhoAtaques } from './MapaCombate';

// Atalho flutuante dos Ataques Salvos (estilo inventário): só abre/usa os slots; o cálculo em si
// é o do AtaqueFormContext (rolarAtaqueSalvo / rolarDanoCustomizado), coberto em outros testes.
let ctx;
vi.mock('../combate/AtaqueFormContext', () => ({ useAtaqueForm: () => ctx }));
vi.mock('../../stores/useStore');
vi.mock('../poderes/PoderesFormContext', () => ({ usePoderesForm: () => null }));
vi.mock('../arsenal/ArsenalFormContext', () => ({ useArsenalForm: () => null }));
vi.mock('../arsenal/ElementosFormContext', () => ({ useElementosForm: () => null, emogis: {}, cores: {} }));
vi.mock('./MapaFormContext', () => ({ useMapaForm: () => null, urlSeguraParaCss: (u) => u, calcularCA: () => 10 }));

const fichaCom = (ataqueConfig) => ({ ataqueConfig });
const montar = (extra = {}) => {
    ctx = {
        minhaFicha: fichaCom({
            ataquesSalvos: [{ id: 1, nome: 'Combo', config: {} }, { id: 2, nome: 'Rajada', config: {} }],
            formulasSalvas: [{ id: 9, nome: 'Velha', formula: '5d10 x 61000', letalidade: 1, energiaTipo: 'mana', energiaCusto: 5 }]
        }),
        podeRolarDano: true, ignorarTravaAcerto: false, dummieAlvo: { nome: 'Goblin' },
        rolarAtaqueSalvo: vi.fn(), rolarDanoCustomizado: vi.fn(),
        ...extra
    };
    return render(<MapaAtalhoAtaques />);
};

afterEach(() => cleanup());
beforeEach(() => { vi.clearAllMocks(); });

describe('MapaAtalhoAtaques', () => {
    it('mostra só o botão fechado, com a contagem de slots', () => {
        montar();
        expect(screen.getByTitle('Atalho dos Ataques Salvos').textContent).toContain('3');
        expect(screen.queryByText('Combo')).toBeNull();
    });

    it('não renderiza nada sem ataques salvos nem fórmulas', () => {
        const { container } = montar({ minhaFicha: fichaCom({}) });
        expect(container.firstChild).toBeNull();
    });

    it('não renderiza sem contexto', () => {
        ctx = null;
        const { container } = render(<MapaAtalhoAtaques />);
        expect(container.firstChild).toBeNull();
    });

    it('abre a grade, mostra o alvo e executa o ataque salvo no clique (e fecha)', () => {
        montar();
        fireEvent.click(screen.getByTitle('Atalho dos Ataques Salvos'));
        expect(screen.getByText('Combo')).toBeTruthy();
        expect(screen.getByText('🎯 Goblin')).toBeTruthy();
        fireEvent.click(screen.getByText('Rajada'));
        expect(ctx.rolarAtaqueSalvo).toHaveBeenCalledWith(ctx.minhaFicha.ataqueConfig.ataquesSalvos[1]);
        expect(screen.queryByText('Combo')).toBeNull();
    });

    it('fórmula antiga roda pela fórmula e aparece com o aviso', () => {
        montar();
        fireEvent.click(screen.getByTitle('Atalho dos Ataques Salvos'));
        expect(screen.getByText('⚠️')).toBeTruthy();
        fireEvent.click(screen.getByText('Velha'));
        expect(ctx.rolarDanoCustomizado).toHaveBeenCalledWith('5d10 x 61000', 1, 'mana', 5);
    });

    it('teclas 1-9 executam o slot correspondente; Esc fecha', () => {
        montar();
        fireEvent.click(screen.getByTitle('Atalho dos Ataques Salvos'));
        fireEvent.keyDown(document, { key: '1' });
        expect(ctx.rolarAtaqueSalvo).toHaveBeenCalledTimes(1);
        fireEvent.click(screen.getByTitle('Atalho dos Ataques Salvos'));
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(screen.queryByText('Combo')).toBeNull();
    });

    it('digitar num campo não dispara o atalho', () => {
        montar();
        fireEvent.click(screen.getByTitle('Atalho dos Ataques Salvos'));
        const campo = document.createElement('input');
        document.body.appendChild(campo);
        fireEvent.keyDown(campo, { key: '1' });
        expect(ctx.rolarAtaqueSalvo).not.toHaveBeenCalled();
        campo.remove();
    });

    it('sem Acerto (trava) os slots ficam desabilitados e as teclas não executam', () => {
        montar({ podeRolarDano: false });
        fireEvent.click(screen.getByTitle('Atalho dos Ataques Salvos'));
        expect(screen.getByText('Combo').closest('button').disabled).toBe(true);
        expect(screen.getByText('Acerto necessário antes de rolar o dano.')).toBeTruthy();
        fireEvent.keyDown(document, { key: '1' });
        expect(ctx.rolarAtaqueSalvo).not.toHaveBeenCalled();
    });

    it('ignorar a trava libera os slots; sem alvo mostra "Sem alvo"', () => {
        montar({ podeRolarDano: false, ignorarTravaAcerto: true, dummieAlvo: null });
        fireEvent.click(screen.getByTitle('Atalho dos Ataques Salvos'));
        expect(screen.getByText('Combo').closest('button').disabled).toBe(false);
        expect(screen.getByText('Sem alvo')).toBeTruthy();
    });

    it('clicar fora fecha a grade', () => {
        montar();
        fireEvent.click(screen.getByTitle('Atalho dos Ataques Salvos'));
        fireEvent.mouseDown(document.body);
        expect(screen.queryByText('Combo')).toBeNull();
    });
});
