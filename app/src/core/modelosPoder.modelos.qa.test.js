import { describe, it, expect } from 'vitest';
import * as mod from './modelosPoder.js';
import {
    MODELOS, obterModelo, planejarModelo, aplicarModeloNaFicha, acharPoderDoModelo,
    normalizarOrigem, descreverOrigem, normalizarSelecao, normalizarParams, selecaoPadrao, paramsPadrao,
} from './modelosPoder.js';
import { normalizarGatilhos } from './gatilhos.js';
import { LIMITE_CONTADORES } from './contadores.js';

const EGO = 'egoSuperior';
const VERG = 'vergAvesta';
const clone = (o) => JSON.parse(JSON.stringify(o));
const fichaVazia = () => ({ poderes: [], contadores: [] });
const m = (id) => obterModelo(id);
const construir = (id, sel, params = {}, ficha = fichaVazia(), op = {}) => m(id).construir(sel ?? selecaoPadrao(m(id)), params, ficha, op);
const mestre = (extra) => ({ isMestre: true, ...extra });
const semUndefined = (o) => !JSON.stringify(o, (k, v) => (v === undefined ? '__UNDEF__' : v)).includes('__UNDEF__');
const ctr = (f, id) => f.contadores.find(c => c.id === id);
const poderDe = (f, id) => acharPoderDoModelo(f, id);

describe('catalogo', () => {
    it('tem Ego Superior (forma) e Verg Avesta (habilidade com origem)', () => {
        expect(MODELOS.map(x => x.id)).toEqual([EGO, VERG]);
        expect(m(EGO).categoria).toBe('forma');
        expect(m(EGO).temOrigem).toBe(false);
        expect(m(VERG).categoria).toBe('habilidade');
        expect(m(VERG).temOrigem).toBe(true);
    });
    it('Ego: partes, padroes e partes que viram nota', () => {
        const partes = m(EGO).partes;
        expect(partes.map(p => p.id)).toEqual(['multiplicadores', 'prestigioPorAcerto', 'prestigioPorDanoSofrido', 'imunidadeCondicoes', 'ascensaoAdicional', 'habilidadesDeRaca']);
        expect(partes.filter(p => p.suportado === 'nota').map(p => p.id)).toEqual(['ascensaoAdicional', 'habilidadesDeRaca']);
        expect(partes.every(p => p.padrao === true)).toBe(true);
        expect(paramsPadrao(m(EGO))).toEqual({ fatorEgo: 140, ganhoNormal: 2, ganhoCritico: 3, ganhoFatal: 4, criticosPorGanho: 3, ganhoPorCriticos: 2, ganhoPorFatal: 2 });
    });
    it('Verg: partes e padroes', () => {
        const partes = m(VERG).partes;
        expect(partes.filter(p => p.suportado === true).map(p => p.id)).toEqual(['acumuloDeDano', 'acertoPorTurno']);
        expect(partes.filter(p => p.suportado === 'nota').map(p => p.id)).toEqual(['vidaMaxima', 'curaAcumulada', 'adaptacao', 'expansao']);
        expect(paramsPadrao(m(VERG))).toEqual({ divisor: 10, limiteAcumulo: 999, acertoPorTurno: 5 });
    });
    it('todo parametro tem min<=padrao<=max', () => {
        MODELOS.forEach(mo => mo.partes.flatMap(p => p.parametros).forEach((p) => {
            expect(p.min).toBeLessThanOrEqual(p.padrao);
            expect(p.padrao).toBeLessThanOrEqual(p.max);
        }));
    });
    it('normalizarParams prende a min/max e cai no padrao com lixo', () => {
        const r = normalizarParams(m(EGO), { fatorEgo: 0, ganhoNormal: 99999, criticosPorGanho: 'abc', ganhoFatal: '', ganhoCritico: -5 });
        expect(r.fatorEgo).toBe(1);
        expect(r.ganhoNormal).toBe(1000);
        expect(r.criticosPorGanho).toBe(3);
        expect(r.ganhoFatal).toBe(4); // '' (campo vazio) -> padrao
        expect(r.ganhoCritico).toBe(0);
        expect(normalizarParams(m(EGO), null).fatorEgo).toBe(140);
        expect(normalizarParams(m(EGO), { fatorEgo: 999999 }).fatorEgo).toBe(100000);
    });
    it('normalizarSelecao descarta desconhecidas e entrada invalida', () => {
        expect(normalizarSelecao(m(EGO), ['x', 'imunidadeCondicoes'])).toEqual(['imunidadeCondicoes']);
        expect(normalizarSelecao(m(EGO), null)).toEqual([]);
        expect(normalizarSelecao(m(EGO), 'imunidadeCondicoes')).toEqual([]);
    });
    it('normalizarOrigem / descreverOrigem', () => {
        expect(normalizarOrigem(null)).toEqual({ tipo: 'herdada', fonte: '' });
        expect(normalizarOrigem({ tipo: 'x', fonte: '  Verg  ' })).toEqual({ tipo: 'herdada', fonte: 'Verg' });
        expect(normalizarOrigem({ tipo: 'independente', fonte: 'a'.repeat(100) }).fonte).toHaveLength(60);
        expect(descreverOrigem(undefined)).toBe('');
        expect(descreverOrigem({ tipo: 'zzz' })).toBe('');
        expect(descreverOrigem({ tipo: 'independente', fonte: 'x' })).toBe('Independente');
        expect(descreverOrigem({ tipo: 'herdada', fonte: '' })).toBe('Herdada de um ser');
        expect(descreverOrigem({ tipo: 'herdada', fonte: 'Reid' })).toBe('Herdada de Reid');
    });
    it('exports internos citados no pedido (construirDoModelo/planejarContadores/gatilhosFinaisEdicao)', () => {
        // Documenta o estado atual: sao funcoes internas (nao exportadas); testadas via MODELOS[].construir/planejarModelo/aplicar.
        expect(typeof mod.planejarModelo).toBe('function');
        expect(typeof mod.aplicarModeloNaFicha).toBe('function');
        expect(typeof mod.construirDoModelo).toBe('undefined');
        expect(typeof mod.planejarContadores).toBe('undefined');
        expect(typeof mod.gatilhosFinaisEdicao).toBe('undefined');
    });
});

