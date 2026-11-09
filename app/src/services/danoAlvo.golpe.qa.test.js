import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./firebase-sync', () => ({
    salvarCamposPersonagem: vi.fn(), salvarDummie: vi.fn(),
    aplicarDanoDireto: vi.fn(), aplicarFadigaDireta: vi.fn(), aplicarElementoDireto: vi.fn(), aplicarElementoNivelDireto: vi.fn(),
}));

import { salvarCamposPersonagem, aplicarDanoDireto } from './firebase-sync';
import { aplicarDanoEmPersonagem, gravarDanoEmPersonagem } from './danoAlvo';
import { normalizarContador } from '../core/contadores';
import useStore from '../stores/useStore';

// QA: aplicarDanoEmPersonagem com `golpe` dispara o evento `atingido` dos gatilhos do ALVO (Dano Rapido do Mestre em outro jogador).

const F = 1000;
const GOLPE = { nivel: 'normal' };
const PC = 'ganhosPermanentes/poderCalculado';
const gAting = (acoes, extra = {}) => ({ nome: 'Ating', evento: { tipo: 'atingido' }, acoes, ...extra });
const ficha = (gatilhos, extra = {}) => ({
    vida: { atual: 500 * F }, poderes: gatilhos ? [{ id: 'p1', nome: 'Poder', ativa: true, gatilhos }] : [], inventario: [], passivas: [], contadores: [], ...extra,
});
const camposGravados = () => salvarCamposPersonagem.mock.calls.map(c => c[1]);
const todosCampos = () => Object.assign({}, ...camposGravados());
const todasChaves = () => camposGravados().flatMap(c => Object.keys(c));
const ct = (id, valor) => normalizarContador({ id, nome: id, valor, min: 0, max: 9999 });

beforeEach(() => {
    vi.clearAllMocks();
    useStore.setState({ personagens: {}, cenario: { ativa: 'cena1' } });
});

