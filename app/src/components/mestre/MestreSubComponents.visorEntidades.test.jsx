import React from 'react';
import { render, screen, within, cleanup, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MestreVisorJogadores } from './MestreSubComponents';
import * as MestreFormContext from './MestreFormContext';
import useStore from '../../stores/useStore';

// ---------------------------------------------------------------------------
// QA — MestreSubComponents.jsx > MestreVisorJogadores: 3 mudanças de comportamento
// no Visor de Entidades feitas nesta sessão:
//
// 1) BUG FIX: o modal "GRIMÓRIO: {nome}" (aberto por "📖 ABRIR FICHA") deixou de
//    guardar o objeto `jogador` inteiro (uma "foto" congelada no instante do
//    clique) e passou a guardar só o NOME, derivando os dados exibidos ao vivo
//    via `jogadoresComStats.find(j => j.nome === nomeInspecionado)` a cada
//    render. Isso corrige o modal ficar parado num instantâneo antigo quando a
//    ficha do personagem muda enquanto o Grimório está aberto.
//
// 2) OTIMIZAÇÃO: o card de cada entidade virou um `EntidadeCard` memoizado
//    (React.memo) de escopo de módulo, extraído do antigo `renderCard` que era
//    redefinido a cada render do Visor.
//
// 3) NOVA FEATURE: campo de busca (placeholder "🔍 Buscar por nome...") acima
//    das abas Jogadores/NPCs, filtrando ambas as listas por substring
//    case-insensitive de `jogador.nome`.
//
// Mocka `./MestreFormContext` (useMestreForm) e `./PainelMestreSandbox`
// (irrelevante pra estes testes, e evita puxar getDatabase()/useStore próprios
// dele), no mesmo padrão de MestreSubComponents.coMestreButton.test.jsx. Mocka
// também `../../stores/useStore` porque agora MestreVisorJogadores assina
// `useStore(s => s.personagens)`/`useStore(s => s.minhaFicha)` diretamente
// (usado só pro cálculo de condicoesGlobais, mockado como [] via
// PainelMestreSandbox).
// ---------------------------------------------------------------------------

vi.mock('./MestreFormContext', async (importOriginal) => {
    const actual = await importOriginal();
    return { ...actual, useMestreForm: vi.fn() };
});

vi.mock('./PainelMestreSandbox', () => ({ default: () => null, TODAS_CONDICOES_BASE: [] }));

vi.mock('../../stores/useStore', async (importOriginal) => {
    const actual = await importOriginal();
    const mockHook = vi.fn();
    // core/attributes.js > getEfeitosDeClasse chama `useStore.getState()` direto
    // (fora de qualquer componente) pra ler overrides de classe do compêndio --
    // como o hook mockado é uma vi.fn() "pelada", precisa expor `.getState()`
    // manualmente (igual o hook de verdade do Zustand faz) ou getStatusLimpo
    // (chamado dentro de EntidadeCard) quebra com "getState is not a function".
    mockHook.getState = vi.fn(() => ({ isMestre: false, minhaFicha: null, personagens: {} }));
    return { ...actual, default: mockHook };
});

function statBase(base) {
    return { base, mBase: 1.0, mGeral: 1.0, mFormas: 1.0, mUnico: '1.0', mAbsoluto: 1.0 };
}

function fichaMinima(overrides = {}) {
    return {
        bio: { classe: 'guerreiro' },
        vida: { ...statBase(1000), atual: 800 },
        mana: { ...statBase(100), atual: 80 },
        aura: { ...statBase(100), atual: 80 },
        chakra: { ...statBase(100), atual: 80 },
        corpo: { ...statBase(100), atual: 80 },
        forca: statBase(10), destreza: statBase(10), inteligencia: statBase(10),
        sabedoria: statBase(10), energiaEsp: statBase(10), carisma: statBase(10),
        stamina: statBase(10), constituicao: statBase(10),
        ...overrides,
    };
}

function montarCtx(jogadoresComStats, extra = {}) {
    MestreFormContext.useMestreForm.mockReturnValue({
        jogadoresComStats,
        meuNome: 'Aria',
        userLogado: 'Aria',
        handleApagarJogador: vi.fn(),
        fmt: (n) => String(n),
        toggleCoMestre: vi.fn(),
        mesaCriador: 'Aria',
        mesaMestres: {},
        ...extra,
    });
}

// Localiza o card (o <div> que contém o nome e os botões) dado o nome exibido,
// pra poder consultar/clicar dentro dele sem confundir com outros cards.
function pegarCard(nome) {
    const titulo = screen.getByText(nome, { selector: 'strong' });
    // O card é o ancestral com os 3 botões de ação (ABRIR FICHA/PROMOVER/APAGAR).
    return titulo.closest('div[style*="position: relative"]');
}

