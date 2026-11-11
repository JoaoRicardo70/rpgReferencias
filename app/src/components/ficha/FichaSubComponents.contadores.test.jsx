import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { FichaCondicoesEElementais } from './FichaSubComponents';
import { useFichaForm } from './FichaFormContext';

// Os Contadores saíram da página 3 do Grimório: agora são criados dentro de cada poder (components/poderes/ContadoresDoPoder.jsx)
// e resumidos na aba Ficha (components/Ficha Def/ContadoresResumo.jsx). Aqui só garantimos que a página de Estados não os mostra mais.
vi.mock('./FichaFormContext', async (importOriginal) => {
    const actual = await importOriginal();
    return { ...actual, useFichaForm: vi.fn() };
});

describe('FichaCondicoesEElementais — sem a seção Contadores', () => {
    afterEach(() => { cleanup(); });

    it('não mostra mais "🔢 Contadores" nem "+ Contador", mesmo com contadores na ficha; o resto da página segue', () => {
        useFichaForm.mockReturnValue({
            minhaFicha: { contadores: [{ id: 'a', nome: 'Arco', valor: 0, min: 0, max: 3 }], poderes: [], condicoes: [] },
            modificarCondicao: vi.fn(), removerBuffTemporario: vi.fn(), toggleAfinidade: vi.fn(),
            condicoesDinamicas: [], elementosDinamicos: [], adicionarReducaoDano: vi.fn(),
        });
        render(<FichaCondicoesEElementais />);
        expect(screen.queryByText('🔢 Contadores')).toBeNull();
        expect(screen.queryByText('+ Contador')).toBeNull();
        expect(screen.queryByLabelText('Nome do contador')).toBeNull();
        expect(screen.getByText(/Estados & Afinidades/)).toBeTruthy();
    });
});
