import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import ClassificacaoPanel from './ClassificacaoPanel';
import useStore from '../../stores/useStore';

// ---------------------------------------------------------------------------
// QA — Regressão: os campos de texto da "Hierarquia da Alma" (Nome/Descrição de
// Poder, Infinity e Singularidade) ficavam presos num useState local (hTextos),
// só propagando pra minhaFicha.hierarquia quando o usuário clicava no botão
// dedicado "💾 SALVAR CLASSIFICAÇÃO NA ALMA". O botão "💾 Guardar Ficha" (na tela
// principal da Ficha) e o onBlur dos próprios campos (que chama
// salvarFichaSilencioso) nunca capturavam essas edições, porque a ficha em si
// nunca tinha sido alterada — dando a impressão de "nunca salva".
//
// Agora cada onChange já propaga direto pra minhaFicha.hierarquia (via
// atualizarTextoHierarquia -> updateFicha), no mesmo padrão usado pelo resto da
// Ficha — então tanto o onBlur quanto o "Guardar Ficha" da tela principal
// funcionam corretamente sem depender do botão dedicado.
// ---------------------------------------------------------------------------

vi.mock('../../stores/useStore');
vi.mock('../../services/firebase-sync', () => ({
    salvarFichaSilencioso: vi.fn(),
}));

function montarMockUseStore(ficha, extra = {}) {
    const mockState = {
        minhaFicha: ficha,
        updateFicha: vi.fn((callback) => callback(ficha)),
        isMestre: true,
        ...extra,
    };
    useStore.mockImplementation((selector) => (selector ? selector(mockState) : mockState));
    return mockState;
}

