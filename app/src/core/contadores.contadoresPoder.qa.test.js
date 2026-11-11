import { describe, it, expect } from 'vitest';
import {
    LIMITE_CONTADORES, novoIdContador, contadoresDoPoder, contadoresAvulsos, nomeDoPoderDoContador,
    normalizarContadorRascunho, referenciasDoContador, semReferenciasDoContador, planejarContadoresDoPoder,
    aplicarContadoresDoPoder, contadorComandante, adotarEstagioDoPoder, adicionarContador, atualizarContador,
    mudarContador, removerContador, sincronizarEstagioDoContador,
} from './contadores';
import { normalizarEstagios } from './estagios';
import { aplicarModeloNaFicha, selecaoPadrao, obterModelo } from './modelosPoder';
import { rascunhoVazio, rascunhoDoPoder, completarRascunho, rascunhoTemAlteracao, rascunhoTemConteudo } from './rascunhoPoder';

const comEstagios = (extra = {}) => ({
    id: 1, nome: 'Portões', categoria: 'poder', ativa: false, estagioAtual: 1,
    estagios: normalizarEstagios({ habilitado: true, maximo: 5, crescimento: 100 }), efeitos: [], efeitosPassivos: [], ...extra,
});
const semEstagios = (extra = {}) => ({ id: 2, nome: 'Simples', categoria: 'habilidade', ativa: false, efeitos: [], efeitosPassivos: [], ...extra });
const ficha = (extra = {}) => ({ contadores: [], poderes: [], ...extra });
const ct = (id, extra = {}) => ({ id, nome: `C${id}`, valor: 0, min: 0, max: 5, ...extra });
const semUndefined = (o) => !JSON.stringify(o, (k, v) => (v === undefined ? '__UNDEF__' : v)).includes('__UNDEF__');

describe('novoIdContador', () => {
    it('gera ids distintos com prefixo ct_', () => {
        const ids = new Set(Array.from({ length: 50 }, () => novoIdContador()));
        expect(ids.size).toBe(50);
        [...ids].forEach(i => expect(i.startsWith('ct_')).toBe(true));
    });
});

describe('contadoresDoPoder / contadoresAvulsos / nomeDoPoderDoContador', () => {
    const f = ficha({
        poderes: [comEstagios(), semEstagios()],
        contadores: [ct('a', { poderId: 1 }), ct('b', { poderId: 2 }), ct('c'), ct('d', { poderId: 999 }), ct('e', { poderId: '' }), ct('f', { poderId: 1 })],
    });
    it('contadoresDoPoder devolve só os do poder (id numérico ou string)', () => {
        expect(contadoresDoPoder(f, 1).map(c => c.id)).toEqual(['a', 'f']);
        expect(contadoresDoPoder(f, '1').map(c => c.id)).toEqual(['a', 'f']);
        expect(contadoresDoPoder(f, 2).map(c => c.id)).toEqual(['b']);
    });
    it('poder inexistente / id vazio / ficha nula -> []', () => {
        expect(contadoresDoPoder(f, 12345)).toEqual([]);
        expect(contadoresDoPoder(f, undefined)).toEqual([]);
        expect(contadoresDoPoder(f, null)).toEqual([]);
        expect(contadoresDoPoder(f, '')).toEqual([]);
        expect(contadoresDoPoder(null, 1)).toEqual([]);
        expect(contadoresDoPoder({}, 1)).toEqual([]);
    });
    it('contadoresAvulsos: sem poderId, vazio ou apontando para poder que não existe mais', () => {
        expect(contadoresAvulsos(f).map(c => c.id)).toEqual(['c', 'd', 'e']);
    });
    it('avulsos de ficha nula/sem poderes', () => {
        expect(contadoresAvulsos(null)).toEqual([]);
        expect(contadoresAvulsos({ contadores: [ct('x')] }).map(c => c.id)).toEqual(['x']);
        expect(contadoresAvulsos({ contadores: [ct('x', { poderId: 1 })] }).map(c => c.id)).toEqual(['x']);
    });
    it('ignora entradas nulas/lixo em contadores e poderes', () => {
        const g = { contadores: [null, 'x', ct('a', { poderId: 1 })], poderes: [null, comEstagios()] };
        expect(contadoresDoPoder(g, 1).map(c => c.id)).toEqual(['a']);
        expect(contadoresAvulsos(g)).toEqual([]);
    });
    it('nomeDoPoderDoContador: nome do dono, "" se avulso/órfão/nulo', () => {
        expect(nomeDoPoderDoContador(f, f.contadores[0])).toBe('Portões');
        expect(nomeDoPoderDoContador(f, f.contadores[2])).toBe('');
        expect(nomeDoPoderDoContador(f, f.contadores[3])).toBe('');
        expect(nomeDoPoderDoContador(f, f.contadores[4])).toBe('');
        expect(nomeDoPoderDoContador(f, null)).toBe('');
        expect(nomeDoPoderDoContador(null, f.contadores[0])).toBe('');
        expect(nomeDoPoderDoContador(ficha({ poderes: [{ id: 7 }] }), { poderId: 7 })).toBe('');
    });
});

