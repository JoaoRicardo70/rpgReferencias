import { describe, it, expect } from 'vitest';
import {
    obterModelo, selecaoPadrao, paramsPadrao, normalizarParams, planejarModelo, aplicarModeloNaFicha, acharPoderDoModelo,
} from './modelosPoder.js';
import { LIMITE_GATILHOS_POR_FONTE } from './gatilhos.js';
import { LIMITE_CONTADORES, normalizarContador } from './contadores.js';
import { calcularPoderAtual } from './poder.js';
import { fatorAdaptacao } from './adaptacao.js';
import { dispararEventoNaFicha } from './gatilhosAplicar.js';

// QA - Modelos: Ego Superior (4 partes de ganho: combate x permanente) e Verg Avesta (Adaptacao por diferenca de Poder).
const EGO = 'egoSuperior';
const VERG = 'vergAvesta';
const m = (id) => obterModelo(id);
const construir = (id, sel, params = {}, ficha = { poderes: [], contadores: [] }, op = {}) => m(id).construir(sel ?? selecaoPadrao(m(id)), params, ficha, op);
const aplicar = (ficha, id, sel, params = {}, extra = {}) => aplicarModeloNaFicha(ficha, { isMestre: true, modeloId: id, selecao: sel ?? selecaoPadrao(m(id)), params, id: 'pid1', ...extra });
const gatilho = (r, id) => (r.poder.gatilhos || []).find(g => g.id === id);
const ganhosDe = (g) => g.acoes.filter(a => a.tipo === 'ganhoPermanente');
const clone = (o) => JSON.parse(JSON.stringify(o));
const fichaNova = () => ({ poderes: [], contadores: [] });

const A_COMB = 'prestigioPorAcerto'; const A_PERM = 'prestigioPermanentePorAcerto';
const D_COMB = 'prestigioPorDanoSofrido'; const D_PERM = 'prestigioPermanentePorDanoSofrido';
const MULT = ['multiplicadores', 'imunidadeCondicoes'];

describe('Ego: partes e padroes', () => {
    it('ha 4 partes de ganho e todas marcadas por padrao', () => {
        const ids = m(EGO).partes.map(p => p.id);
        [A_COMB, A_PERM, D_COMB, D_PERM].forEach(id => { expect(ids).toContain(id); expect(selecaoPadrao(m(EGO))).toContain(id); });
    });
    it('padroes: combate +2/+3/+4 multiplicar, permanente +0,2/+0,3/+0,4 somar, dano +2% e +0,2%', () => {
        const p = paramsPadrao(m(EGO));
        expect([p.ganhoNormal, p.ganhoCritico, p.ganhoFatal, p.modoAcerto]).toEqual([2, 3, 4, 'multiplicar']);
        expect([p.ganhoNormalPerm, p.ganhoCriticoPerm, p.ganhoFatalPerm, p.modoAcertoPerm]).toEqual([0.2, 0.3, 0.4, 'somar']);
        expect([p.ganhoPorCriticos, p.ganhoPorFatal, p.modoDanoSofrido]).toEqual([2, 2, 'multiplicar']);
        expect([p.ganhoPorCriticosPerm, p.ganhoPorFatalPerm, p.modoDanoSofridoPerm]).toEqual([0.2, 0.2, 'somar']);
    });
});