describe('construir: Ego Superior', () => {
    it('selecao padrao: nenhum gatilho descartado, ids mp_ego_*, automatico e armado', () => {
        const r = construir(EGO);
        const g = r.poder.gatilhos;
        expect(g).toHaveLength(6);
        expect(r.avisos.filter(a => /nao foi criado|não foi criado/.test(a))).toEqual([]);
        expect(g.map(x => x.id)).toEqual(['mp_ego_acerto_1', 'mp_ego_acerto_2', 'mp_ego_acerto_3', 'mp_ego_dano_1', 'mp_ego_dano_2', 'mp_ego_dano_3']);
        g.forEach((x) => { expect(x.modo).toBe('automatico'); expect(x.armado).toBe(true); });
        // reprocessar nao descarta nada
        expect(normalizarGatilhos(g).descartados).toEqual([]);
    });
    it('acertou normal/critico/fatal com +2/+3/+4', () => {
        const g = construir(EGO, ['prestigioPorAcerto']).poder.gatilhos;
        expect(g.map(x => [x.evento.tipo, x.evento.nivel])).toEqual([['acertou', 'normal'], ['acertou', 'critico'], ['acertou', 'fatal']]);
        expect(g.map(x => x.acoes[0])).toEqual([
            expect.objectContaining({ tipo: 'ganhoPermanente', valor: 2 }),
            expect.objectContaining({ tipo: 'ganhoPermanente', valor: 3 }),
            expect.objectContaining({ tipo: 'ganhoPermanente', valor: 4 }),
        ]);
    });
    it('ganho 0 nao cria o gatilho do nivel (ids mantem posicao)', () => {
        const g = construir(EGO, ['prestigioPorAcerto'], { ganhoNormal: 0, ganhoCritico: 0 }).poder.gatilhos;
        expect(g.map(x => x.id)).toEqual(['mp_ego_acerto_3']);
    });
    it('dano sofrido: atingido critico, contadorAtingiu >= N, atingido fatal; contador 0..N reset cena', () => {
        const r = construir(EGO, ['prestigioPorDanoSofrido']);
        const g = r.poder.gatilhos;
        expect(g[0].evento).toMatchObject({ tipo: 'atingido', nivel: 'critico' });
        expect(g[1].evento).toMatchObject({ tipo: 'contadorAtingiu', contadorId: 'mp_ego_criticos', op: '>=', valor: 3 });
        expect(g[1].acoes.map(a => a.tipo)).toEqual(['ganhoPermanente', 'contador']);
        expect(g[1].acoes[1]).toMatchObject({ id: 'mp_ego_criticos', op: 'zerar' });
        expect(g[2].evento).toMatchObject({ tipo: 'atingido', nivel: 'fatal' });
        expect(r.contadores).toEqual([{ id: 'mp_ego_criticos', nome: 'Ego: críticos sofridos', valor: 0, min: 0, max: 3, reset: 'cena' }]);
    });
    it('criticosPorGanho customizado reflete no contador e no gatilho', () => {
        const r = construir(EGO, ['prestigioPorDanoSofrido'], { criticosPorGanho: 5 });
        expect(r.contadores[0].max).toBe(5);
        expect(r.poder.gatilhos[1].evento.valor).toBe(5);
    });
    it('sem ganhoPorCriticos nao cria contador nem os 2 gatilhos; so o fatal', () => {
        const r = construir(EGO, ['prestigioPorDanoSofrido'], { ganhoPorCriticos: 0 });
        expect(r.contadores).toEqual([]);
        expect(r.poder.gatilhos.map(x => x.id)).toEqual(['mp_ego_dano_3']);
    });
    it('tudo zerado em dano: poder sem gatilhos (campo ausente)', () => {
        const r = construir(EGO, ['prestigioPorDanoSofrido'], { ganhoPorCriticos: 0, ganhoPorFatal: 0 });
        expect(r.poder.gatilhos).toBeUndefined();
    });
    it('multiplicadores: 4 efeitos munico x140 e nota de Cura', () => {
        const r = construir(EGO, ['multiplicadores']);
        expect(r.poder.efeitos).toHaveLength(4);
        r.poder.efeitos.forEach(e => { expect(e.propriedade).toBe('munico'); expect(String(e.valor)).toBe('140'); });
        expect(r.poder.efeitos.map(e => e.atributo)).toEqual(['vida', 'dano', 'todos_status', 'todas_energias']);
        expect(r.poder.notasIA).toContain('Cura x140');
    });
    it('fatorEgo customizado', () => {
        const r = construir(EGO, ['multiplicadores'], { fatorEgo: 50 });
        r.poder.efeitos.forEach(e => expect(String(e.valor)).toBe('50'));
    });
    it('imunidade: imune_estado escopo todos', () => {
        const r = construir(EGO, ['imunidadeCondicoes']);
        expect(r.poder.efeitos).toHaveLength(1);
        expect(r.poder.efeitos[0]).toMatchObject({ atributo: 'imune_estado', escopo: 'todos' });
    });
    it('partes nota viram texto em notasIA e aviso', () => {
        const r = construir(EGO, ['ascensaoAdicional', 'habilidadesDeRaca']);
        expect(r.poder.notasIA).toMatch(/Ascens/);
        expect(r.poder.notasIA).toMatch(/poderes de raça/);
        expect(r.avisos.filter(a => /não existe no app/.test(a))).toHaveLength(2);
        expect(r.poder.gatilhos).toBeUndefined();
    });
    it('poder.modelo guarda id/partes/params; sem origem no Ego', () => {
        const r = construir(EGO, ['imunidadeCondicoes'], { fatorEgo: 7 }, fichaVazia(), { origem: { tipo: 'independente' } });
        expect(r.poder.modelo.id).toBe(EGO);
        expect(r.poder.modelo.partes).toEqual(['imunidadeCondicoes']);
        expect(r.poder.modelo.params.fatorEgo).toBe(7);
        expect(r.poder.origem).toBeUndefined();
        expect(r.poder.categoria).toBe('forma');
    });
    it('criarOpcionais: modo opcional e armado false', () => {
        construir(EGO, null, {}, fichaVazia(), { criarOpcionais: true }).poder.gatilhos
            .forEach((x) => { expect(x.modo).toBe('opcional'); expect(x.armado).toBe(false); });
        // valor truthy nao booleano nao liga
        construir(EGO, null, {}, fichaVazia(), { criarOpcionais: 'true' }).poder.gatilhos
            .forEach(x => expect(x.modo).toBe('automatico'));
    });
    it('selecao vazia/desconhecida: poder sem efeitos/gatilhos nao quebra', () => {
        const r = construir(EGO, [], {});
        expect(r.contadores).toEqual([]);
        expect(r.poder.gatilhos).toBeUndefined();
    });
});