describe('normalizarContadorRascunho', () => {
    it('sem valor; limites trocados e presos; reset só cena', () => {
        const n = normalizarContadorRascunho({ id: 'x', nome: ' Arco ', min: 9, max: 2, valor: 7, reset: 'cena', poderId: 3 });
        expect(n).toEqual({ id: 'x', nome: 'Arco', min: 2, max: 9, reset: 'cena' });
        expect('valor' in n).toBe(false);
        expect('poderId' in n).toBe(false);
        expect('reset' in normalizarContadorRascunho({ id: 'x', reset: 'permanente' })).toBe(false);
        expect(normalizarContadorRascunho({ id: 'x', min: -1e9, max: 1e9 })).toMatchObject({ min: -9999, max: 9999 });
    });
    it('sem id gera um; nome vazio vira "Contador"', () => {
        const n = normalizarContadorRascunho({ nome: '' });
        expect(n.id).toMatch(/^ct_/);
        expect(n.nome).toBe('Contador');
    });
    // BUG CONHECIDO (relatado): normalizarContadorRascunho(null|'x') devolve um contador "Contador" 0-10 em vez de null (o spread de null/string passa pelo normalizarContador).
    it('lixo (null/string/undefined) -> null', () => {
        expect(normalizarContadorRascunho(null)).toBeNull();
        expect(normalizarContadorRascunho('x')).toBeNull();
        expect(normalizarContadorRascunho(undefined)).toBeNull();
    });
    it('nome muito longo é cortado em 40', () => {
        expect(normalizarContadorRascunho({ id: 'x', nome: 'a'.repeat(100) }).nome).toHaveLength(40);
    });
});

describe('referenciasDoContador / semReferenciasDoContador', () => {
    const gEvento = { id: 'g1', nome: 'Ev', evento: { tipo: 'contadorAtingiu', contadorId: 'k', op: '>=', valor: 3 }, acoes: [] };
    const gAcao = { id: 'g2', nome: 'Ac', evento: { tipo: 'atingido' }, acoes: [{ tipo: 'contador', id: 'k', op: 'somar', valor: 1 }] };
    const gGanho = { id: 'g3', nome: 'Ga', evento: { tipo: 'fimDeLuta' }, acoes: [{ tipo: 'ganhoPermanente', deContador: { id: 'k' } }] };
    const gOutro = { id: 'g4', nome: 'Ou', evento: { tipo: 'contadorAtingiu', contadorId: 'z' }, acoes: [{ tipo: 'contador', id: 'z', op: 'zerar' }] };
    const gNum = { id: 'g5', nome: 'Num', evento: { tipo: 'contadorAtingiu', contadorId: 7 }, acoes: [] };
    const todos = [gEvento, gAcao, gGanho, gOutro, gNum];

    it('detecta evento, ação contador e ganhoPermanente deContador', () => {
        expect(referenciasDoContador(todos, 'k').map(g => g.id)).toEqual(['g1', 'g2', 'g3']);
    });
    it('compara por id como string (7 == "7")', () => {
        expect(referenciasDoContador(todos, '7').map(g => g.id)).toEqual(['g5']);
        expect(referenciasDoContador(todos, 7).map(g => g.id)).toEqual(['g5']);
    });
    it('aceita um poder (usa poder.gatilhos) ou lista; lixo -> []', () => {
        expect(referenciasDoContador({ gatilhos: todos }, 'z').map(g => g.id)).toEqual(['g4']);
        expect(referenciasDoContador({}, 'k')).toEqual([]);
        expect(referenciasDoContador(null, 'k')).toEqual([]);
        expect(referenciasDoContador(undefined, 'k')).toEqual([]);
        expect(referenciasDoContador([null, 'x', {}, { acoes: 'oops' }], 'k')).toEqual([]);
    });
    it('semReferenciasDoContador remove só os que usam o id e não muta', () => {
        const copia = [...todos];
        expect(semReferenciasDoContador(todos, 'k').map(g => g.id)).toEqual(['g4', 'g5']);
        expect(todos).toEqual(copia);
        expect(semReferenciasDoContador(null, 'k')).toEqual([]);
        expect(semReferenciasDoContador(todos, 'nenhum')).toHaveLength(5);
    });
});

