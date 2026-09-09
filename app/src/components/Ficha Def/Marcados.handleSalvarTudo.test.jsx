import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import MarcadosPanel from './Marcados';
import useStore from '../../stores/useStore';
import { salvarFirebaseImediato } from '../../services/firebase-sync';

// ---------------------------------------------------------------------------
// QA — Regressão pega em revisão de código: o botão manual "Guardar Ficha"
// mudava pra "✅ Guardado!" NO INSTANTE do clique, antes mesmo da escrita no
// Firebase começar (o antigo callSave/salvarFirebaseImediato() não era
// aguardado) -- uma confirmação de sucesso mentirosa. Corrigido trocando o
// booleano "salvando" por uma máquina de 4 estados (estadoSalvar: 'idle' |
// 'salvando' | 'salvo' | 'erro') e um handleSalvarTudo que só marca sucesso
// DEPOIS de `await salvarFirebaseImediato()` resolver de verdade, e marca
// 'erro' (não sucesso) se a Promise rejeitar.
//
// tentativaSalvarRef existe pra resolver uma segunda regressão sutil: cada
// chamada de handleSalvarTudo agenda um setTimeout (1500ms em sucesso, 3000ms
// em erro) pra voltar sozinho a 'idle'. Sem o guard `tentativaSalvarRef.current
// === minhaTentativa`, se o usuário clicar "Guardar Ficha" de novo ENQUANTO o
// setTimeout de uma tentativa anterior ainda não disparou, esse timeout
// "fantasma" da tentativa antiga dispararia por cima da tentativa nova e
// forçaria o estado de volta a 'idle' mesmo com a segunda gravação ainda em
// andamento (ou já concluída num estado diferente) -- fazendo o botão mentir
// de novo, agora na direção oposta (mostrando "Guardar Ficha" como se nada
// estivesse acontecendo enquanto uma gravação real ainda está em curso).
// ---------------------------------------------------------------------------

vi.mock('../../stores/useStore');
vi.mock('../../services/firebase-sync', () => ({
    uploadImagem: vi.fn(),
    salvarFichaSilencioso: vi.fn(),
    salvarFirebaseImediato: vi.fn(() => Promise.resolve()),
    salvarDivisorPoderMesa: vi.fn(),
}));

function fichaBase(overrides = {}) {
    return {
        vida: { base: 0 }, mana: { base: 0 }, aura: { base: 0 }, chakra: { base: 0 }, corpo: { base: 0 },
        forca: { base: 0 }, destreza: { base: 0 }, inteligencia: { base: 0 }, sabedoria: { base: 0 },
        energiaEsp: { base: 0 }, carisma: { base: 0 }, stamina: { base: 0 }, constituicao: { base: 0 },
        ascensaoBase: 1, divisores: {}, bio: {}, estetica: {}, labels: {}, statusPool: 0,
        poderes: [], inventario: [], seresSelados: [],
        ...overrides,
    };
}

function montarMockUseStore(ficha, extra = {}) {
    const mockState = {
        minhaFicha: ficha,
        updateFicha: vi.fn((callback) => callback(ficha)),
        meuNome: 'Testador',
        importarDaAbaStatus: vi.fn(),
        isMestre: false,
        divisorPoderMesa: 1,
        setDivisorPoderMesa: vi.fn(),
        ...extra,
    };
    useStore.mockImplementation((selector) => (selector ? selector(mockState) : mockState));
    return mockState;
}

// Cria uma Promise "controlável" de fora: o teste decide exatamente quando ela
// resolve/rejeita, simulando uma escrita no Firebase que ainda está em voo.
function criarPromiseControlavel() {
    let resolver, rejeitar;
    const promise = new Promise((res, rej) => { resolver = res; rejeitar = rej; });
    return { promise, resolver, rejeitar };
}

function botaoGuardar() {
    // O texto muda conforme o estado, então buscamos pelo botão que contém
    // qualquer uma das 4 variantes possíveis do rótulo "Guardar".
    return screen.getByText((conteudo) => /Guardar Ficha|Guardando\.\.\.|Guardado!|Erro ao Guardar!/.test(conteudo)).closest('button');
}

