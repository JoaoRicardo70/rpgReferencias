import { describe, it, expect } from 'vitest';
import {
    montarPromptImportacao, lerRespostaDaIA, prepararItemImportado, prepararImportacao, mudarCategoriaImportada,
    montarPoderFinal, juntarNotas, resumirItemImportado,
} from './importadorIA';
import { ATRIBUTOS_EFEITO } from './sextaFeiraCriacao';
import { ESTADOS } from './condicoes';

const RESPOSTA = `Claro! Aqui está o JSON:
\`\`\`json
{
  "poderes": [
    {
      "nome": "Fênix Negra",
      "descricao": "Forma suprema.",
      "categoria": "forma",
      "danoQtd": "10", "danoFaces": 0,
      "custoPercentual": "7,5",
      "alcance": 0,
      "efeitosPassivos": [
        { "nome": "Furia", "atributo": "dano", "propriedade": "mgeral", "valor": 40 },
        { "nome": "Mira", "atributo": "acerto", "propriedade": "base", "valor": "+80" },
        { "nome": "Aura", "atributo": "todos_status", "propriedade": "mbase", "valor": 50 },
        { "nome": "CA", "atributo": "evasiva", "propriedade": "base", "valor": 60 },
        { "nome": "CA", "atributo": "resistencia", "propriedade": "base", "valor": 60 },
        { "nome": "Rapidez", "atributo": "velocidade_da_luz", "propriedade": "base", "valor": 5 },
        { "nome": "Forca", "atributo": "forca", "propriedade": "base", "valor": "x40" },
        { "nome": "Dano puro", "atributo": "dano", "propriedade": "base", "valor": 10 }
      ],
      "notasIA": "Só funciona à noite.",
      "naoAplicado": ["x40 em todo dano"]
    },
    { "descricao": "sem nome", "categoria": "habilidade" },
    {
      "nome": "Escudo Reflexo", "categoria": "habilidade", "tipoAcao": "reacao",
      "efeitos": [{ "nome": "Reducao", "atributo": "reacao_acertou", "propriedade": "reduzir_dano", "valor": 50 }]
    }
  ]
}
\`\`\`
Espero ter ajudado.`;

function pipeline() {
    const lido = lerRespostaDaIA(RESPOSTA);
    expect(lido.ok).toBe(true);
    return prepararImportacao(lido.itens, 'habilidade', 10);
}
const attrs = (efs) => efs.map(e => e.atributo);