describe('planejarContadoresDoPoder', () => {
    it('cria itens novos (valor = mín, poderId do poder) sem mutar a ficha', () => {
        const f = ficha({ poderes: [semEstagios()] });
        const antes = JSON.stringify(f);
        const p = planejarContadoresDoPoder(f, 2, [{ id: 'n1', nome: 'Novo', min: 1, max: 4, reset: 'cena' }]);
        expect(p.ok).toBe(true);
        expect(p.criar).toEqual([{ id: 'n1', nome: 'Novo', valor: 1, min: 1, max: 4, poderId: 2, reset: 'cena' }]);
        expect(p.atualizar).toEqual([]); expect(p.vincular).toEqual([]); expect(p.remover).toEqual([]); expect(p.avisos).toEqual([]);
        expect(p.total).toBe(1);
        expect(JSON.stringify(f)).toBe(antes);
    });
    it('atualiza os do poder, remove os que saíram do rascunho', () => {
        const f = ficha({ poderes: [semEstagios()], contadores: [ct('a', { poderId: 2 }), ct('b', { poderId: 2 })] });
        const p = planejarContadoresDoPoder(f, 2, [{ id: 'a', nome: 'A2', min: 0, max: 9 }]);
        expect(p.atualizar.map(c => c.id)).toEqual(['a']);
        expect(p.remover).toEqual(['b']);
        expect(p.vincular).toEqual([]);
        expect(p.total).toBe(1);
    });
    it('vincula avulso existente (atualizar + vincular)', () => {
        const f = ficha({ poderes: [semEstagios()], contadores: [ct('av')] });
        const p = planejarContadoresDoPoder(f, 2, [{ id: 'av', nome: 'AV', min: 0, max: 5 }]);
        expect(p.atualizar.map(c => c.id)).toEqual(['av']);
        expect(p.vincular).toEqual(['av']);
        expect(p.criar).toEqual([]);
        expect(p.avisos).toEqual([]);
    });
    it('contador órfão (poderId de poder que não existe) conta como avulso e pode ser vinculado', () => {
        const f = ficha({ poderes: [semEstagios()], contadores: [ct('or', { poderId: 999 })] });
        const p = planejarContadoresDoPoder(f, 2, [{ id: 'or', nome: 'OR' }]);
        expect(p.vincular).toEqual(['or']);
    });
    it('ignora contador de OUTRO poder com aviso (nunca rouba)', () => {
        const f = ficha({ poderes: [comEstagios(), semEstagios()], contadores: [ct('x', { poderId: 1, nome: 'Alheio' })] });
        const p = planejarContadoresDoPoder(f, 2, [{ id: 'x', nome: 'Alheio', min: 0, max: 5 }]);
        expect(p.atualizar).toEqual([]); expect(p.vincular).toEqual([]); expect(p.criar).toEqual([]);
        expect(p.avisos).toHaveLength(1);
        expect(p.avisos[0]).toContain('Alheio');
        expect(p.ok).toBe(true);
        // e o contador do outro poder não entra em "remover"
        expect(p.remover).toEqual([]);
    });
    it('id inexistente na ficha vira criação normal (rascunho persistente de contador já removido)', () => {
        const f = ficha({ poderes: [semEstagios()] });
        const p = planejarContadoresDoPoder(f, 2, [{ id: 'fantasma', nome: 'F' }]);
        expect(p.criar.map(c => c.id)).toEqual(['fantasma']);
        expect(p.avisos).toEqual([]);
    });
    it('poderId null (poder novo) funciona: nada é "meu"', () => {
        const f = ficha({ contadores: [ct('a', { poderId: 1 })] });
        const p = planejarContadoresDoPoder(f, null, [{ id: 'n' }]);
        expect(p.remover).toEqual([]);
        expect(p.criar).toHaveLength(1);
    });
    it('duplicados no rascunho são ignorados (o primeiro vale)', () => {
        const f = ficha({ poderes: [semEstagios()] });
        const p = planejarContadoresDoPoder(f, 2, [{ id: 'd', nome: 'um' }, { id: 'd', nome: 'dois' }]);
        expect(p.criar).toHaveLength(1);
        expect(p.criar[0].nome).toBe('um');
    });
    // BUG CONHECIDO (mesma causa): itens lixo (null/'x'/5) no rascunho viram contadores fantasmas "Contador" e gastam o limite de 12.
    it('itens lixo no rascunho são ignorados', () => {
        const f = ficha({ poderes: [semEstagios()] });
        expect(planejarContadoresDoPoder(f, 2, [{ id: 'd', nome: 'um' }, null, 'x', 5]).criar).toHaveLength(1);
    });
    it('rascunho nulo/ilegível não quebra', () => {
        const f = ficha({ poderes: [semEstagios()] });
        expect(planejarContadoresDoPoder(f, 2, null).ok).toBe(true);
        expect(planejarContadoresDoPoder(f, 2, 'x').total).toBe(0);
        expect(planejarContadoresDoPoder(null, 2, [{ id: 'a' }]).total).toBe(1);
    });
    it('limite 12: exatamente 12 passa, 13 bloqueia com mensagem; remover libera espaço', () => {
        const doze = Array.from({ length: 12 }, (_, i) => ct(`c${i}`));
        const f = ficha({ poderes: [semEstagios()], contadores: doze });
        expect(planejarContadoresDoPoder(f, 2, [{ id: 'novo' }]).ok).toBe(false);
        const p = planejarContadoresDoPoder(f, 2, [{ id: 'novo' }]);
        expect(p.total).toBe(13);
        expect(p.erro).toContain(String(LIMITE_CONTADORES));
        const f11 = ficha({ poderes: [semEstagios()], contadores: doze.slice(0, 11) });
        expect(planejarContadoresDoPoder(f11, 2, [{ id: 'novo' }]).ok).toBe(true);
        // 12 contadores, mas 2 são deste poder e saem do rascunho: cabe 1 novo
        const f12 = ficha({ poderes: [semEstagios()], contadores: doze.map((c, i) => (i < 2 ? { ...c, poderId: 2 } : c)) });
        const q = planejarContadoresDoPoder(f12, 2, [{ id: 'novo' }]);
        expect(q.remover).toHaveLength(2);
        expect(q.ok).toBe(true);
        expect(q.total).toBe(11);
    });
});

