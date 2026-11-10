import { describe, it, expect } from 'vitest';
import {
    SECOES_FORM, SECOES_PADRAO, chaveRascunhoPoder, chaveAbaRascunhoPoder, rascunhoVazio,
    rascunhoTemConteudo, completarRascunho, rascunhoDoPoder, resumirSecoes, rascunhoDifere, rascunhoTemAlteracao,
} from './rascunhoPoder';

describe('rascunhoPoder — chaves', () => {
    it('chave combina dono e categoria', () => {
        expect(chaveRascunhoPoder('Natsu', 'forma')).toBe('Natsu|forma');
        expect(chaveAbaRascunhoPoder('Natsu')).toBe('Natsu|_aba');
    });
    it('dono vazio/null cai em "_" e categoria vazia em habilidade', () => {
        expect(chaveRascunhoPoder('', '')).toBe('_|habilidade');
        expect(chaveRascunhoPoder(null, undefined)).toBe('_|habilidade');
        expect(chaveAbaRascunhoPoder(undefined)).toBe('_|_aba');
    });
    it('donos/categorias diferentes geram chaves diferentes', () => {
        expect(chaveRascunhoPoder('A', 'poder')).not.toBe(chaveRascunhoPoder('B', 'poder'));
        expect(chaveRascunhoPoder('A', 'poder')).not.toBe(chaveRascunhoPoder('A', 'forma'));
    });
});

describe('rascunhoPoder — rascunhoVazio / constantes', () => {
    it('SECOES_FORM tem as 5 seções e o padrão só abre Básico', () => {
        expect(SECOES_FORM).toEqual(['basico', 'combate', 'efeitos', 'gatilhos', 'avancado']);
        expect(SECOES_PADRAO).toEqual({ basico: true, combate: false, efeitos: false, gatilhos: false, avancado: false });
        expect(Object.isFrozen(SECOES_PADRAO)).toBe(true);
    });
    it('cada chamada devolve objeto novo (sem compartilhar referências)', () => {
        const a = rascunhoVazio(); const b = rascunhoVazio();
        a.efeitos.push({ x: 1 }); a.abertas.combate = true; a.escudo.nome = 'x';
        expect(b.efeitos).toEqual([]);
        expect(b.abertas.combate).toBe(false);
        expect(b.escudo.nome).toBe('');
        expect(SECOES_PADRAO.combate).toBe(false);
    });
    it('é JSON puro (round-trip idêntico)', () => {
        const v = rascunhoVazio();
        expect(JSON.parse(JSON.stringify(v))).toEqual(v);
    });
    it('tem poderEditandoId null e padrões esperados', () => {
        const v = rascunhoVazio();
        expect(v.poderEditandoId).toBeNull();
        expect(v.dadosFaces).toBe(20);
        expect(v.alcance).toBe(1);
        expect(v.fadigaPorUso).toBe(15);
        expect(v.usosPor).toBe('cena');
    });
});