describe('importador v2 - pipeline completo', () => {
    it('lê 3 itens e numera as chaves a partir da chave inicial', () => {
        const prev = pipeline();
        expect(prev.map(p => p.chave)).toEqual([10, 11, 12]);
    });

    it('Fênix Negra: mantém acerto/evasiva/resistencia, descarta o resto', () => {
        const [f] = pipeline();
        expect(f.valido).toBe(true);
        expect(f.marcado).toBe(true);
        expect(f.objeto.categoria).toBe('forma');
        expect(f.objeto.nome).toBe('Fênix Negra');
        expect(attrs(f.objeto.efeitosPassivos)).toEqual(['acerto', 'evasiva', 'resistencia']);
        const acerto = f.objeto.efeitosPassivos[0];
        expect(acerto).toMatchObject({ propriedade: 'base', valor: '80' }); // normalizarPoder grava valor como string
        expect(Number(acerto.valor)).toBe(80);
        expect(f.objeto.efeitosPassivos.every(e => Number(e.valor) === 80 || Number(e.valor) === 60)).toBe(true);
    });

    it('atributo inventado NÃO vira evasiva nem outro padrão', () => {
        const [f] = pipeline();
        expect(attrs(f.objeto.efeitosPassivos).filter(a => a === 'evasiva')).toHaveLength(1);
        expect(f.objeto.efeitosPassivos.some(e => e.nome === 'Rapidez')).toBe(false);
        expect(f.naoAplicado.some(n => /velocidade_da_luz/.test(n))).toBe(true);
    });

    it('multiplicador valido vira pendente; atributo inexistente, dano base e valor não numérico vão para naoAplicado e para as notas', () => {
        const [f] = pipeline();
        expect(f.objeto.efeitosIncertos).toEqual([
            expect.objectContaining({ multiplicador: true, atributo: 'poder_direto', propriedade: 'mgeral', valor: 40, destino: 'passivo' }),
            expect.objectContaining({ multiplicador: true, atributo: 'todos_status', propriedade: 'mbase', valor: 50, destino: 'passivo' }),
        ]);
        expect(f.naoAplicado.some(n => /mgeral/.test(n))).toBe(false);
        expect(f.naoAplicado.some(n => /Dano puro/.test(n) && /dano base 10/.test(n))).toBe(true);
        expect(f.naoAplicado.some(n => /x40/.test(n) && /forca/.test(n))).toBe(true);
        expect(f.naoAplicado).toContain('x40 em todo dano');
        expect(f.objeto.notasIA).toContain('Só funciona à noite.');
        expect(f.objeto.notasIA).toContain('Não aplicado automaticamente:');
        f.naoAplicado.forEach(n => expect(f.objeto.notasIA).toContain(`- ${n}`));
    });

    it('forma: dano sem faces vira d20, alcance 0 vira 1, custo com vírgula, fadiga 0', () => {
        const [f] = pipeline();
        expect(f.objeto).toMatchObject({ dadosQtd: 10, dadosFaces: 20, custoPercentual: 7.5, alcance: 1, fadigaPorUso: 0 });
        expect(f.objeto.maestriaRequerida).toBeUndefined();
    });

    it('item sem nome fica inválido e desmarcado', () => {
        const [, sem] = pipeline();
        expect(sem.valido).toBe(false);
        expect(sem.marcado).toBe(false);
    });

    it('reação reacao_acertou/reduzir_dano 50 é preservada', () => {
        const [, , r] = pipeline();
        expect(r.valido).toBe(true);
        expect(r.objeto.tipoAcao).toBe('reacao');
        expect(r.objeto.efeitos).toEqual([expect.objectContaining({ atributo: 'reacao_acertou', propriedade: 'reduzir_dano', valor: '50' })]);
        expect(r.naoAplicado).toEqual([]);
        expect(r.objeto.notasIA).toBe('');
    });

    it('montarPoderFinal: sem naoAplicado, com id, cópia profunda', () => {
        const [f] = pipeline();
        expect(f.objeto.naoAplicado).toEqual(f.naoAplicado);
        const final = montarPoderFinal(f.objeto, 99);
        expect(final).not.toHaveProperty('naoAplicado');
        expect(final.id).toBe(99);
        // x40 Geral passivo grava 39 (motor soma a 1) e some do campo de incertos
        expect(final).not.toHaveProperty('efeitosIncertos');
        expect(final.efeitosPassivos.at(-2)).toMatchObject({ atributo: 'poder_direto', propriedade: 'mgeral', valor: 39 });
        expect(final.efeitosPassivos.at(-1)).toMatchObject({ atributo: 'todos_status', propriedade: 'mbase', valor: 49 });
        final.efeitosPassivos.slice(-2).forEach(e => { expect(e).not.toHaveProperty('multiplicador'); expect(e).not.toHaveProperty('destino'); });
        final.efeitosPassivos.splice(-2);
        expect(final.efeitosPassivos).toEqual(f.objeto.efeitosPassivos);
        expect(final.efeitosPassivos).not.toBe(f.objeto.efeitosPassivos);
        expect(final.efeitosPassivos[0]).not.toBe(f.objeto.efeitosPassivos[0]);
        final.efeitosPassivos[0].valor = '1';
        expect(f.objeto.efeitosPassivos[0].valor).toBe('80');
        expect(f.objeto.naoAplicado).toBeDefined();
    });
});