describe('aplicarContadoresDoPoder', () => {
    it('não grava se plano nulo/inválido', () => {
        const f = ficha({ contadores: [ct('a')] });
        expect(aplicarContadoresDoPoder(f, 1, null)).toBe(false);
        expect(aplicarContadoresDoPoder(f, 1, { ok: false, remover: [], atualizar: [], criar: [], vincular: [] })).toBe(false);
        expect(aplicarContadoresDoPoder(null, 1, { ok: true })).toBe(false);
        expect(f.contadores).toHaveLength(1);
    });
    it('preserva o valor (preso ao novo intervalo), define poderId, aplica/zera reset, cria e remove', () => {
        const f = ficha({
            poderes: [semEstagios()],
            contadores: [ct('a', { poderId: 2, valor: 4, reset: 'cena' }), ct('b', { poderId: 2 }), ct('c', { valor: 3 })],
        });
        const plano = planejarContadoresDoPoder(f, 2, [
            { id: 'a', nome: 'A', min: 0, max: 3 }, // reset some (vira permanente); valor 4 preso a 3
            { id: 'c', nome: 'Avulso vinculado', min: 0, max: 10, reset: 'cena' },
            { id: 'n', nome: 'Novo', min: 0, max: 2 },
        ]);
        expect(aplicarContadoresDoPoder(f, 2, plano)).toBe(true);
        const por = Object.fromEntries(f.contadores.map(c => [c.id, c]));
        expect(por.b).toBeUndefined();
        expect(por.a).toEqual({ id: 'a', nome: 'A', valor: 3, min: 0, max: 3, poderId: 2 });
        expect(por.c).toMatchObject({ valor: 3, poderId: 2, reset: 'cena', nome: 'Avulso vinculado', max: 10 });
        expect(por.n).toMatchObject({ valor: 0, poderId: 2 });
        expect(semUndefined(f.contadores)).toBe(true);
    });
    it('valor preservado quando só o nome muda', () => {
        const f = ficha({ poderes: [semEstagios()], contadores: [ct('a', { poderId: 2, valor: 4 })] });
        aplicarContadoresDoPoder(f, 2, planejarContadoresDoPoder(f, 2, [{ id: 'a', nome: 'Outro', min: 0, max: 5 }]));
        expect(f.contadores[0].valor).toBe(4);
        expect(f.contadores[0].nome).toBe('Outro');
    });
    it('não toca em contadores de outros poderes/avulsos fora do plano', () => {
        const f = ficha({ poderes: [comEstagios(), semEstagios()], contadores: [ct('o', { poderId: 1, valor: 2 }), ct('av', { valor: 1 })] });
        aplicarContadoresDoPoder(f, 2, planejarContadoresDoPoder(f, 2, [{ id: 'n' }]));
        expect(f.contadores.find(c => c.id === 'o')).toEqual(ct('o', { poderId: 1, valor: 2 }));
        expect(f.contadores.find(c => c.id === 'av')).toEqual(ct('av', { valor: 1 }));
        expect(f.contadores).toHaveLength(3);
    });
    it('cria o array se faltava', () => {
        const f = { poderes: [] };
        aplicarContadoresDoPoder(f, 2, planejarContadoresDoPoder(f, 2, [{ id: 'n' }]));
        expect(f.contadores).toHaveLength(1);
    });
});

