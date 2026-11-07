import React from 'react';
import { render, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AtaqueFormProvider, useAtaqueForm } from './AtaqueFormContext';
import { DefesaFormProvider, useDefesaForm } from './DefesaFormContext';
import { MapaFormProvider, useMapaForm } from '../mapa/MapaFormContext';
import useStore from '../../stores/useStore';
import { enviarParaFeed, salvarCamposPersonagem, aplicarDanoDireto, salvarFichaSilencioso } from '../../services/firebase-sync';
import { calcularDano } from '../../core/engine';
import { FATOR_EXIBICAO_VITAIS as F } from '../../core/vitals';

// QA (endurecimento) - o MESMO dano contra os MESMOS escudos tem de dar o MESMO resultado final (Vida e escudos) no Ataque (contra alvo-personagem),
// na Defesa (dano recebido) e no Dano Rapido do Mestre (contra outro jogador e contra o proprio Mestre).

vi.mock('../../stores/useStore', () => ({ default: vi.fn() }));
vi.mock('../../core/engine', async (importOriginal) => ({ ...(await importOriginal()), calcularDano: vi.fn(), calcularCA: vi.fn(() => 10) }));
vi.mock('../../core/disputaPoder', async (importOriginal) => ({
    ...(await importOriginal()),
    calcularDisputaPoder: vi.fn(() => ({ ativa: false })),
    aplicarDisputaAoDano: vi.fn((dano) => dano),
    getPoderParaDisputa: vi.fn(() => null),
}));
vi.mock('../../core/danoProporcional', async (importOriginal) => ({ ...(await importOriginal()), escalarDanoPelaVida: vi.fn((dano) => dano) }));
vi.mock('../../services/firebase-sync', () => ({
    salvarFichaSilencioso: vi.fn(), enviarParaFeed: vi.fn(), salvarDummie: vi.fn(), salvarCenarioCompleto: vi.fn(), salvarCamposPersonagem: vi.fn(),
    aplicarDanoDireto: vi.fn(), aplicarFadigaDireta: vi.fn(), aplicarElementoDireto: vi.fn(), aplicarElementoNivelDireto: vi.fn(),
    uploadImagem: vi.fn(() => Promise.resolve('https://exemplo.com/img.png')), zerarIniciativaGlobal: vi.fn(),
}));

const VIDA = 1e12;
const vital = (base) => ({ base, mBase: 1, mGeral: 1, mFormas: 1, mAbsoluto: 1, mUnico: '1.0', atual: base, regeneracao: 0 });
const E = (id, nome, valor, tipo = 'escudo') => ({ id, nome, valor, tipo });
const fichaBase = (escudos) => ({
    iniciativa: 0, posicao: { x: 0, y: 0, z: 0 },
    acoes: { padrao: { max: 1, atual: 0 }, bonus: { max: 1, atual: 0 }, reacao: { max: 1, atual: 0 } },
    vida: vital(VIDA), mana: vital(1e9), aura: vital(1e9), chakra: vital(1e9), corpo: vital(1e9),
    forca: { base: 50 }, destreza: { base: 50 }, inteligencia: { base: 50 }, sabedoria: { base: 50 }, energiaEsp: { base: 50 }, carisma: { base: 50 }, stamina: { base: 50 }, constituicao: { base: 50 },
    multiplicadorVida: 1, multiplicadorMorte: 1, divisores: {}, ascensaoBase: 1, bio: {}, estetica: {}, labels: {}, statusPool: 0, afinidades: {},
    poderes: [], inventario: [], passivas: [], ataquesElementais: [], reducoesDano: [], hierarquia: {},
    combate: { fadigaTurnos: 0, fadigaPorTurno: 5, fadigaExtra: 0 },
    ...(escudos ? { escudos: escudos.map(x => ({ ...x })) } : {}),
});

let state; let probe;
function instalarStore(extra) {
    useStore.mockImplementation((sel) => (typeof sel === 'function' ? sel(state) : state));
    useStore.getState = () => state;
    Object.assign(state, extra);
}
// Eco do Firebase: salvarCamposPersonagem atualiza a ficha do store, como o listener real faz.
function ecoFirebase() {
    salvarCamposPersonagem.mockImplementation((nome, campos) => {
        const f = state.personagens[nome];
        if (!f) return;
        if ('escudos' in campos) { if (campos.escudos === null) delete f.escudos; else f.escudos = campos.escudos; }
    });
    aplicarDanoDireto.mockImplementation((nome, v) => { const f = state.personagens[nome]; if (f) f.vida.atual = v; });
}

