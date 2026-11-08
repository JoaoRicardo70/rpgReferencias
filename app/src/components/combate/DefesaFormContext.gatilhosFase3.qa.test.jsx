import React from 'react';
import { render, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DefesaFormProvider, useDefesaForm } from './DefesaFormContext';
import { FichaAlvoProvider } from '../Ficha Def/FichaAlvoContext';
import useStore from '../../stores/useStore';
import { enviarParaFeed, aplicarDanoDireto } from '../../services/firebase-sync';

// QA Fase 3 na Defesa > Receber dano: nao-regressao (automatico / sem gatilhos), Volta das cinzas por resultado, perguntar (Sim/Nao/cancelar/dois gatilhos),
// previsao x aplicacao, Mestre aplicando na ficha de outro jogador, atacante Dummie / sem ficha, God Mode.
vi.mock('../../stores/useStore', async (importOriginal) => {
    const real = await importOriginal();
    return { ...real, default: vi.fn() }; // sanitizarNome real (FichaAlvoProvider decide souEuMesmo com ele)
});
vi.mock('../../services/firebase-sync', () => ({
    salvarFichaSilencioso: vi.fn(),
    salvarFichaAlvoSilencioso: vi.fn(), salvarFichaAlvoImediato: vi.fn(), salvarFirebaseImediato: vi.fn(),
    iniciarSincronizacaoFichaAlvo: vi.fn(), pararSincronizacaoFichaAlvo: vi.fn(),
    enviarParaFeed: vi.fn(),
    salvarCamposPersonagem: vi.fn(),
    aplicarDanoDireto: vi.fn(), aplicarFadigaDireta: vi.fn(), aplicarElementoDireto: vi.fn(), aplicarElementoNivelDireto: vi.fn(),
    salvarDummie: vi.fn(),
}));
vi.mock('../../core/engine', async (importOriginal) => {
    const real = await importOriginal();
    return { ...real, calcularCA: vi.fn(() => 10) };
});
vi.mock('../../core/disputaPoder', async (importOriginal) => {
    const real = await importOriginal();
    return { ...real, getPoderParaDisputa: vi.fn(() => null) };
});

const FATOR = 1000;
const VIDA_BASE = 200000000; // 200.000 exibido
let probe;
function Harness() { probe = useDefesaForm(); return null; }
function fichaReal(extra = {}) {
    return {
        vida: { base: VIDA_BASE, atual: VIDA_BASE, mBase: 1, mGeral: 1, mFormas: 1, mAbsoluto: 1, mUnico: '1.0' },
        mana: { base: 0 }, aura: { base: 0 }, chakra: { base: 0 }, corpo: { base: 0 },
        forca: { base: 0 }, destreza: { base: 0 }, inteligencia: { base: 0 }, sabedoria: { base: 0 },
        energiaEsp: { base: 0 }, carisma: { base: 0 }, stamina: { base: 0 }, constituicao: { base: 0 },
        ascensaoBase: 1, divisores: { vida: 0.0001 }, bio: {}, estetica: {}, labels: {}, statusPool: 0,
        afinidades: {}, inventario: [], poderes: [],
        ...extra,
    };
}
const TABELA = { tipo: 'rolarTabela', dado: '1d4', resultados: [
    { ate: 1, texto: 'cura total', acoes: [{ tipo: 'curar', modo: 'percMax', valor: 100 }] },
    { ate: 2, texto: 'limpa e cura 50%', acoes: [{ tipo: 'limparCondicoes' }, { tipo: 'curar', modo: 'percMax', valor: 50 }] },
    { ate: 3, texto: 'imune 1 turno', acoes: [{ tipo: 'imunidadeTotal', duracaoTurnos: 1 }, { tipo: 'curar', modo: 'percMax', valor: 50 }] },
    { ate: 4, texto: 'volta ao atacante', acoes: [{ tipo: 'danoNoAtacante', modo: 'percDanoRecebido', valor: 100 }, { tipo: 'curar', modo: 'percMax', valor: 50 }] },
] };
const opc = (extra = {}) => ({ modo: 'opcional', armado: true, ...extra });
const G0 = (extra = {}) => ({ id: 'vc0', nome: 'Cinzas 0%', ...opc(), evento: { tipo: 'danoQueZeraria' }, limite: { max: 1, por: 'cena' }, acoes: [{ tipo: 'definirVida', percMax: 1 }, TABELA], ...extra });
const G51 = (extra = {}) => ({ id: 'vc3', nome: 'Cinzas 5-1%', ...opc(), evento: { tipo: 'vidaAbaixoDe', de: 5, ate: 1 }, limite: { max: 1, por: 'cena' }, acoes: [{ tipo: 'limparCondicoes' }, { tipo: 'curar', modo: 'percMax', valor: 40 }], ...extra });
const NEGAR_AUTO = { id: 'nm', nome: 'Negar morte', evento: { tipo: 'danoQueZeraria' }, limite: { max: 1, por: 'cena' }, acoes: [{ tipo: 'anularDano' }, { tipo: 'definirVida', valor: 1 }] };
const poderCom = (...gs) => [{ id: 'p1', nome: 'Volta', ativa: true, gatilhos: gs }];

