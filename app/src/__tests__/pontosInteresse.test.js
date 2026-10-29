import { describe, it, expect } from 'vitest';
import {
    novoPonto, pontosValidos, cenasDoPonto, cenasSemPonto, pontosDaRegiao, cenarioComPonto, cenarioSemPonto, cenarioComCenaNoPonto,
    caixaDaRegiao, caixaDaFaccao, vistaDeFoco, VISTA_SEM_FOCO, emojiDoIcone, NOME_PONTO_MAX, filtrarPontos, contarPorFiltro, filtroDeIcone, ICONES_PONTO, zoomVistaFoco, moverVistaFoco, ZOOM_FOCO_MAX
} from '../core/pontosInteresse';
import { novaCenaDeRegiao } from '../core/cenasRegiao';

const MESTRE = { ehMestre: true, souCriador: true, meuNome: 'Mestre', ativaId: 'default' };
const JOGADOR = { ehMestre: false, souCriador: false, meuNome: 'Ana', ativaId: 'default' };

describe('pontos de interesse - dados', () => {
    it('novoPonto limita coordenadas, corta o nome e cai no ícone padrão', () => {
        const p = novoPonto({ reino: 'Noxus', nome: `  ${'a'.repeat(80)} `, x: 140, y: -5, icone: 'inexistente' });
        expect(p.nome).toHaveLength(NOME_PONTO_MAX);
        expect(p.x).toBe(100); expect(p.y).toBe(0);
        expect(p.icone).toBe('cidade');
        expect(emojiDoIcone('porto')).toBe('⚓');
        expect(emojiDoIcone('nada')).toBe('🏰');
    });

    it('pontosValidos ignora entradas quebradas do Firebase', () => {
        const v = pontosValidos({ ok: { reino: 'Noxus', nome: 'Capital', x: 10, y: 20 }, semNome: { reino: 'Noxus', x: 1, y: 1 }, semReino: { nome: 'X', x: 1, y: 1 }, nan: { reino: 'Noxus', nome: 'Y', x: 'abc', y: 1 }, lixo: 5 });
        expect(Object.keys(v)).toEqual(['ok']);
        expect(pontosValidos(null)).toEqual({});
    });
});

describe('pontos de interesse - cenas', () => {
    const lista = {
        a: { nome: 'Capital', reino: 'Noxus', ponto: 'p1' },
        b: { nome: 'Arena', reino: 'Noxus', ponto: 'p1', restrita: true, acessoNomes: ['Bia'] },
        c: { nome: 'Solta', reino: 'Noxus' },
        d: { nome: 'Órfã', reino: 'Noxus', ponto: 'apagado' },
        e: { nome: 'Outra região', reino: 'Demacia' }
    };
    const pontos = { p1: novoPonto({ reino: 'Noxus', nome: 'Capital', x: 50, y: 50 }) };

    it('lista as cenas do ponto respeitando o acesso de cada pessoa', () => {
        expect(cenasDoPonto(lista, 'p1', MESTRE).map((c) => c.id)).toEqual(['b', 'a'].sort((x, y) => lista[x].nome.localeCompare(lista[y].nome, 'pt-BR')));
        expect(cenasDoPonto(lista, 'p1', JOGADOR).map((c) => c.id)).toEqual(['a']);
        expect(cenasDoPonto(lista, '', MESTRE)).toEqual([]);
    });

    it('cenas sem ponto incluem as nunca marcadas e as de um ponto apagado, só da região', () => {
        expect(cenasSemPonto(lista, pontos, 'Noxus', MESTRE).map((c) => c.id).sort()).toEqual(['c', 'd']);
        expect(cenasSemPonto(lista, pontos, 'Demacia', MESTRE).map((c) => c.id)).toEqual(['e']);
    });

    it('o Mestre vê todos os pontos; o jogador só os que têm cena liberada para ele', () => {
        const dois = { ...pontos, p2: novoPonto({ reino: 'Noxus', nome: 'Ruínas', x: 20, y: 20 }), p3: novoPonto({ reino: 'Demacia', nome: 'Muralha', x: 5, y: 5 }) };
        expect(pontosDaRegiao(dois, lista, 'Noxus', MESTRE).map((p) => p.id)).toEqual(['p1', 'p2']);
        expect(pontosDaRegiao(dois, lista, 'Noxus', JOGADOR).map((p) => p.id)).toEqual(['p1']);
        expect(pontosDaRegiao(dois, lista, 'Noxus', JOGADOR)[0].cenas).toBe(1);
    });

    it('a cena nova pode já nascer num ponto', () => {
        expect(novaCenaDeRegiao({ reino: 'Noxus', nome: 'X', ponto: 'p1' }).ponto).toBe('p1');
        expect('ponto' in novaCenaDeRegiao({ reino: 'Noxus', nome: 'X' })).toBe(false);
    });
});

