import React from 'react';
import { render, cleanup, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MapaTecnicasRapidas } from './MapaCombate';
import useStore from '../../stores/useStore';

// QA - MapaTecnicasRapidas.alternarTecnica com usos limitados: sem usos nao gasta Acao nem chama togglePoder.
let poderesCtx;
const gastarAcao = vi.fn(() => true);
const togglePoder = vi.fn();

vi.mock('../poderes/PoderesFormContext', () => ({ usePoderesForm: () => poderesCtx }));
vi.mock('../../hooks/useGastarAcao', () => ({ default: () => gastarAcao }));
vi.mock('../../stores/useStore');

const poder = (id, nome, extra = {}) => ({ id, nome, categoria: 'habilidade', ativa: false, ...extra });
function montar(poderes, ctxExtra = {}, combate) {
    poderesCtx = { minhaFicha: { poderes, ...(combate ? { combate } : {}) }, togglePoder, mudarEstagioPoder: vi.fn(), ...ctxExtra };
    return render(<MapaTecnicasRapidas />);
}
const chip = (container, nome) => [...container.querySelectorAll('.mapa-tecnica-chip')].find(c => c.textContent.includes(nome));

beforeEach(() => {
    vi.clearAllMocks();
    gastarAcao.mockImplementation(() => true);
    window.alert = vi.fn();
    const state = { pastasFechadasMapaTecnicas: {}, setPastasFechadasMapaTecnicas: vi.fn() };
    useStore.mockImplementation((sel) => (typeof sel === 'function' ? sel(state) : state));
});
afterEach(() => cleanup());

describe('MapaTecnicasRapidas.alternarTecnica - usos limitados', () => {
    it('sem usos restantes: alert, NAO gasta Acao e NAO chama togglePoder', () => {
        const { container } = montar([poder('a', 'Raio', { usosMax: 1, usosPor: 'cena' })], { cenaAtivaId: 'c1' }, { usosPoderes: { a: { n: 1, cena: 'c1' } } });
        fireEvent.click(chip(container, 'Raio'));
        expect(window.alert).toHaveBeenCalledTimes(1);
        expect(window.alert.mock.calls[0][0]).toContain('Raio');
        expect(window.alert.mock.calls[0][0]).toContain('0/1 usos (por cena)');
        expect(window.alert.mock.calls[0][0]).toContain('trocar de cena ou descansar');
        expect(gastarAcao).not.toHaveBeenCalled();
        expect(togglePoder).not.toHaveBeenCalled();
    });

    it('por descanso esgotado: mensagem so fala em descansar', () => {
        const { container } = montar([poder('a', 'Raio', { usosMax: 1, usosPor: 'descanso' })], { cenaAtivaId: 'c9' }, { usosPoderes: { a: { n: 1, cena: 'c1' } } });
        fireEvent.click(chip(container, 'Raio'));
        expect(window.alert.mock.calls[0][0]).not.toContain('trocar de cena');
        expect(gastarAcao).not.toHaveBeenCalled();
        expect(togglePoder).not.toHaveBeenCalled();
    });

    it('com usos restantes: gasta a Acao e chama togglePoder', () => {
        const { container } = montar([poder('a', 'Raio', { usosMax: 2, usosPor: 'cena' })], { cenaAtivaId: 'c1' }, { usosPoderes: { a: { n: 1, cena: 'c1' } } });
        fireEvent.click(chip(container, 'Raio'));
        expect(gastarAcao).toHaveBeenCalledTimes(1);
        expect(togglePoder).toHaveBeenCalledWith('a');
        expect(window.alert).not.toHaveBeenCalled();
    });

    it('uso gasto em outra cena (por cena) nao bloqueia', () => {
        const { container } = montar([poder('a', 'Raio', { usosMax: 1, usosPor: 'cena' })], { cenaAtivaId: 'c2' }, { usosPoderes: { a: { n: 1, cena: 'c1' } } });
        fireEvent.click(chip(container, 'Raio'));
        expect(togglePoder).toHaveBeenCalledWith('a');
    });

    it('ilimitado: comportamento antigo', () => {
        const { container } = montar([poder('a', 'Raio')]);
        fireEvent.click(chip(container, 'Raio'));
        expect(gastarAcao).toHaveBeenCalledTimes(1);
        expect(togglePoder).toHaveBeenCalledWith('a');
    });

    it('esgotada mas JA LIGADA: desligar nao exige usos nem cobra Acao', () => {
        const { container } = montar([poder('a', 'Raio', { ativa: true, usosMax: 1, usosPor: 'descanso' })], {}, { usosPoderes: { a: { n: 1, cena: 'default' } } });
        fireEvent.click(chip(container, 'Raio'));
        expect(window.alert).not.toHaveBeenCalled();
        expect(gastarAcao).not.toHaveBeenCalled();
        expect(togglePoder).toHaveBeenCalledWith('a');
    });

    it('com usos mas Acao recusada (gastarAcao false): nao liga', () => {
        gastarAcao.mockImplementation(() => false);
        const { container } = montar([poder('a', 'Raio', { usosMax: 2 })]);
        fireEvent.click(chip(container, 'Raio'));
        expect(gastarAcao).toHaveBeenCalledTimes(1);
        expect(togglePoder).not.toHaveBeenCalled();
    });
});