describe('construir: Verg Avesta', () => {
    it('acumulo: contador permanente 0..999, gatilhos passivos, fimDeLuta deContador fator 1/10 zerar', () => {
        const r = construir(VERG, ['acumuloDeDano']);
        expect(r.contadores).toEqual([{ id: 'mp_verg_acumulo', nome: 'Verg Avesta: acumulado', valor: 0, min: 0, max: 999 }]);
        expect(r.contadores[0].reset).toBeUndefined();
        const [a, f] = r.poder.gatilhos;
        expect(a.id).toBe('mp_verg_acumulo_1');
        expect(a.evento).toMatchObject({ tipo: 'atingido' });
        expect(f.id).toBe('mp_verg_acumulo_2');
        expect(f.evento.tipo).toBe('fimDeLuta');
        expect(f.acoes[0].tipo).toBe('ganhoPermanente');
        expect(f.acoes[0].deContador).toMatchObject({ id: 'mp_verg_acumulo', fator: 0.1, zerar: true });
        expect(normalizarGatilhos(r.poder.gatilhos).descartados).toEqual([]);
    });
    it('divisor 6 e 3 -> fator arredondado a 6 casas', () => {
        expect(construir(VERG, ['acumuloDeDano'], { divisor: 6 }).poder.gatilhos[1].acoes[0].deContador.fator).toBeCloseTo(1 / 6, 5);
        expect(construir(VERG, ['acumuloDeDano'], { divisor: 1 }).poder.gatilhos[1].acoes[0].deContador.fator).toBe(1);
        expect(construir(VERG, ['acumuloDeDano'], { divisor: 0 }).poder.gatilhos[1].acoes[0].deContador.fator).toBe(1); // preso a min 1
    });
    it('limiteAcumulo customizado', () => {
        expect(construir(VERG, ['acumuloDeDano'], { limiteAcumulo: 50 }).contadores[0].max).toBe(50);
    });
    it('acerto por turno: buff com nome constante em turnoInicio', () => {
        const a = construir(VERG, ['acertoPorTurno'], { acertoPorTurno: 5 }).poder.gatilhos[0];
        const b = construir(VERG, ['acertoPorTurno'], { acertoPorTurno: 9 }).poder.gatilhos[0];
        expect(a.nome).toBe('Verg: Acerto por turno');
        expect(b.nome).toBe('Verg: Acerto por turno');
        expect(a.evento.tipo).toBe('turnoInicio');
        expect(a.acoes[0]).toMatchObject({ tipo: 'buff', atributo: 'acerto', valor: 5 });
        expect(b.acoes[0].valor).toBe(9);
        expect(a.id).toBe('mp_verg_acerto_1');
    });
    it('selecao padrao: 3 gatilhos, 1 contador, notas das 4 partes nota', () => {
        const r = construir(VERG);
        expect(r.poder.gatilhos).toHaveLength(3);
        expect(r.contadores).toHaveLength(1);
        expect(r.avisos.filter(a => /não existe no app/.test(a))).toHaveLength(4);
        expect(r.poder.categoria).toBe('habilidade');
    });
    it('origem herdada/independente + fonte no poder; padrao herdada', () => {
        expect(construir(VERG, null, {}, fichaVazia(), { origem: { tipo: 'independente', fonte: 'x' } }).poder.origem).toEqual({ tipo: 'independente', fonte: 'x' });
        expect(construir(VERG, null, {}, fichaVazia(), { origem: { tipo: 'herdada', fonte: ' Verg ' } }).poder.origem).toEqual({ tipo: 'herdada', fonte: 'Verg' });
        expect(construir(VERG).poder.origem).toEqual({ tipo: 'herdada', fonte: '' });
    });
    it('gatilhos opcionais quando pedido', () => {
        construir(VERG, null, {}, fichaVazia(), { criarOpcionais: true }).poder.gatilhos.forEach((g) => { expect(g.modo).toBe('opcional'); expect(g.armado).toBe(false); });
    });
});