describe('Ego: cada parte isolada', () => {
    it('so acerto de combate: 3 gatilhos (normal/critico/fatal), 1 acao cada, duracao combate, multiplicar', () => {
        const r = construir(EGO, [A_COMB]);
        expect(r.poder.gatilhos.map(g => g.id)).toEqual(['mp_ego_acerto_1', 'mp_ego_acerto_2', 'mp_ego_acerto_3']);
        r.poder.gatilhos.forEach((g, i) => {
            expect(g.acoes).toHaveLength(1);
            expect(g.acoes[0]).toMatchObject({ tipo: 'ganhoPermanente', unidade: 'percentual', modo: 'multiplicar', duracao: 'combate', valor: [2, 3, 4][i] });
            expect(g.evento).toMatchObject({ tipo: 'acertou', nivel: ['normal', 'critico', 'fatal'][i] });
        });
    });
    it('so acerto permanente: mesmos ids, sem campo duracao, somar, +0,2/+0,3/+0,4', () => {
        const r = construir(EGO, [A_PERM]);
        expect(r.poder.gatilhos.map(g => g.id)).toEqual(['mp_ego_acerto_1', 'mp_ego_acerto_2', 'mp_ego_acerto_3']);
        r.poder.gatilhos.forEach((g, i) => {
            expect(g.acoes).toHaveLength(1);
            expect(g.acoes[0]).not.toHaveProperty('duracao');
            expect(g.acoes[0]).toMatchObject({ unidade: 'percentual', modo: 'somar', valor: [0.2, 0.3, 0.4][i] });
        });
    });
    it('so dano sofrido combate: contador mp_ego_criticos + 3 gatilhos; zerar por ultimo na serie', () => {
        const r = construir(EGO, [D_COMB]);
        expect(r.contadores.map(c => c.id)).toEqual(['mp_ego_criticos']);
        expect(r.poder.gatilhos.map(g => g.id)).toEqual(['mp_ego_dano_1', 'mp_ego_dano_2', 'mp_ego_dano_3']);
        const serie = gatilho(r, 'mp_ego_dano_2');
        expect(serie.acoes.map(a => a.tipo)).toEqual(['ganhoPermanente', 'contador']);
        expect(serie.acoes[0]).toMatchObject({ duracao: 'combate', modo: 'multiplicar', valor: 2 });
        expect(serie.acoes[1]).toMatchObject({ op: 'zerar' });
        expect(gatilho(r, 'mp_ego_dano_3').acoes[0]).toMatchObject({ duracao: 'combate', valor: 2 });
    });
    it('so dano sofrido permanente: contador e gatilhos, sem duracao, +0,2 somar', () => {
        const r = construir(EGO, [D_PERM]);
        expect(r.contadores.map(c => c.id)).toEqual(['mp_ego_criticos']);
        const serie = gatilho(r, 'mp_ego_dano_2');
        expect(serie.acoes[0]).toMatchObject({ modo: 'somar', valor: 0.2 });
        expect(serie.acoes[0]).not.toHaveProperty('duracao');
        expect(serie.acoes[serie.acoes.length - 1]).toMatchObject({ tipo: 'contador', op: 'zerar' });
        expect(gatilho(r, 'mp_ego_dano_3').acoes[0]).toMatchObject({ modo: 'somar', valor: 0.2 });
    });
    it('ganho 0 numa parte omite o gatilho; nenhum ganho de dano omite o contador', () => {
        const r = construir(EGO, [A_COMB], { ganhoNormal: 0, ganhoCritico: 0 });
        expect(r.poder.gatilhos.map(g => g.id)).toEqual(['mp_ego_acerto_3']);
        const d = construir(EGO, [D_COMB, D_PERM], { ganhoPorCriticos: 0, ganhoPorCriticosPerm: 0, ganhoPorFatal: 2 });
        expect(d.contadores).toEqual([]);
        expect(d.poder.gatilhos.map(g => g.id)).toEqual(['mp_ego_dano_3']);
    });
});

describe('Ego: partes combinadas', () => {
    it('acerto combate + permanente: ids compartilhados com 2 acoes (combate primeiro, permanente depois)', () => {
        const r = construir(EGO, [A_COMB, A_PERM]);
        expect(r.poder.gatilhos).toHaveLength(3);
        r.poder.gatilhos.forEach((g, i) => {
            expect(g.acoes).toHaveLength(2);
            expect(g.acoes[0]).toMatchObject({ duracao: 'combate', modo: 'multiplicar', valor: [2, 3, 4][i] });
            expect(g.acoes[1]).toMatchObject({ modo: 'somar', valor: [0.2, 0.3, 0.4][i] });
            expect(g.acoes[1]).not.toHaveProperty('duracao');
        });
    });
    it('a ordem das partes na selecao nao importa (combate sempre antes)', () => {
        const a = construir(EGO, [A_COMB, A_PERM]).poder.gatilhos;
        const b = construir(EGO, [A_PERM, A_COMB]).poder.gatilhos;
        expect(b.map(g => g.acoes.map(x => x.valor))).toEqual(a.map(g => g.acoes.map(x => x.valor)));
    });
    it('dano combate + permanente: serie = [ganho combate, ganho perm, zerar] com zerar UNICO e por ultimo', () => {
        const r = construir(EGO, [D_COMB, D_PERM]);
        const serie = gatilho(r, 'mp_ego_dano_2');
        expect(serie.acoes.map(a => a.tipo)).toEqual(['ganhoPermanente', 'ganhoPermanente', 'contador']);
        expect(serie.acoes.filter(a => a.tipo === 'contador' && a.op === 'zerar')).toHaveLength(1);
        expect(serie.acoes[2]).toMatchObject({ op: 'zerar' });
        expect(gatilho(r, 'mp_ego_dano_3').acoes).toHaveLength(2);
        expect(r.contadores).toHaveLength(1); // contador compartilhado, sem duplicar
        expect(gatilho(r, 'mp_ego_dano_1').acoes).toHaveLength(1); // conta critico uma vez so
    });
    it('selecao padrao completa respeita os limites: <=8 gatilhos, <=6 acoes cada, ids unicos, sem avisos de descarte', () => {
        const r = construir(EGO, null);
        expect(r.poder.gatilhos.length).toBeLessThanOrEqual(LIMITE_GATILHOS_POR_FONTE);
        expect(r.poder.gatilhos).toHaveLength(6);
        expect(new Set(r.poder.gatilhos.map(g => g.id)).size).toBe(6);
        r.poder.gatilhos.forEach(g => expect(g.acoes.length).toBeLessThanOrEqual(6));
        expect(r.avisos.filter(a => /não foi criado|mais de/.test(a))).toEqual([]);
        expect(r.contadores).toHaveLength(1);
    });
    it('ids estaveis: o mesmo id para a mesma situacao em qualquer combinacao', () => {
        const idsDe = (sel) => construir(EGO, sel).poder.gatilhos.map(g => g.id);
        expect(idsDe([A_COMB])).toEqual(idsDe([A_PERM]));
        expect(idsDe([A_COMB, A_PERM])).toEqual(idsDe([A_COMB]));
        expect(idsDe([D_COMB])).toEqual(idsDe([D_PERM]));
        expect(idsDe(null).slice().sort()).toEqual(['mp_ego_acerto_1', 'mp_ego_acerto_2', 'mp_ego_acerto_3', 'mp_ego_dano_1', 'mp_ego_dano_2', 'mp_ego_dano_3']);
        expect(idsDe(null)).toEqual(idsDe(null));
    });
    it('nomes <= 60 caracteres mesmo com valores longos e partes combinadas; nenhum gatilho descartado', () => {
        const longo = { ganhoNormal: 123.456789, ganhoCritico: 123.456789, ganhoFatal: 123.456789, ganhoNormalPerm: 987.654321, ganhoCriticoPerm: 987.654321, ganhoFatalPerm: 987.654321, ganhoPorCriticos: 555.123456, ganhoPorCriticosPerm: 555.123456, ganhoPorFatal: 555.123456, ganhoPorFatalPerm: 555.123456 };
        const r = construir(EGO, null, longo);
        expect(r.poder.gatilhos).toHaveLength(6);
        r.poder.gatilhos.forEach(g => expect(g.nome.length).toBeLessThanOrEqual(60));
        const padrao = construir(EGO, null);
        padrao.poder.gatilhos.forEach(g => expect(g.nome.length).toBeLessThanOrEqual(60));
    });
    it('nome dos gatilhos combinados cita as duas duracoes', () => {
        const nome = gatilho(construir(EGO, [A_COMB, A_PERM]), 'mp_ego_acerto_1').nome;
        expect(nome).toContain('combate'); expect(nome).toMatch(/perm/);
    });
});