describe('pontos de interesse - edição (cenário novo, sem mexer no original)', () => {
    const base = { ativa: 'default', lista: { a: { nome: 'A', reino: 'Noxus', ponto: 'p1' }, b: { nome: 'B', reino: 'Noxus', ponto: 'p2' } } };

    it('cria e move um ponto', () => {
        const c1 = cenarioComPonto(base, 'p1', { reino: 'Noxus', nome: 'Capital', x: 10, y: 10 });
        expect(c1.pontos.p1.nome).toBe('Capital');
        expect(base.pontos).toBeUndefined();
        const c2 = cenarioComPonto(c1, 'p1', { ...c1.pontos.p1, x: 33.33, y: 44 });
        expect(c2.pontos.p1.x).toBe(33.3);
    });

    it('excluir um ponto solta as cenas dele sem apagá-las', () => {
        const c = cenarioSemPonto({ ...base, pontos: { p1: { reino: 'Noxus', nome: 'Capital', x: 1, y: 1 }, p2: { reino: 'Noxus', nome: 'Porto', x: 2, y: 2 } } }, 'p1');
        expect(Object.keys(c.pontos)).toEqual(['p2']);
        expect('ponto' in c.lista.a).toBe(false);
        expect(c.lista.a.nome).toBe('A');
        expect(c.lista.b.ponto).toBe('p2');
    });

    it('move a cena entre pontos ou a tira de todos', () => {
        expect(cenarioComCenaNoPonto(base, 'a', 'p9').lista.a.ponto).toBe('p9');
        expect('ponto' in cenarioComCenaNoPonto(base, 'a', null).lista.a).toBe(false);
        expect(cenarioComCenaNoPonto(base, 'zzz', 'p1')).toBe(base);
    });
});

describe('pontos de interesse - aproximação na região', () => {
    it('a caixa de cada região cai onde ela está no mapa', () => {
        const fre = caixaDaRegiao('Freljord'); const shu = caixaDaRegiao('Shurima');
        expect(fre.x1).toBeLessThan(0.5); expect(fre.y1).toBeLessThan(0.45);
        expect(shu.y0).toBeGreaterThan(0.4);
        expect(caixaDaRegiao('Região Inexistente')).toBeNull();
        ['Demacia', 'Noxus', 'Piltover e Zaun', 'Targon', 'Ixtal', 'Águas de Sentina', 'Ionia', 'Ilha das Sombras'].forEach((n) => {
            const c = caixaDaRegiao(n);
            expect(c.x1).toBeGreaterThan(c.x0); expect(c.y1).toBeGreaterThan(c.y0);
        });
    });

    it('o zoom enquadra a caixa sem mostrar nada fora do mapa', () => {
        expect(vistaDeFoco(null)).toBe(VISTA_SEM_FOCO);
        ['Freljord', 'Noxus', 'Shurima', 'Ionia', 'Ilha das Sombras', 'Targon'].forEach((n) => {
            const v = vistaDeFoco(caixaDaRegiao(n));
            expect(v.escala).toBeGreaterThanOrEqual(1.5); expect(v.escala).toBeLessThanOrEqual(4.5);
            expect(v.x).toBeLessThanOrEqual(0); expect(v.x).toBeGreaterThanOrEqual((1 - v.escala) * 100 - 0.001);
            expect(v.y).toBeLessThanOrEqual(0); expect(v.y).toBeGreaterThanOrEqual((1 - v.escala) * 100 - 0.001);
        });
    });
});

