import React from 'react';
import { render, cleanup, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';

let fichaMock;
let souEuMesmoMock = true;
const callSave = vi.fn();
const adicionarAviso = vi.fn();
vi.mock('../Ficha Def/FichaAlvoContext', () => ({
    useFichaAtiva: () => ({ ficha: fichaMock, updateFicha: (cb) => cb(fichaMock), souEuMesmo: souEuMesmoMock }),
    useCallSaveAtivo: () => callSave,
}));
vi.mock('../../stores/useStore', () => ({
    default: (sel) => sel({ adicionarAviso }),
}));

import EnsinamentosRecebidos from './EnsinamentosRecebidos';

const oferta = (id, tipo, extra = {}) => ({ id, de: 'Natsu', tipo, nivel: 40, em: 1, item: { nome: `Item ${id}`, categoria: 'habilidade' }, ...extra });

beforeEach(() => { souEuMesmoMock = true; });
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('EnsinamentosRecebidos', () => {
    it('não renderiza se souEuMesmo=false', () => {
        souEuMesmoMock = false;
        fichaMock = { ensinamentos: { a: oferta('a', 'poder') } };
        const { container } = render(<EnsinamentosRecebidos />);
        expect(container.textContent).toBe('');
    });

    it('não renderiza sem ofertas ou sem ensinamentos', () => {
        fichaMock = {};
        expect(render(<EnsinamentosRecebidos />).container.textContent).toBe('');
        cleanup();
        fichaMock = { ensinamentos: {} };
        expect(render(<EnsinamentosRecebidos />).container.textContent).toBe('');
    });

    it('filtra por tipo e mostra Maestria inicial para poder', () => {
        fichaMock = { ensinamentos: { a: oferta('a', 'poder'), b: oferta('b', 'tecnica') } };
        const { container } = render(<EnsinamentosRecebidos tipo="poder" />);
        expect(container.textContent).toContain('Item a');
        expect(container.textContent).toContain('Maestria inicial 40%');
        expect(container.textContent).not.toContain('Item b');
    });

    it('aceitar adiciona em ficha.poderes, some a oferta, salva e avisa', () => {
        fichaMock = { poderes: [], ensinamentos: { a: oferta('a', 'poder') } };
        const { getByText } = render(<EnsinamentosRecebidos tipo="poder" />);
        fireEvent.click(getByText('Aceitar'));
        expect(fichaMock.poderes).toHaveLength(1);
        expect(fichaMock.poderes[0]).toMatchObject({ nome: 'Item a', ensinadoPor: 'Natsu', maestria: 40 });
        expect(fichaMock.ensinamentos.a).toBeUndefined();
        expect(callSave).toHaveBeenCalledTimes(1);
        expect(adicionarAviso).toHaveBeenCalledWith(expect.stringContaining('Item a'), 'info');
    });

    it('recusar só remove a oferta, sem criar item nem avisar', () => {
        fichaMock = { poderes: [], ensinamentos: { a: oferta('a', 'poder') } };
        const { getByText } = render(<EnsinamentosRecebidos tipo="poder" />);
        fireEvent.click(getByText('Recusar'));
        expect(fichaMock.poderes).toHaveLength(0);
        expect(fichaMock.ensinamentos.a).toBeUndefined();
        expect(callSave).toHaveBeenCalledTimes(1);
        expect(adicionarAviso).not.toHaveBeenCalled();
    });

    it('aceitar oferta já removida não duplica nem avisa', () => {
        const o = oferta('a', 'poder');
        fichaMock = { poderes: [], ensinamentos: {} };
        const { container } = render(<EnsinamentosRecebidos />);
        expect(container.textContent).toBe('');
        expect(fichaMock.poderes).toHaveLength(0);
        expect(adicionarAviso).not.toHaveBeenCalled();
        expect(o.id).toBe('a');
    });

    it('técnica aceita vai para ataquesElementais', () => {
        fichaMock = { ensinamentos: { t: oferta('t', 'tecnica') } };
        const { getByText, container } = render(<EnsinamentosRecebidos tipo="tecnica" />);
        expect(container.textContent).toContain('nível 40%');
        fireEvent.click(getByText('Aceitar'));
        expect(fichaMock.ataquesElementais).toHaveLength(1);
        expect(fichaMock.poderes).toBeUndefined();
    });
});