describe('Ego: efeito no jogo (ponta a ponta)', () => {
    it('acerto normal: aplica ganho de combate (multiplicar) E permanente (somar) na ficha; fimDeLuta zera so o de combate', () => {
        const f = { ...fichaNova(), vida: { atual: 1e9 } };
        expect(aplicar(f, EGO).ok).toBe(true);
        f.poderes[0].ativa = true;
        for (let i = 0; i < 10; i++) dispararEventoNaFicha(f, { tipo: 'acertou', nivel: 'normal' }, { cenaId: 'c', nome: 'Eu' });
        expect(f.ganhosCombate.fatorPoder).toBeCloseTo(1.02 ** 10, 8);
        expect(f.ganhosPermanentes.poderCalculado).toBeCloseTo(0.02, 8); // 10 x 0,2%
        dispararEventoNaFicha(f, { tipo: 'fimDeLuta' }, { cenaId: 'c', nome: 'Eu' });
        expect(f.ganhosCombate).toEqual({ poderCalculado: 0, fatorPoder: 1 });
        expect(f.ganhosPermanentes.poderCalculado).toBeCloseTo(0.02, 8);
    });
    it('3 criticos sofridos: serie dispara os dois ganhos e zera o contador (le antes de zerar)', () => {
        const f = { ...fichaNova(), vida: { atual: 1e9 } };
        aplicar(f, EGO); f.poderes[0].ativa = true;
        for (let i = 0; i < 3; i++) dispararEventoNaFicha(f, { tipo: 'atingido', nivel: 'critico' }, { cenaId: 'c', nome: 'Eu' });
        expect(f.ganhosCombate.fatorPoder).toBeCloseTo(1.02, 8);
        expect(f.ganhosPermanentes.poderCalculado).toBeCloseTo(0.002, 8);
        expect(f.contadores.find(c => c.id === 'mp_ego_criticos').valor).toBe(0);
    });
});