function montar(ficha, { personagens = {}, dummies = {}, alvo } = {}) {
    const state = {
        minhaFicha: ficha, meuNome: 'Eu', personagens: alvo ? { ...personagens, [alvo]: ficha } : personagens, dummies, feedCombate: [], divisorPoderMesa: 1,
        updateFicha: vi.fn((cb) => cb(ficha)), updateFichaAlvo: vi.fn((nome, cb) => cb(ficha)), setAbaAtiva: vi.fn(), cenario: { ativa: 'cena1', zonas: [] },
    };
    useStore.mockImplementation((sel) => (typeof sel === 'function' ? sel(state) : state));
    useStore.getState = () => state;
    const arvore = alvo
        ? <FichaAlvoProvider nome={alvo}><DefesaFormProvider><Harness /></DefesaFormProvider></FichaAlvoProvider>
        : <DefesaFormProvider><Harness /></DefesaFormProvider>;
    render(arvore);
    return ficha;
}
function receber(dano, atacante) {
    act(() => { probe.setDanoDeDado(false); });
    act(() => { probe.setDanoRecebidoInc(String(dano)); });
    if (atacante) act(() => { probe.setAtacanteInc(atacante); });
    act(() => { probe.sofrerDanoBruto(); });
}
const textosFeed = () => enviarParaFeed.mock.calls.map(c => c[0].texto).filter(Boolean).join(' || ');
let rngSpy;
const sorteio = (v) => rngSpy.mockReturnValue(v); // 0.001 -> 1, 0.3 -> 2, 0.6 -> 3, 0.99 -> 4 no 1d4
beforeEach(() => { vi.clearAllMocks(); window.alert = vi.fn(); window.confirm = vi.fn(() => true); rngSpy = vi.spyOn(Math, 'random').mockReturnValue(0.001); });
afterEach(() => { cleanup(); rngSpy.mockRestore(); });