describe('importador v2 - prepararItemImportado (bordas)', () => {
    it('entrada nula/ não objeto não quebra e é inválida', () => {
        for (const x of [null, undefined, 5, 'abc']) {
            const r = prepararItemImportado(x, 'poder');
            expect(r.valido).toBe(false);
            expect(r.objeto.categoria).toBe('poder');
        }
    });
    it('naoAplicado aceita string única e ignora vazios', () => {
        expect(prepararItemImportado({ nome: 'A', naoAplicado: ' algo ' }).naoAplicado).toEqual(['algo']);
        expect(prepararItemImportado({ nome: 'A', naoAplicado: ['', null, 'b'] }).naoAplicado).toEqual(['b']);
    });
    it('vírgula decimal em valor de efeito e em area; atributo com acento/maiúscula é aceito', () => {
        const r = prepararItemImportado({ nome: 'A', area: '2,5', efeitos: [{ atributo: 'Força', propriedade: 'BASE', valor: '3,5' }] });
        expect(r.objeto.area).toBe(2.5);
        expect(r.objeto.efeitos).toHaveLength(1);
        expect(Number(r.objeto.efeitos[0].valor)).toBe(3.5);
    });
    it('propriedade inexistente descarta (não vira base)', () => {
        const r = prepararItemImportado({ nome: 'A', efeitos: [{ atributo: 'forca', propriedade: 'xyz', valor: 3 }] });
        expect(r.objeto.efeitos).toEqual([]);
        expect(r.naoAplicado).toHaveLength(1);
    });
    it('efeito nulo é ignorado em silêncio', () => {
        const r = prepararItemImportado({ nome: 'A', efeitos: [null] });
        expect(r.objeto.efeitos).toEqual([]);
        expect(r.naoAplicado).toEqual([]);
    });
    it('mais de 12 efeitos gera aviso', () => {
        const efs = Array.from({ length: 14 }, (_, i) => ({ nome: `e${i}`, atributo: 'forca', propriedade: 'base', valor: 1 }));
        const r = prepararItemImportado({ nome: 'A', efeitos: efs });
        expect(r.avisos.length).toBeGreaterThan(0);
    });
    it('notas ficam limitadas a 4000 caracteres', () => {
        expect(juntarNotas('x'.repeat(5000), ['a']).length).toBe(4000);
        expect(juntarNotas('', [])).toBe('');
        expect(juntarNotas(null, 'um')).toBe('Não aplicado automaticamente:\n- um');
    });
    it('prepararImportacao: entrada não-array devolve []', () => {
        expect(prepararImportacao(null)).toEqual([]);
        expect(prepararImportacao(undefined)).toEqual([]);
    });
    it('resumirItemImportado: nulo vira string vazia, objeto válido vira texto', () => {
        expect(resumirItemImportado(null)).toBe('');
        expect(typeof resumirItemImportado(prepararItemImportado({ nome: 'A', danoQtd: 2, danoFaces: 6 }).objeto)).toBe('string');
    });
    it('montarPoderFinal com null não quebra', () => {
        expect(montarPoderFinal(null, 3)).toEqual({ id: 3 });
    });
});

describe('importador v2 - mudarCategoriaImportada', () => {
    const base = () => prepararItemImportado({ nome: 'A', categoria: 'habilidade' }).objeto;
    it('habilidade -> forma remove maestriaRequerida e garante fadigaPorUso', () => {
        const o = base();
        const f = mudarCategoriaImportada(o, 'forma');
        expect(f.categoria).toBe('forma');
        expect(f).not.toHaveProperty('maestriaRequerida');
        expect(f.fadigaPorUso).toBe(0);
        expect(o.categoria).toBe('habilidade');
        expect(o).toHaveProperty('maestriaRequerida');
    });
    it('forma -> poder remove fadigaPorUso e garante maestriaRequerida', () => {
        const o = prepararItemImportado({ nome: 'F', categoria: 'forma', fadigaPorUso: 30 }).objeto;
        const p = mudarCategoriaImportada(o, 'poder');
        expect(p).not.toHaveProperty('fadigaPorUso');
        expect(p.maestriaRequerida).toBe(0);
    });
    it('categoria inválida ou objeto nulo devolve o mesmo', () => {
        const o = base();
        expect(mudarCategoriaImportada(o, 'xyz')).toBe(o);
        expect(mudarCategoriaImportada(null, 'forma')).toBeNull();
    });
});

describe('importador v2 - prompt', () => {
    const p = montarPromptImportacao('texto qualquer', 'forma');
    it('contém as listas reais de atributos e estados', () => {
        expect(ATRIBUTOS_EFEITO).toContain('acerto');
        ATRIBUTOS_EFEITO.forEach(a => expect(p).toContain(a));
        ESTADOS.forEach(e => expect(p).toContain(e.id));
    });
    it('ensina CA em dois efeitos (evasiva e resistencia)', () => {
        expect(p).toMatch(/DOIS efeitos/);
        expect(p).toContain('"atributo":"evasiva"');
        expect(p).toContain('"atributo":"resistencia"');
    });
    it('ensina acerto e a reação reduzir_dano', () => {
        expect(p).toContain('"atributo":"acerto"');
        expect(p).toContain('reduzir_dano');
    });
    it('explica MULTIPLICADORES e traz "multiplicadores" no exemplo, mantendo naoAplicado', () => {
        expect(p).toContain('MULTIPLICADORES (');
        expect(p).not.toMatch(/NÃO CONVERTA multiplicadores/);
        expect(p).toContain('"multiplicadores": []');
        expect(p).toContain('naoAplicado');
    });
    it('categoria padrão entra no exemplo de retorno', () => {
        expect(p).toContain('"categoria": "forma"');
        expect(montarPromptImportacao('x', 'abc')).toContain('"categoria": "habilidade"');
    });
});