describe('Ego: Editar partes idempotente e migracao', () => {
    it('aplicar duas vezes a mesma selecao nao duplica poder, gatilhos nem contadores', () => {
        const f = fichaNova();
        aplicar(f, EGO);
        const depois1 = clone(f);
        const r2 = aplicar(f, EGO);
        expect(r2).toMatchObject({ ok: true, modo: 'editar' });
        expect(f.poderes).toHaveLength(1);
        expect(f.poderes[0].gatilhos).toEqual(depois1.poderes[0].gatilhos);
        expect(f.contadores).toHaveLength(1);
        expect(f.poderes[0].efeitos).toEqual(depois1.poderes[0].efeitos);
        aplicar(f, EGO);
        expect(f.poderes[0].gatilhos).toHaveLength(6);
    });
    it('desmarcar as partes permanentes remove so as acoes permanentes (ids ficam)', () => {
        const f = fichaNova();
        aplicar(f, EGO);
        aplicar(f, EGO, selecaoPadrao(m(EGO)).filter(id => id !== A_PERM && id !== D_PERM));
        const gs = f.poderes[0].gatilhos;
        expect(gs).toHaveLength(6);
        gs.forEach(g => ganhosDe(g).forEach(a => expect(a.duracao).toBe('combate')));
        expect(gs.find(g => g.id === 'mp_ego_dano_2').acoes.map(a => a.tipo)).toEqual(['ganhoPermanente', 'contador']);
    });
    it('desmarcar as partes de combate deixa so os ganhos permanentes', () => {
        const f = fichaNova();
        aplicar(f, EGO);
        aplicar(f, EGO, selecaoPadrao(m(EGO)).filter(id => id !== A_COMB && id !== D_COMB));
        f.poderes[0].gatilhos.forEach(g => ganhosDe(g).forEach(a => expect(a).not.toHaveProperty('duracao')));
    });
    it('desmarcar todas as de dano remove o contador mp_ego_criticos e os gatilhos de dano', () => {
        const f = fichaNova();
        aplicar(f, EGO);
        aplicar(f, EGO, selecaoPadrao(m(EGO)).filter(id => id !== D_COMB && id !== D_PERM));
        expect(f.contadores.find(c => c.id === 'mp_ego_criticos')).toBeUndefined();
        expect(f.poderes[0].gatilhos.map(g => g.id)).toEqual(['mp_ego_acerto_1', 'mp_ego_acerto_2', 'mp_ego_acerto_3']);
    });
    it('gatilho manual do Mestre/jogador sobrevive a regeneracao; ocupando vagas, o limite bloqueia sem mutar', () => {
        const f = fichaNova();
        aplicar(f, EGO);
        f.poderes[0].gatilhos.push({ id: 'manual_1', nome: 'Meu', modo: 'automatico', armado: true, evento: { tipo: 'turnoInicio' }, acoes: [{ tipo: 'mensagem', texto: 'oi' }] });
        expect(aplicar(f, EGO).ok).toBe(true);
        expect(f.poderes[0].gatilhos.some(g => g.id === 'manual_1')).toBe(true);
        expect(f.poderes[0].gatilhos).toHaveLength(7);
        // 3 manuais extras = 5 manuais + 6 do modelo > 8: bloqueia
        const manuais = [2, 3, 4].map(n => ({ id: 'manual_' + n, nome: 'M' + n, modo: 'automatico', armado: true, evento: { tipo: 'turnoInicio' }, acoes: [{ tipo: 'mensagem', texto: 'x' }] }));
        f.poderes[0].gatilhos.push(...manuais);
        const antes = clone(f);
        const r = aplicar(f, EGO);
        expect(r.ok).toBe(false);
        expect(f).toEqual(antes);
    });
    it('params ANTIGOS (modoAcerto, ganhoNormal/Critico/Fatal, modoDanoSofrido, ganhoPorCriticos/Fatal, criticosPorGanho) viram a parte TEMPORARIA', () => {
        const antigos = { modoAcerto: 'somar', ganhoNormal: 5, ganhoCritico: 6, ganhoFatal: 7, modoDanoSofrido: 'somar', ganhoPorCriticos: 8, ganhoPorFatal: 9, criticosPorGanho: 4 };
        const r = construir(EGO, [A_COMB, D_COMB], antigos);
        expect(ganhosDe(gatilho(r, 'mp_ego_acerto_1'))[0]).toMatchObject({ duracao: 'combate', modo: 'somar', valor: 5 });
        expect(ganhosDe(gatilho(r, 'mp_ego_acerto_3'))[0]).toMatchObject({ duracao: 'combate', valor: 7 });
        expect(ganhosDe(gatilho(r, 'mp_ego_dano_2'))[0]).toMatchObject({ duracao: 'combate', modo: 'somar', valor: 8 });
        expect(gatilho(r, 'mp_ego_dano_2').evento).toMatchObject({ valor: 4 });
        expect(ganhosDe(gatilho(r, 'mp_ego_dano_3'))[0]).toMatchObject({ duracao: 'combate', valor: 9 });
        // as partes permanentes continuam nos padroes (sufixo Perm independente)
        const p = normalizarParams(m(EGO), antigos);
        expect(p.ganhoNormalPerm).toBe(0.2);
        expect(p.modoAcertoPerm).toBe('somar');
    });
    it('parametros permanentes (sufixo Perm) sao independentes dos temporarios', () => {
        const r = construir(EGO, [A_COMB, A_PERM], { ganhoNormal: 10, ganhoNormalPerm: 1, modoAcertoPerm: 'multiplicar' });
        const [c, p] = ganhosDe(gatilho(r, 'mp_ego_acerto_1'));
        expect(c).toMatchObject({ duracao: 'combate', valor: 10, modo: 'multiplicar' });
        expect(p).toMatchObject({ valor: 1, modo: 'multiplicar' });
        expect(p).not.toHaveProperty('duracao');
    });
    it('modelo.params antigos salvos no poder (sem chaves Perm) regeneram sem quebrar', () => {
        const f = fichaNova();
        aplicar(f, EGO, ['multiplicadores', A_COMB, D_COMB, 'imunidadeCondicoes', 'ascensaoAdicional', 'habilidadesDeRaca'], { ganhoNormal: 3 });
        f.poderes[0].modelo.params = { ganhoNormal: 3, modoAcerto: 'multiplicar' }; // so os antigos
        const r = aplicar(f, EGO, selecaoPadrao(m(EGO)), f.poderes[0].modelo.params);
        expect(r.ok).toBe(true);
        expect(ganhosDe(f.poderes[0].gatilhos.find(g => g.id === 'mp_ego_acerto_1'))[0]).toMatchObject({ valor: 3, duracao: 'combate' });
        expect(f.poderes[0].gatilhos.find(g => g.id === 'mp_ego_acerto_1').acoes).toHaveLength(2);
    });
});