function Pa() { probe = useAtaqueForm(); return null; }
function Pd() { probe = useDefesaForm(); return null; }
function Pm() { probe = useMapaForm(); return null; }

const danoMock = (n) => calcularDano.mockReturnValue({ dano: n, letalidade: 0, rolagem: '', rolagemMagica: '', atributosUsados: '', detalheEnergia: '', armaStr: '', detalheConta: '' });
const textoFeed = () => enviarParaFeed.mock.calls.map(([p]) => [p.texto, ...(p.textoPosGolpe || [])].join(' ')).join(' | ');
const trecho = (t) => { const m = /(\S+) absorveu ([\d.]+) \(restam ([\d.]+)\)/.exec(t); return m ? `${m[2]}/${m[3]}` : ''; };
const util = (lista) => (lista || []).filter(e => Number.isFinite(e.valor) && e.valor > 0).map(e => `${e.id}:${e.valor}`);
const ultimaGravacaoEscudos = (inicial) => {
    const gravs = salvarCamposPersonagem.mock.calls.filter(([, c]) => 'escudos' in c);
    if (gravs.length === 0) return util(inicial);
    const ult = gravs[gravs.length - 1][1].escudos;
    return util(ult || []);
};

function viaAtaque(escudos, dano) {
    const ana = { ...fichaBase(escudos), iniciativa: 10 };
    state = {
        minhaFicha: { ...fichaBase(), iniciativa: 10, vida: vital(5e11) }, meuNome: 'Heroi', personagens: { Ana: ana }, dummies: {}, alvoSelecionado: 'pj:Ana',
        updateFicha: vi.fn((cb) => cb(state.minhaFicha)), setAbaAtiva: vi.fn(), abaAtiva: 'aba-ataque', feedCombate: [],
        ignorarTravaAcerto: false, setIgnorarTravaAcerto: vi.fn(), cenario: { zonas: [] }, isMestre: false,
    };
    instalarStore({});
    danoMock(dano);
    render(<AtaqueFormProvider><Pa /></AtaqueFormProvider>);
    act(() => { probe.rolarDano(); });
    const gravVida = aplicarDanoDireto.mock.calls.filter(([n]) => n === 'Ana');
    const vidaFinal = gravVida.length ? gravVida[gravVida.length - 1][1] : VIDA;
    return { perda: VIDA - vidaFinal, escudos: ultimaGravacaoEscudos(escudos), absorveu: trecho(textoFeed()) };
}

function viaDefesa(escudos, dano) {
    const eu = fichaBase(escudos);
    state = {
        minhaFicha: eu, meuNome: 'Eu', personagens: {}, dummies: {}, feedCombate: [], divisorPoderMesa: 1,
        updateFicha: vi.fn((cb) => cb(eu)), setAbaAtiva: vi.fn(), cenario: { zonas: [] },
    };
    instalarStore({});
    render(<DefesaFormProvider><Pd /></DefesaFormProvider>);
    act(() => { probe.setDanoDeDado(false); });
    act(() => { probe.setDanoRecebidoInc(String(dano)); });
    act(() => { probe.sofrerDanoBruto(); });
    return { perda: VIDA - eu.vida.atual, escudos: util(eu.escudos), absorveu: trecho(textoFeed()) };
}

function estadoMapa(minha, personagens = {}) {
    return {
        minhaFicha: minha, meuNome: 'Mestre', personagens, updateFicha: vi.fn((cb) => cb(minha)), feedCombate: [],
        isMestre: true, mesaCriador: 'Mestre', dummies: {}, alvoSelecionado: null, abaAtiva: 'mapa',
        cenario: { ativa: 'default', lista: { default: { nome: 'Cena', escala: 1.5 } }, turnoAtualIndex: 0 },
    };
}
function viaDanoRapidoOutro(escudos, dano) {
    const vilao = fichaBase(escudos);
    state = estadoMapa(fichaBase(), { Vilao: vilao });
    instalarStore({});
    render(<MapaFormProvider><Pm /></MapaFormProvider>);
    act(() => { probe.aplicarDanoRapido({ nome: 'Vilao', ficha: vilao, isDummie: false }, dano, 'fisico'); });
    const g = aplicarDanoDireto.mock.calls.filter(([n]) => n === 'Vilao');
    const vidaFinal = g.length ? g[g.length - 1][1] : VIDA;
    return { perda: VIDA - vidaFinal, escudos: ultimaGravacaoEscudos(escudos), absorveu: trecho(textoFeed()) };
}
function viaDanoRapidoMestre(escudos, dano) {
    const eu = fichaBase(escudos);
    state = estadoMapa(eu);
    instalarStore({});
    render(<MapaFormProvider><Pm /></MapaFormProvider>);
    act(() => { probe.aplicarDanoRapido({ nome: 'Mestre', ficha: eu, isDummie: false }, dano, 'fisico'); });
    return { perda: VIDA - eu.vida.atual, escudos: util(eu.escudos), absorveu: trecho(textoFeed()) };
}

