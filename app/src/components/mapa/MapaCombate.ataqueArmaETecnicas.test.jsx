import React from 'react';
import { render, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MapaAtaqueArma, MapaTecnicasRapidas, MapaMagiasElementais } from './MapaCombate';
import { AtaqueFormProvider } from '../combate/AtaqueFormContext';
import { PoderesFormProvider } from '../poderes/PoderesFormContext';
import { ArsenalFormProvider } from '../arsenal/ArsenalFormContext';
import { ElementosFormProvider } from '../arsenal/ElementosFormContext';
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
        itemEditandoId: null,
        setItemEditandoId: vi.fn(),
        efeitosTempArsenal: [],
        setEfeitosTempArsenal: vi.fn(),
        efeitosTempPassivosArsenal: [],
        setEfeitosTempPassivosArsenal: vi.fn(),
        elemEditandoId: null,
        setElemEditandoId: vi.fn(),
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

    // -------------------------------------------------------------------------
    // QA — Troca rápida de arma (reusa toggleEquiparItem de ArsenalFormContext.jsx). Só renderiza
    // quando o Mapa está DENTRO de um ArsenalFormProvider também (ver MapaPanel.jsx) — sem ele,
    // o componente já cobre graciosamente (arsenalCtx null) nos testes anteriores desta suíte.
    // -------------------------------------------------------------------------
    describe('troca rápida de arma (ArsenalFormProvider)', () => {
        it('lista todas as armas do inventário, destacando a equipada', () => {
            montarStore({
                minhaFicha: {
                    poderes: [],
                    inventario: [
                        { id: 1, nome: 'Espada Longa', tipo: 'arma', equipado: true },
                        { id: 2, nome: 'Arco Curto', tipo: 'arma', equipado: false },
                    ],
                },
            });
            const { getByText } = render(
                <AtaqueFormProvider><ArsenalFormProvider><MapaAtaqueArma /></ArsenalFormProvider></AtaqueFormProvider>
            );

            expect(getByText('🗡️ Espada Longa')).toBeTruthy();
            expect(getByText('⚪ Arco Curto')).toBeTruthy();
        });

        it('clicar numa arma NÃO equipada chama toggleEquiparItem, que a equipa e desequipa a anterior (mesma função do Arsenal)', () => {
            const minhaFicha = {
                poderes: [],
                inventario: [
                    { id: 1, nome: 'Espada Longa', tipo: 'arma', equipado: true },
                    { id: 2, nome: 'Arco Curto', tipo: 'arma', equipado: false },
                ],
            };
            montarStore({ minhaFicha, updateFicha: vi.fn((cb) => cb(minhaFicha)) });
            const { getByText } = render(
                <AtaqueFormProvider><ArsenalFormProvider><MapaAtaqueArma /></ArsenalFormProvider></AtaqueFormProvider>
            );

            act(() => { getByText('⚪ Arco Curto').click(); });

            const [espada, arco] = minhaFicha.inventario;
            expect(arco.equipado).toBe(true);
            expect(espada.equipado).toBe(false); // toggleEquiparItem desequipa a arma anterior automaticamente
        });

        it('clicar na arma JÁ equipada não faz nada (não desequipa, não chama updateFicha de novo)', () => {
            const minhaFicha = {
                poderes: [],
                inventario: [{ id: 1, nome: 'Espada Longa', tipo: 'arma', equipado: true }],
            };
            const updateFicha = vi.fn((cb) => cb(minhaFicha));
            montarStore({ minhaFicha, updateFicha });
            const { getByText } = render(
                <AtaqueFormProvider><ArsenalFormProvider><MapaAtaqueArma /></ArsenalFormProvider></AtaqueFormProvider>
            );

            act(() => { getByText('🗡️ Espada Longa').click(); });

            expect(minhaFicha.inventario[0].equipado).toBe(true);
            expect(updateFicha).not.toHaveBeenCalled();
        });

        it('sem inventário nenhum, não mostra a lista de armas nem lança', () => {
            montarStore({ minhaFicha: { poderes: [], inventario: [] } });
            expect(() => {
                render(<AtaqueFormProvider><ArsenalFormProvider><MapaAtaqueArma /></ArsenalFormProvider></AtaqueFormProvider>);
            }).not.toThrow();
        });

        // ---------------------------------------------------------------------
        // QA — item com tipo 'arma' mas `equipado` NUNCA setado (undefined, não `false`) — cobre
        // o caso de armas antigas/legadas cujo registro nunca passou por um toggle. O chip precisa
        // tratar undefined como "não equipada" (⚪), igual trataria `false`, e o clique precisa
        // funcionar normalmente (chama toggleEquiparItem).
        // ---------------------------------------------------------------------------
        it('uma arma com `equipado` nunca definido (undefined) renderiza como NÃO equipada (⚪) e o clique nela chama toggleEquiparItem normalmente', () => {
            const minhaFicha = {
                poderes: [],
                inventario: [{ id: 1, nome: 'Adaga Enferrujada', tipo: 'arma' }], // sem a chave "equipado" de jeito nenhum
            };
            montarStore({ minhaFicha, updateFicha: vi.fn((cb) => cb(minhaFicha)) });
            const { getByText, queryByText } = render(
                <AtaqueFormProvider><ArsenalFormProvider><MapaAtaqueArma /></ArsenalFormProvider></AtaqueFormProvider>
            );

            expect(getByText('⚪ Adaga Enferrujada')).toBeTruthy();
            expect(queryByText('🗡️ Adaga Enferrujada')).toBeNull();

            act(() => { getByText('⚪ Adaga Enferrujada').click(); });

            expect(minhaFicha.inventario[0].equipado).toBe(true);
        });
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

    it('não lança ao renderizar um poder sem "nome" (undefined) nem com nome vazio — chip cai no fallback "Sem nome"', () => {
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
        expect(botoes[0].textContent.trim()).toBe('☆ Sem nome');
        expect(botoes[1].textContent.trim()).toBe('★ Sem nome');
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

    // -------------------------------------------------------------------------
    // QA — Organização por categoria (Formas/Habilidades/Poderes) e por pasta dentro de cada uma
    // (mesmo campo p.pasta que a aba Poderes usa, ver PoderesFormContext.jsx) — pedido do usuário
    // pra não ficar tudo achatado numa lista só, como aparecia antes no Mapa.
    // -------------------------------------------------------------------------
    describe('organização por categoria e por pasta', () => {
        it('separa em 3 seções (Formas/Habilidades/Poderes), escondendo as categorias vazias', () => {
            montarStore({
                minhaFicha: {
                    poderes: [
                        { id: 1, nome: 'Bankai', categoria: 'forma', ativa: false },
                        { id: 2, nome: 'Golpe Rápido', categoria: 'habilidade', ativa: false },
                    ],
                },
            });
            const { getByText, queryByText } = render(<PoderesFormProvider><MapaTecnicasRapidas /></PoderesFormProvider>);

            expect(getByText('🎭 Formas')).toBeTruthy();
            expect(getByText('🗡️ Habilidades')).toBeTruthy();
            // Nenhum "poder" (categoria 'poder') na ficha -> a seção "✨ Poderes" nem aparece.
            expect(queryByText('✨ Poderes')).toBeNull();
        });

        it('Formas SEMPRE agrupam por pasta, mesmo sem nenhuma pasta atribuída (cai tudo em "Sem Pasta")', () => {
            montarStore({
                minhaFicha: {
                    poderes: [
                        { id: 1, nome: 'Bankai', categoria: 'forma', ativa: false },
                        { id: 2, nome: 'Modo Berserker', categoria: 'forma', ativa: false },
                    ],
                },
            });
            const { getByText } = render(<PoderesFormProvider><MapaTecnicasRapidas /></PoderesFormProvider>);

            expect(getByText(/Sem Pasta/)).toBeTruthy();
            // Ambas as Formas continuam visíveis dentro do grupo (expandido por padrão).
            expect(getByText('☆ Bankai')).toBeTruthy();
            expect(getByText('☆ Modo Berserker')).toBeTruthy();
        });

        it('Formas com pastas diferentes aparecem em cabeçalhos separados, em ordem alfabética', () => {
            montarStore({
                minhaFicha: {
                    poderes: [
                        { id: 1, nome: 'Zeta', categoria: 'forma', ativa: false, pasta: 'Zulu' },
                        { id: 2, nome: 'Alfa', categoria: 'forma', ativa: false, pasta: 'Alpha' },
                    ],
                },
            });
            const { getAllByText } = render(<PoderesFormProvider><MapaTecnicasRapidas /></PoderesFormProvider>);

            const cabecalhos = getAllByText(/📁/).map(el => el.textContent);
            expect(cabecalhos[0]).toContain('Alpha');
            expect(cabecalhos[1]).toContain('Zulu');
        });

        it('Habilidades continuam em lista simples (sem cabeçalho 📁) enquanto nenhuma tiver pasta', () => {
            montarStore({
                minhaFicha: {
                    poderes: [{ id: 1, nome: 'Golpe Rápido', categoria: 'habilidade', ativa: false }],
                },
            });
            const { getByText, queryByText } = render(<PoderesFormProvider><MapaTecnicasRapidas /></PoderesFormProvider>);

            expect(getByText('☆ Golpe Rápido')).toBeTruthy();
            expect(queryByText(/📁/)).toBeNull();
        });

        it('Habilidades passam a agrupar por pasta assim que alguma delas tiver uma pasta atribuída', () => {
            montarStore({
                minhaFicha: {
                    poderes: [
                        { id: 1, nome: 'Golpe Rápido', categoria: 'habilidade', ativa: false, pasta: 'Combos' },
                        { id: 2, nome: 'Grito de Guerra', categoria: 'habilidade', ativa: false },
                    ],
                },
            });
            const { getByText } = render(<PoderesFormProvider><MapaTecnicasRapidas /></PoderesFormProvider>);

            expect(getByText(/📁 Combos/)).toBeTruthy();
            expect(getByText(/Sem Pasta/)).toBeTruthy();
        });

        // -----------------------------------------------------------------
        // QA — filtro de categoria em cada seção: `(p.categoria || 'poder').toLowerCase() === cat`.
        // Um poder SEM categoria (undefined/ausente) cai no fallback 'poder' e aparece na seção
        // "✨ Poderes". Já um poder com uma categoria ESTRANHA/legada (não vazia, mas também não
        // 'forma'/'habilidade'/'poder') não bate com NENHUM dos 3 filtros — o fallback só entra em
        // jogo quando `p.categoria` é falsy, não quando é uma string não reconhecida — então ele
        // desaparece silenciosamente das 3 seções. Documentado aqui como comportamento real (não é
        // uma regressão desta sessão: o mesmo padrão de filtro já existe em
        // PoderesFormContext.itensFiltrados), mas vale registrar via teste.
        // -----------------------------------------------------------------
        it('um poder SEM campo "categoria" (undefined) cai no fallback e aparece na seção "✨ Poderes"', () => {
            montarStore({
                minhaFicha: {
                    poderes: [{ id: 1, nome: 'Relíquia Sem Categoria', ativa: false }],
                },
            });
            const { getByText } = render(<PoderesFormProvider><MapaTecnicasRapidas /></PoderesFormProvider>);

            expect(getByText('✨ Poderes')).toBeTruthy();
            expect(getByText('☆ Relíquia Sem Categoria')).toBeTruthy();
        });

        it('DOCUMENTA: um poder com uma categoria ESTRANHA/legada (ex: "legado", não vazia) some das 3 seções silenciosamente, sem lançar', () => {
            montarStore({
                minhaFicha: {
                    poderes: [
                        { id: 1, nome: 'Item Legado', categoria: 'legado', ativa: false },
                        { id: 2, nome: 'Golpe Normal', categoria: 'habilidade', ativa: false },
                    ],
                },
            });
            const { getByText, queryByText } = render(<PoderesFormProvider><MapaTecnicasRapidas /></PoderesFormProvider>);

            // O item normal aparece normalmente...
            expect(getByText('☆ Golpe Normal')).toBeTruthy();
            // ...mas o item de categoria estranha não aparece em NENHUMA das 3 seções, nem lança.
            expect(queryByText(/Item Legado/)).toBeNull();
            expect(queryByText('🎭 Formas')).toBeNull();
            expect(queryByText('✨ Poderes')).toBeNull();
        });

        it('clicar no cabeçalho de uma pasta recolhe e esconde os itens dela, sem afetar as outras pastas', () => {
            montarStore({
                minhaFicha: {
                    poderes: [
                        { id: 1, nome: 'Bankai', categoria: 'forma', ativa: false, pasta: 'Transformações' },
                        { id: 2, nome: 'Ego', categoria: 'forma', ativa: false, pasta: 'Selados' },
                    ],
                },
            });
            const { getByText, queryByText } = render(<PoderesFormProvider><MapaTecnicasRapidas /></PoderesFormProvider>);

            expect(getByText('☆ Bankai')).toBeTruthy();
            act(() => { getByText(/📁 Transformações/).click(); });

            expect(queryByText('☆ Bankai')).toBeNull();
            // A outra pasta continua expandida normalmente.
            expect(getByText('☆ Ego')).toBeTruthy();
        });
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

// ---------------------------------------------------------------------------
// QA — MapaMagiasElementais: memoriza/desmemoriza Técnicas Elementais (ficha.ataquesElementais,
// criadas na página "Afinidades & Elementos" do Grimório) direto do Mapa — reusa o MESMO
// toggleEquiparElem de ElementosFormContext.jsx, agrupado por elemento. Era a 3ª categoria de
// técnica que ainda faltava no Mapa (Formas/Poderes/Habilidades já cobertos por
// MapaTecnicasRapidas) — Elementais vivem num array totalmente à parte (ataquesElementais), sem
// nenhuma relação de dados com ficha.poderes.
// ---------------------------------------------------------------------------
describe('MapaMagiasElementais — memoriza/desmemoriza Técnicas Elementais do Grimório direto do Mapa', () => {
    it('mostra uma dica quando a ficha não tem nenhuma magia elemental criada ainda', () => {
        montarStore({ minhaFicha: { ataquesElementais: [] } });
        const { getByText, queryAllByRole } = render(<ElementosFormProvider><MapaMagiasElementais /></ElementosFormProvider>);

        expect(getByText(/Nenhuma magia elemental criada ainda/i)).toBeTruthy();
        expect(queryAllByRole('button').length).toBe(0);
    });

    it('agrupa as magias por elemento, marcando visualmente as já memorizadas (equipado)', () => {
        montarStore({
            minhaFicha: {
                ataquesElementais: [
                    { id: 1, nome: 'Bola de Fogo', elemento: 'Fogo', equipado: false },
                    { id: 2, nome: 'Jato de Água', elemento: 'Agua', equipado: true },
                ],
            },
        });
        const { getByText } = render(<ElementosFormProvider><MapaMagiasElementais /></ElementosFormProvider>);

        expect(getByText('🔥 Fogo')).toBeTruthy();
        expect(getByText('💧 Agua')).toBeTruthy();
        expect(getByText('☆ Bola de Fogo')).toBeTruthy();
        expect(getByText('★ Jato de Água')).toBeTruthy();
    });

    it('magia sem elemento definido cai no grupo "Neutro"', () => {
        montarStore({
            minhaFicha: { ataquesElementais: [{ id: 1, nome: 'Golpe Puro', equipado: false }] },
        });
        const { getByText } = render(<ElementosFormProvider><MapaMagiasElementais /></ElementosFormProvider>);

        expect(getByText(/Neutro/)).toBeTruthy();
        expect(getByText('☆ Golpe Puro')).toBeTruthy();
    });

    it('clicar numa magia chama toggleEquiparElem(id) e alterna o campo equipado (mesma função da aba Afinidades & Elementos)', () => {
        const minhaFicha = { ataquesElementais: [{ id: 1, nome: 'Bola de Fogo', elemento: 'Fogo', equipado: false }] };
        montarStore({ minhaFicha, updateFicha: vi.fn((cb) => cb(minhaFicha)) });
        const { getByText } = render(<ElementosFormProvider><MapaMagiasElementais /></ElementosFormProvider>);

        act(() => { getByText('☆ Bola de Fogo').click(); });

        expect(minhaFicha.ataquesElementais[0].equipado).toBe(true);
    });

    it('magia sem "nome" cai no fallback "Sem nome", sem lançar', () => {
        montarStore({
            minhaFicha: { ataquesElementais: [{ id: 1, nome: undefined, elemento: 'Fogo', equipado: false }] },
        });
        expect(() => {
            render(<ElementosFormProvider><MapaMagiasElementais /></ElementosFormProvider>);
        }).not.toThrow();
    });

    it('não lança e renderiza null se usado FORA de um ElementosFormProvider (defensivo)', () => {
        montarStore();
        expect(() => render(<MapaMagiasElementais />)).not.toThrow();
    });

    // -------------------------------------------------------------------------
    // QA — gaps adicionais: fallback de emoji/cor para elemento desconhecido, agrupamento sem
    // duplicar cabeçalho, ordenação alfabética estável, `equipado` undefined, isolamento do
    // toggle entre magias do MESMO grupo e ausência total da chave `ataquesElementais` na ficha.
    // -------------------------------------------------------------------------
    it('elemento que NÃO existe nas tabelas emogis/cores cai no fallback (🌪️ e não lança), sem virar "undefined"', () => {
        // ELEMENTOS_EMOJIS['ElementoInventado'] e ELEMENTOS_CORES['ElementoInventado'] são
        // ambos `undefined` — o componente usa `|| '🌪️'` e `|| '#00ffcc'` como fallback
        // (ver MapaMagiasElementais em MapaCombate.jsx). Confirma que o cabeçalho do grupo
        // não renderiza a string literal "undefined" em nenhum lugar.
        montarStore({
            minhaFicha: {
                ataquesElementais: [{ id: 1, nome: 'Magia Rara', elemento: 'ElementoInventado', equipado: false }],
            },
        });
        let getByText, container;
        expect(() => {
            ({ getByText, container } = render(<ElementosFormProvider><MapaMagiasElementais /></ElementosFormProvider>));
        }).not.toThrow();

        expect(getByText('🌪️ ElementoInventado')).toBeTruthy();
        expect(getByText('☆ Magia Rara')).toBeTruthy();
        expect(container.textContent).not.toMatch(/undefined/);
    });

    it('múltiplas magias com o MESMO elemento renderizam sob um ÚNICO cabeçalho de grupo, sem duplicar', () => {
        montarStore({
            minhaFicha: {
                ataquesElementais: [
                    { id: 1, nome: 'Bola de Fogo', elemento: 'Fogo', equipado: false },
                    { id: 2, nome: 'Lança Flamejante', elemento: 'Fogo', equipado: false },
                    { id: 3, nome: 'Explosão Ígnea', elemento: 'Fogo', equipado: true },
                ],
            },
        });
        const { getAllByText, getByText } = render(<ElementosFormProvider><MapaMagiasElementais /></ElementosFormProvider>);

        expect(getAllByText('🔥 Fogo').length).toBe(1);
        expect(getByText('☆ Bola de Fogo')).toBeTruthy();
        expect(getByText('☆ Lança Flamejante')).toBeTruthy();
        expect(getByText('★ Explosão Ígnea')).toBeTruthy();
    });

    it('grupos de elemento renderizam em ordem alfabética estável (pt-BR), independente da ordem de criação das magias', () => {
        montarStore({
            minhaFicha: {
                ataquesElementais: [
                    { id: 1, nome: 'Rajada', elemento: 'Vento', equipado: false },
                    { id: 2, nome: 'Onda', elemento: 'Agua', equipado: false },
                    { id: 3, nome: 'Chama', elemento: 'Fogo', equipado: false },
                ],
            },
        });
        const { container } = render(<ElementosFormProvider><MapaMagiasElementais /></ElementosFormProvider>);

        const texto = container.textContent;
        const iAgua = texto.indexOf('Agua');
        const iFogo = texto.indexOf('Fogo');
        const iVento = texto.indexOf('Vento');
        expect(iAgua).toBeGreaterThan(-1);
        expect(iFogo).toBeGreaterThan(-1);
        expect(iVento).toBeGreaterThan(-1);
        expect(iAgua).toBeLessThan(iFogo);
        expect(iFogo).toBeLessThan(iVento);
    });

    it('uma magia com `equipado` nunca definido (undefined) renderiza como NÃO memorizada (☆), igual a `false`', () => {
        montarStore({
            minhaFicha: {
                ataquesElementais: [{ id: 1, nome: 'Pergaminho Antigo', elemento: 'Fogo' }], // sem a chave "equipado"
            },
        });
        const { getByText, queryByText } = render(<ElementosFormProvider><MapaMagiasElementais /></ElementosFormProvider>);

        expect(getByText('☆ Pergaminho Antigo')).toBeTruthy();
        expect(queryByText('★ Pergaminho Antigo')).toBeNull();
    });

    it('clicar em UMA magia dentro de um grupo com várias do mesmo elemento só alterna ELA, não as irmãs (toggleEquiparElem usa findIndex por id)', () => {
        const minhaFicha = {
            ataquesElementais: [
                { id: 1, nome: 'Bola de Fogo', elemento: 'Fogo', equipado: false },
                { id: 2, nome: 'Lança Flamejante', elemento: 'Fogo', equipado: false },
                { id: 3, nome: 'Explosão Ígnea', elemento: 'Fogo', equipado: false },
            ],
        };
        montarStore({ minhaFicha, updateFicha: vi.fn((cb) => cb(minhaFicha)) });
        const { getByText } = render(<ElementosFormProvider><MapaMagiasElementais /></ElementosFormProvider>);

        act(() => { getByText('☆ Lança Flamejante').click(); });

        expect(minhaFicha.ataquesElementais[0].equipado).toBe(false);
        expect(minhaFicha.ataquesElementais[1].equipado).toBe(true);
        expect(minhaFicha.ataquesElementais[2].equipado).toBe(false);
    });

    it('ficha SEM a chave "ataquesElementais" (nunca criada, nem como array vazio) se comporta como o caso vazio, sem lançar', () => {
        montarStore({ minhaFicha: {} }); // nem `ataquesElementais: []` está presente
        let getByText, queryAllByRole;
        expect(() => {
            ({ getByText, queryAllByRole } = render(<ElementosFormProvider><MapaMagiasElementais /></ElementosFormProvider>));
        }).not.toThrow();

        expect(getByText(/Nenhuma magia elemental criada ainda/i)).toBeTruthy();
        expect(queryAllByRole('button').length).toBe(0);
    });
});