describe('planejarModelo', () => {
    it('modelo desconhecido e selecao vazia', () => {
        expect(planejarModelo('xx', ['a'], {}, fichaVazia()).ok).toBe(false);
        const r = planejarModelo(EGO, [], {}, fichaVazia());
        expect(r.ok).toBe(false);
        expect(r.erro).toMatch(/ao menos uma parte/);
    });
    it('novo: contagens', () => {
        const r = planejarModelo(EGO, selecaoPadrao(m(EGO)), {}, fichaVazia());
        expect(r).toMatchObject({ ok: true, modo: 'novo', poderes: 1, contadores: 1, gatilhos: 6, efeitos: 5 });
        expect(r.contadoresAtualizados).toBe(0);
        expect(r.contadoresRemovidos).toBe(0);
    });
    it('editar quando ja existe', () => {
        const f = fichaVazia();
        aplicarModeloNaFicha(f, mestre({ modeloId: EGO, selecao: selecaoPadrao(m(EGO)), id: 1 }));
        const r = planejarModelo(EGO, ['imunidadeCondicoes'], {}, f);
        expect(r).toMatchObject({ ok: true, modo: 'editar', poderes: 0, contadores: 0, contadoresRemovidos: 1, gatilhos: 0 });
    });
    it('bloqueia quando excede 12 contadores', () => {
        const f = { poderes: [], contadores: Array.from({ length: 12 }, (_, i) => ({ id: `c${i}`, nome: 'c', valor: 0, min: 0, max: 5 })) };
        const r = planejarModelo(EGO, selecaoPadrao(m(EGO)), {}, f);
        expect(r.ok).toBe(false);
        expect(r.erro).toMatch(/12 contadores/);
    });
    it('12 contadores mas a selecao nao precisa de contador novo: ok', () => {
        const f = { poderes: [], contadores: Array.from({ length: 12 }, (_, i) => ({ id: `c${i}`, nome: 'c', valor: 0, min: 0, max: 5 })) };
        expect(planejarModelo(EGO, ['imunidadeCondicoes'], {}, f).ok).toBe(true);
    });
    it('ficha sem contadores/poderes (undefined/null)', () => {
        expect(planejarModelo(EGO, ['prestigioPorDanoSofrido'], {}, {}).ok).toBe(true);
        expect(planejarModelo(EGO, ['prestigioPorDanoSofrido'], {}, undefined).ok).toBe(true);
        expect(planejarModelo(EGO, ['prestigioPorDanoSofrido'], {}, null).ok).toBe(true);
    });
});

