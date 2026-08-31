import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FichaBioGroup } from './FichaSubComponents';
import { useFichaForm } from './FichaFormContext';

// ---------------------------------------------------------------------------
// QA — Regressão: FichaBioGroup usava `setSubClasse` (o setter de estado do
// dropdown "Classe Mística") em 3 handlers de onChange sem nunca destructurá-lo
// de `useFichaForm()` — o contexto de fato EXPÕE `setSubClasse` (ver
// FichaFormContext.jsx linha ~429), só faltava na lista de destructuring da
// linha 38 deste arquivo. Isso derrubava a renderização inteira do app com
// `ReferenceError: setSubClasse is not defined` assim que o jogador trocava a
// Classe Mística pra qualquer opção diferente de "Alter Ego"/"Pretender"
// (o branch que NÃO usa mudarSubClasseDireto). Encontrado via auditoria
// `eslint --rule no-undef` no projeto inteiro.
// ---------------------------------------------------------------------------

vi.mock('./FichaFormContext', async (importOriginal) => {
    const actual = await importOriginal();
    return { ...actual, useFichaForm: vi.fn() };
});

function montarCtx(overrides = {}) {
    return {
        minhaFicha: { seresSelados: [] },
        isGrand: false,
        grandIcone: '',
        classe: '',
        mesa: 'presente',
        setMesa: vi.fn(),
        comitarBio: vi.fn(),
        raca: '',
        setRaca: vi.fn(),
        setClasse: vi.fn(),
        subClasse: '',
        setSubClasse: vi.fn(),
        alterEgoSlot1: '',
        alterEgoSerId: '',
        setAlterEgoSlot1: vi.fn(),
        setAlterEgoSerId: vi.fn(),
        mudarSubClasseDireto: vi.fn(),
        descansoLongoPretender: false,
        classesMemorizadas: [],
        toggleMemoriaPretender: vi.fn(),
        idade: '', setIdade: vi.fn(),
        fisico: '', setFisico: vi.fn(),
        sangue: '', setSangue: vi.fn(),
        alinhamento: '', setAlinhamento: vi.fn(),
        afiliacao: '', setAfiliacao: vi.fn(),
        dinheiro: '', setDinheiro: vi.fn(),
        salvandoBio: false,
        salvarBio: vi.fn(),
        ...overrides,
    };
}

describe('FichaBioGroup — trocar a Classe Mística não lança ReferenceError', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        cleanup();
    });

    it('trocar para uma classe regular (ex: Saber) chama setSubClasse(\'\') sem lançar erro', () => {
        const ctx = montarCtx();
        useFichaForm.mockReturnValue(ctx);
        render(<FichaBioGroup />);

        const selectClasse = screen.getByDisplayValue('Nenhuma / Mundano');
        expect(() => fireEvent.change(selectClasse, { target: { value: 'saber' } })).not.toThrow();

        expect(ctx.setClasse).toHaveBeenCalledWith('saber');
        expect(ctx.setSubClasse).toHaveBeenCalledWith('');
        expect(ctx.comitarBio).toHaveBeenCalledWith({ classe: 'saber', subClasse: '' });
    });

    it('trocar para "Alter Ego" NÃO chama setSubClasse (fica só em comitarBio), sem lançar erro', () => {
        const ctx = montarCtx();
        useFichaForm.mockReturnValue(ctx);
        render(<FichaBioGroup />);

        const selectClasse = screen.getByDisplayValue('Nenhuma / Mundano');
        expect(() => fireEvent.change(selectClasse, { target: { value: 'alterego' } })).not.toThrow();

        expect(ctx.setClasse).toHaveBeenCalledWith('alterego');
        expect(ctx.setSubClasse).not.toHaveBeenCalled();
        expect(ctx.comitarBio).toHaveBeenCalledWith({ classe: 'alterego' });
    });

    it('dentro do painel de Dualidade do Alter Ego, trocar o Fragmento Fixo (Slot 1) também usa setSubClasse sem lançar erro', () => {
        const ctx = montarCtx({ classe: 'alterego', subClasse: 'saber', alterEgoSlot1: 'saber' });
        useFichaForm.mockReturnValue(ctx);
        render(<FichaBioGroup />);

        const selectSlot1 = screen.getByDisplayValue('⚔️ Saber');
        expect(() => fireEvent.change(selectSlot1, { target: { value: 'lancer' } })).not.toThrow();

        expect(ctx.setAlterEgoSlot1).toHaveBeenCalledWith('lancer');
        expect(ctx.setSubClasse).toHaveBeenCalledWith('lancer');
    });
});
