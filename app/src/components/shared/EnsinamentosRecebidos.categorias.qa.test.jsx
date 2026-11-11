import React from 'react';
import { render, cleanup, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';

let fichaMock;
const callSave = vi.fn();
const adicionarAviso = vi.fn();
vi.mock('../Ficha Def/FichaAlvoContext', () => ({
    useFichaAtiva: () => ({ ficha: fichaMock, updateFicha: (cb) => cb(fichaMock), souEuMesmo: true }),
    useCallSaveAtivo: () => callSave,
}));
vi.mock('../../stores/useStore', () => ({
    default: (sel) => sel({ adicionarAviso }),
}));

import EnsinamentosRecebidos from './EnsinamentosRecebidos';

const oferta = (id, categoria) => ({ id, de: 'Mestre', tipo: 'poder', nivel: 70, em: 1, item: { nome: `Item ${id}`, categoria } });
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('EnsinamentosRecebidos com categorias', () => {
    it('ocular nao liberado: alerta, nao cria, mantem a oferta e nao salva', () => {
        fichaMock = { hierarquia: {}, poderes: [], ensinamentos: { a: oferta('a', 'ocular') } };
        const { getByText } = render(<EnsinamentosRecebidos tipo="poder" />);
        fireEvent.click(getByText('Aceitar'));
        expect(adicionarAviso).toHaveBeenCalledTimes(1);
        expect(adicionarAviso).toHaveBeenCalledWith(expect.stringContaining('Poderes Oculares'), 'alerta');
        expect(fichaMock.poderes).toHaveLength(0);
        expect(fichaMock.ensinamentos.a).toBeDefined();
        expect(callSave).not.toHaveBeenCalled();
    });
    it('infinity nao liberado: idem', () => {
        fichaMock = { poderes: [], ensinamentos: { a: oferta('a', 'infinity') } };
        const { getByText } = render(<EnsinamentosRecebidos tipo="poder" />);
        fireEvent.click(getByText('Aceitar'));
        expect(fichaMock.poderes).toHaveLength(0);
        expect(fichaMock.ensinamentos.a).toBeDefined();
    });
    it('apos liberar, aceita: cria a copia, remove a oferta, salva e avisa (info)', () => {
        fichaMock = { hierarquia: {}, poderes: [], ensinamentos: { a: oferta('a', 'infinity') } };
        const { getByText, rerender } = render(<EnsinamentosRecebidos tipo="poder" />);
        fireEvent.click(getByText('Aceitar'));
        expect(fichaMock.poderes).toHaveLength(0);
        fichaMock.hierarquia = { infinity: true };
        rerender(<EnsinamentosRecebidos tipo="poder" />);
        fireEvent.click(getByText('Aceitar'));
        expect(fichaMock.poderes).toHaveLength(1);
        expect(fichaMock.poderes[0]).toMatchObject({ categoria: 'infinity', maestria: 70 });
        expect(fichaMock.ensinamentos.a).toBeUndefined();
        expect(callSave).toHaveBeenCalledTimes(1);
        expect(adicionarAviso).toHaveBeenLastCalledWith(expect.stringContaining('Item a'), 'info');
    });
    it('Singularidade forjada: alerta com a mensagem, oferta descartada, nada criado, sem aviso "aprendeu"', () => {
        fichaMock = { hierarquia: { singularidade: '3' }, poderes: [], ensinamentos: { a: oferta('a', 'singularidade') } };
        const { getByText } = render(<EnsinamentosRecebidos tipo="poder" />);
        fireEvent.click(getByText('Aceitar'));
        expect(adicionarAviso).toHaveBeenCalledWith(expect.stringContaining('impossível de copiar'), 'alerta');
        expect(adicionarAviso).not.toHaveBeenCalledWith(expect.stringContaining('aprendeu'), 'info');
        expect(fichaMock.poderes).toHaveLength(0);
        expect(fichaMock.ensinamentos.a).toBeUndefined();
    });
    it('Singularidade forjada em ficha SEM liberacao: tambem so alerta e descarta (sem criar)', () => {
        fichaMock = { poderes: [], ensinamentos: { a: oferta('a', 'singularidade') } };
        const { getByText } = render(<EnsinamentosRecebidos tipo="poder" />);
        fireEvent.click(getByText('Aceitar'));
        expect(fichaMock.poderes).toHaveLength(0);
        expect(adicionarAviso).toHaveBeenCalled();
    });
    it('recusar oferta bloqueada remove sem criar', () => {
        fichaMock = { poderes: [], ensinamentos: { a: oferta('a', 'ocular') } };
        const { getByText } = render(<EnsinamentosRecebidos tipo="poder" />);
        fireEvent.click(getByText('Recusar'));
        expect(fichaMock.ensinamentos.a).toBeUndefined();
        expect(fichaMock.poderes).toHaveLength(0);
    });
});