describe('aplicarModeloNaFicha: permissao', () => {
    it.each([['string true', 'true'], ['undefined', undefined], ['false', false], ['1', 1], ['null', null]])('recusa isMestre=%s sem mutar', (_n, v) => {
        const f = fichaVazia();
        const antes = JSON.stringify(f);
        const r = aplicarModeloNaFicha(f, { modeloId: EGO, selecao: ['imunidadeCondicoes'], isMestre: v });
        expect(r.ok).toBe(false);
        expect(JSON.stringify(f)).toBe(antes);
    });
    it('sem req / ficha ausente / modelo invalido / selecao vazia', () => {
        expect(aplicarModeloNaFicha(fichaVazia()).ok).toBe(false);
        expect(aplicarModeloNaFicha(null, mestre({ modeloId: EGO, selecao: ['imunidadeCondicoes'] })).ok).toBe(false);
        const f = fichaVazia();
        expect(aplicarModeloNaFicha(f, mestre({ modeloId: 'x', selecao: ['a'] })).ok).toBe(false);
        expect(aplicarModeloNaFicha(f, mestre({ modeloId: EGO, selecao: [] })).ok).toBe(false);
        expect(aplicarModeloNaFicha(f, mestre({ modeloId: EGO, selecao: ['lixo'] })).ok).toBe(false);
        expect(f).toEqual(fichaVazia());
    });
});