describe('MestreSubComponents — MestreVisorJogadores > Visor de Entidades', () => {
    afterEach(() => {
        cleanup();
        vi.clearAllMocks();
    });

    beforeEach(() => {
        // useStore(s => s.personagens) / useStore(s => s.minhaFicha) só alimentam o
        // useMemo de condicoesGlobais (TODAS_CONDICOES_BASE já mockado como []) --
        // um estado fixo e estável é suficiente e mantém a referência do useMemo
        // igual entre renders (importante pro teste de memoização do card).
        const mockState = { personagens: {}, minhaFicha: null };
        useStore.mockImplementation((selector) => (typeof selector === 'function' ? selector(mockState) : mockState));
    });

    // -----------------------------------------------------------------------
    // 1) REGRESSÃO DO BUG: modal do Grimório reflete dados AO VIVO
    // -----------------------------------------------------------------------
    it('regressão: se jogadoresComStats mudar DEPOIS do modal aberto, o Grimório mostra o valor NOVO, não o congelado no clique', () => {
        const jogadorV1 = { nome: 'Aria', ficha: fichaMinima({ forca: statBase(10) }), classId: 'guerreiro', percHp: 80 };
        montarCtx([jogadorV1]);

        const { rerender } = render(<MestreVisorJogadores />);

        fireEvent.click(within(pegarCard('Aria')).getByRole('button', { name: /ABRIR FICHA/i }));

        expect(screen.getByText('📖 GRIMÓRIO: Aria', { exact: false })).toBeDefined();
        // Escopa no bloco do atributo FOR (força) do grid do Grimório -- outros
        // atributos (destreza, inteligência etc.) também valem 10 por padrão em
        // fichaMinima(), então buscar "10" solto no documento inteiro é ambíguo.
        const blocoForca = () => screen.getByText('for').closest('div');
        expect(within(blocoForca()).getByText('10')).toBeDefined();

        // Simula o listener do Firebase recalculando jogadoresComStats do zero (novo
        // objeto de ficha, mesmo nome) enquanto o modal segue aberto -- exatamente o
        // cenário do bug relatado (equipar item / subir Ascensão / regenerar com o
        // Grimório aberto).
        const jogadorV2 = { nome: 'Aria', ficha: fichaMinima({ forca: statBase(99) }), classId: 'guerreiro', percHp: 60 };
        montarCtx([jogadorV2]);
        rerender(<MestreVisorJogadores />);

        expect(screen.getByText('📖 GRIMÓRIO: Aria', { exact: false })).toBeDefined();
        expect(within(blocoForca()).queryByText('10')).toBeNull();
        expect(within(blocoForca()).getByText('99')).toBeDefined();
    });

    // -----------------------------------------------------------------------
    // 2) OTIMIZAÇÃO: EntidadeCard memoizado não recalcula/re-renderiza por
    //    mudanças de estado NÃO relacionadas (abrir ficha de outra entidade,
    //    digitar na busca sem afetar a lista filtrada).
    // -----------------------------------------------------------------------
    it('EntidadeCard memoizado: abrir a ficha de OUTRA entidade não re-renderiza os cards (fmt não é chamado de novo)', () => {
        const fmtSpy = vi.fn((n) => String(n));
        const aria = { nome: 'Aria', ficha: fichaMinima(), classId: 'guerreiro', percHp: 80 };
        const bruno = { nome: 'Bruno', ficha: fichaMinima({ vida: { ...statBase(2000), atual: 1500 } }), classId: 'mago', percHp: 90 };
        montarCtx([aria, bruno], { fmt: fmtSpy });

        const { rerender } = render(<MestreVisorJogadores />);
        const chamadasAntes = fmtSpy.mock.calls.length;
        expect(chamadasAntes).toBeGreaterThan(0);

        // Abre a ficha do Bruno -- muda `nomeInspecionado` no pai, mas essa prop
        // NUNCA é repassada aos EntidadeCard (só usada pra derivar o conteúdo do
        // modal), então nenhum card deveria re-renderizar/recalcular.
        fireEvent.click(within(pegarCard('Bruno')).getByRole('button', { name: /ABRIR FICHA/i }));

        expect(fmtSpy.mock.calls.length).toBe(chamadasAntes);

        // Continua funcionalmente correto: o card da Aria não sumiu nem trocou de
        // dado, e o botão dela ainda abre a ficha DELA (não a do Bruno).
        expect(within(pegarCard('Aria')).getByText(/HP:/)).toBeDefined();
        fireEvent.click(screen.getByText('✕'));
        fireEvent.click(within(pegarCard('Aria')).getByRole('button', { name: /ABRIR FICHA/i }));
        expect(screen.getByText('📖 GRIMÓRIO: Aria', { exact: false })).toBeDefined();

        // Controle negativo: prova que fmtSpy REALMENTE detectaria um re-render se
        // um ocorresse (evita um teste que passaria mesmo se fmt nunca fosse
        // invocado de novo por qualquer motivo). Trocar jogadoresComStats por um
        // novo array/objeto força o Visor inteiro (e seus cards) a recalcular.
        fireEvent.click(screen.getByText('✕'));
        const chamadasAntesControle = fmtSpy.mock.calls.length;
        montarCtx([{ ...aria, ficha: fichaMinima({ vida: { ...statBase(1000), atual: 1 } }) }, bruno], { fmt: fmtSpy });
        rerender(<MestreVisorJogadores />);
        expect(fmtSpy.mock.calls.length).toBeGreaterThan(chamadasAntesControle);
    });

    it('EntidadeCard memoizado: digitar na busca (sem alterar a lista filtrada) não re-renderiza os cards já visíveis', () => {
        const fmtSpy = vi.fn((n) => String(n));
        const aria = { nome: 'Aria', ficha: fichaMinima(), classId: 'guerreiro', percHp: 80 };
        const bruno = { nome: 'Bruno', ficha: fichaMinima({ vida: { ...statBase(2000), atual: 1500 } }), classId: 'mago', percHp: 90 };
        montarCtx([aria, bruno], { fmt: fmtSpy });

        render(<MestreVisorJogadores />);
        const chamadasAntes = fmtSpy.mock.calls.length;

        const busca = screen.getByPlaceholderText('🔍 Buscar por nome...');
        // "r" está presente em "Aria" e "Bruno" -- ambos continuam na lista
        // filtrada, então nenhum dos dois cards deveria re-renderizar.
        fireEvent.change(busca, { target: { value: 'r' } });

        expect(fmtSpy.mock.calls.length).toBe(chamadasAntes);
        expect(pegarCard('Aria')).toBeTruthy();
        expect(pegarCard('Bruno')).toBeTruthy();
    });

    // -----------------------------------------------------------------------
    // 3) NOVA FEATURE: busca por nome filtra Jogadores e NPCs
    // -----------------------------------------------------------------------
    it('busca por nome filtra tanto jogadores quanto NPCs (case-insensitive, substring), e limpar a busca mostra todos de novo', () => {
        const aria = { nome: 'Aria', ficha: fichaMinima(), classId: 'guerreiro', percHp: 80 };
        const bruno = { nome: 'Bruno', ficha: fichaMinima(), classId: 'mago', percHp: 90 };
        const npc = { nome: 'Grosseiro', ficha: fichaMinima({ isNPC: true, bio: { classe: 'NPC - Ameaça', mesa: 'npc' } }), classId: 'NPC - Ameaça', percHp: 100 };
        montarCtx([aria, bruno, npc]);

        render(<MestreVisorJogadores />);

        // Estado inicial (sem busca): aba Jogadores mostra os 2 heróis; contadores
        // das abas refletem 2 jogadores e 1 NPC.
        expect(pegarCard('Aria')).toBeTruthy();
        expect(pegarCard('Bruno')).toBeTruthy();
        expect(screen.getByRole('button', { name: /JOGADORES \(2\)/i })).toBeDefined();
        expect(screen.getByRole('button', { name: /NPCs \(1\)/i })).toBeDefined();

        const busca = screen.getByPlaceholderText('🔍 Buscar por nome...');
        fireEvent.change(busca, { target: { value: 'ARIA' } }); // maiúsculo de propósito: case-insensitive

        // Só "Aria" corresponde -- some da lista de jogadores o "Bruno", e a
        // contagem de NPCs cai a 0 (o NPC "Grosseiro" também é filtrado).
        expect(pegarCard('Aria')).toBeTruthy();
        expect(screen.queryByText('Bruno', { selector: 'strong' })).toBeNull();
        expect(screen.getByRole('button', { name: /JOGADORES \(1\)/i })).toBeDefined();
        expect(screen.getByRole('button', { name: /NPCs \(0\)/i })).toBeDefined();

        // Limpar a busca restaura as duas listas por completo.
        fireEvent.change(busca, { target: { value: '' } });

        expect(pegarCard('Aria')).toBeTruthy();
        expect(pegarCard('Bruno')).toBeTruthy();
        expect(screen.getByRole('button', { name: /JOGADORES \(2\)/i })).toBeDefined();
        expect(screen.getByRole('button', { name: /NPCs \(1\)/i })).toBeDefined();
    });
});