describe('rascunhoPoder — rascunhoTemConteudo', () => {
    it('vazio, null, undefined e não-objeto => false', () => {
        expect(rascunhoTemConteudo(rascunhoVazio())).toBe(false);
        expect(rascunhoTemConteudo(null)).toBe(false);
        expect(rascunhoTemConteudo(undefined)).toBe(false);
        expect(rascunhoTemConteudo('texto')).toBe(false);
        expect(rascunhoTemConteudo(42)).toBe(false);
    });
    it('objeto vazio {} (campos faltando) => false? campos undefined diferem do padrão', () => {
        // Documenta o comportamento: campos ausentes (undefined) contam como diferentes do padrão.
        // Rascunhos reais passam por completarRascunho antes, então o resultado correto é via completar.
        expect(rascunhoTemConteudo(completarRascunho({}))).toBe(false);
    });
    it('digitar nome, descrição, dados ou efeito => true', () => {
        expect(rascunhoTemConteudo({ ...rascunhoVazio(), nome: 'x' })).toBe(true);
        expect(rascunhoTemConteudo({ ...rascunhoVazio(), descricao: 'x' })).toBe(true);
        expect(rascunhoTemConteudo({ ...rascunhoVazio(), dadosQtd: 2 })).toBe(true);
        expect(rascunhoTemConteudo({ ...rascunhoVazio(), efeitos: [{ nome: 'a' }] })).toBe(true);
        expect(rascunhoTemConteudo({ ...rascunhoVazio(), nomeEfeito: 'pendente' })).toBe(true);
    });
    it('mexer só no estado de UI (abertas) ou nos seletores padrão (novoAtr/novoProp) não conta', () => {
        const r = rascunhoVazio();
        r.abertas = { basico: false, combate: true, efeitos: true, gatilhos: true, avancado: true };
        r.novoAtr = 'agilidade'; r.novoProp = 'mult'; r.novoAtrPassivo = 'forca'; r.novoPropPassivo = 'mult';
        expect(rascunhoTemConteudo(r)).toBe(false);
    });
    it('poderEditandoId sozinho não conta como conteúdo', () => {
        expect(rascunhoTemConteudo({ ...rascunhoVazio(), poderEditandoId: 5 })).toBe(false);
    });
    it('espaço em branco no nome conta como conteúdo (difere do vazio)', () => {
        expect(rascunhoTemConteudo({ ...rascunhoVazio(), nome: ' ' })).toBe(true);
    });
});

describe('rascunhoPoder — completarRascunho', () => {
    it('null/undefined/primitivo devolvem rascunho vazio completo', () => {
        expect(completarRascunho(null)).toEqual(rascunhoVazio());
        expect(completarRascunho(undefined)).toEqual(rascunhoVazio());
        expect(completarRascunho('x')).toEqual(rascunhoVazio());
    });
    it('preenche campos faltando e subobjetos parciais', () => {
        const r = completarRascunho({ nome: 'A', custoTurno: { valor: '3' }, escudo: { nome: 'E' }, estagios: { habilitado: true }, abertas: { combate: true } });
        expect(r.nome).toBe('A');
        expect(r.custoTurno).toEqual({ modo: 'fixo', valor: '3', energia: 'mana' });
        expect(r.escudo).toEqual({ nome: 'E', valor: '', tipo: 'escudo' });
        expect(r.estagios.habilitado).toBe(true);
        expect(r.estagios.nomes).toBe('');
        expect(r.abertas).toEqual({ ...SECOES_PADRAO, combate: true });
        expect(r.dadosFaces).toBe(20);
    });
    it('arrays inválidos viram []', () => {
        const r = completarRascunho({ efeitos: null, efeitosPassivos: 'x', gatilhos: {}, gatilhosDescartados: 5 });
        expect(r.efeitos).toEqual([]); expect(r.efeitosPassivos).toEqual([]);
        expect(r.gatilhos).toEqual([]); expect(r.gatilhosDescartados).toEqual([]);
    });
    it('não muta a entrada e devolve cópia profunda', () => {
        const ent = { nome: 'A', efeitos: [{ nome: 'e' }], abertas: { combate: true } };
        const copia = JSON.parse(JSON.stringify(ent));
        const r = completarRascunho(ent);
        expect(ent).toEqual(copia);
        r.efeitos[0].nome = 'mudou'; r.abertas.combate = false;
        expect(ent.efeitos[0].nome).toBe('e');
        expect(ent.abertas.combate).toBe(true);
    });
    it('abertas null não quebra', () => {
        expect(completarRascunho({ abertas: null }).abertas).toEqual(SECOES_PADRAO);
    });
});