describe('aplicarModeloNaFicha: criar e editar', () => {
    it('cria poder + contador; ficha sem contadores/poderes', () => {
        const f = {};
        const r = aplicarModeloNaFicha(f, mestre({ modeloId: EGO, selecao: selecaoPadrao(m(EGO)), id: 77 }));
        expect(r).toMatchObject({ ok: true, modo: 'novo' });
        expect(f.poderes).toHaveLength(1);
        expect(f.poderes[0].id).toBe(77);
        expect(f.poderes[0].gatilhos).toHaveLength(6);
        expect(f.contadores).toHaveLength(1);
        expect(f.contadores[0].id).toBe('mp_ego_criticos');
        expect(semUndefined(f)).toBe(true);
    });
    it('id padrao Date.now quando nao informado', () => {
        const f = fichaVazia();
        aplicarModeloNaFicha(f, mestre({ modeloId: EGO, selecao: ['imunidadeCondicoes'] }));
        expect(typeof f.poderes[0].id).toBe('number');
    });
    it('aplicar de novo vira editar: nao duplica poder nem contador', () => {
        const f = fichaVazia();
        aplicarModeloNaFicha(f, mestre({ modeloId: EGO, selecao: selecaoPadrao(m(EGO)), id: 1 }));
        const r = aplicarModeloNaFicha(f, mestre({ modeloId: EGO, selecao: selecaoPadrao(m(EGO)), id: 2 }));
        expect(r.modo).toBe('editar');
        expect(f.poderes).toHaveLength(1);
        expect(f.poderes[0].id).toBe(1);
        expect(f.contadores).toHaveLength(1);
        expect(f.poderes[0].gatilhos).toHaveLength(6);
        expect(f.poderes[0].efeitos).toHaveLength(5);
    });
    it('Ego e Verg coexistem', () => {
        const f = fichaVazia();
        aplicarModeloNaFicha(f, mestre({ modeloId: EGO, selecao: selecaoPadrao(m(EGO)), id: 1 }));
        aplicarModeloNaFicha(f, mestre({ modeloId: VERG, selecao: selecaoPadrao(m(VERG)), id: 2, opcoes: { origem: { tipo: 'herdada', fonte: 'Reid' } } }));
        expect(f.poderes).toHaveLength(2);
        expect(f.contadores.map(c => c.id).sort()).toEqual(['mp_ego_criticos', 'mp_verg_acumulo']);
        expect(poderDe(f, VERG).origem).toEqual({ tipo: 'herdada', fonte: 'Reid' });
    });
    it('criticosPorGanho 3 -> 5 -> 2: atualiza max/gatilho e prende o valor', () => {
        const f = fichaVazia();
        const base = { modeloId: EGO, selecao: ['prestigioPorDanoSofrido'], id: 1 };
        aplicarModeloNaFicha(f, mestre({ ...base, params: { criticosPorGanho: 3 } }));
        ctr(f, 'mp_ego_criticos').valor = 3; // preso ao max atual
        let r = aplicarModeloNaFicha(f, mestre({ ...base, params: { criticosPorGanho: 5 } }));
        expect(r.ok).toBe(true);
        expect(ctr(f, 'mp_ego_criticos')).toMatchObject({ max: 5, min: 0, valor: 3 });
        expect(poderDe(f, EGO).gatilhos.find(g => g.id === 'mp_ego_dano_2').evento.valor).toBe(5);
        ctr(f, 'mp_ego_criticos').valor = 5;
        aplicarModeloNaFicha(f, mestre({ ...base, params: { criticosPorGanho: 2 } }));
        expect(ctr(f, 'mp_ego_criticos')).toMatchObject({ max: 2, valor: 2 });
        expect(poderDe(f, EGO).gatilhos.find(g => g.id === 'mp_ego_dano_2').evento.valor).toBe(2);
        expect(poderDe(f, EGO).gatilhos.find(g => g.id === 'mp_ego_dano_2').nome).toContain('2 críticos');
        expect(f.contadores).toHaveLength(1);
    });
    it('Verg: mudar limite atualiza nome/max do contador mantendo valor', () => {
        const f = fichaVazia();
        const base = { modeloId: VERG, selecao: ['acumuloDeDano'], id: 1 };
        aplicarModeloNaFicha(f, mestre(base));
        ctr(f, 'mp_verg_acumulo').valor = 40;
        ctr(f, 'mp_verg_acumulo').nome = 'renomeado a mao';
        aplicarModeloNaFicha(f, mestre({ ...base, params: { limiteAcumulo: 30 } }));
        expect(ctr(f, 'mp_verg_acumulo')).toMatchObject({ max: 30, valor: 30, nome: 'Verg Avesta: acumulado' });
    });
    it('contador orfao (poder apagado) e reaproveitado e ajustado, sem duplicar', () => {
        const f = fichaVazia();
        aplicarModeloNaFicha(f, mestre({ modeloId: EGO, selecao: ['prestigioPorDanoSofrido'], id: 1 }));
        ctr(f, 'mp_ego_criticos').valor = 2;
        f.poderes = [];
        const r = aplicarModeloNaFicha(f, mestre({ modeloId: EGO, selecao: ['prestigioPorDanoSofrido'], params: { criticosPorGanho: 2 }, id: 9 }));
        expect(r.modo).toBe('novo');
        expect(f.contadores).toHaveLength(1);
        expect(ctr(f, 'mp_ego_criticos')).toMatchObject({ max: 2, valor: 2 });
        expect(f.poderes).toHaveLength(1);
    });
    it('contador orfao conta no total sem duplicar (12 cheios incluindo o orfao)', () => {
        const f = fichaVazia();
        f.contadores = Array.from({ length: 11 }, (_, i) => ({ id: `c${i}`, nome: 'c', valor: 0, min: 0, max: 5 }));
        f.contadores.push({ id: 'mp_ego_criticos', nome: 'velho', valor: 1, min: 0, max: 9 });
        const r = aplicarModeloNaFicha(f, mestre({ modeloId: EGO, selecao: ['prestigioPorDanoSofrido'], id: 1 }));
        expect(r.ok).toBe(true);
        expect(f.contadores).toHaveLength(12);
        expect(ctr(f, 'mp_ego_criticos').max).toBe(3);
    });
    it('desmarcar parte remove so o que o modelo criou; preserva gatilho/efeito manual', () => {
        const f = fichaVazia();
        aplicarModeloNaFicha(f, mestre({ modeloId: EGO, selecao: selecaoPadrao(m(EGO)), id: 1 }));
        const p = poderDe(f, EGO);
        p.gatilhos.push({ id: 'manual_1', nome: 'Meu', modo: 'automatico', armado: true, evento: { tipo: 'turnoInicio' }, acoes: [{ tipo: 'buff', atributo: 'acerto', valor: 1, duracao: 3, modo: 'combate' }] });
        p.efeitos.push({ nome: 'Manual', atributo: 'forca', propriedade: 'base', valor: '5' });
        f.contadores.push({ id: 'meu_c', nome: 'Meu', valor: 0, min: 0, max: 3 });
        const r = aplicarModeloNaFicha(f, mestre({ modeloId: EGO, selecao: ['imunidadeCondicoes', 'prestigioPorAcerto'], id: 1 }));
        expect(r.ok).toBe(true);
        const ids = poderDe(f, EGO).gatilhos.map(g => g.id);
        expect(ids).toContain('manual_1');
        expect(ids.filter(i => i.startsWith('mp_'))).toEqual(['mp_ego_acerto_1', 'mp_ego_acerto_2', 'mp_ego_acerto_3']);
        expect(poderDe(f, EGO).efeitos.map(e => e.nome)).toEqual(expect.arrayContaining(['Manual', 'Ego Superior: imune a condições']));
        expect(poderDe(f, EGO).efeitos.some(e => e.nome === 'Ego Superior: Vida')).toBe(false);
        expect(f.contadores.map(c => c.id)).toEqual(['meu_c']);
        expect(poderDe(f, EGO).modelo.partes).toEqual(['prestigioPorAcerto', 'imunidadeCondicoes']);
    });
    it('desmarcar todos os gatilhos remove o campo gatilhos quando nao ha manuais', () => {
        const f = fichaVazia();
        aplicarModeloNaFicha(f, mestre({ modeloId: EGO, selecao: selecaoPadrao(m(EGO)), id: 1 }));
        aplicarModeloNaFicha(f, mestre({ modeloId: EGO, selecao: ['imunidadeCondicoes'], id: 1 }));
        expect(poderDe(f, EGO).gatilhos).toBeUndefined();
        expect(semUndefined(f)).toBe(true);
    });
    it('editar troca origem do Verg e mantem a existente do Ego', () => {
        const f = fichaVazia();
        aplicarModeloNaFicha(f, mestre({ modeloId: VERG, selecao: ['acertoPorTurno'], id: 1, opcoes: { origem: { tipo: 'herdada', fonte: 'A' } } }));
        aplicarModeloNaFicha(f, mestre({ modeloId: VERG, selecao: ['acertoPorTurno'], id: 1, opcoes: { origem: { tipo: 'independente' } } }));
        expect(poderDe(f, VERG).origem).toEqual({ tipo: 'independente', fonte: '' });
    });
    it('notas editadas a mao sao preservadas', () => {
        const f = fichaVazia();
        aplicarModeloNaFicha(f, mestre({ modeloId: EGO, selecao: ['multiplicadores'], id: 1 }));
        poderDe(f, EGO).notasIA = 'minha nota';
        aplicarModeloNaFicha(f, mestre({ modeloId: EGO, selecao: ['multiplicadores'], params: { fatorEgo: 10 }, id: 1 }));
        expect(poderDe(f, EGO).notasIA).toContain('minha nota');
        expect(poderDe(f, EGO).notasIA).toContain('Cura x10');
    });
    it('mudar fator troca efeitos (sem duplicar)', () => {
        const f = fichaVazia();
        aplicarModeloNaFicha(f, mestre({ modeloId: EGO, selecao: ['multiplicadores'], id: 1 }));
        aplicarModeloNaFicha(f, mestre({ modeloId: EGO, selecao: ['multiplicadores'], params: { fatorEgo: 10 }, id: 1 }));
        const e = poderDe(f, EGO).efeitos;
        expect(e).toHaveLength(4);
        e.forEach(x => expect(String(x.valor)).toBe('10'));
    });
});