describe('Defesa - NAO-REGRESSAO com gatilhos automaticos e sem gatilhos (valores a mao)', () => {
    it('sem gatilhos: dano 1000 tira exatamente 1000 exibidos (1.000.000 brutos); nenhum confirm; sem texto de gatilho', () => {
        const f = montar(fichaReal());
        receber(1000);
        expect(f.vida.atual).toBe(VIDA_BASE - 1000 * FATOR);
        expect(window.confirm).not.toHaveBeenCalled();
        expect(textosFeed()).not.toContain('🔔');
        expect(aplicarDanoDireto).not.toHaveBeenCalled();
    });
    it('sem gatilhos: golpe maior que a Vida deixa 0 (nunca negativo) e nao cria combate', () => {
        const f = montar(fichaReal());
        receber(999999999);
        expect(f.vida.atual).toBe(0); expect(f.combate).toBeUndefined();
    });
    it('Negar morte AUTOMATICO: dano letal deixa 1 de vida, sem perguntar, uso gasto uma vez; 2o golpe letal mata', () => {
        const f = montar(fichaReal({ poderes: poderCom(NEGAR_AUTO) }));
        receber(999999999);
        expect(window.confirm).not.toHaveBeenCalled();
        expect(f.vida.atual).toBe(1 * FATOR);
        receber(999999999);
        expect(f.vida.atual).toBe(0);
    });
    it('gatilho automatico com `perguntar:true` e `armado:false` salvos (lixo): ignora ambos, dispara sem perguntar', () => {
        const f = montar(fichaReal({ poderes: poderCom({ ...NEGAR_AUTO, perguntar: true, armado: false }) }));
        receber(999999999);
        expect(window.confirm).not.toHaveBeenCalled(); expect(f.vida.atual).toBe(1 * FATOR);
    });
    it('gatilho SALVO na Fase 1/2 com modo opcional e SEM armado (ou armado nao booleano): NAO dispara (desarmado) e nao pergunta; com armado:true dispara', () => {
        [undefined, 'true', null, 0].forEach((v) => {
            cleanup();
            const f = montar(fichaReal({ poderes: poderCom({ ...NEGAR_AUTO, modo: 'opcional', ...(v !== undefined ? { armado: v } : {}) }) }));
            receber(999999999);
            expect(window.confirm).not.toHaveBeenCalled(); expect(f.vida.atual).toBe(0);
        });
        cleanup();
        const g = montar(fichaReal({ poderes: poderCom({ ...NEGAR_AUTO, modo: 'opcional', armado: true }) }));
        receber(999999999);
        expect(g.vida.atual).toBe(1 * FATOR);
    });
    it('dano que nao zera, com Volta das cinzas armada e perguntar: nao pergunta e a Vida desce o valor exato', () => {
        const f = montar(fichaReal({ poderes: poderCom(G0({ perguntar: true })) }));
        receber(1000);
        expect(window.confirm).not.toHaveBeenCalled(); expect(f.vida.atual).toBe(VIDA_BASE - 1000 * FATOR);
    });
});

