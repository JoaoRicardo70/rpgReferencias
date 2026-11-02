import { describe, it, expect } from 'vitest';
import { montarPromptImportacao, extrairJson, lerRespostaDaIA, montarPoderImportado } from './importadorIA';

describe('importadorIA', () => {
    it('o prompt leva o texto e a categoria', () => {
        const p = montarPromptImportacao('Golpe de Fogo 15d6', 'forma');
        expect(p).toContain('Golpe de Fogo 15d6');
        expect(p).toContain('formas');
    });

    it('extrai JSON de resposta com cerca ```json e texto em volta', () => {
        const r = 'Claro! Aqui está:\n```json\n{"poderes":[{"nome":"A {x}","descricao":"d"}]}\n```\nEspero ter ajudado.';
        expect(JSON.parse(extrairJson(r)).poderes[0].nome).toBe('A {x}');
    });

    it('aceita lista na raiz e as chaves habilidades/formas', () => {
        expect(lerRespostaDaIA('[{"nome":"A"}]').itens).toHaveLength(1);
        expect(lerRespostaDaIA('{"habilidades":[{"nome":"A"},{"nome":"B"}]}').itens).toHaveLength(2);
    });

    it('erros em português: sem JSON, JSON quebrado, lista vazia', () => {
        expect(lerRespostaDaIA('nada aqui').ok).toBe(false);
        expect(lerRespostaDaIA('{"poderes":[{"nome":').ok).toBe(false);
        expect(lerRespostaDaIA('{"poderes":[]}').ok).toBe(false);
        expect(lerRespostaDaIA('{"outra":1}').ok).toBe(false);
    });

    it('monta um poder completo com padrões seguros', () => {
        const p = montarPoderImportado({ nome: ' Chama ', danoQtd: '15', danoFaces: 6, custoPercentual: '2,5', tipoAcao: 'bonus' }, 'habilidade', 7);
        expect(p).toMatchObject({ id: 7, nome: 'Chama', categoria: 'habilidade', dadosQtd: 15, dadosFaces: 6, custoPercentual: 2.5, tipoAcao: 'bonus', efeitos: [], efeitosPassivos: [], alcance: 1, maestria: 0, maestriaRequerida: 0 });
    });

    it('sem dano usa d20 de padrão; tipoAcao inválido vira automático; forma ganha maestria/fadiga', () => {
        const p = montarPoderImportado({ nome: '', danoQtd: -3, tipoAcao: 'xyz' }, 'forma', 1);
        expect(p).toMatchObject({ nome: 'Sem nome', dadosQtd: 0, dadosFaces: 20, tipoAcao: '', maestria: 0, fadigaPorUso: 0 });
        expect(p.maestriaRequerida).toBeUndefined();
    });
});

describe('importadorIA (bordas)', () => {
    it('prompt: categoria desconhecida cai em habilidades; texto nulo não quebra', () => {
        expect(montarPromptImportacao(null, 'xyz')).toContain('habilidades');
        expect(montarPromptImportacao(undefined)).toContain('TEXTO:');
        expect(montarPromptImportacao('  abc  ', 'poder')).toContain('poderes');
    });

    it('extrairJson: null/vazio/sem fechamento/aspas escapadas/chaves em string', () => {
        expect(extrairJson(null)).toBeNull();
        expect(extrairJson('')).toBeNull();
        expect(extrairJson('{"a":1')).toBeNull();
        expect(extrairJson('x {"a":"q\\"}"} y')).toBe('{"a":"q\\"}"}');
        expect(extrairJson('```JSON\n[1,2]\n```')).toBe('[1,2]');
        expect(extrairJson('{"a":{"b":{}}} {"c":1}')).toBe('{"a":{"b":{}}}');
    });

    it('lerRespostaDaIA: filtra itens não-objeto e rejeita lista só com lixo', () => {
        expect(lerRespostaDaIA('{"poderes":[1,null,"x",[],{"nome":"A"}]}').itens).toEqual([{ nome: 'A' }]);
        expect(lerRespostaDaIA('{"poderes":[1,null]}').ok).toBe(false);
        expect(lerRespostaDaIA('{"poderes":"x"}').ok).toBe(false);
        expect(lerRespostaDaIA(undefined).ok).toBe(false);
        expect(lerRespostaDaIA('[]').ok).toBe(false);
    });

    it('lerRespostaDaIA: texto antes com colchete solto pega o primeiro JSON', () => {
        const r = lerRespostaDaIA('[nota] {"poderes":[{"nome":"A"}]}');
        expect(r.ok).toBe(true);
        expect(r.itens[0].nome).toBe('A');
    });

    it('montarPoderImportado: aliases dadosQtd/dadosFaces, alcance 0 vira 1, números com vírgula, nulos', () => {
        const p = montarPoderImportado({ nome: 'A', dadosQtd: '3', dadosFaces: '8', alcance: 0, area: '2,5', custoPercentual: 'abc' }, 'poder', 1);
        expect(p).toMatchObject({ dadosQtd: 3, dadosFaces: 8, alcance: 1, area: 2.5, custoPercentual: 0, maestria: 0, maestriaRequerida: 0 });
        const q = montarPoderImportado({ nome: 'B', alcance: '6' }, 'habilidade', 2);
        expect(q.alcance).toBe(6);
        expect(montarPoderImportado({ nome: null, descricao: null, notasIA: null }, 'poder', 3)).toMatchObject({ nome: 'Sem nome', descricao: '', notasIA: '' });
        expect(montarPoderImportado({ danoQtd: 2.9 }, 'poder', 4).dadosQtd).toBe(2);
    });

    it('categoria desconhecida não ganha maestria', () => {
        const p = montarPoderImportado({ nome: 'x' }, 'outra', 1);
        expect(p.maestria).toBeUndefined();
        expect(p.ativa).toBe(false);
    });
});