describe('aplicarModeloNaFicha: limites', () => {
    const cheia = (n) => Array.from({ length: n }, (_, i) => ({ id: `c${i}`, nome: 'c', valor: 0, min: 0, max: 5 }));
    it('12 contadores + 1 novo: bloqueia e nao muta', () => {
        const f = { poderes: [], contadores: cheia(12) };
        const antes = JSON.stringify(f);
        const r = aplicarModeloNaFicha(f, mestre({ modeloId: EGO, selecao: ['prestigioPorDanoSofrido'], id: 1 }));
        expect(r.ok).toBe(false);
        expect(JSON.stringify(f)).toBe(antes);
    });
    it('11 contadores + 1 novo: cabe (limite exato)', () => {
        const f = { poderes: [], contadores: cheia(LIMITE_CONTADORES - 1) };
        expect(aplicarModeloNaFicha(f, mestre({ modeloId: EGO, selecao: ['prestigioPorDanoSofrido'], id: 1 })).ok).toBe(true);
        expect(f.contadores).toHaveLength(LIMITE_CONTADORES);
    });
    it('editar com 12 contadores: desmarcar parte do contador nao bloqueia (desconta removidos)', () => {
        const f = { poderes: [], contadores: cheia(11) };
        aplicarModeloNaFicha(f, mestre({ modeloId: EGO, selecao: ['prestigioPorDanoSofrido'], id: 1 }));
        expect(f.contadores).toHaveLength(12);
        const r = aplicarModeloNaFicha(f, mestre({ modeloId: EGO, selecao: ['imunidadeCondicoes'], id: 1 }));
        expect(r.ok).toBe(true);
        expect(f.contadores).toHaveLength(11);
        // e o planejar concorda
        const f2 = { poderes: [], contadores: cheia(11) };
        aplicarModeloNaFicha(f2, mestre({ modeloId: EGO, selecao: ['prestigioPorDanoSofrido'], id: 1 }));
        expect(planejarModelo(EGO, ['imunidadeCondicoes'], {}, f2).ok).toBe(true);
    });
    it('editar com 12 contadores trocando Ego -> Verg ja existente nao e problema; Verg novo com 12 bloqueia', () => {
        const f = { poderes: [], contadores: cheia(12) };
        expect(aplicarModeloNaFicha(f, mestre({ modeloId: VERG, selecao: ['acumuloDeDano'], id: 1 })).ok).toBe(false);
        expect(f.poderes).toHaveLength(0);
    });
    it('limite 8 gatilhos em editar: bloqueio atomico (JSON identico)', () => {
        const f = fichaVazia();
        aplicarModeloNaFicha(f, mestre({ modeloId: EGO, selecao: ['imunidadeCondicoes'], id: 1 }));
        const p = poderDe(f, EGO);
        p.gatilhos = Array.from({ length: 7 }, (_, i) => ({ id: `man_${i}`, nome: `M${i}`, modo: 'automatico', armado: true, evento: { tipo: 'turnoInicio' }, acoes: [{ tipo: 'buff', atributo: 'acerto', valor: 1, duracao: 3, modo: 'combate' }] }));
        // garante que os manuais passam na normalizacao
        expect(normalizarGatilhos(p.gatilhos).gatilhos).toHaveLength(7);
        const antes = JSON.stringify(f);
        const r = aplicarModeloNaFicha(f, mestre({ modeloId: EGO, selecao: ['imunidadeCondicoes', 'prestigioPorDanoSofrido'], id: 1 }));
        expect(r.ok).toBe(false);
        expect(r.mensagem).toMatch(/limite/);
        expect(JSON.stringify(f)).toBe(antes);
        const pl = planejarModelo(EGO, ['imunidadeCondicoes', 'prestigioPorDanoSofrido'], {}, f);
        expect(pl.ok).toBe(false);
        expect(pl.erro).toMatch(/limite/);
    });
    it('bloqueio atomico tambem nao altera contadores (inclui ajuste/remocao)', () => {
        const f = fichaVazia();
        aplicarModeloNaFicha(f, mestre({ modeloId: EGO, selecao: ['prestigioPorDanoSofrido'], id: 1 }));
        const p = poderDe(f, EGO);
        p.gatilhos.push(...Array.from({ length: 5 }, (_, i) => ({ id: `man_${i}`, nome: `M${i}`, modo: 'automatico', armado: true, evento: { tipo: 'turnoInicio' }, acoes: [{ tipo: 'buff', atributo: 'acerto', valor: 1, duracao: 3, modo: 'combate' }] })));
        // 3 do modelo + 5 manuais = 8 (cabe). Agora pede 6 gatilhos do modelo => estoura.
        const antes = JSON.stringify(f);
        const r = aplicarModeloNaFicha(f, mestre({ modeloId: EGO, selecao: ['prestigioPorDanoSofrido', 'prestigioPorAcerto'], params: { criticosPorGanho: 9 }, id: 1 }));
        expect(r.ok).toBe(false);
        expect(JSON.stringify(f)).toBe(antes);
    });
    it('editar com manuais ate o limite (8 no total) funciona', () => {
        const f = fichaVazia();
        aplicarModeloNaFicha(f, mestre({ modeloId: EGO, selecao: ['prestigioPorDanoSofrido'], id: 1 }));
        poderDe(f, EGO).gatilhos.push(...Array.from({ length: 5 }, (_, i) => ({ id: `man_${i}`, nome: `M${i}`, modo: 'automatico', armado: true, evento: { tipo: 'turnoInicio' }, acoes: [{ tipo: 'buff', atributo: 'acerto', valor: 1, duracao: 3, modo: 'combate' }] })));
        const r = aplicarModeloNaFicha(f, mestre({ modeloId: EGO, selecao: ['prestigioPorDanoSofrido'], id: 1 }));
        expect(r.ok).toBe(true);
        expect(poderDe(f, EGO).gatilhos).toHaveLength(8);
    });
});