describe('Ego: aviso ao regenerar Ego antigo sem partes permanentes', () => {
    const SEL_SEM_PERM = selecaoPadrao(m(EGO)).filter(id => id !== A_PERM && id !== D_PERM);
    // Ego "antigo": gatilhos legados SEM duracao (ganho permanente em %), como o app gerava antes da mudanca.
    const egoAntigo = () => {
        const f = fichaNova();
        aplicar(f, EGO, SEL_SEM_PERM);
        f.poderes[0].gatilhos.forEach(g => g.acoes.forEach((a) => { delete a.duracao; }));
        return f;
    };
    it('regenerar sem permanentes: AVISO de que agora os ganhos sao temporarios', () => {
        const f = egoAntigo();
        expect(planejarModelo(EGO, SEL_SEM_PERM, {}, f).avisos.join('|')).toMatch(/temporários/); // plano antes de aplicar
        const r = aplicar(f, EGO, SEL_SEM_PERM);
        expect(r.ok).toBe(true);
        expect(r.avisos.join('|')).toMatch(/temporários/);
    });
    it('regenerar COM as partes permanentes marcadas: sem aviso', () => {
        const f = egoAntigo();
        expect(planejarModelo(EGO, selecaoPadrao(m(EGO)), {}, f).avisos.join('|')).not.toMatch(/temporários/);
        const r = aplicar(f, EGO, selecaoPadrao(m(EGO)));
        expect(r.avisos.join('|')).not.toMatch(/temporários/);
    });
    it('so uma parte permanente marcada ja basta para nao avisar', () => {
        [A_PERM, D_PERM].forEach((id) => {
            const f = egoAntigo();
            const r = aplicar(f, EGO, [...SEL_SEM_PERM, id]);
            expect(r.avisos.join('|')).not.toMatch(/temporários/);
        });
    });
    it('poder novo (sem Ego na ficha): sem aviso', () => {
        expect(construir(EGO, SEL_SEM_PERM).avisos.join('|')).not.toMatch(/temporários/);
        expect(aplicar(fichaNova(), EGO, SEL_SEM_PERM).avisos.join('|')).not.toMatch(/temporários/);
    });
    it('Ego no formato novo (acoes com duracao combate) regenerado sem permanentes: sem aviso', () => {
        const f = fichaNova();
        aplicar(f, EGO, SEL_SEM_PERM);
        const r = aplicar(f, EGO, SEL_SEM_PERM);
        expect(r.avisos.join('|')).not.toMatch(/temporários/);
    });
});

describe('Ego: limite de 12 contadores', () => {
    it('ficha cheia (12 contadores): planejar e aplicar recusam sem mutar', () => {
        const f = fichaNova();
        f.contadores = Array.from({ length: LIMITE_CONTADORES }, (_, i) => normalizarContador({ id: 'c' + i, nome: 'c' + i, valor: 0, min: 0, max: 9 }));
        const plano = planejarModelo(EGO, selecaoPadrao(m(EGO)), {}, f);
        expect(plano.ok).toBe(false);
        expect(plano.erro).toMatch(/12 contadores/);
        const antes = clone(f);
        expect(aplicar(f, EGO).ok).toBe(false);
        expect(f).toEqual(antes);
    });
    it('11 contadores + 1 do Ego = 12: cabe', () => {
        const f = fichaNova();
        f.contadores = Array.from({ length: LIMITE_CONTADORES - 1 }, (_, i) => normalizarContador({ id: 'c' + i, nome: 'c' + i, valor: 0, min: 0, max: 9 }));
        expect(planejarModelo(EGO, selecaoPadrao(m(EGO)), {}, f).ok).toBe(true);
        expect(aplicar(f, EGO).ok).toBe(true);
        expect(f.contadores).toHaveLength(LIMITE_CONTADORES);
    });
    it('partes de dano combate + permanente criam UM contador so', () => {
        const f = fichaNova();
        aplicar(f, EGO);
        expect(f.contadores.filter(c => c.id === 'mp_ego_criticos')).toHaveLength(1);
    });
});

