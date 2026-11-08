import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import useStore from '../../stores/useStore';
import { salvarFichaSilencioso } from '../../services/firebase-sync';
import { TestesFormProvider } from './TestesFormContext';
import { TestesModificadoresGlobais } from './TestesSubComponents';

vi.mock('../../services/firebase-sync', () => ({ enviarParaFeed: vi.fn(), salvarFichaSilencioso: vi.fn() }));

const montar = (extra = {}) => {
    useStore.setState({ minhaFicha: { forca: { base: 100 }, proficienciaBase: 2, ...extra }, meuNome: 'Ana', setAbaAtiva: vi.fn() });
    render(<TestesFormProvider><TestesModificadoresGlobais /></TestesFormProvider>);
};
const campo = (en) => screen.getByLabelText(new RegExp(`Proficiência em ${en}`));

beforeEach(() => vi.clearAllMocks());
afterEach(() => cleanup());

describe('Prof. por energia (editor)', () => {
    it('mostra quatro campos vazios quando a ficha nao tem o campo', () => {
        montar();
        ['Mana', 'Aura', 'Chakra', 'Corpo'].forEach(en => expect(campo(en).value).toBe(''));
        expect(screen.getByText(/Prof\. por energia \(vazio = base\)/)).toBeTruthy();
    });
    it('digitar grava na ficha e salva; esvaziar tudo remove o campo', () => {
        montar();
        fireEvent.change(campo('Mana'), { target: { value: '5' } });
        expect(useStore.getState().minhaFicha.proficienciaPorEnergia).toEqual({ mana: 5 });
        expect(salvarFichaSilencioso).toHaveBeenCalled();
        fireEvent.change(campo('Corpo'), { target: { value: '2' } });
        expect(useStore.getState().minhaFicha.proficienciaPorEnergia).toEqual({ mana: 5, corpo: 2 });
        fireEvent.change(campo('Mana'), { target: { value: '' } });
        fireEvent.change(campo('Corpo'), { target: { value: '' } });
        expect('proficienciaPorEnergia' in useStore.getState().minhaFicha).toBe(false);
        expect(useStore.getState().minhaFicha.proficienciaBase).toBe(2);
    });
    it('mostra o valor ja salvo', () => {
        montar({ proficienciaPorEnergia: { aura: 7 } });
        expect(campo('Aura').value).toBe('7');
    });
});