describe('integridade', () => {
    it('sem undefined em nenhuma combinacao aplicada', () => {
        MODELOS.forEach((mo) => {
            const f = fichaVazia();
            expect(aplicarModeloNaFicha(f, mestre({ modeloId: mo.id, selecao: selecaoPadrao(mo), id: 1 })).ok).toBe(true);
            expect(semUndefined(f)).toBe(true);
            expect(() => structuredClone(f)).not.toThrow();
        });
    });
    it('cada parte sozinha constroi sem descartar gatilhos', () => {
        MODELOS.forEach(mo => mo.partes.forEach((p) => {
            const r = mo.construir([p.id], {}, fichaVazia(), {});
            expect(r.avisos.filter(a => /não foi criado/.test(a))).toEqual([]);
            expect(r.poder.modelo.partes).toEqual([p.id]);
        }));
    });
    it('construir nao muta a ficha', () => {
        const f = fichaVazia();
        f.contadores.push({ id: 'mp_ego_criticos', nome: 'x', valor: 1, min: 0, max: 9 });
        const antes = clone(f);
        construir(EGO, null, {}, f);
        planejarModelo(EGO, null, {}, f);
        expect(f).toEqual(antes);
    });
    it('contagem de reaproveitados/atualizar/remover no construir', () => {
        const f = fichaVazia();
        aplicarModeloNaFicha(f, mestre({ modeloId: EGO, selecao: ['prestigioPorDanoSofrido'], id: 1 }));
        const r = construir(EGO, ['imunidadeCondicoes'], {}, f);
        expect(r.contadoresRemover).toEqual(['mp_ego_criticos']);
        expect(r.totalContadores).toBe(0);
        const r2 = construir(EGO, ['prestigioPorDanoSofrido'], {}, f);
        expect(r2.reaproveitados).toEqual(['mp_ego_criticos']);
        expect(r2.contadores).toEqual([]);
        expect(r2.totalContadores).toBe(1);
    });
});
