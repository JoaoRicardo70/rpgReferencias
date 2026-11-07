import React from 'react';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FichaEscudos } from './FichaSubComponents';
import { useFichaForm } from './FichaFormContext';
import { adicionarEscudo, removerEscudo, atualizarEscudo, LIMITE_ESCUDOS } from '../../core/escudos';

// QA (endurecimento) - FichaEscudos: entradas invalidas, limite de 12, clique duplo e fluxo integrado com as funcoes reais do core.
vi.mock('./FichaFormContext', () => ({
    useFichaForm: vi.fn(),
    ATRIBUTO_OPTIONS: [], CLASSES_OPTIONS: [], STATS: [], ENERGIAS: [],
}));

const e = (id, nome, valor, tipo = 'escudo', extra = {}) => ({ id, nome, valor, tipo, ...extra });
const nome = (v) => fireEvent.change(screen.getByLabelText('Nome do escudo'), { target: { value: v } });
const valor = (v) => fireEvent.change(screen.getByLabelText('Valor do escudo'), { target: { value: v } });
const botao = () => screen.getByText('+ Escudo');

beforeEach(() => { vi.clearAllMocks(); });
afterEach(() => cleanup());

describe('FichaEscudos QA - validacao do formulario', () => {
    let fns;
    beforeEach(() => {
        fns = { adicionarEscudoFicha: vi.fn(), removerEscudoFicha: vi.fn(), atualizarEscudoFicha: vi.fn() };
        useFichaForm.mockReturnValue({ minhaFicha: {}, ...fns });
        render(<FichaEscudos />);
    });
    it.each([['0'], ['-5'], ['']])('valor "%s" mantem o botao desabilitado', (v) => {
        nome('Domo'); valor(v);
        expect(botao().disabled).toBe(true);
        fireEvent.click(botao());
        expect(fns.adicionarEscudoFicha).not.toHaveBeenCalled();
    });
    it('nome so com espacos mantem o botao desabilitado', () => {
        nome('    '); valor('100');
        expect(botao().disabled).toBe(true);
    });
    it('valor decimal e aceito pelo formulario (o core trunca) e nome com unicode passa intacto', () => {
        nome('盾 Domo'); valor('99.9');
        expect(botao().disabled).toBe(false);
        fireEvent.click(botao());
        expect(fns.adicionarEscudoFicha).toHaveBeenCalledWith({ nome: '盾 Domo', valor: '99.9', tipo: 'escudo' });
    });
    it('clique duplo no botao adiciona UMA vez so (campos limpos desabilitam o botao)', () => {
        nome('Domo'); valor('100');
        fireEvent.click(botao());
        fireEvent.click(botao());
        expect(fns.adicionarEscudoFicha).toHaveBeenCalledTimes(1);
    });
    it('o campo de nome limita a 40 caracteres', () => {
        expect(screen.getByLabelText('Nome do escudo').maxLength).toBe(40);
    });
});

describe('FichaEscudos QA - lista', () => {
    it('com 12 escudos o formulario de adicionar some; com 11 aparece', () => {
        const doze = Array.from({ length: LIMITE_ESCUDOS }, (_, i) => e(`i${i}`, `E${i}`, 1));
        useFichaForm.mockReturnValue({ minhaFicha: { escudos: doze }, adicionarEscudoFicha: vi.fn(), removerEscudoFicha: vi.fn(), atualizarEscudoFicha: vi.fn() });
        const { unmount } = render(<FichaEscudos />);
        expect(screen.queryByText('+ Escudo')).toBeNull();
        unmount();
        useFichaForm.mockReturnValue({ minhaFicha: { escudos: doze.slice(1) }, adicionarEscudoFicha: vi.fn(), removerEscudoFicha: vi.fn(), atualizarEscudoFicha: vi.fn() });
        render(<FichaEscudos />);
        expect(screen.getByText('+ Escudo')).toBeTruthy();
    });
    it('dados corrompidos (null, valor NaN, texto) nao quebram a renderizacao e o total soma so o valido', () => {
        useFichaForm.mockReturnValue({ minhaFicha: { escudos: [null, e('a', 'Ok', 1500), e('b', 'Ruim', NaN), 'lixo'] }, adicionarEscudoFicha: vi.fn(), removerEscudoFicha: vi.fn(), atualizarEscudoFicha: vi.fn() });
        render(<FichaEscudos />);
        expect(screen.getByText('Ok')).toBeTruthy();
        expect(screen.getByText(/Total: 1\.500/)).toBeTruthy();
    });
    it('sem ctx / sem minhaFicha renderiza nada', () => {
        useFichaForm.mockReturnValue(null);
        const { container } = render(<FichaEscudos />);
        expect(container.innerHTML).toBe('');
    });
    it('editar o valor para o MESMO numero nao chama atualizar; para vazio chama (o core recusa)', () => {
        const atualizar = vi.fn();
        useFichaForm.mockReturnValue({ minhaFicha: { escudos: [e('a', 'Domo', 100)] }, adicionarEscudoFicha: vi.fn(), removerEscudoFicha: vi.fn(), atualizarEscudoFicha: atualizar });
        render(<FichaEscudos />);
        const campo = screen.getByLabelText('Valor de Domo');
        fireEvent.blur(campo);
        expect(atualizar).not.toHaveBeenCalled();
        fireEvent.change(campo, { target: { value: '' } });
        fireEvent.blur(campo);
        expect(atualizar).toHaveBeenCalledWith('a', { valor: '' });
    });
});

describe('FichaEscudos QA - integrado com as funcoes reais do core (ficha mutavel + rerender)', () => {
    function montarIntegrado(inicial = {}) {
        const ficha = { ...inicial };
        const ctx = {
            get minhaFicha() { return ficha; },
            adicionarEscudoFicha: (d) => adicionarEscudo(ficha, d),
            removerEscudoFicha: (id) => removerEscudo(ficha, id),
            atualizarEscudoFicha: (id, p) => atualizarEscudo(ficha, id, p),
        };
        useFichaForm.mockImplementation(() => ({ ...ctx, minhaFicha: ficha }));
        const r = render(<FichaEscudos />);
        return { ficha, rerender: () => r.rerender(<FichaEscudos />) };
    }
    it('adiciona, edita para 0 (remove) e remove o ultimo: a chave escudos nunca fica [] na ficha', () => {
        const { ficha, rerender } = montarIntegrado();
        nome('Domo'); valor('300'); fireEvent.change(screen.getByLabelText('Tipo do escudo'), { target: { value: 'vidaTemporaria' } });
        fireEvent.click(botao());
        rerender();
        expect(ficha.escudos).toHaveLength(1);
        expect(ficha.escudos[0]).toMatchObject({ nome: 'Domo', valor: 300, tipo: 'vidaTemporaria' });
        const campo = screen.getByLabelText('Valor de Domo');
        fireEvent.change(campo, { target: { value: '0' } });
        fireEvent.blur(campo);
        expect('escudos' in ficha).toBe(false);
        rerender();
        nome('Outro'); valor('50'); fireEvent.click(botao()); rerender();
        fireEvent.click(screen.getByLabelText('Remover o escudo Outro'));
        expect('escudos' in ficha).toBe(false);
    });
    it('editar com texto invalido nao altera o valor existente', () => {
        const { ficha } = montarIntegrado({ escudos: [e('a', 'Domo', 100)] });
        const campo = screen.getByLabelText('Valor de Domo');
        fireEvent.change(campo, { target: { value: '' } });
        fireEvent.blur(campo);
        expect(ficha.escudos[0].valor).toBe(100);
    });
});