describe('ClassificacaoPanel — persistência dos textos de Hierarquia (Poder/Infinity/Singularidade)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        cleanup();
    });

    it('editar o Nome da Singularidade já propaga pra minhaFicha.hierarquia.singularidadeNome imediatamente (não só ao clicar em Salvar)', () => {
        const ficha = { hierarquia: { singularidade: '3' } };
        const mockState = montarMockUseStore(ficha);
        render(<ClassificacaoPanel />);

        const inputNome = screen.getByPlaceholderText('Nome da Singularidade (Ex: All For One)');
        fireEvent.change(inputNome, { target: { value: 'Domínio das Sombras' } });

        expect(mockState.updateFicha).toHaveBeenCalled();
        expect(ficha.hierarquia.singularidadeNome).toBe('Domínio das Sombras');
    });

    it('editar a Descrição da Singularidade também propaga imediatamente pra ficha', () => {
        const ficha = { hierarquia: { singularidade: '3' } };
        montarMockUseStore(ficha);
        render(<ClassificacaoPanel />);

        const textarea = screen.getByPlaceholderText('Descreva como essa anomalia cósmica quebra as regras do universo...');
        fireEvent.change(textarea, { target: { value: 'Consome a luz de tudo ao redor.' } });

        expect(ficha.hierarquia.singularidadeDesc).toBe('Consome a luz de tudo ao redor.');
    });

    it('editar o Nome do Poder (Categoria 1) propaga pra minhaFicha.hierarquia.poderNome', () => {
        const ficha = { hierarquia: { poder: true } };
        montarMockUseStore(ficha);
        render(<ClassificacaoPanel />);

        const inputNome = screen.getByPlaceholderText('Nome do seu Poder (Ex: Chamas do Purgatório)');
        fireEvent.change(inputNome, { target: { value: 'Chamas da Alma' } });

        expect(ficha.hierarquia.poderNome).toBe('Chamas da Alma');
    });

    it('editar o Nome do Infinity (Categoria 2) propaga pra minhaFicha.hierarquia.infinityNome', () => {
        const ficha = { hierarquia: { infinity: true } };
        montarMockUseStore(ficha);
        render(<ClassificacaoPanel />);

        const inputNome = screen.getByPlaceholderText('Nome do seu Infinity (Ex: Frio Zero Absoluto)');
        fireEvent.change(inputNome, { target: { value: 'Vazio Eterno' } });

        expect(ficha.hierarquia.infinityNome).toBe('Vazio Eterno');
    });

    // Nota: f.hierarquia em si nunca chega vazio/ausente na prática quando um campo de texto
    // está visível — salvarHierarquia() (o toggle de checkbox que liga Poder/Infinity/
    // Singularidade) já garante `if (!f.hierarquia) f.hierarquia = {}` antes de qualquer campo
    // de texto poder aparecer. O cenário real e alcançável é: hierarquia JÁ existe, mas ainda
    // não tem o campo específico sendo editado agora (ex.: acabou de ligar "Poder", ainda não
    // preencheu poderDesc) — exatamente o que este teste cobre.
    it('preenche um campo de texto ainda ausente numa ficha.hierarquia já existente, sem lançar erro', () => {
        const ficha = { hierarquia: { poder: true } }; // hierarquia existe, mas sem poderDesc ainda
        montarMockUseStore(ficha);
        render(<ClassificacaoPanel />);

        const textarea = screen.getByPlaceholderText('Descreva como a ressonância da sua habilidade se manifesta na realidade...');
        expect(() => fireEvent.change(textarea, { target: { value: 'Teste' } })).not.toThrow();
        expect(ficha.hierarquia.poderDesc).toBe('Teste');
    });

    it('jogador comum (isMestre=false) vê os campos de texto desabilitados', () => {
        const ficha = { hierarquia: { singularidade: '3', singularidadeNome: 'Original' } };
        montarMockUseStore(ficha, { isMestre: false });
        render(<ClassificacaoPanel />);

        const inputNome = screen.getByPlaceholderText('Nome da Singularidade (Ex: All For One)');
        expect(inputNome.disabled).toBe(true);
    });

    // Cobertura extra de QA: o requisito implícito de atualizarTextoHierarquia é que
    // desmarcar uma categoria (Poder/Infinity/Singularidade) apenas ESCONDE seus campos —
    // não deve apagar o que já foi digitado em minhaFicha.hierarquia, já que
    // salvarHierarquia() só grava as flags poder/infinity/singularidade, nunca mexe nos
    // campos de texto. Ao marcar a categoria de novo, o texto deve reaparecer — validando
    // o round-trip hTextos <-> ficha.hierarquia feito pelo useEffect que observa
    // minhaFicha?.hierarquia.
    it('desmarcar "Poder" esconde o campo mas preserva o texto na ficha; marcar de novo reexibe o texto (round-trip hTextos/ficha)', () => {
        const ficha = { hierarquia: { poder: true } };
        montarMockUseStore(ficha);
        const { rerender } = render(<ClassificacaoPanel />);

        const descPlaceholder = 'Descreva como a ressonância da sua habilidade se manifesta na realidade...';
        const textarea = screen.getByPlaceholderText(descPlaceholder);
        fireEvent.change(textarea, { target: { value: 'Chamas Eternas' } });
        expect(ficha.hierarquia.poderDesc).toBe('Chamas Eternas');

        // Desmarca a Categoria 1 (Poder) — primeiro checkbox da página.
        const checkboxPoder = screen.getAllByRole('checkbox')[0];
        fireEvent.click(checkboxPoder);

        expect(ficha.hierarquia.poder).toBe(false);
        // O texto digitado sobrevive na ficha mesmo com o campo agora oculto.
        expect(ficha.hierarquia.poderDesc).toBe('Chamas Eternas');

        rerender(<ClassificacaoPanel />);
        expect(screen.queryByPlaceholderText(descPlaceholder)).toBeNull();

        // Marca "Poder" de novo, simulando uma NOVA referência de objeto para
        // minhaFicha.hierarquia (como aconteceria de verdade via Immer/sincronização do
        // Firebase), para exercitar de fato o useEffect que resincroniza hTextos a partir
        // de minhaFicha?.hierarquia — não só o estado local já em memória.
        ficha.hierarquia = { ...ficha.hierarquia, poder: true };
        rerender(<ClassificacaoPanel />);

        const textareaDeVolta = screen.getByPlaceholderText(descPlaceholder);
        expect(textareaDeVolta.value).toBe('Chamas Eternas');
    });

    it('o botão dedicado "SALVAR CLASSIFICAÇÃO NA ALMA" continua funcionando normalmente (redundante, mas não quebra)', () => {
        const ficha = { hierarquia: { singularidade: '3' } };
        const mockState = montarMockUseStore(ficha);
        render(<ClassificacaoPanel />);

        const botao = screen.getByText(/SALVAR CLASSIFICAÇÃO NA ALMA/i);
        fireEvent.click(botao);

        expect(mockState.updateFicha).toHaveBeenCalled();
    });
});