const CAMINHOS = { Ataque: viaAtaque, Defesa: viaDefesa, 'Dano Rapido (outro jogador)': viaDanoRapidoOutro, 'Dano Rapido (Mestre em si)': viaDanoRapidoMestre };

beforeEach(() => { vi.clearAllMocks(); window.alert = vi.fn(); });
afterEach(() => cleanup());

// [descricao, escudos, dano, perda de Vida esperada (escala exibida), escudos restantes esperados, "absorveu/restam" esperado]
const CASOS = [
    ['dano MENOR que o escudo', [E('a', 'Domo', 1600)], 1000, 0, ['a:600'], '1.000/600'],
    ['dano IGUAL ao escudo', [E('a', 'Domo', 1000)], 1000, 0, [], '1.000/0'],
    ['dano MAIOR que o escudo', [E('a', 'Domo', 600)], 1000, 400, [], '600/0'],
    ['dano 1 acima do escudo', [E('a', 'Domo', 999)], 1000, 1, [], '999/0'],
    ['dano 1 abaixo do escudo', [E('a', 'Domo', 1001)], 1000, 0, ['a:1'], '1.000/1'],
    ['varios escudos + vida temporaria misturados (escudos antes, mais antigo primeiro)', [E('v1', 'VT', 100, 'vidaTemporaria'), E('s1', 'A', 300), E('v2', 'VT2', 50, 'vidaTemporaria'), E('s2', 'B', 200)], 560, 0, ['v1:40', 'v2:50'], '560/90'],
    ['dano acima de todos os escudos', [E('s1', 'A', 300), E('v1', 'VT', 100, 'vidaTemporaria')], 1000, 600, [], '400/0'],
    ['escudo com valor 0 e NaN na lista: ignorados, dano integral na Vida', [E('z', 'Zero', 0), E('n', 'Nan', NaN)], 1000, 1000, [], ''],
    ['escudo 0 na frente de escudo valido', [E('z', 'Zero', 0), E('a', 'Ok', 400)], 1000, 600, [], '400/0'],
    ['sem escudos (comportamento antigo)', undefined, 1000, 1000, [], ''],
    ['lista de escudos vazia', [], 1000, 1000, [], ''],
];

describe.each(Object.entries(CAMINHOS))('MESMO dano, MESMO resultado - %s', (_nome, via) => {
    it.each(CASOS)('%s', (_desc, escudos, dano, perdaExibida, restantes, absorveu) => {
        const r = via(escudos, dano);
        expect(r.perda).toBe(perdaExibida * F);
        expect(r.escudos).toEqual(restantes);
        expect(r.absorveu).toBe(absorveu);
    });
});

describe('MESMO dano, MESMO resultado - comparando os quatro caminhos lado a lado', () => {
    it.each(CASOS)('%s', (_desc, escudos, dano) => {
        const resultados = Object.values(CAMINHOS).map((via) => {
            vi.clearAllMocks();
            cleanup();
            return via(escudos, dano);
        });
        resultados.slice(1).forEach(r => expect(r).toEqual(resultados[0]));
    });
});

describe('dano 0 em todos os caminhos', () => {
    // Defesa: dano 0 digitado. Ataque: calcularDano 0. Dano Rapido: valor 0.
    it.each([['Defesa', viaDefesa], ['Dano Rapido (Mestre em si)', viaDanoRapidoMestre]])('%s: escudos intactos e Vida intacta', (_n, via) => {
        const r = via([E('a', 'Domo', 100)], 0);
        expect(r.perda).toBe(0);
        expect(r.escudos).toEqual(['a:100']);
        expect(r.absorveu).toBe('');
    });
    it('Ataque: dano 0 nao consome escudo', () => {
        const r = viaAtaque([E('a', 'Domo', 100)], 0);
        expect(r.escudos).toEqual(['a:100']);
        expect(r.absorveu).toBe('');
    });
});