describe('aplicarDanoEmPersonagem com golpe', () => {
    it('ganhoPermanente em atingido: soma no poderCalculado e grava so os campos tocados', () => {
        const f = ficha([gAting([{ tipo: 'ganhoPermanente', valor: 7 }])]);
        useStore.setState({ personagens: { Ana: f } });
        const r = aplicarDanoEmPersonagem('Ana', f, 100, 100 * F, { golpe: GOLPE });
        expect(aplicarDanoDireto).toHaveBeenCalledWith('Ana', 400 * F);
        expect(todosCampos()[PC]).toBe(7);
        expect(todasChaves()).not.toContain('vida/atual');
        expect(JSON.stringify(todosCampos())).not.toContain('undefined');
        expect(r.textos.length).toBeGreaterThan(0);
    });
    it('ganhoPermanente acumula sobre o valor ja existente', () => {
        const f = ficha([gAting([{ tipo: 'ganhoPermanente', valor: 3 }])], { ganhosPermanentes: { poderCalculado: 10 } });
        useStore.setState({ personagens: { Ana: f } });
        aplicarDanoEmPersonagem('Ana', f, 100, 100 * F, { golpe: GOLPE });
        expect(todosCampos()[PC]).toBe(13);
    });
    it('acao de contador em atingido: contador sobe e e gravado', () => {
        const f = ficha([gAting([{ tipo: 'contador', id: 'apanhei', op: 'somar', valor: 2 }])], { contadores: [ct('apanhei', 1)] });
        useStore.setState({ personagens: { Ana: f } });
        aplicarDanoEmPersonagem('Ana', f, 100, 100 * F, { golpe: GOLPE });
        expect(todasChaves().some(k => k.includes('contadores'))).toBe(true);
        expect(JSON.stringify(camposGravados())).toContain('3');
    });
    it('sem golpe NAO dispara atingido (so vida)', () => {
        const f = ficha([gAting([{ tipo: 'ganhoPermanente', valor: 7 }])]);
        useStore.setState({ personagens: { Ana: f } });
        const r = aplicarDanoEmPersonagem('Ana', f, 100, 100 * F);
        expect(aplicarDanoDireto).toHaveBeenCalledWith('Ana', 400 * F);
        expect(todasChaves()).not.toContain(PC);
        expect(r.textos).toEqual([]);
    });
    it('golpe null nao dispara; objeto vazio dispara com nivel padrao normal', () => {
        const f = ficha([gAting([{ tipo: 'ganhoPermanente', valor: 1 }])]);
        useStore.setState({ personagens: { Ana: f } });
        aplicarDanoEmPersonagem('Ana', f, 100, 100 * F, { golpe: null });
        expect(salvarCamposPersonagem).not.toHaveBeenCalled();
        aplicarDanoEmPersonagem('Ana', f, 100, 100 * F, { golpe: {} });
        expect(todosCampos()[PC]).toBe(1);
    });
    it('golpe de nivel normal nao dispara gatilho atingido de nivel critico', () => {
        const f = ficha([gAting([{ tipo: 'ganhoPermanente', valor: 7 }], { evento: { tipo: 'atingido', nivel: 'critico' } })]);
        useStore.setState({ personagens: { Ana: f } });
        aplicarDanoEmPersonagem('Ana', f, 100, 100 * F, { golpe: GOLPE });
        expect(todasChaves()).not.toContain(PC);
    });
    it('escudo absorvendo tudo NAO dispara; so grava o escudo', () => {
        const f = ficha([gAting([{ tipo: 'ganhoPermanente', valor: 7 }])], { escudos: [{ id: 'e1', nome: 'Barreira', valor: 1000, tipo: 'escudo' }] });
        useStore.setState({ personagens: { Ana: f } });
        aplicarDanoEmPersonagem('Ana', f, 100, 100 * F, { golpe: GOLPE });
        expect(todasChaves()).not.toContain(PC);
        expect(todasChaves()).toContain('escudos');
        expect(aplicarDanoDireto).toHaveBeenCalledWith('Ana', 500 * F);
    });
    it('escudo parcial: o que sobra e dano na Vida e dispara', () => {
        const f = ficha([gAting([{ tipo: 'ganhoPermanente', valor: 7 }])], { escudos: [{ id: 'e1', nome: 'Barreira', valor: 40, tipo: 'escudo' }] });
        useStore.setState({ personagens: { Ana: f } });
        aplicarDanoEmPersonagem('Ana', f, 100, 100 * F, { golpe: GOLPE });
        expect(aplicarDanoDireto).toHaveBeenCalledWith('Ana', 440 * F);
        expect(todosCampos()[PC]).toBe(7);
    });
    it('imunidade total NAO dispara e a vida nao muda', () => {
        const f = ficha([gAting([{ tipo: 'ganhoPermanente', valor: 7 }])], { combate: { imunidadeTotal: { turnosRestantes: 1, origem: 'x' } } });
        useStore.setState({ personagens: { Ana: f } });
        const r = aplicarDanoEmPersonagem('Ana', f, 100, 100 * F, { golpe: GOLPE });
        expect(todasChaves()).not.toContain(PC);
        expect(aplicarDanoDireto).toHaveBeenCalledWith('Ana', 500 * F);
        expect(r.texto).toContain('Imunidade total');
    });
    it('dano 0 NAO dispara', () => {
        const f = ficha([gAting([{ tipo: 'ganhoPermanente', valor: 7 }])]);
        useStore.setState({ personagens: { Ana: f } });
        aplicarDanoEmPersonagem('Ana', f, 0, 0, { golpe: GOLPE });
        expect(todasChaves()).not.toContain(PC);
        expect(aplicarDanoDireto).toHaveBeenCalledWith('Ana', 500 * F);
    });
    it('ficha sem gatilhos com golpe: caminho de sempre, nenhuma gravacao extra', () => {
        const f = ficha(null);
        useStore.setState({ personagens: { Ana: f } });
        const r = aplicarDanoEmPersonagem('Ana', f, 100, 100 * F, { golpe: GOLPE });
        expect(salvarCamposPersonagem).not.toHaveBeenCalled();
        expect(r.textos).toEqual([]);
        expect(aplicarDanoDireto).toHaveBeenCalledWith('Ana', 400 * F);
    });
    it('dois golpes seguidos (ficha refletindo a gravacao) somam duas vezes', () => {
        const f = ficha([gAting([{ tipo: 'ganhoPermanente', valor: 2 }])]);
        useStore.setState({ personagens: { Ana: f } });
        aplicarDanoEmPersonagem('Ana', f, 10, 10 * F, { golpe: GOLPE });
        const g1 = todosCampos()[PC];
        expect(g1).toBe(2);
        f.ganhosPermanentes = { poderCalculado: g1 };
        vi.clearAllMocks();
        aplicarDanoEmPersonagem('Ana', f, 10, 10 * F, { golpe: GOLPE });
        expect(todosCampos()[PC]).toBe(4);
    });
    it('gatilho danoEmSi nao dispara atingido', () => {
        const f = ficha([{ nome: 'Em si', evento: { tipo: 'danoEmSi' }, acoes: [{ tipo: 'ganhoPermanente', valor: 7 }] }]);
        useStore.setState({ personagens: { Ana: f } });
        aplicarDanoEmPersonagem('Ana', f, 100, 100 * F, { golpe: GOLPE });
        expect(todasChaves()).not.toContain(PC);
    });
});

describe('gravarDanoEmPersonagem repassa golpe', () => {
    it('com golpe dispara; sem golpe nao', () => {
        const f = ficha([gAting([{ tipo: 'ganhoPermanente', valor: 5 }])]);
        useStore.setState({ personagens: { Ana: f } });
        gravarDanoEmPersonagem('Ana', f, 400 * F, {});
        expect(salvarCamposPersonagem).not.toHaveBeenCalled();
        gravarDanoEmPersonagem('Ana', f, 400 * F, { golpe: GOLPE });
        expect(todosCampos()[PC]).toBe(5);
    });
});