describe('MarcadosPanel — handleSalvarTudo (botão "Guardar Ficha" com estado honesto)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
        window.confirm = vi.fn(() => true);
        window.alert = vi.fn();
    });

    afterEach(() => {
        cleanup();
        vi.useRealTimers();
    });

    it('mostra "⏳ Guardando..." e desabilita o botão enquanto salvarFirebaseImediato ainda não resolveu', async () => {
        const { promise } = criarPromiseControlavel();
        salvarFirebaseImediato.mockReturnValue(promise);
        montarMockUseStore(fichaBase());
        render(<MarcadosPanel />);

        const btnAntes = botaoGuardar();
        expect(btnAntes.textContent).toContain('💾 Guardar Ficha');
        expect(btnAntes.disabled).toBe(false);

        await act(async () => {
            fireEvent.click(btnAntes);
        });

        const btnDurante = botaoGuardar();
        expect(btnDurante.textContent).toContain('⏳ Guardando...');
        expect(btnDurante.disabled).toBe(true);
    });

    it('mostra "✅ Guardado!" só DEPOIS que a Promise resolve de verdade, e volta sozinho a "Guardar Ficha" após 1500ms', async () => {
        const { promise, resolver } = criarPromiseControlavel();
        salvarFirebaseImediato.mockReturnValue(promise);
        montarMockUseStore(fichaBase());
        render(<MarcadosPanel />);

        await act(async () => {
            fireEvent.click(botaoGuardar());
        });
        expect(botaoGuardar().textContent).toContain('⏳ Guardando...');

        await act(async () => {
            resolver();
            await promise;
        });

        expect(botaoGuardar().textContent).toContain('✅ Guardado!');
        expect(botaoGuardar().disabled).toBe(false);

        await act(async () => {
            vi.advanceTimersByTime(1500);
        });

        expect(botaoGuardar().textContent).toContain('💾 Guardar Ficha');
    });

    it('mostra "⚠️ Erro ao Guardar!" (não um falso sucesso) quando salvarFirebaseImediato rejeita, e volta sozinho a "Guardar Ficha" após 3000ms', async () => {
        const { promise, rejeitar } = criarPromiseControlavel();
        salvarFirebaseImediato.mockReturnValue(promise);
        montarMockUseStore(fichaBase());
        render(<MarcadosPanel />);

        await act(async () => {
            fireEvent.click(botaoGuardar());
        });
        expect(botaoGuardar().textContent).toContain('⏳ Guardando...');

        await act(async () => {
            rejeitar(new Error('Falha simulada de rede'));
            await promise.catch(() => {});
        });

        expect(botaoGuardar().textContent).toContain('⚠️ Erro ao Guardar!');
        expect(botaoGuardar().disabled).toBe(false);

        await act(async () => {
            vi.advanceTimersByTime(3000);
        });

        expect(botaoGuardar().textContent).toContain('💾 Guardar Ficha');
    });

    // 🎯 Este é o teste que reproduz a regressão que tentativaSalvarRef existe pra evitar. Sem o
    // guard `tentativaSalvarRef.current === minhaTentativa` dentro do setTimeout, o passo
    // "avança 1500ms" abaixo dispararia o timeout FANTASMA da PRIMEIRA tentativa e forçaria o
    // estado de volta a 'idle' -- mesmo com a SEGUNDA gravação ainda genuinamente em andamento
    // ('salvando'). Isso faria o botão mentir de novo (mostrar "Guardar Ficha" como se nada
    // estivesse acontecendo enquanto uma escrita real ainda está em voo, inclusive reabilitando
    // o botão pra um terceiro clique concorrente). Com o guard, o timeout fantasma da tentativa 1
    // percebe que tentativaSalvarRef.current (2) !== minhaTentativa (1) e não faz nada.
    it('RACE CONDITION: um segundo clique iniciado logo após o primeiro "salvo" não é derrubado de volta a idle pelo timeout fantasma da primeira tentativa', async () => {
        const primeira = criarPromiseControlavel();
        const segunda = criarPromiseControlavel();
        salvarFirebaseImediato
            .mockReturnValueOnce(primeira.promise)
            .mockReturnValueOnce(segunda.promise);
        montarMockUseStore(fichaBase());
        render(<MarcadosPanel />);

        // --- Primeiro clique: resolve rápido, chega a 'salvo' e agenda seu setTimeout de 1500ms.
        await act(async () => {
            fireEvent.click(botaoGuardar());
        });
        await act(async () => {
            primeira.resolver();
            await primeira.promise;
        });
        expect(botaoGuardar().textContent).toContain('✅ Guardado!');

        // --- Bem antes dos 1500ms da primeira tentativa vencerem, um SEGUNDO clique começa uma
        // nova gravação (ainda pendente -- não resolve nem rejeita ainda).
        await act(async () => {
            fireEvent.click(botaoGuardar());
        });
        expect(botaoGuardar().textContent).toContain('⏳ Guardando...');

        // --- Avança exatamente os 1500ms da PRIMEIRA tentativa. O timeout fantasma dela dispara
        // agora, mas a segunda gravação ainda está pendente (estado real = 'salvando').
        await act(async () => {
            vi.advanceTimersByTime(1500);
        });

        // Com o guard: continua 'salvando' (a segunda gravação genuína ainda em curso) --
        // o botão NÃO foi yankado de volta pra "Guardar Ficha" nem reabilitado.
        const btnAposTimeoutFantasma = botaoGuardar();
        expect(btnAposTimeoutFantasma.textContent).toContain('⏳ Guardando...');
        expect(btnAposTimeoutFantasma.disabled).toBe(true);

        // --- Agora a segunda gravação conclui de verdade.
        await act(async () => {
            segunda.resolver();
            await segunda.promise;
        });
        expect(botaoGuardar().textContent).toContain('✅ Guardado!');

        // --- E o PRÓPRIO timeout da segunda tentativa (não um fantasma) volta a idle depois de
        // seus próprios 1500ms -- prova que o guard não quebrou o auto-reset legítimo.
        await act(async () => {
            vi.advanceTimersByTime(1500);
        });
        expect(botaoGuardar().textContent).toContain('💾 Guardar Ficha');
    });
});