describe('pontos de interesse - categorias e filtro', () => {
    it('a categoria padrão é "local" e valores inválidos voltam a ela', () => {
        expect(novoPonto({ reino: 'Noxus', nome: 'A', x: 1, y: 1 }).categoria).toBe('local');
        expect(novoPonto({ reino: 'Noxus', nome: 'A', x: 1, y: 1, categoria: 'dungeon' }).categoria).toBe('dungeon');
        expect(novoPonto({ reino: 'Noxus', nome: 'A', x: 1, y: 1, categoria: 'xyz' }).categoria).toBe('local');
        expect(pontosValidos({ a: { reino: 'Noxus', nome: 'A', x: 1, y: 1, categoria: 'dungeon' } }).a.categoria).toBe('dungeon');
    });

    it('filtra por tipo de ícone e conta todos os tipos, mesmo os vazios', () => {
        const lista = [
            { id: 'a', ponto: { categoria: 'local', icone: 'cidade' } },
            { id: 'b', ponto: { categoria: 'dungeon', icone: 'masmorra' } },
            { id: 'c', ponto: { categoria: 'local', icone: 'cidade' } }
        ];
        expect(filtrarPontos(lista, filtroDeIcone('cidade')).map((p) => p.id)).toEqual(['a', 'c']);
        expect(filtrarPontos(lista, filtroDeIcone('porto'))).toEqual([]);
        const c = contarPorFiltro(lista);
        expect(c).toMatchObject({ todos: 3, local: 2, dungeon: 1, 'icone:cidade': 2, 'icone:masmorra': 1, 'icone:porto': 0 });
        ICONES_PONTO.forEach((i) => expect(c).toHaveProperty(filtroDeIcone(i.id)));
    });

    it('filtrarPontos separa por categoria e "todos" não filtra', () => {
        const lista = [{ id: 'a', ponto: { categoria: 'local' } }, { id: 'b', ponto: { categoria: 'dungeon' } }];
        expect(filtrarPontos(lista, 'todos')).toHaveLength(2);
        expect(filtrarPontos(lista, 'dungeon').map((p) => p.id)).toEqual(['b']);
        expect(filtrarPontos(lista, 'local').map((p) => p.id)).toEqual(['a']);
    });
});

describe('pontos de interesse - território atual e zoom livre', () => {
    it('a caixa usa a grade atual e cai no padrão quando a facção da região não tem mais território', () => {
        const grade = Array.from({ length: 204 }, () => '0'.repeat(320));
        grade[100] = '0'.repeat(300) + '3'.repeat(10) + '0'.repeat(10);
        const c = caixaDaRegiao('Noxus', grade);
        expect(c.x0).toBeGreaterThan(0.9);
        expect(caixaDaRegiao('Noxus', Array.from({ length: 204 }, () => '0'.repeat(320))).x0).toBeLessThan(0.6);
        expect(caixaDaFaccao(null, '3')).toBeNull();
    });

    it('zoomVistaFoco mantém o ponto sob o cursor e respeita os limites', () => {
        const v0 = { escala: 2, x: -50, y: -50 };
        const v1 = zoomVistaFoco(v0, 4, 0.5, 0.5);
        expect((0.5 - v1.x / 100) / v1.escala).toBeCloseTo((0.5 - v0.x / 100) / v0.escala);
        expect(zoomVistaFoco(v0, 99).escala).toBe(ZOOM_FOCO_MAX);
        expect(zoomVistaFoco(v0, 0.1)).toEqual({ escala: 1, x: 0, y: 0 });
        const borda = zoomVistaFoco({ escala: 1, x: 0, y: 0 }, 3, 0, 0);
        expect(borda.x).toBe(0); expect(borda.y).toBe(0);
    });

    it('moverVistaFoco desloca sem sair do mapa', () => {
        const v = { escala: 3, x: -100, y: -100 };
        expect(moverVistaFoco(v, 0.1, 0.05)).toEqual({ escala: 3, x: -90, y: -95 });
        expect(moverVistaFoco(v, 5, 5)).toEqual({ escala: 3, x: 0, y: 0 });
        expect(moverVistaFoco(v, -5, -5)).toEqual({ escala: 3, x: -200, y: -200 });
    });
});