describe('Defesa - Volta das cinzas: cada resultado do 1d4 pelo componente', () => {
    const rodar = (v, extraFicha = {}, personagens = {}, atacante) => {
        sorteio(v);
        const f = montar(fichaReal({ poderes: poderCom(G0()), ...extraFicha }), { personagens });
        receber(999999999, atacante);
        return f;
    };
    it('1 (0.001): cura total', () => {
        const f = rodar(0.001);
        expect(f.vida.atual).toBe(VIDA_BASE); expect(textosFeed()).toContain('Cinzas 0% rolou 1 (d4): cura total');
    });
    it('2 (0.3): limpa condicoes e cura 50% (fica em 51%)', () => {
        const f = rodar(0.3, { condicoes: [{ id: 'queimado', stacks: 1 }] });
        expect(f.condicoes).toBeUndefined(); expect(f.vida.atual).toBe(VIDA_BASE * 0.51);
        expect(textosFeed()).toContain('rolou 2 (d4)');
    });
    it('3 (0.6): Imunidade total por 1 turno + 50%; o proximo golpe e zerado (so a mensagem de Imunidade total)', () => {
        const f = rodar(0.6);
        expect(f.combate.imunidadeTotal).toMatchObject({ turnosRestantes: 1 }); expect(f.vida.atual).toBe(VIDA_BASE * 0.51);
        enviarParaFeed.mockClear();
        receber(50000);
        expect(f.vida.atual).toBe(VIDA_BASE * 0.51);
        expect(textosFeed()).toContain('Imunidade total');
    });
    it('4 (0.99) com atacante-personagem: o dano devolvido (100% do recebido) vai ao atacante e a frase aparece', () => {
        const vilao = fichaReal();
        const f = rodar(0.99, {}, { Vilao: vilao }, 'p:Vilao');
        expect(f.vida.atual).toBe(VIDA_BASE * 0.51);
        expect(aplicarDanoDireto).toHaveBeenCalledTimes(1);
        const [nome, vidaNova] = aplicarDanoDireto.mock.calls[0];
        expect(nome).toBe('Vilao'); expect(vidaNova).toBe(0); // 999.999.999 exibidos >> 200.000: o atacante zera
        expect(textosFeed()).toMatch(/Vilao sofreu 999\.999\.999 de dano devolvido por Cinzas 0%/);
    });
    it('4 com atacante DUMMIE (d:x): so avisa, nao grava ninguem', () => {
        const f = rodar(0.99, {}, {}, 'd:dum1');
        expect(f.vida.atual).toBe(VIDA_BASE * 0.51);
        expect(aplicarDanoDireto).not.toHaveBeenCalled();
        expect(textosFeed()).toContain('dano no atacante ignorado');
    });
    it('4 com atacante personagem SEM ficha no store: aviso "nao tem ficha" e nada gravado', () => {
        const f = rodar(0.99, {}, {}, 'p:Fantasma');
        expect(f.vida.atual).toBe(VIDA_BASE * 0.51);
        expect(aplicarDanoDireto).not.toHaveBeenCalled();
        expect(textosFeed()).toContain('ignorado');
    });
    it('4 com atacante AUTO sem golpe recente: atacante desconhecido, avisa e ignora', () => {
        const f = rodar(0.99);
        expect(f.vida.atual).toBe(VIDA_BASE * 0.51); expect(aplicarDanoDireto).not.toHaveBeenCalled();
        expect(textosFeed()).toContain('dano no atacante ignorado');
    });
    it('4 com God Mode do atacante: o dano devolvido zera (Vida dele inalterada na gravacao)', () => {
        const vilao = fichaReal({ combate: { imunidadeTotal: { turnosRestantes: 2, origem: 'x' } } });
        rodar(0.99, {}, { Vilao: vilao }, 'p:Vilao');
        expect(aplicarDanoDireto.mock.calls.filter(c => c[0] === 'Vilao').every(c => c[1] === VIDA_BASE)).toBe(true);
        expect(textosFeed()).toContain('Imunidade total');
    });
    it('LACO: atacante com gatilho "atingido -> danoNoAtacante" nao devolve de volta ao defensor (uma so volta)', () => {
        const espinhos = { id: 'es', nome: 'Espinhos', evento: { tipo: 'atingido', nivel: 'qualquer' }, acoes: [{ tipo: 'danoNoAtacante', modo: 'fixo', valor: 5000 }] };
        const vilao = fichaReal({ poderes: poderCom(espinhos) });
        const f = rodar(0.99, {}, { Vilao: vilao }, 'p:Vilao');
        expect(aplicarDanoDireto.mock.calls.filter(c => c[0] === 'Eu')).toHaveLength(0);
        expect(f.vida.atual).toBe(VIDA_BASE * 0.51);
    });
    it('feed e ficha sem "undefined"/"NaN" depois de tudo', () => {
        const f = rodar(0.99, { condicoes: [{ id: 'queimado', stacks: 1 }] }, { Vilao: fichaReal() }, 'p:Vilao');
        expect(textosFeed()).not.toMatch(/undefined|NaN/);
        expect(JSON.stringify(f)).not.toMatch(/undefined|NaN/);
    });
    it('segundo golpe letal na mesma cena mata (limite 1/cena); em outra cena salva de novo', () => {
        const f = rodar(0.001);
        f.vida.atual = 100 * FATOR; receber(999999999);
        expect(f.vida.atual).toBe(0);
        f.vida.atual = 100 * FATOR; useStore.getState().cenario.ativa = 'cena2'; receber(999999999);
        expect(f.vida.atual).toBe(VIDA_BASE);
    });
});