describe('rascunhoPoder — rascunhoDoPoder', () => {
    const base = { id: 7, nome: 'Rasengan', categoria: 'habilidade' };
    it('poder mínimo: só id e nome', () => {
        const r = rascunhoDoPoder(base);
        expect(r.poderEditandoId).toBe(7);
        expect(r.nome).toBe('Rasengan');
        expect(r.descricao).toBe('');
        expect(r.dadosFaces).toBe(20);
        expect(r.alcance).toBe(1);
        expect(r.fadigaPorUso).toBe(15);
        expect(r.efeitos).toEqual([]);
        expect(r.abertas).toEqual({ basico: true, combate: false, efeitos: false, gatilhos: false, avancado: false });
    });
    it('fadigaPorUso 0 é preservado (não vira 15)', () => {
        expect(rascunhoDoPoder({ ...base, fadigaPorUso: 0 }).fadigaPorUso).toBe(0);
    });
    it('mapeia campos de combate e abre a seção Combate', () => {
        const r = rascunhoDoPoder({ ...base, dadosQtd: 3, dadosFaces: 6, custoPercentual: 10, custoPercentualMax: 20, danoVerdadeiro: true, armaVinculada: 'a1', alcance: 3, area: 2 });
        expect(r.dadosQtd).toBe(3); expect(r.dadosFaces).toBe(6);
        expect(r.arma).toBe('a1');
        expect(r.danoVerdadeiro).toBe(true);
        expect(r.abertas.combate).toBe(true);
        expect(r.abertas.efeitos).toBe(false);
    });
    it('danoVerdadeiro só true estrito', () => {
        expect(rascunhoDoPoder({ ...base, danoVerdadeiro: 'sim' }).danoVerdadeiro).toBe(false);
    });
    it('efeitos e passivos são clonados e abrem Efeitos', () => {
        const ef = [{ nome: 'F', atributo: 'forca', propriedade: 'base', valor: 5 }];
        const p = { ...base, efeitos: ef, efeitosPassivos: [{ nome: 'P', atributo: 'evasiva', propriedade: 'base', valor: 1 }] };
        const r = rascunhoDoPoder(p);
        expect(r.efeitos).toEqual(ef);
        expect(r.efeitos).not.toBe(ef);
        r.efeitos[0].valor = 99;
        expect(ef[0].valor).toBe(5);
        expect(r.abertas.efeitos).toBe(true);
    });
    it('não altera o poder original', () => {
        const p = { ...base, efeitos: [{ nome: 'F', valor: 1 }], gatilhos: [], usosMax: 2, usosPor: 'descanso', pasta: 'A/B' };
        const copia = JSON.parse(JSON.stringify(p));
        rascunhoDoPoder(p);
        expect(p).toEqual(copia);
    });
    it('usos, recarga, pasta e maestria abrem Avançado', () => {
        const r = rascunhoDoPoder({ ...base, usosMax: 3, usosPor: 'descanso', recargaTurnos: 2, pasta: 'Taijutsu', maestria: 50, maestriaRequerida: 30 });
        expect(r.usosMax).toBe(3); expect(r.usosPor).toBe('descanso');
        expect(r.recargaTurnos).toBe(2); expect(r.pasta).toBe('Taijutsu');
        expect(r.abertas.avancado).toBe(true);
    });
    it('poder gravado produz rascunho SEM diferença consigo mesmo', () => {
        const p = { ...base, descricao: 'd', dadosQtd: 1, efeitos: [{ nome: 'x', atributo: 'forca', propriedade: 'base', valor: 1 }] };
        expect(rascunhoDifere(rascunhoDoPoder(p), rascunhoDoPoder(p))).toBe(false);
    });
    it('poder sem nome (null) não explode', () => {
        expect(rascunhoDoPoder({ id: 1, nome: null }).nome).toBe('');
    });
});

