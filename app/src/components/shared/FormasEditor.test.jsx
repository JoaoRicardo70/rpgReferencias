import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import FormasEditor from './FormasEditor';

afterEach(() => cleanup());

const formas = [{
    id: 'f1', nome: "Susano'o (Fase 1)", acumulaFormaBase: true, efeitos: [], efeitosPassivos: [],
    configs: [{ id: 'c1', nome: 'Padrão', efeitos: [], efeitosPassivos: [] }]
}];

const abrir = () => fireEvent.click(screen.getByRole('button', { name: /FORMAS MÍSTICAS/ }));

describe('FormasEditor', () => {
    it('inativa: botão ATIVAR MODO manda forma e config', () => {
        const onAtivarForma = vi.fn();
        render(<FormasEditor formas={formas} formaAtivaId={null} configAtivaId={null} onAtivarForma={onAtivarForma} />);
        abrir();
        fireEvent.click(screen.getByRole('button', { name: 'ATIVAR MODO' }));
        expect(onAtivarForma).toHaveBeenCalledWith('f1', 'c1');
    });

    it('ativa: vira DESATIVAR MODO e clicar manda null/null', () => {
        const onAtivarForma = vi.fn();
        render(<FormasEditor formas={formas} formaAtivaId="f1" configAtivaId="c1" onAtivarForma={onAtivarForma} />);
        abrir();
        fireEvent.click(screen.getByRole('button', { name: 'DESATIVAR MODO' }));
        expect(onAtivarForma).toHaveBeenCalledWith(null, null);
    });

    it('o editor de efeitos oferece PODER DIRETO com as propriedades de multiplicador', () => {
        render(<FormasEditor formas={formas} formaAtivaId={null} configAtivaId={null} onSalvarForma={() => {}} onAtivarForma={() => {}} />);
        abrir();
        fireEvent.click(screen.getByRole('button', { name: 'EDITAR' }));
        const selects = screen.getAllByRole('combobox');
        const atributo = selects[0];
        expect(Array.from(atributo.querySelectorAll('option')).map(o => o.value)).toContain('poder_direto');
        fireEvent.change(atributo, { target: { value: 'poder_direto' } });
        const props = Array.from(screen.getAllByRole('combobox')[1].querySelectorAll('option')).map(o => o.value);
        ['mbase', 'mgeral', 'mformas', 'mabs', 'munico'].forEach(p => expect(props).toContain(p));
    });
});