describe('estágios — comandante único', () => {
    it('contadorComandante: primeiro vinculado, só se o poder tem Estágios', () => {
        const f = ficha({ poderes: [comEstagios(), semEstagios()], contadores: [ct('x', { poderId: 2 }), ct('a', { poderId: 1 }), ct('b', { poderId: 1 })] });
        expect(contadorComandante(f, 1).id).toBe('a');
        expect(contadorComandante(f, '1').id).toBe('a');
        expect(contadorComandante(f, 2)).toBeNull(); // sem estágios
        expect(contadorComandante(f, 99)).toBeNull();
        expect(contadorComandante(f, null)).toBeNull();
        expect(contadorComandante(f, '')).toBeNull();
        expect(contadorComandante(null, 1)).toBeNull();
    });
    it('só o comandante sincroniza o estágio; o segundo contador não mexe', () => {
        const f = ficha({ poderes: [comEstagios()] });
        adicionarContador(f, { id: 'a', poderId: 1 });
        adicionarContador(f, { id: 'b', poderId: 1 });
        mudarContador(f, 'b', 3);
        expect(f.poderes[0].estagioAtual).toBe(1);
        mudarContador(f, 'a', 2);
        expect(f.poderes[0].estagioAtual).toBe(3);
        mudarContador(f, 'b', 1);
        expect(f.poderes[0].estagioAtual).toBe(3);
    });
    it('segundo contador vinculado NÃO adota o estágio como valor', () => {
        const f = ficha({ poderes: [comEstagios({ estagioAtual: 4 })] });
        adicionarContador(f, { id: 'a', poderId: 1 });
        adicionarContador(f, { id: 'b', poderId: 1, min: 0, max: 5 });
        expect(f.contadores[0].valor).toBe(3);
        expect(f.contadores[1].valor).toBe(0);
    });
    it('editar nome/min/max/reset do comandante nunca mexe no estágio', () => {
        const f = ficha({ poderes: [comEstagios({ estagioAtual: 3 })] });
        adicionarContador(f, { id: 'a', poderId: 1, min: 0, max: 5 });
        expect(f.contadores[0].valor).toBe(2);
        atualizarContador(f, 'a', { nome: 'Outro' });
        atualizarContador(f, 'a', { reset: 'cena' });
        atualizarContador(f, 'a', { max: 8 });
        atualizarContador(f, 'a', { min: 1 });
        expect(f.poderes[0].estagioAtual).toBe(3);
        expect(f.contadores[0].valor).toBe(2);
        // editar valor para o MESMO valor também não mexe (estágio mexido à mão antes)
        f.poderes[0].estagioAtual = 5;
        atualizarContador(f, 'a', { valor: 2, nome: 'X' });
        expect(f.poderes[0].estagioAtual).toBe(5);
    });
    it('prender o valor por mudança de min/max (valor muda) não é mudança "de verdade" via patch de valor: estágio intocado', () => {
        const f = ficha({ poderes: [comEstagios({ estagioAtual: 4 })] });
        adicionarContador(f, { id: 'a', poderId: 1, min: 0, max: 5 }); // valor 3
        atualizarContador(f, 'a', { max: 1 }); // valor preso a 1 sem patch.valor
        expect(f.contadores[0].valor).toBe(1);
        expect(f.poderes[0].estagioAtual).toBe(4);
    });
    it('valor inicial = estágioAtual-1, preso a min/max, sem forçar estágio', () => {
        const f = ficha({ poderes: [comEstagios({ estagioAtual: 5 })] });
        adicionarContador(f, { id: 'a', poderId: 1, min: 0, max: 2 });
        expect(f.contadores[0].valor).toBe(2);
        expect(f.poderes[0].estagioAtual).toBe(5);
        const g = ficha({ poderes: [comEstagios({ estagioAtual: 1 })] });
        adicionarContador(g, { id: 'a', poderId: 1, min: 3, max: 6 });
        expect(g.contadores[0].valor).toBe(3); // 0 preso ao mínimo
        expect(g.poderes[0].estagioAtual).toBe(1);
    });
    it('poder sem Estágios: contador vinculado não adota nada e não sincroniza', () => {
        const f = ficha({ poderes: [semEstagios()] });
        adicionarContador(f, { id: 'a', poderId: 2, min: 0, max: 5 });
        expect(f.contadores[0].valor).toBe(0);
        mudarContador(f, 'a', 2);
        expect(f.poderes[0].estagioAtual).toBeUndefined();
        expect(sincronizarEstagioDoContador(f, f.contadores[0])).toBe(false);
        expect(adotarEstagioDoPoder(f, f.contadores[0])).toBe(false);
    });
    it('poder inexistente: não quebra', () => {
        const f = ficha();
        expect(() => adicionarContador(f, { id: 'a', poderId: 123 })).not.toThrow();
        expect(f.contadores[0].poderId).toBe(123);
        expect(mudarContador(f, 'a', 1)).toBe(true);
    });
    it('remover o comandante passa o comando ao próximo (que passa a sincronizar)', () => {
        const f = ficha({ poderes: [comEstagios()] });
        adicionarContador(f, { id: 'a', poderId: 1 });
        adicionarContador(f, { id: 'b', poderId: 1 });
        removerContador(f, 'a');
        mudarContador(f, 'b', 2);
        expect(f.poderes[0].estagioAtual).toBe(3);
    });
    it('vincular avulso a poder com Estágios adota o estágio; trocar o dono re-adota', () => {
        const f = ficha({ poderes: [comEstagios({ estagioAtual: 3 })], contadores: [ct('c', { valor: 4 })] });
        atualizarContador(f, 'c', { poderId: 1 });
        expect(f.contadores[0].valor).toBe(2);
        expect(f.poderes[0].estagioAtual).toBe(3);
    });
    it('aplicarContadoresDoPoder: criado vira comandante e adota estágio atual', () => {
        const f = ficha({ poderes: [comEstagios({ estagioAtual: 4 })] });
        aplicarContadoresDoPoder(f, 1, planejarContadoresDoPoder(f, 1, [{ id: 'n', nome: 'N', min: 0, max: 5 }]));
        expect(f.contadores[0].valor).toBe(3);
        expect(f.poderes[0].estagioAtual).toBe(4);
    });
    it('aplicarContadoresDoPoder: editar nome de comandante já gravado não mexe valor nem estágio', () => {
        const f = ficha({ poderes: [comEstagios({ estagioAtual: 4 })], contadores: [ct('n', { poderId: 1, valor: 1 })] });
        aplicarContadoresDoPoder(f, 1, planejarContadoresDoPoder(f, 1, [{ id: 'n', nome: 'Novo nome', min: 0, max: 5 }]));
        expect(f.contadores[0].valor).toBe(1);
        expect(f.poderes[0].estagioAtual).toBe(4);
    });
});

