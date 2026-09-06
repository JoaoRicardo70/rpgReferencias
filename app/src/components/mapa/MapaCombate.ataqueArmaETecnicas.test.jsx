import React from 'react';
import { render, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MapaAtaqueArma, MapaTecnicasRapidas } from './MapaCombate';
import { AtaqueFormProvider } from '../combate/AtaqueFormContext';
import { PoderesFormProvider } from '../poderes/PoderesFormContext';
import useStore from '../../stores/useStore';
import { salvarDummie, enviarParaFeed } from '../../services/firebase-sync';

// ---------------------------------------------------------------------------
// QA — MapaAtaqueArma e MapaTecnicasRapidas (MapaCombate.jsx): acesso rápido, direto do Mapa,
// ao ataque com a Arma equipada (reusa rolarDano de AtaqueFormContext, mesma trava de Acerto da
// aba Ataque) e ao liga/desliga de Poderes/Formas/Habilidades do Grimório (reusa togglePoder de
// PoderesFormContext) — nenhuma lógica de dano/ativação nova foi escrita, só a superfície de UI.
// ---------------------------------------------------------------------------

vi.mock('../../stores/useStore');
vi.mock('../../core/engine', () => ({ calcularDano: vi.fn(() => ({ dano: 10, letalidade: 0, rolagem: '', rolagemMagica: '', atributosUsados: '', detalheEnergia: '', armaStr: '', detalheConta: '' })) }));
vi.mock('../../services/firebase-sync', () => ({
    salvarFichaSilencioso: vi.fn(),
    salvarFirebaseImediato: vi.fn(() => Promise.resolve()),
    enviarParaFeed: vi.fn(),
    salvarDummie: vi.fn(),
    salvarCenarioCompleto: vi.fn(),
    uploadImagem: vi.fn(() => Promise.resolve('https://exemplo.com/img.png')),
}));

let mockState;
function montarStore(overrides = {}) {
    mockState = {
        minhaFicha: { poderes: [], inventario: [] },
        meuNome: 'Heroi',
        isMestre: true,
        personagens: {},
        updateFicha: vi.fn((callback) => callback(mockState.minhaFicha)),
        setAbaAtiva: vi.fn(),
        abaAtiva: 'aba-mapa',
        feedCombate: [],
        alvoSelecionado: null,
        dummies: {},
        efeitosTemp: [],
        setEfeitosTemp: vi.fn(),
        efeitosTempPassivos: [],
        setEfeitosTempPassivos: vi.fn(),
        poderEditandoId: null,
        setPoderEditandoId: vi.fn(),
        ...overrides,
    };
    useStore.mockImplementation((selector) => (typeof selector === 'function' ? selector(mockState) : mockState));
    return mockState;
}

afterEach(() => cleanup());
beforeEach(() => { vi.clearAllMocks(); window.alert = vi.fn(); });

