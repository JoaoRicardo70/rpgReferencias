import React from 'react';
import { render, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';

let souEuMesmoMock = true;
let personagensMock = {};
const adicionarAviso = vi.fn();
const enviarEnsinamento = vi.fn(() => Promise.resolve({ ok: true }));
vi.mock('../Ficha Def/FichaAlvoContext', () => ({
    useFichaAtiva: () => ({ nome: 'Prof', souEuMesmo: souEuMesmoMock }),
}));
vi.mock('../../stores/useStore', () => ({
    default: (sel) => sel({ personagens: personagensMock, adicionarAviso }),
    sanitizarNome: (n) => String(n || ''),
}));
vi.mock('../../services/ensinar', () => ({ enviarEnsinamento: (...a) => enviarEnsinamento(...a) }));

import EnsinarBotao from './EnsinarBotao';

beforeEach(() => {
    souEuMesmoMock = true;
    personagensMock = { Prof: {}, Aluno: { hierarquia: {} }, Liberado: { hierarquia: { ocular: true, infinity: true } } };
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

const MSG = 'Singularidade é impossível de copiar ou ensinar (regra absoluta da Hierarquia da Alma).';

describe('EnsinarBotao com categorias', () => {
    it('Singularidade: botao desabilitado com o motivo e sem caixa de envio', () => {
        render(<EnsinarBotao tipo="poder" item={{ nome: 'Sing', categoria: 'singularidade' }} />);
        const btn = screen.getByRole('button');
        expect(btn.disabled).toBe(true);
        expect(btn.getAttribute('title')).toBe(MSG);
        expect(screen.getByText(MSG)).toBeTruthy();
        fireEvent.click(btn);
        expect(screen.queryByText('Enviar oferta')).toBeNull();
    });
    it('Singularidade em plural/zero-width tambem trava', () => {
        render(<EnsinarBotao tipo="poder" item={{ nome: 'Sing', categoria: 'Singularidades​' }} />);
        expect(screen.getByRole('button').disabled).toBe(true);
    });
    it('tecnica com categoria singularidade nao trava (so tipo poder)', () => {
        render(<EnsinarBotao tipo="tecnica" item={{ nome: 'T', categoria: 'singularidade' }} />);
        expect(screen.getByRole('button').disabled).toBe(false);
    });
    it('Infinity e copiavel: botao habilitado', () => {
        render(<EnsinarBotao tipo="poder" item={{ nome: 'Inf', categoria: 'infinity' }} />);
        expect(screen.getByRole('button', { name: /Ensinar/ }).disabled).toBe(false);
    });
    it('nao renderiza se nao for o proprio personagem', () => {
        souEuMesmoMock = false;
        const { container } = render(<EnsinarBotao tipo="poder" item={{ nome: 'Inf', categoria: 'infinity' }} />);
        expect(container.textContent).toBe('');
    });
    it('aviso ao professor (sem bloquear) quando aluno nao tem a categoria liberada', async () => {
        render(<EnsinarBotao tipo="poder" item={{ nome: 'Olho', categoria: 'ocular' }} />);
        fireEvent.click(screen.getByText(/🎓 Ensinar/));
        fireEvent.click(screen.getByLabelText(/Aluno/, { selector: 'input' }));
        expect(screen.getByText(/ainda não tem esta categoria liberada/)).toBeTruthy();
        const enviar = screen.getByText('Enviar oferta');
        expect(enviar.disabled).toBe(false);
        fireEvent.click(enviar);
        await waitFor(() => expect(enviarEnsinamento).toHaveBeenCalledTimes(1));
        expect(enviarEnsinamento.mock.calls[0][0].alunos).toEqual(['Aluno']);
    });
    it('sem aviso quando o aluno tem a categoria liberada', () => {
        render(<EnsinarBotao tipo="poder" item={{ nome: 'Olho', categoria: 'ocular' }} />);
        fireEvent.click(screen.getByText(/🎓 Ensinar/));
        fireEvent.click(screen.getByLabelText(/Liberado/, { selector: 'input' }));
        expect(screen.queryByText(/ainda não/)).toBeNull();
    });
    it('sem aviso para categoria base mesmo com aluno sem liberacao', () => {
        render(<EnsinarBotao tipo="poder" item={{ nome: 'H', categoria: 'habilidade' }} />);
        fireEvent.click(screen.getByText(/🎓 Ensinar/));
        fireEvent.click(screen.getByLabelText(/Aluno/, { selector: 'input' }));
        expect(screen.queryByText(/ainda não/)).toBeNull();
    });
    it('aviso lista varios alunos no plural', () => {
        personagensMock.Outro = {};
        render(<EnsinarBotao tipo="poder" item={{ nome: 'Inf', categoria: 'infinity' }} />);
        fireEvent.click(screen.getByText(/🎓 Ensinar/));
        fireEvent.click(screen.getByLabelText(/Aluno/, { selector: 'input' }));
        fireEvent.click(screen.getByLabelText(/Outro/, { selector: 'input' }));
        expect(screen.getByText(/Aluno, Outro ainda não têm/)).toBeTruthy();
    });
});
