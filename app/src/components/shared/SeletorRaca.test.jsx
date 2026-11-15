import React, { useState } from 'react';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { describe, it, expect, afterEach } from 'vitest';
import SeletorRaca from './SeletorRaca';
import useStore from '../../stores/useStore';

function Campo({ inicial = '' }) {
    const [raca, setRaca] = useState(inicial);
    return <><SeletorRaca valor={raca} aoMudar={setRaca} /><output data-testid="saida">{raca}</output></>;
}
const CATALOGO = { racas: [{ id: 'saiyajin', nome: 'Saiyajin', icone: '🐒', apelidos: ['Sayajin'], herdaDe: '' }, { id: 'humano', nome: 'Humano', icone: '🧍', apelidos: [], herdaDe: '' }] };

afterEach(() => { cleanup(); useStore.setState({ cenario: {} }); });

describe('SeletorRaca', () => {
    it('sem catálogo continua um campo de texto livre', () => {
        useStore.setState({ cenario: {} });
        render(<Campo />);
        const campo = screen.getByLabelText('Raça');
        expect(campo.tagName).toBe('INPUT');
        fireEvent.change(campo, { target: { value: 'Elfo' } });
        expect(screen.getByTestId('saida').textContent).toBe('Elfo');
    });

    it('com catálogo: select com as raças, "Outra" e o nome da raça vira o valor', () => {
        useStore.setState({ cenario: CATALOGO });
        render(<Campo />);
        const select = screen.getByLabelText('Raça');
        expect(select.tagName).toBe('SELECT');
        expect([...select.options].map(o => o.textContent)).toEqual(['Sem raça', '🐒 Saiyajin', '🧍 Humano', 'Outra (texto livre)']);
        fireEvent.change(select, { target: { value: 'humano' } });
        expect(screen.getByTestId('saida').textContent).toBe('Humano');
        expect(screen.queryByText(/Raça não cadastrada/)).toBeNull();
    });

    it('texto que casa com apelido aparece já selecionado na raça do catálogo', () => {
        useStore.setState({ cenario: CATALOGO });
        render(<Campo inicial="sayajin" />);
        expect(screen.getByLabelText('Raça').value).toBe('saiyajin');
    });

    it('"Outra (texto livre)" mostra o campo de texto e o aviso de raça não cadastrada', () => {
        useStore.setState({ cenario: CATALOGO });
        render(<Campo />);
        fireEvent.change(screen.getByLabelText('Raça'), { target: { value: '__outra__' } });
        fireEvent.change(screen.getByLabelText('Raça (texto livre)'), { target: { value: 'Elfo da Lua' } });
        expect(screen.getByTestId('saida').textContent).toBe('Elfo da Lua');
        expect(screen.getByText('⚠️ Raça não cadastrada — sem acesso a Habilidades de Raça')).toBeTruthy();
    });

    it('raça antiga fora do catálogo abre direto em texto livre com o aviso', () => {
        useStore.setState({ cenario: CATALOGO });
        render(<Campo inicial="Namekuseijin" />);
        expect(screen.getByLabelText('Raça').value).toBe('__outra__');
        expect(screen.getByLabelText('Raça (texto livre)').value).toBe('Namekuseijin');
        expect(screen.getByRole('note').textContent).toMatch(/Raça não cadastrada/);
    });
});