// ---------------------------------------------------------------------------------------------------------------------------------
describe('Verg: crescimentoAdaptacao (Adaptacao por diferenca de Poder)', () => {
    const PARTE = 'crescimentoAdaptacao';
    const SEL = ['acumuloDeDano', PARTE];
    const fichaCombate = (combate = {}) => ({ ...fichaNova(), combate: { ...combate } });

    it('a parte antiga Acerto por turno saiu e a nova parte existe com fracao padrao 50 (min 0 max 100)', () => {
        const ids = m(VERG).partes.map(p => p.id);
        expect(ids).not.toContain('acertoPorTurno');
        expect(ids).toContain(PARTE);
        const par = m(VERG).partes.find(p => p.id === PARTE).parametros[0];
        expect(par).toMatchObject({ id: 'fracaoDaDiferenca', padrao: 50, min: 0, max: 100 });
        expect(paramsPadrao(m(VERG)).fracaoDaDiferenca).toBe(50);
        expect(normalizarParams(m(VERG), { fracaoDaDiferenca: 0 }).fracaoDaDiferenca).toBe(0);
        expect(normalizarParams(m(VERG), { fracaoDaDiferenca: 99999 }).fracaoDaDiferenca).toBe(100);
        expect(normalizarParams(m(VERG), { fracaoDaDiferenca: 'abc' }).fracaoDaDiferenca).toBe(50);
        expect(normalizarParams(m(VERG), { acertoPorTurno: 50 }).fracaoDaDiferenca).toBe(50); // param antigo ignorado
    });
    it('nenhum gatilho de buff de Acerto e criado; so os 2 do acumulo', () => {
        const r = construir(VERG, null);
        expect(r.poder.gatilhos.map(g => g.id)).toEqual(['mp_verg_acumulo_1', 'mp_verg_acumulo_2']);
        expect(r.poder.gatilhos.some(g => g.acoes.some(a => a.tipo === 'buff'))).toBe(false);
        expect(r.poder.gatilhos.some(g => g.id === 'mp_verg_acerto_1')).toBe(false);
    });
    it('aplicar liga adaptacaoLigada e define adaptacaoFracao (ficha com combate ausente tambem)', () => {
        const f = fichaCombate({ adaptacaoLigada: false, adaptacaoFracao: 5 });
        expect(aplicar(f, VERG, SEL, { fracaoDaDiferenca: 7.5 }).ok).toBe(true);
        expect(f.combate.adaptacaoLigada).toBe(true);
        expect(f.combate.adaptacaoFracao).toBe(7.5);
        const g = fichaNova(); // sem combate
        expect(aplicar(g, VERG, SEL).ok).toBe(true);
        expect(g.combate).toMatchObject({ adaptacaoLigada: true, adaptacaoFracao: 50 });
    });
    it('ligou: true quando estava DESLIGADO', () => {
        const f = fichaCombate({ adaptacaoLigada: false });
        aplicar(f, VERG, SEL, { fracaoDaDiferenca: 6 });
        expect(f.poderes[0].modelo.adaptacao).toEqual({ ligou: true, fracao: 6 });
        const g = fichaNova();
        aplicar(g, VERG, SEL);
        expect(g.poderes[0].modelo.adaptacao).toEqual({ ligou: true, fracao: 50 });
    });
    it('ligou: false quando estava ligado a mao (e a taxa do modelo passa a valer)', () => {
        const f = fichaCombate({ adaptacaoLigada: true, adaptacaoFracao: 3 });
        aplicar(f, VERG, SEL, { fracaoDaDiferenca: 9 });
        expect(f.poderes[0].modelo.adaptacao).toEqual({ ligou: false, fracao: 9 });
        expect(f.combate.adaptacaoLigada).toBe(true);
        expect(f.combate.adaptacaoFracao).toBe(9);
    });
    it('ligou continua true quando o modelo ja ligou antes (reaplicar com interruptor ligado)', () => {
        const f = fichaCombate({ adaptacaoLigada: false });
        aplicar(f, VERG, SEL, { fracaoDaDiferenca: 5 });
        expect(f.combate.adaptacaoLigada).toBe(true); // agora ligado (pelo modelo)
        aplicar(f, VERG, SEL, { fracaoDaDiferenca: 8 });
        expect(f.poderes[0].modelo.adaptacao).toEqual({ ligou: true, fracao: 8 });
    });
    it('editar a taxa atualiza adaptacaoFracao e adaptacao.fracao; poder nao duplica', () => {
        const f = fichaCombate({ adaptacaoLigada: false });
        aplicar(f, VERG, SEL, { fracaoDaDiferenca: 5 });
        aplicar(f, VERG, SEL, { fracaoDaDiferenca: 12 });
        expect(f.poderes).toHaveLength(1);
        expect(f.combate.adaptacaoFracao).toBe(12);
        expect(f.poderes[0].modelo.adaptacao.fracao).toBe(12);
        expect(f.poderes[0].modelo.params.fracaoDaDiferenca).toBe(12);
    });
    it('desmarcar a parte: desliga adaptacaoLigada SO se o modelo ligou', () => {
        const ligou = fichaCombate({ adaptacaoLigada: false });
        aplicar(ligou, VERG, SEL);
        aplicar(ligou, VERG, ['acumuloDeDano']);
        expect(ligou.combate.adaptacaoLigada).toBe(false);
        expect(ligou.poderes[0].modelo.adaptacao).toBeUndefined();

        const aMao = fichaCombate({ adaptacaoLigada: true, adaptacaoFracao: 3 });
        aplicar(aMao, VERG, SEL);
        aplicar(aMao, VERG, ['acumuloDeDano']);
        expect(aMao.combate.adaptacaoLigada).toBe(true);
    });
    it('desmarcar a parte quando ela nunca foi marcada nao mexe no interruptor', () => {
        const f = fichaCombate({ adaptacaoLigada: true, adaptacaoFracao: 4 });
        aplicar(f, VERG, ['acumuloDeDano']);
        expect(f.combate).toMatchObject({ adaptacaoLigada: true, adaptacaoFracao: 4 });
        expect(f.poderes[0].modelo.adaptacao).toBeUndefined();
    });
    it('atomicidade: contadores no limite -> ok false e ficha IDENTICA (combate intacto)', () => {
        const f = fichaCombate({ adaptacaoLigada: false, adaptacaoFracao: 2 });
        f.contadores = Array.from({ length: LIMITE_CONTADORES }, (_, i) => normalizarContador({ id: 'c' + i, nome: 'c' + i, valor: 0, min: 0, max: 9 }));
        const antes = clone(f);
        const r = aplicar(f, VERG, SEL, { fracaoDaDiferenca: 50 });
        expect(r.ok).toBe(false);
        expect(f).toEqual(antes);
    });
    it('atomicidade: gatilhos no limite (edicao) -> ok false e ficha IDENTICA', () => {
        const f = fichaCombate({ adaptacaoLigada: false });
        aplicar(f, VERG, ['acumuloDeDano']);
        const manuais = Array.from({ length: 7 }, (_, i) => ({ id: 'man_' + i, nome: 'M' + i, modo: 'automatico', armado: true, evento: { tipo: 'turnoInicio' }, acoes: [{ tipo: 'mensagem', texto: 'x' }] }));
        f.poderes[0].gatilhos.push(...manuais); // 2 do modelo + 7 manuais => ao regenerar: 7 + 2 = 9 > 8
        const antes = clone(f);
        const r = aplicar(f, VERG, SEL, { fracaoDaDiferenca: 50 });
        expect(r.ok).toBe(false);
        expect(f).toEqual(antes);
        expect(f.combate.adaptacaoLigada).toBe(false);
    });
    it('nao-Mestre ou selecao vazia: nada muda', () => {
        const f = fichaCombate({ adaptacaoLigada: false });
        const antes = clone(f);
        expect(aplicarModeloNaFicha(f, { isMestre: false, modeloId: VERG, selecao: SEL, params: {} }).ok).toBe(false);
        expect(aplicar(f, VERG, []).ok).toBe(false);
        expect(f).toEqual(antes);
    });
    it('Mestre aplicando em OUTRA ficha grava os campos nela (e a ficha do Mestre fica intacta)', () => {
        const fichaMestre = fichaCombate({ adaptacaoLigada: false, adaptacaoFracao: 5 });
        const fichaAlvo = fichaCombate({ adaptacaoLigada: false, adaptacaoFracao: 5 });
        const antesMestre = clone(fichaMestre);
        expect(aplicar(fichaAlvo, VERG, SEL, { fracaoDaDiferenca: 15 }, { opcoes: { origem: { tipo: 'herdada', fonte: 'Verg' } } }).ok).toBe(true);
        expect(fichaAlvo.combate).toMatchObject({ adaptacaoLigada: true, adaptacaoFracao: 15 });
        expect(fichaAlvo.poderes[0].modelo.adaptacao).toEqual({ ligou: true, fracao: 15 });
        expect(fichaMestre).toEqual(antesMestre);
    });
    it('Adaptacao: depois de aplicar, ela fica ligada e o fator de combate F multiplica o Poder', () => {
        const f = { ...fichaCombate({ adaptacaoLigada: false }), vida: { base: 600000 }, mana: { base: 0 }, aura: { base: 0 }, chakra: { base: 0 }, corpo: { base: 0 }, forca: { base: 100 }, destreza: { base: 0 }, inteligencia: { base: 0 }, sabedoria: { base: 0 }, energiaEsp: { base: 0 }, carisma: { base: 0 }, stamina: { base: 0 }, constituicao: { base: 0 }, divisores: { vida: 1e-12 }, bio: {}, estetica: {}, labels: {}, inventario: [], seresSelados: [] };
        aplicar(f, VERG, SEL, { fracaoDaDiferenca: 10 });
        expect(f.combate.adaptacaoLigada).toBe(true);
        const poderSemF = calcularPoderAtual(f, 1).poderExato;
        f.combate.adaptacaoFator = 1.4;
        expect(fatorAdaptacao(f)).toBe(1.4);
        const poderComF = calcularPoderAtual(f, 1).poderExato;
        expect(poderComF / poderSemF).toBeCloseTo(1.4, 3);
    });
    it('sem a parte (interruptor desligado) a Adaptacao continua desligada', () => {
        const f = fichaCombate({ adaptacaoLigada: false });
        aplicar(f, VERG, ['acumuloDeDano']);
        expect(f.combate.adaptacaoLigada).toBe(false);
    });
    it('planejarModelo expoe adaptacao {taxa} so com a parte marcada', () => {
        expect(planejarModelo(VERG, SEL, { fracaoDaDiferenca: 3 }, fichaNova()).adaptacao).toEqual({ fracao: 3 });
        expect(planejarModelo(VERG, ['acumuloDeDano'], {}, fichaNova()).adaptacao).toBeNull();
        expect(planejarModelo(EGO, selecaoPadrao(m(EGO)), {}, fichaNova()).adaptacao).toBeNull();
    });
    it('planejar/construir nao mutam a ficha (so aplicar grava)', () => {
        const f = fichaCombate({ adaptacaoLigada: false });
        const antes = clone(f);
        planejarModelo(VERG, SEL, {}, f); construir(VERG, SEL, {}, f);
        expect(f).toEqual(antes);
    });
});