describe('MapaAtaqueArma — ataque com a arma equipada direto do Mapa', () => {
    it('mostra "Nenhuma arma equipada" quando o inventário não tem arma equipada', () => {
        montarStore({ minhaFicha: { poderes: [], inventario: [] } });
        const { getByText } = render(<AtaqueFormProvider><MapaAtaqueArma /></AtaqueFormProvider>);

        expect(getByText(/Nenhuma arma equipada/i)).toBeTruthy();
    });

    it('mostra o nome da arma equipada quando existe uma no inventário', () => {
        montarStore({
            minhaFicha: { poderes: [], inventario: [{ id: 1, nome: 'Espada Longa', tipo: 'arma', equipado: true }] },
        });
        const { getByText } = render(<AtaqueFormProvider><MapaAtaqueArma /></AtaqueFormProvider>);

        expect(getByText(/Espada Longa/)).toBeTruthy();
    });

    it('botão de atacar fica HABILITADO por padrão quando não há alvo selecionado (podeRolarDano começa true)', () => {
        montarStore({ minhaFicha: { poderes: [], inventario: [] }, alvoSelecionado: null });
        const { getByText } = render(<AtaqueFormProvider><MapaAtaqueArma /></AtaqueFormProvider>);

        const botao = getByText('⚔️ ROLAR DANO');
        expect(botao.disabled).toBe(false);
    });

    it('o checkbox "Ignorar Trava de Acerto" habilita o botão mesmo quando podeRolarDano é falso (mesma trava da aba Ataque)', () => {
        // dummieAlvo presente + nenhum acerto registrado no feed -> podeRolarDano começa falso.
        montarStore({
            minhaFicha: { poderes: [], inventario: [] },
            alvoSelecionado: 'goblin1',
            dummies: { goblin1: { nome: 'Goblin', hpAtual: 10 } },
            feedCombate: [],
        });
        const { getByRole, getByText } = render(<AtaqueFormProvider><MapaAtaqueArma /></AtaqueFormProvider>);

        expect(getByText('ACERTO NECESSÁRIO PRIMEIRO').disabled).toBe(true);

        const checkbox = getByRole('checkbox');
        act(() => { checkbox.click(); });

        expect(getByText('⚔️ ATACAR GOBLIN').disabled).toBe(false);
    });

    it('clicar em ROLAR DANO (habilitado) chama rolarDano e não lança', () => {
        const minhaFicha = {
            poderes: [], inventario: [], passivas: [], ataquesElementais: [],
            mana: { base: 1000000, atual: 1000000 },
            vida: { base: 1000000, atual: 1000000 },
            combate: {}, hierarquia: {},
        };
        montarStore({ minhaFicha, updateFicha: vi.fn((cb) => cb(minhaFicha)), alvoSelecionado: null, dummies: {} });
        const { getByText } = render(<AtaqueFormProvider><MapaAtaqueArma /></AtaqueFormProvider>);

        expect(() => {
            act(() => { getByText('⚔️ ROLAR DANO').click(); });
        }).not.toThrow();
    });

    it('não lança e renderiza null se usado FORA de um AtaqueFormProvider (defensivo)', () => {
        montarStore();
        expect(() => render(<MapaAtaqueArma />)).not.toThrow();
    });

    it('com DUAS armas marcadas como equipado ao mesmo tempo, mostra a PRIMEIRA encontrada (armaEquipada usa .find) e não lança', () => {
        // O modelo de dados não impede, no papel, duas entradas com equipado:true (só a UI da aba
        // Arsenal tenta impedir isso) — armaEquipada (AtaqueFormContext.jsx) usa .find(), então
        // sempre resolve pra uma só (a primeira do array), nunca crasha nem mostra as duas.
        montarStore({
            minhaFicha: {
                poderes: [],
                inventario: [
                    { id: 1, nome: 'Espada Longa', tipo: 'arma', equipado: true },
                    { id: 2, nome: 'Machado Duplo', tipo: 'arma', equipado: true },
                ],
            },
        });
        const { getByText, queryByText } = render(<AtaqueFormProvider><MapaAtaqueArma /></AtaqueFormProvider>);

        expect(getByText(/Arma equipada: Espada Longa/)).toBeTruthy();
        expect(queryByText(/Machado Duplo/)).toBeNull();
    });

    it('clicar em ATACAR com um alvo já Acertado (podeRolarDano true) aplica o dano no dummie via salvarDummie', () => {
        // Mesmo caminho completo do botão "ATACAR"/"ROLAR DANO" da aba Ataque (AtaqueBotoesAcao),
        // agora exercitado a partir do Mapa COM alvo — a suíte anterior só cobria o caminho sem
        // dummieAlvo (nunca passava pelo bloco de aplicar dano no dummie/salvarDummie).
        const minhaFicha = {
            poderes: [], inventario: [], passivas: [], ataquesElementais: [],
            mana: { base: 1000000, atual: 1000000 },
            vida: { base: 1000000, atual: 1000000 },
            combate: {}, hierarquia: {},
        };
        montarStore({
            minhaFicha, updateFicha: vi.fn((cb) => cb(minhaFicha)),
            alvoSelecionado: 'goblin1',
            dummies: { goblin1: { nome: 'Goblin', hpAtual: 50 } },
            // meuUltimoAcerto contra o mesmo alvo -> useEffect de podeRolarDano libera o ataque.
            feedCombate: [{ nome: 'Heroi', tipo: 'acerto', alvoNome: 'Goblin', acertouAlvo: true }],
        });
        const { getByText } = render(<AtaqueFormProvider><MapaAtaqueArma /></AtaqueFormProvider>);

        const botao = getByText('⚔️ ATACAR GOBLIN');
        expect(botao.disabled).toBe(false);

        act(() => { botao.click(); });

        // calcularDano está mockado no topo do arquivo pra sempre devolver dano:10.
        expect(salvarDummie).toHaveBeenCalledWith('goblin1', expect.objectContaining({ hpAtual: 40 }));
        expect(enviarParaFeed).toHaveBeenCalledWith(expect.objectContaining({ tipo: 'dano', dano: 10, alvoNome: 'Goblin' }));
    });

    it('DOCUMENTA (não corrige): clique duplo rápido chama rolarDano duas vezes, sem nenhuma guarda de idempotência', () => {
        // rolarDano (AtaqueFormContext.jsx) é lógica pré-existente, amplamente usada (inclusive
        // pelo botão já existente na aba Ataque) e fora do escopo desta sessão — diferente do
        // lock de "avançar turno" adicionado nesta mesma sessão pro Mapa, rolarDano NÃO tem
        // nenhum guard/debounce contra duplo clique. Este teste apenas comprova e documenta o
        // comportamento (2 chamadas a salvarDummie/enviarParaFeed a partir de UM duplo-clique),
        // pra decisão humana futura sobre se vale a pena adicionar uma trava aqui também.
        const minhaFicha = {
            poderes: [], inventario: [], passivas: [], ataquesElementais: [],
            mana: { base: 1000000, atual: 1000000 },
            vida: { base: 1000000, atual: 1000000 },
            combate: {}, hierarquia: {},
        };
        montarStore({
            minhaFicha, updateFicha: vi.fn((cb) => cb(minhaFicha)),
            alvoSelecionado: 'goblin1',
            dummies: { goblin1: { nome: 'Goblin', hpAtual: 50 } },
            feedCombate: [{ nome: 'Heroi', tipo: 'acerto', alvoNome: 'Goblin', acertouAlvo: true }],
        });
        const { getByText } = render(<AtaqueFormProvider><MapaAtaqueArma /></AtaqueFormProvider>);

        const botao = getByText('⚔️ ATACAR GOBLIN');
        act(() => { botao.click(); botao.click(); });

        expect(salvarDummie).toHaveBeenCalledTimes(2);
        expect(enviarParaFeed).toHaveBeenCalledTimes(2);
        // Como o mock de store não reflete de volta o hpAtual salvo (não há um "banco" real de
        // dummies sendo atualizado entre os dois cliques dentro do mesmo teste), as DUAS chamadas
        // calculam o dano em cima do MESMO hpAtual original (50) — cada uma soltando hpAtual:40 —
        // em vez de encadear 50 -> 40 -> 30. Isso ilustra bem o risco: se os dois cliques
        // acontecerem antes do dummie realmente sincronizar de volta pelo Firebase, o segundo
        // "dano" pode se perder (sobrescrito) ou, dependendo da ordem de chegada, duplicar o
        // efeito no feed de combate mesmo a vida do alvo não caindo duas vezes.
        expect(salvarDummie).toHaveBeenNthCalledWith(1, 'goblin1', expect.objectContaining({ hpAtual: 40 }));
        expect(salvarDummie).toHaveBeenNthCalledWith(2, 'goblin1', expect.objectContaining({ hpAtual: 40 }));
    });
});