describe('rascunhoPoder — resumirSecoes', () => {
    it('vazio: todos os resumos e erros vazios', () => {
        const s = resumirSecoes(rascunhoVazio());
        SECOES_FORM.forEach(id => { expect(s[id].resumo).toBe(''); expect(s[id].erro).toBe(''); });
    });
    it('null/undefined não quebram', () => {
        expect(resumirSecoes(null).combate.resumo).toBe('');
        expect(resumirSecoes(undefined).efeitos.erro).toBe('');
    });
    it('Básico: vertente e elemento só quando Elemental', () => {
        expect(resumirSecoes({ vertente: 'Acumulativo', elemento: 'Fogo' }).basico.resumo).toBe('Acumulativo');
        expect(resumirSecoes({ vertente: 'Elemental', elemento: 'Fogo' }).basico.resumo).toBe('Elemental · Fogo');
        expect(resumirSecoes({ vertente: 'Elemental', elemento: '' }).basico.resumo).toBe('Elemental');
    });
    it('Combate: dados, custo, faixa de custo, flags', () => {
        const s = resumirSecoes({ dadosQtd: 2, dadosFaces: 8, custoPercentual: 5, custoPercentualMax: 15, semComoPoder: true, danoVerdadeiro: true, tipoAcao: 'x', area: 3, alcance: 4, arma: 'a' }).combate.resumo;
        expect(s).toBe('2d8 · custo 5–15% · sem Como Poder · dano verdadeiro · ação definida · área 3Q · alcance 4Q · arma vinculada');
    });
    it('Combate: custo simples, dadosFaces 0 cai em d20, alcance 1 não aparece', () => {
        expect(resumirSecoes({ dadosQtd: 1, dadosFaces: 0, custoPercentual: 7, alcance: 1 }).combate.resumo).toBe('1d20 · custo 7%');
    });
    it('Combate: strings numéricas e lixo (NaN) são tolerados', () => {
        expect(resumirSecoes({ dadosQtd: '3', dadosFaces: '6' }).combate.resumo).toBe('3d6');
        expect(resumirSecoes({ dadosQtd: 'abc', custoPercentual: 'x' }).combate.resumo).toBe('');
    });
    it('Efeitos: pluraliza e conta passivos', () => {
        expect(resumirSecoes({ efeitos: [{}] }).efeitos.resumo).toBe('1 efeito');
        expect(resumirSecoes({ efeitos: [{}, {}], efeitosPassivos: [{}] }).efeitos.resumo).toBe('2 efeitos · 1 passivo');
        expect(resumirSecoes({ efeitosPassivos: [{}, {}] }).efeitos.resumo).toBe('2 passivos');
    });
    it('Efeitos: aviso quando há texto digitado e não adicionado (ativo ou passivo)', () => {
        const msg = 'efeito digitado e não adicionado';
        expect(resumirSecoes({ nomeEfeito: 'Bônus' }).efeitos.erro).toBe(msg);
        expect(resumirSecoes({ novoVal: '5' }).efeitos.erro).toBe(msg);
        expect(resumirSecoes({ nomeEfeitoPassivo: 'P' }).efeitos.erro).toBe(msg);
        expect(resumirSecoes({ novoValPassivo: '2' }).efeitos.erro).toBe(msg);
    });
    it('Efeitos: só espaços não gera aviso', () => {
        expect(resumirSecoes({ nomeEfeito: '   ', novoVal: ' ' }).efeitos.erro).toBe('');
    });
    it('Efeitos: novoVal numérico 0 (number) gera aviso? String("0") não é vazia', () => {
        expect(resumirSecoes({ novoVal: 0 }).efeitos.erro).toBe('efeito digitado e não adicionado');
    });
    it('Gatilhos: contagem e aviso de inválidos', () => {
        expect(resumirSecoes({ gatilhos: [{}] }).gatilhos.resumo).toBe('1 gatilho');
        expect(resumirSecoes({ gatilhos: [{}, {}] }).gatilhos.resumo).toBe('2 gatilhos');
        expect(resumirSecoes({ gatilhosDescartados: [{}] }).gatilhos.erro).toBe('1 gatilho inválido');
        expect(resumirSecoes({ gatilhosDescartados: [{}, {}, {}] }).gatilhos.erro).toBe('3 gatilhos inválidos');
        expect(resumirSecoes({ gatilhosDescartados: [{}] }).gatilhos.resumo).toBe('');
    });
    it('Avançado: usos, custo por turno, recarga, escudo, estágios, maestria, pasta', () => {
        const s = resumirSecoes({
            usosMax: 1, custoTurno: { modo: 'fixo', valor: 5, energia: 'mana' }, recargaTurnos: 2,
            escudo: { nome: 'E', valor: 10, tipo: 'escudo' }, estagios: { habilitado: true }, maestria: 40, maestriaRequerida: 60, pasta: ' Pasta ',
        }).avancado.resumo;
        expect(s).toBe('1 uso · custo por turno · recarga 2 · escudo · Estágios ativos · maestria 40% · exige 60% · pasta Pasta');
        expect(resumirSecoes({ usosMax: 3 }).avancado.resumo).toBe('3 usos');
    });
    it('Avançado: pasta só espaços não aparece', () => {
        expect(resumirSecoes({ pasta: '   ' }).avancado.resumo).toBe('');
    });
});