describe('Verg: migracao do gatilho legado mp_verg_acerto_1', () => {
    const legado = () => {
        const f = { ...fichaNova(), combate: { adaptacaoLigada: false } };
        f.contadores = [normalizarContador({ id: 'mp_verg_acumulo', nome: 'Verg Avesta: acumulado', valor: 3, min: 0, max: 999, poderId: 'pid1' })];
        f.poderes = [{
            id: 'pid1', nome: 'Verg Avesta', notasIA: 'Acerto por turno: +5 de Acerto por turno de combate.\nAcúmulo: o app conta GOLPES sofridos (não o dano exato); o Mestre ajusta o total em "Ganhos permanentes" se quiser o valor exato.',
            modelo: { id: 'vergAvesta', partes: ['acumuloDeDano', 'acertoPorTurno'], params: { acertoPorTurno: 5 } },
            efeitos: [],
            gatilhos: [
                { id: 'mp_verg_acerto_1', nome: 'Verg: +5 de Acerto por turno', modo: 'automatico', armado: true, evento: { tipo: 'turnoInicio' }, acoes: [{ tipo: 'buff', atributo: 'acerto', valor: 5, duracao: 3, modo: 'combate' }] },
                { id: 'mp_verg_acumulo_1', nome: 'Verg: acumula o golpe sofrido', modo: 'automatico', armado: true, passivo: true, evento: { tipo: 'atingido', nivel: 'qualquer' }, acoes: [{ tipo: 'contador', id: 'mp_verg_acumulo', op: 'somar', valor: 1 }] },
                { id: 'manual_1', nome: 'Manual', modo: 'automatico', armado: true, evento: { tipo: 'turnoInicio' }, acoes: [{ tipo: 'mensagem', texto: 'x' }] },
            ],
        }];
        return f;
    };
    it('regenerar remove mp_verg_acerto_1, preserva o manual e avisa da migracao', () => {
        const f = legado();
        const r = aplicar(f, VERG, ['acumuloDeDano']);
        expect(r.ok).toBe(true);
        const ids = f.poderes[0].gatilhos.map(g => g.id);
        expect(ids).not.toContain('mp_verg_acerto_1');
        expect(ids).toContain('manual_1');
        expect(ids).toEqual(expect.arrayContaining(['mp_verg_acumulo_1', 'mp_verg_acumulo_2']));
        expect(r.avisos.join('|')).toMatch(/Acerto por turno do Verg/);
        expect(f.poderes[0].modelo.partes).not.toContain('acertoPorTurno');
        expect(f.poderes[0].notasIA).not.toMatch(/^Acerto por turno: \+/m);
    });
    it('regenerar marcando a parte nova: gatilho antigo sai, interruptor liga e params antigos sao ignorados', () => {
        const f = legado();
        const r = aplicar(f, VERG, ['acumuloDeDano', 'crescimentoAdaptacao'], { acertoPorTurno: 5, fracaoDaDiferenca: 4 });
        expect(r.ok).toBe(true);
        expect(f.poderes[0].gatilhos.some(g => g.id === 'mp_verg_acerto_1')).toBe(false);
        expect(f.combate).toMatchObject({ adaptacaoLigada: true, adaptacaoFracao: 4 });
        expect(f.poderes[0].modelo.adaptacao).toEqual({ ligou: true, fracao: 4 });
        expect(f.poderes[0].modelo.params.acertoPorTurno).toBeUndefined();
    });
    it('o gatilho legado liberado nao conta no limite de 8 (editar com 7 manuais + legado funciona so se couber)', () => {
        const f = legado();
        f.poderes[0].gatilhos.push(...Array.from({ length: 4 }, (_, i) => ({ id: 'extra_' + i, nome: 'E' + i, modo: 'automatico', armado: true, evento: { tipo: 'turnoInicio' }, acoes: [{ tipo: 'mensagem', texto: 'x' }] })));
        // 5 manuais + 2 do modelo = 7 <= 8
        expect(aplicar(f, VERG, ['acumuloDeDano']).ok).toBe(true);
        expect(f.poderes[0].gatilhos).toHaveLength(7);
    });
    it('acharPoderDoModelo encontra o Verg apos migrar', () => {
        const f = legado();
        aplicar(f, VERG, ['acumuloDeDano', 'crescimentoAdaptacao']);
        expect(acharPoderDoModelo(f, VERG)).toBe(f.poderes[0]);
    });
});