describe('modelosPoder — migração de contadores mp_* sem poderId', () => {
    const EGO = 'egoSuperior';
    const mestre = (extra) => ({ isMestre: true, ...extra });
    it('novo: contadores do modelo nascem com poderId do poder', () => {
        const f = ficha();
        const r = aplicarModeloNaFicha(f, mestre({ modeloId: EGO, selecao: selecaoPadrao(obterModelo(EGO)), id: 77 }));
        expect(r.ok).toBe(true);
        const mp = f.contadores.filter(c => c.id.startsWith('mp_'));
        expect(mp.length).toBeGreaterThan(0);
        mp.forEach(c => expect(c.poderId).toBe(77));
    });
    it('editar partes migra mp_* sem poderId (legado) e é idempotente', () => {
        const f = ficha();
        aplicarModeloNaFicha(f, mestre({ modeloId: EGO, selecao: selecaoPadrao(obterModelo(EGO)), id: 77 }));
        f.contadores.forEach(c => { delete c.poderId; }); // simula ficha antiga
        f.contadores.find(c => c.id.startsWith('mp_')).valor = 1;
        const r = aplicarModeloNaFicha(f, mestre({ modeloId: EGO, selecao: selecaoPadrao(obterModelo(EGO)) }));
        expect(r.ok).toBe(true);
        expect(r.modo).toBe('editar');
        f.contadores.filter(c => c.id.startsWith('mp_')).forEach(c => expect(c.poderId).toBe(77));
        expect(f.contadores.find(c => c.id.startsWith('mp_')).valor).toBe(1);
        const snap = JSON.stringify(f);
        aplicarModeloNaFicha(f, mestre({ modeloId: EGO, selecao: selecaoPadrao(obterModelo(EGO)) }));
        expect(JSON.stringify(f)).toBe(snap);
        expect(f.contadores.length).toBe(JSON.parse(snap).contadores.length);
        expect(semUndefined(f.contadores)).toBe(true);
    });
});