describe('aplicacoes seguidas (clique duplo) consomem em sequencia, sem gastar o mesmo escudo duas vezes', () => {
    it('Ataque: dois golpes de 1000 contra escudo 1600 (com eco do Firebase) -> 600 e depois 0, 400 para a Vida', () => {
        const ana = { ...fichaBase([E('a', 'Domo', 1600)]), iniciativa: 10 };
        state = {
            minhaFicha: { ...fichaBase(), iniciativa: 10, vida: vital(5e11) }, meuNome: 'Heroi', personagens: { Ana: ana }, dummies: {}, alvoSelecionado: 'pj:Ana',
            updateFicha: vi.fn((cb) => cb(state.minhaFicha)), setAbaAtiva: vi.fn(), abaAtiva: 'aba-ataque', feedCombate: [],
            ignorarTravaAcerto: false, setIgnorarTravaAcerto: vi.fn(), cenario: { zonas: [] }, isMestre: false,
        };
        instalarStore({});
        ecoFirebase();
        danoMock(1000);
        render(<AtaqueFormProvider><Pa /></AtaqueFormProvider>);
        act(() => { probe.rolarDano(); });
        expect(ana.escudos.map(e => e.valor)).toEqual([600]);
        act(() => { probe.rolarDano(); });
        expect(ana.escudos).toBeUndefined();
        const absorcoes = enviarParaFeed.mock.calls.map(([p]) => trecho((p.textoPosGolpe || []).join(' '))).filter(Boolean);
        expect(absorcoes).toEqual(['1.000/600', '600/0']);
    });
    it('Defesa: dois danos de 1000 contra escudo 1600 -> 600 e 0, Vida perde 400', () => {
        const eu = fichaBase([E('a', 'Domo', 1600)]);
        state = {
            minhaFicha: eu, meuNome: 'Eu', personagens: {}, dummies: {}, feedCombate: [], divisorPoderMesa: 1,
            updateFicha: vi.fn((cb) => cb(eu)), setAbaAtiva: vi.fn(), cenario: { zonas: [] },
        };
        instalarStore({});
        render(<DefesaFormProvider><Pd /></DefesaFormProvider>);
        act(() => { probe.setDanoDeDado(false); });
        act(() => { probe.setDanoRecebidoInc('1000'); });
        act(() => { probe.sofrerDanoBruto(); });
        expect(eu.escudos[0].valor).toBe(600);
        act(() => { probe.setDanoRecebidoInc('1000'); }); // o formulario limpa o campo depois de aplicar
        act(() => { probe.sofrerDanoBruto(); });
        expect('escudos' in eu).toBe(false);
        expect(VIDA - eu.vida.atual).toBe(400 * F);
    });
    it('Dano Rapido em outro jogador: duas aplicacoes (com eco) -> escudo 4000 depois 3000; sem eco duplicado', () => {
        const vilao = fichaBase([E('a', 'Domo', 5000)]);
        state = estadoMapa(fichaBase(), { Vilao: vilao });
        instalarStore({});
        ecoFirebase();
        render(<MapaFormProvider><Pm /></MapaFormProvider>);
        act(() => { probe.aplicarDanoRapido({ nome: 'Vilao', ficha: vilao, isDummie: false }, 1000, 'fisico'); });
        act(() => { probe.aplicarDanoRapido({ nome: 'Vilao', ficha: vilao, isDummie: false }, 1000, 'fisico'); });
        expect(vilao.escudos.map(e => e.valor)).toEqual([3000]);
    });
});

describe('persistencia: nunca grava escudos vazio nem com undefined', () => {
    it.each(Object.entries(CAMINHOS))('%s: nenhuma gravacao contem undefined e escudos zerado vai como null (Firebase) ou some da ficha', (_n, via) => {
        via([E('a', 'Domo', 500)], 1000);
        salvarCamposPersonagem.mock.calls.forEach(([, campos]) => {
            expect(JSON.stringify(campos, (k, v) => (v === undefined ? '__undef__' : v))).not.toContain('__undef__');
            if ('escudos' in campos) expect(campos.escudos === null || (Array.isArray(campos.escudos) && campos.escudos.length > 0)).toBe(true);
        });
    });
    it('Defesa: ficha sem escudos continua sem a chave apos receber dano; salvarFichaSilencioso chamado', () => {
        const r = viaDefesa(undefined, 100);
        expect(r.perda).toBe(100 * F);
        expect(salvarFichaSilencioso).toHaveBeenCalled();
    });
});