describe('MapaTecnicasRapidas — liga/desliga Poderes/Formas/Habilidades do Grimório direto do Mapa', () => {
    it('mostra uma dica quando a ficha não tem nenhum poder criado ainda', () => {
        montarStore({ minhaFicha: { poderes: [] } });
        const { getByText, queryAllByRole } = render(<PoderesFormProvider><MapaTecnicasRapidas /></PoderesFormProvider>);

        expect(getByText(/Nenhuma técnica criada ainda/i)).toBeTruthy();
        expect(queryAllByRole('button').length).toBe(0);
    });

    it('lista um botão por poder/forma/habilidade, marcando visualmente os já ativos', () => {
        montarStore({
            minhaFicha: {
                poderes: [
                    { id: 'p1', nome: 'Bola de Fogo', categoria: 'habilidade', ativa: false },
                    { id: 'p2', nome: 'Forma Berserker', categoria: 'forma', ativa: true },
                ],
            },
        });
        const { getByText } = render(<PoderesFormProvider><MapaTecnicasRapidas /></PoderesFormProvider>);

        expect(getByText('☆ Bola de Fogo')).toBeTruthy();
        expect(getByText('★ Forma Berserker')).toBeTruthy();
    });

    it('clicar num poder chama togglePoder(id) e alterna o estado ativa (mesma função da aba Poderes)', () => {
        const minhaFicha = { poderes: [{ id: 'p1', nome: 'Bola de Fogo', categoria: 'habilidade', ativa: false, vida: {}, mana: {}, aura: {}, chakra: {}, corpo: {} }] };
        montarStore({ minhaFicha, updateFicha: vi.fn((cb) => cb(minhaFicha)) });
        const { getByText } = render(<PoderesFormProvider><MapaTecnicasRapidas /></PoderesFormProvider>);

        act(() => { getByText('☆ Bola de Fogo').click(); });

        expect(minhaFicha.poderes[0].ativa).toBe(true);
    });

    it('não lança e renderiza null se usado FORA de um PoderesFormProvider (defensivo)', () => {
        montarStore();
        expect(() => render(<MapaTecnicasRapidas />)).not.toThrow();
    });

    it('não lança ao renderizar um poder sem "nome" (undefined) nem com nome vazio — chip aparece só com a estrela', () => {
        const minhaFicha = {
            poderes: [
                { id: 'p1', nome: undefined, categoria: 'habilidade', ativa: false, vida: {}, mana: {}, aura: {}, chakra: {}, corpo: {} },
                { id: 'p2', nome: '', categoria: 'habilidade', ativa: true, vida: {}, mana: {}, aura: {}, chakra: {}, corpo: {} },
            ],
        };
        montarStore({ minhaFicha });

        let getAllByRole;
        expect(() => {
            ({ getAllByRole } = render(<PoderesFormProvider><MapaTecnicasRapidas /></PoderesFormProvider>));
        }).not.toThrow();

        const botoes = getAllByRole('button');
        expect(botoes.length).toBe(2);
        expect(botoes[0].textContent.trim()).toBe('☆');
        expect(botoes[1].textContent.trim()).toBe('★');
    });

    it('alterna um poder normalmente mesmo com um alvo selecionado e podeRolarDano (Ataque) falso — toggle de Técnica não depende da trava de Acerto do Mapa', () => {
        // Gap de cobertura apontado no code-review: MapaTecnicasRapidas só lê usePoderesForm()
        // (minhaFicha.poderes, togglePoder) — nunca toca em alvoSelecionado/dummies/feedCombate/
        // podeRolarDano do AtaqueFormContext. Simulamos aqui exatamente o cenário em que o botão
        // de Ataque estaria bloqueado (dummie selecionado, ZERO acerto no feed) e confirmamos que
        // isso não trava nem afeta em nada o toggle da Técnica, renderizada ao lado dele.
        const minhaFicha = {
            poderes: [{ id: 'p1', nome: 'Bola de Fogo', categoria: 'habilidade', ativa: false, vida: {}, mana: {}, aura: {}, chakra: {}, corpo: {} }],
        };
        montarStore({
            minhaFicha, updateFicha: vi.fn((cb) => cb(minhaFicha)),
            alvoSelecionado: 'goblin1',
            dummies: { goblin1: { nome: 'Goblin', hpAtual: 10 } },
            feedCombate: [], // nenhum Acerto ainda -> podeRolarDano (Ataque) começaria falso
        });

        const { getByText } = render(<PoderesFormProvider><MapaTecnicasRapidas /></PoderesFormProvider>);

        act(() => { getByText('☆ Bola de Fogo').click(); });

        expect(minhaFicha.poderes[0].ativa).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// QA — MapaAtaqueArma e MapaTecnicasRapidas MONTADOS JUNTOS, como realmente ficam em
// MapaPanel.jsx (dois <div>s irmãos, cada um com seu próprio Provider — AtaqueFormProvider e
// PoderesFormProvider — mas ambos lendo do MESMO useStore mockado). Não compartilham nenhum
// estado de React entre si; a única coisa em comum é o Zustand por baixo.
// ---------------------------------------------------------------------------
describe('MapaAtaqueArma + MapaTecnicasRapidas juntos no mesmo Mapa (como em MapaPanel.jsx)', () => {
    it('monta os dois ao mesmo tempo sem lançar, e permite ligar uma Técnica e depois Atacar sem nenhuma interferência entre os dois', () => {
        const minhaFicha = {
            poderes: [{ id: 'p1', nome: 'Bola de Fogo', categoria: 'habilidade', ativa: false, vida: {}, mana: {}, aura: {}, chakra: {}, corpo: {} }],
            inventario: [], passivas: [], ataquesElementais: [],
            mana: { base: 1000000, atual: 1000000 },
            vida: { base: 1000000, atual: 1000000 },
            combate: {}, hierarquia: {},
        };
        montarStore({ minhaFicha, updateFicha: vi.fn((cb) => cb(minhaFicha)), alvoSelecionado: null, dummies: {} });

        let utils;
        expect(() => {
            utils = render(
                <>
                    <AtaqueFormProvider><MapaAtaqueArma /></AtaqueFormProvider>
                    <PoderesFormProvider><MapaTecnicasRapidas /></PoderesFormProvider>
                </>
            );
        }).not.toThrow();

        const { getByText } = utils;

        // 1) Liga a Técnica primeiro.
        act(() => { getByText('☆ Bola de Fogo').click(); });
        expect(minhaFicha.poderes[0].ativa).toBe(true);

        // 2) Ataca em seguida (sem alvo -> podeRolarDano começa true) — não deve lançar nem
        //    desfazer o toggle da Técnica feito no passo anterior.
        expect(() => {
            act(() => { getByText('⚔️ ROLAR DANO').click(); });
        }).not.toThrow();

        // Continua true — o clique em Atacar não reverteu nem interferiu no estado da Técnica.
        // (Igual ao restante da suíte, não reafirmamos o rótulo "★" no DOM aqui: o mock de
        // useStore não é um store reativo de verdade, então o componente não re-renderiza sozinho
        // só porque mutamos minhaFicha.poderes[0].ativa por fora — o que já é testado à parte.)
        expect(minhaFicha.poderes[0].ativa).toBe(true);
    });
});