describe('rascunhoPoder — contadoresRascunho', () => {
    it('rascunhoVazio e completarRascunho têm array contadoresRascunho', () => {
        expect(rascunhoVazio().contadoresRascunho).toEqual([]);
        expect(completarRascunho({ nome: 'x' }).contadoresRascunho).toEqual([]);
        expect(completarRascunho({ contadoresRascunho: 'lixo' }).contadoresRascunho).toEqual([]);
        expect(completarRascunho(null).contadoresRascunho).toEqual([]);
    });
    it('rascunhoDoPoder inclui só os contadores do poder (sem valor), preservando ids', () => {
        const p = semEstagios();
        const lista = [ct('a', { poderId: 2, valor: 3, reset: 'cena' }), ct('b', { poderId: 1 }), ct('c')];
        const r = rascunhoDoPoder(p, lista);
        expect(r.contadoresRascunho).toEqual([{ id: 'a', nome: 'Ca', min: 0, max: 5, reset: 'cena' }]);
        expect(rascunhoDoPoder(p, undefined).contadoresRascunho).toEqual([]);
        expect(rascunhoDoPoder(p, null).contadoresRascunho).toEqual([]);
    });
    it('contador no rascunho conta como conteúdo e abre a seção gatilhos com resumo', () => {
        const r = rascunhoVazio();
        r.contadoresRascunho = [{ id: 'a', nome: 'A', min: 0, max: 5 }];
        expect(rascunhoTemConteudo(r)).toBe(true);
    });
    it('rascunhoTemAlteracao detecta contador novo ou removido ao editar poder existente', () => {
        const p = semEstagios();
        const cs = [ct('a', { poderId: 2 })];
        const r = rascunhoDoPoder(p, cs);
        expect(rascunhoTemAlteracao(r, [p], cs)).toBe(false);
        r.contadoresRascunho.push({ id: 'z', nome: 'Z', min: 0, max: 1 });
        expect(rascunhoTemAlteracao(r, [p], cs)).toBe(true);
        const r2 = rascunhoDoPoder(p, cs); r2.contadoresRascunho = [];
        expect(rascunhoTemAlteracao(r2, [p], cs)).toBe(true);
    });
});