describe('rascunhoPoder — rascunhoDifere', () => {
    it('iguais => false; ignora abertas e poderEditandoId', () => {
        const a = rascunhoVazio();
        const b = { ...rascunhoVazio(), poderEditandoId: 3, abertas: { basico: false, combate: true, efeitos: true, gatilhos: true, avancado: true } };
        expect(rascunhoDifere(a, b)).toBe(false);
    });
    it('mudança de conteúdo => true', () => {
        expect(rascunhoDifere({ ...rascunhoVazio(), nome: 'x' }, rascunhoVazio())).toBe(true);
    });
    it('tolera null/parciais (completa os padrões)', () => {
        expect(rascunhoDifere(null, undefined)).toBe(false);
        expect(rascunhoDifere({ nome: 'x' }, null)).toBe(true);
    });
    it('mudança profunda em efeito é detectada', () => {
        const a = { ...rascunhoVazio(), efeitos: [{ valor: 1 }] };
        const b = { ...rascunhoVazio(), efeitos: [{ valor: 2 }] };
        expect(rascunhoDifere(a, b)).toBe(true);
    });
});

describe('rascunhoPoder — rascunhoTemAlteracao', () => {
    const poder = { id: 1, nome: 'Golpe', descricao: 'd', categoria: 'habilidade' };
    it('null/não-objeto => false', () => {
        expect(rascunhoTemAlteracao(null, [])).toBe(false);
        expect(rascunhoTemAlteracao(undefined, undefined)).toBe(false);
        expect(rascunhoTemAlteracao('x', [])).toBe(false);
    });
    it('sem poderEditandoId usa "tem conteúdo"', () => {
        expect(rascunhoTemAlteracao(rascunhoVazio(), [])).toBe(false);
        expect(rascunhoTemAlteracao({ ...rascunhoVazio(), nome: 'x' }, [])).toBe(true);
    });
    it('reescrevendo sem mudança => false; com mudança => true', () => {
        const r = rascunhoDoPoder(poder);
        expect(rascunhoTemAlteracao(r, [poder])).toBe(false);
        expect(rascunhoTemAlteracao({ ...r, nome: 'Golpe 2' }, [poder])).toBe(true);
    });
    it('abrir/fechar seção não conta como alteração', () => {
        const r = rascunhoDoPoder(poder); r.abertas.combate = true;
        expect(rascunhoTemAlteracao(r, [poder])).toBe(false);
    });
    it('poder original não existe (apagado): cai em "tem conteúdo"', () => {
        const r = rascunhoDoPoder(poder);
        expect(rascunhoTemAlteracao(r, [])).toBe(true);
        expect(rascunhoTemAlteracao(r, undefined)).toBe(true);
        expect(rascunhoTemAlteracao(r, [null, { id: 99 }])).toBe(true);
        expect(rascunhoTemAlteracao({ ...rascunhoVazio(), poderEditandoId: 1 }, [])).toBe(false);
    });
    it('lista de poderes com null não quebra', () => {
        const r = rascunhoDoPoder(poder);
        expect(rascunhoTemAlteracao(r, [null, poder])).toBe(false);
    });
});