describe('Defesa - perguntar (Sim / Nao / cancelar / dois gatilhos)', () => {
    it('Sim: dispara, UMA pergunta, a rolagem real vem do Math.random da aplicacao (0.99 -> 4), nao do rng da previsao', () => {
        sorteio(0.99);
        const f = montar(fichaReal({ poderes: poderCom(G0({ perguntar: true })) }));
        receber(999999999);
        expect(window.confirm).toHaveBeenCalledTimes(1);
        const rolagens = textosFeed().match(/rolou \d \(d4\)/g) || [];
        expect(rolagens).toEqual(['rolou 4 (d4)']); // exatamente uma rolagem no feed e ela e a real
        expect(f.vida.atual).toBe(VIDA_BASE * 0.51);
    });
    it('Nao: nao dispara (Vida 0), nao gasta uso, nenhuma rolagem; novo golpe ainda pergunta', () => {
        const f = montar(fichaReal({ poderes: poderCom(G0({ perguntar: true })) }));
        window.confirm = vi.fn(() => false);
        receber(999999999);
        expect(f.vida.atual).toBe(0); expect(f.combate?.usosPoderes).toBeUndefined(); expect(textosFeed()).not.toContain('rolou');
        f.vida.atual = 100 * FATOR; window.confirm = vi.fn(() => true);
        receber(999999999);
        expect(window.confirm).toHaveBeenCalledTimes(1); expect(f.vida.atual).toBeGreaterThan(0);
    });
    it('cancelar (confirm devolve undefined/null) conta como Nao', () => {
        [undefined, null].forEach((ret) => {
            cleanup();
            const f = montar(fichaReal({ poderes: poderCom(G0({ perguntar: true })) }));
            window.confirm = vi.fn(() => ret);
            receber(999999999);
            expect(f.vida.atual).toBe(0);
        });
    });
    it('dois gatilhos perguntam: Sim em um (0%), Nao no outro (faixa 5-1); so o 0% executa e o uso da faixa fica intacto', () => {
        sorteio(0.99);
        // 0%: deixa 2% (e rola a tabela sem cura: linha unica sem acoes de vida) -> a faixa 5-1 reagiria a isso
        const g0 = G0({ perguntar: true, acoes: [{ tipo: 'definirVida', percMax: 2 }, { tipo: 'rolarTabela', dado: '1d4', resultados: [{ ate: 4, texto: 'nada de cura', acoes: [{ tipo: 'mensagem', texto: 'sem cura' }] }] }] });
        const g51 = G51({ perguntar: true });
        const f = montar(fichaReal({ poderes: poderCom(g0, g51) }));
        window.confirm = vi.fn((t) => t.startsWith('Usar Cinzas 0%'));
        receber(999999999);
        expect(window.confirm).toHaveBeenCalledTimes(2);
        expect(f.vida.atual).toBe(VIDA_BASE * 0.02);
        const usos = f.combate.usosPoderes;
        expect(Object.keys(usos)).toEqual(['p1:vc0']);
    });
    it('Nao no 0% e Sim na faixa: o golpe mata (0%) e a faixa nao dispara (Vida final 0 nao esta em 5-1)', () => {
        const f = montar(fichaReal({ poderes: poderCom(G0({ perguntar: true }), G51({ perguntar: true })) }));
        window.confirm = vi.fn((t) => !t.startsWith('Usar Cinzas 0%'));
        receber(999999999);
        expect(f.vida.atual).toBe(0);
    });
    it('faixa 5-1 com perguntar (golpe que deixa 3%): pergunta e, no Sim, limpa e cura 40%', () => {
        const f = montar(fichaReal({ condicoes: [{ id: 'queimado', stacks: 1 }], poderes: poderCom(G51({ perguntar: true })) }));
        receber(194000); // 200.000 - 194.000 = 6.000 = 3%
        expect(window.confirm).toHaveBeenCalledTimes(1);
        expect(f.vida.atual).toBe(VIDA_BASE * 0.43); expect(f.condicoes).toBeUndefined();
    });
    it('God Mode: nao pergunta e a Vida nao muda', () => {
        const f = montar(fichaReal({ combate: { imunidadeTotal: { turnosRestantes: 1, origem: 'x' } }, poderes: poderCom(G0({ perguntar: true })) }));
        receber(999999999);
        expect(window.confirm).not.toHaveBeenCalled(); expect(f.vida.atual).toBe(VIDA_BASE);
    });
    it('desarmado + perguntar: nao pergunta e morre', () => {
        const f = montar(fichaReal({ poderes: poderCom(G0({ perguntar: true, armado: false })) }));
        receber(999999999);
        expect(window.confirm).not.toHaveBeenCalled(); expect(f.vida.atual).toBe(0);
    });
});

describe('Defesa - Mestre aplicando dano na ficha de OUTRO jogador (updateFichaAlvo)', () => {
    it('nao abre pergunta (o Mestre nao decide pelo dono): vale so `armado`', () => {
        sorteio(0.001);
        const f = montar(fichaReal({ poderes: poderCom(G0({ perguntar: true })) }), { alvo: 'Ana' });
        receber(999999999);
        expect(window.confirm).not.toHaveBeenCalled();
        expect(f.vida.atual).toBe(VIDA_BASE);
    });
    it('desarmado pelo Mestre: o golpe mata', () => {
        const f = montar(fichaReal({ poderes: poderCom(G0({ perguntar: true, armado: false })) }), { alvo: 'Ana' });
        receber(999999999);
        expect(f.vida.atual).toBe(0);
    });
});
