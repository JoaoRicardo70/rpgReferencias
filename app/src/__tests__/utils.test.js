import { describe, it, expect } from 'vitest';
import { contarDigitos, tratarUnico, pegarDoisPrimeirosDigitos, isFisico, isEnergia, migrarPassivasParaPoderes, calcularDiffFirebase, mesclarComRemoto } from '../core/utils.js';

// ==========================================
// contarDigitos
// ==========================================
describe('contarDigitos', () => {
    it('returns correct digits for small numbers', () => {
        expect(contarDigitos(1)).toBe(1);
        expect(contarDigitos(9)).toBe(1);
        expect(contarDigitos(10)).toBe(2);
        expect(contarDigitos(99)).toBe(2);
        expect(contarDigitos(100)).toBe(3);
        expect(contarDigitos(999)).toBe(3);
    });

    it('returns correct digits for large numbers', () => {
        expect(contarDigitos(1000000)).toBe(7);
        expect(contarDigitos(100000000)).toBe(9);
        expect(contarDigitos(1e21)).toBe(22); // key bug fix test
        expect(contarDigitos(9.99e20)).toBe(21);
    });

    it('returns 1 for zero, negative, NaN, Infinity', () => {
        expect(contarDigitos(0)).toBe(1);
        expect(contarDigitos(-5)).toBe(1);
        expect(contarDigitos(NaN)).toBe(1);
        expect(contarDigitos(Infinity)).toBe(1);
        expect(contarDigitos(-Infinity)).toBe(1);
    });
});

// ==========================================
// tratarUnico
// ==========================================
describe('tratarUnico', () => {
    it('parses comma-separated multipliers', () => {
        expect(tratarUnico("2.0,3.0")).toEqual([2.0, 3.0]);
        expect(tratarUnico("1.5")).toEqual([1.5]);
    });

    it('handles whitespace around values', () => {
        expect(tratarUnico(" 2.0 , 3.0 ")).toEqual([2.0, 3.0]);
    });

    it('returns [1.0] for falsy/empty/invalid input', () => {
        expect(tratarUnico(null)).toEqual([1.0]);
        expect(tratarUnico(undefined)).toEqual([1.0]);
        expect(tratarUnico("")).toEqual([1.0]);
        expect(tratarUnico("abc")).toEqual([1.0]);
    });

    it('filters out non-numeric entries', () => {
        expect(tratarUnico("2.0,abc,3.0")).toEqual([2.0, 3.0]);
    });

    it('handles numeric input (not string)', () => {
        expect(tratarUnico(5)).toEqual([5]);
    });
});

// ==========================================
// pegarDoisPrimeirosDigitos
// ==========================================
describe('pegarDoisPrimeirosDigitos', () => {
    it('returns number itself for 1-2 digit numbers', () => {
        expect(pegarDoisPrimeirosDigitos(5)).toBe(5);
        expect(pegarDoisPrimeirosDigitos(42)).toBe(42);
        expect(pegarDoisPrimeirosDigitos(99)).toBe(99);
    });

    it('returns first two digits for larger numbers', () => {
        expect(pegarDoisPrimeirosDigitos(12345)).toBe(12);
        expect(pegarDoisPrimeirosDigitos(987654)).toBe(98);
        expect(pegarDoisPrimeirosDigitos(100000)).toBe(100); // special case: starts with 100
    });

    it('returns 100 for exact 100', () => {
        expect(pegarDoisPrimeirosDigitos(100)).toBe(100);
    });

    it('returns 0 for zero/falsy', () => {
        expect(pegarDoisPrimeirosDigitos(0)).toBe(0);
        expect(pegarDoisPrimeirosDigitos(null)).toBe(0);
        expect(pegarDoisPrimeirosDigitos(undefined)).toBe(0);
    });

    it('handles negative numbers (uses abs)', () => {
        expect(pegarDoisPrimeirosDigitos(-42)).toBe(42);
        expect(pegarDoisPrimeirosDigitos(-12345)).toBe(12);
    });
});

// ==========================================
// isFisico
// ==========================================
describe('isFisico', () => {
    it('returns true for all physical stats', () => {
        const fisicos = ['forca', 'destreza', 'inteligencia', 'sabedoria', 'energiaesp', 'carisma', 'stamina', 'constituicao'];
        fisicos.forEach(s => expect(isFisico(s)).toBe(true));
    });

    it('is case-insensitive', () => {
        expect(isFisico('FORCA')).toBe(true);
        expect(isFisico('Destreza')).toBe(true);
    });

    it('returns false for energy stats', () => {
        expect(isFisico('mana')).toBe(false);
        expect(isFisico('aura')).toBe(false);
        expect(isFisico('chakra')).toBe(false);
    });

    it('returns false for unknown stats', () => {
        expect(isFisico('vida')).toBe(false);
        expect(isFisico('xyz')).toBe(false);
    });
});

// ==========================================
// isEnergia
// ==========================================
describe('isEnergia', () => {
    it('returns true for all energy stats', () => {
        const energias = ['mana', 'aura', 'chakra', 'corpo'];
        energias.forEach(s => expect(isEnergia(s)).toBe(true));
    });

    it('is case-insensitive', () => {
        expect(isEnergia('MANA')).toBe(true);
        expect(isEnergia('Aura')).toBe(true);
    });

    it('returns false for physical stats', () => {
        expect(isEnergia('forca')).toBe(false);
        expect(isEnergia('destreza')).toBe(false);
    });

    it('returns false for vida and unknown', () => {
        expect(isEnergia('vida')).toBe(false);
        expect(isEnergia('xyz')).toBe(false);
    });
});

// ==========================================
// migrarPassivasParaPoderes
// ==========================================
describe('migrarPassivasParaPoderes', () => {
    it('retorna array vazio para entrada vazia, nula ou nao-array', () => {
        expect(migrarPassivasParaPoderes([])).toEqual([]);
        expect(migrarPassivasParaPoderes(null)).toEqual([]);
        expect(migrarPassivasParaPoderes(undefined)).toEqual([]);
        expect(migrarPassivasParaPoderes('nao e array')).toEqual([]);
    });

    it('converte uma passiva legada num poder categoria "habilidade", inativo, com os efeitos em efeitosPassivos', () => {
        const passivas = [{ nome: 'Instinto Superior', tipo: 'Habilidade', efeitos: [
            { nome: 'Bonus Dano', atributo: 'dano', propriedade: 'mgeral', valor: 50 },
            { nome: 'Bonus Status', atributo: 'todos_status', propriedade: 'mgeral', valor: 40 },
        ] }];

        const [migrado] = migrarPassivasParaPoderes(passivas);

        expect(migrado.nome).toBe('Instinto Superior');
        expect(migrado.categoria).toBe('habilidade');
        expect(migrado.ativa).toBe(false);
        expect(migrado.efeitos).toEqual([]);
        expect(migrado.efeitosPassivos).toEqual(passivas[0].efeitos);
        expect(typeof migrado.id).toBe('string');
        expect(migrado.id.length).toBeGreaterThan(0);
    });

    it('gera um id unico para cada item migrado, mesmo com nomes repetidos', () => {
        const passivas = [{ nome: 'A', efeitos: [] }, { nome: 'A', efeitos: [] }];
        const [a, b] = migrarPassivasParaPoderes(passivas);
        expect(a.id).not.toBe(b.id);
    });

    it('trata item sem nome ou sem efeitos sem lancar erro', () => {
        const [migrado] = migrarPassivasParaPoderes([{}]);
        expect(migrado.nome).toBe('Habilidade sem nome');
        expect(migrado.efeitosPassivos).toEqual([]);
    });

    it('trata efeitos malformados (nao-array) como efeitosPassivos vazio, sem lancar erro', () => {
        expect(migrarPassivasParaPoderes([{ nome: 'X', efeitos: 'nao e array' }])[0].efeitosPassivos).toEqual([]);
        expect(migrarPassivasParaPoderes([{ nome: 'Y', efeitos: { a: 1 } }])[0].efeitosPassivos).toEqual([]);
        expect(migrarPassivasParaPoderes([{ nome: 'Z', efeitos: null }])[0].efeitosPassivos).toEqual([]);
    });

    it('gera ids que nao colidem mesmo entre chamadas separadas no mesmo milissegundo', () => {
        // Regressao: o id antigo era só `legado_passiva_${Date.now()}_${i}`, que colide
        // se a função for chamada duas vezes com o mesmo índice dentro do mesmo ms
        // (ex: duas execuções de carregarDadosFicha em sequência rápida, antes do
        // persist-back salvar a ficha migrada e esvaziar ficha.passivas).
        const passivas = [{ nome: 'A', efeitos: [] }];
        const idsGerados = new Set();
        for (let i = 0; i < 200; i++) {
            idsGerados.add(migrarPassivasParaPoderes(passivas)[0].id);
        }
        expect(idsGerados.size).toBe(200);
    });
});

// ==========================================
// calcularDiffFirebase / mesclarComRemoto (sincronização multiplayer)
// ==========================================
describe('calcularDiffFirebase', () => {
    it('sem baseline anterior (null), cada chave de topo vira uma entrada própria do diff', () => {
        const diff = calcularDiffFirebase(null, { status: 'vivo', dano: { mBase: 1.0 } });
        expect(diff).toEqual({ status: 'vivo', dano: { mBase: 1.0 } });
    });

    it('recursa em objetos simples aninhados, gerando um caminho por campo folha alterado', () => {
        const anterior = { dano: { mBase: 1.0, mGeral: 1.0 } };
        const atual = { dano: { mBase: 1.0, mGeral: 2.0 } };
        expect(calcularDiffFirebase(anterior, atual)).toEqual({ 'dano/mGeral': 2.0 });
    });

    it('trata arrays como valor atômico (sem diff item a item)', () => {
        const anterior = { poderes: [{ id: 1, nome: 'A' }] };
        const atual = { poderes: [{ id: 1, nome: 'A' }, { id: 2, nome: 'B' }] };
        expect(calcularDiffFirebase(anterior, atual)).toEqual({ poderes: atual.poderes });
    });

    it('campo removido localmente vira null no diff (Firebase remove a chave)', () => {
        const anterior = { bio: { apelido: 'Herói' } };
        const atual = { bio: { apelido: undefined } };
        expect(calcularDiffFirebase(anterior, atual)).toEqual({ 'bio/apelido': null });
    });

    it('quando um campo muda de objeto para valor primitivo (ou vice-versa), substitui o valor inteiro sem tentar recursar', () => {
        const anterior = { campo: { sub: 1 } };
        const atual = { campo: 'texto' };
        expect(calcularDiffFirebase(anterior, atual)).toEqual({ campo: 'texto' });
    });

    it('nenhuma mudança real produz um diff vazio', () => {
        const ficha = { status: 'vivo', dano: { mBase: 1.0 } };
        expect(calcularDiffFirebase(ficha, JSON.parse(JSON.stringify(ficha)))).toEqual({});
    });

    it('recursa em profundidade arbitrária (3+ níveis), gerando o caminho completo do campo folha (acoes.padrao.max)', () => {
        const anterior = { acoes: { padrao: { max: 1, atual: 1 }, bonus: { max: 1, atual: 1 } } };
        const atual = { acoes: { padrao: { max: 2, atual: 1 }, bonus: { max: 1, atual: 1 } } };
        expect(calcularDiffFirebase(anterior, atual)).toEqual({ 'acoes/padrao/max': 2 });
    });

    it('mapa dinâmico (dominios/proficiencias/statusPoolAlocado): nova chave adicionada localmente vira seu próprio caminho', () => {
        const anterior = { dominios: { elementais: {}, mana: {} } };
        const atual = { dominios: { elementais: { fogo: { nivel: 1 } }, mana: {} } };
        expect(calcularDiffFirebase(anterior, atual)).toEqual({ 'dominios/elementais/fogo': { nivel: 1 } });
    });

    it('mapa dinâmico: chave removida localmente vira null no caminho da própria chave (não do mapa inteiro)', () => {
        const anterior = { proficiencias: { esgrima: true, furtividade: true } };
        const atual = { proficiencias: { esgrima: true } };
        expect(calcularDiffFirebase(anterior, atual)).toEqual({ 'proficiencias/furtividade': null });
    });

    it('mesmo mapa dinâmico com múltiplas chaves alteradas gera um caminho por chave (statusPoolAlocado)', () => {
        const anterior = { statusPoolAlocado: { vida: 10, mana: 5, foco: 3 } };
        const atual = { statusPoolAlocado: { vida: 12, mana: 5, foco: 7 } };
        expect(calcularDiffFirebase(anterior, atual)).toEqual({ 'statusPoolAlocado/vida': 12, 'statusPoolAlocado/foco': 7 });
    });

    it('mudança de tipo com mesmo "valor aparente" (número 10 -> string "10") é tratada como alteração real', () => {
        const anterior = { nivel: 10 };
        const atual = { nivel: '10' };
        expect(calcularDiffFirebase(anterior, atual)).toEqual({ nivel: '10' });
    });

    it('valor numérico 0 vs string vazia vs false são todos diffs distintos entre si e do valor anterior', () => {
        expect(calcularDiffFirebase({ x: 1 }, { x: 0 })).toEqual({ x: 0 });
        expect(calcularDiffFirebase({ x: 1 }, { x: '' })).toEqual({ x: '' });
        expect(calcularDiffFirebase({ x: 1 }, { x: false })).toEqual({ x: false });
    });
});

describe('mesclarComRemoto', () => {
    it('campo intocado localmente (igual à baseline) recebe o valor remoto — mudança ao vivo do Mestre/outra aba', () => {
        const base = { vida: { atual: 100 } };
        const local = { vida: { atual: 100 } };
        const remoto = { vida: { atual: 50 } };
        expect(mesclarComRemoto(base, local, remoto)).toEqual({ vida: { atual: 50 } });
    });

    it('campo já editado localmente (diferente da baseline) NUNCA é sobrescrito pelo remoto — protege digitação não salva', () => {
        const base = { vida: { atual: 100 } };
        const local = { vida: { atual: 77 } }; // jogador editou, ainda não salvou
        const remoto = { vida: { atual: 50 } }; // Firebase ainda tem o valor antigo (100) por trás, mas simula um remoto desatualizado
        expect(mesclarComRemoto(base, local, remoto)).toEqual({ vida: { atual: 77 } });
    });

    it('array alterado localmente vence o remoto (arrays são atômicos, mesma regra do diff)', () => {
        const base = { poderes: [{ id: 1 }] };
        const local = { poderes: [{ id: 1 }, { id: 2 }] };
        const remoto = { poderes: [{ id: 1 }, { id: 3 }] };
        expect(mesclarComRemoto(base, local, remoto)).toEqual({ poderes: [{ id: 1 }, { id: 2 }] });
    });

    it('campo novo que só existe no remoto (ausente na baseline e no local) é adotado', () => {
        const base = {};
        const local = { status: 'vivo' };
        const remoto = { status: 'vivo', condicoes: ['atordoado'] };
        expect(mesclarComRemoto(base, local, remoto)).toEqual({ status: 'vivo', condicoes: ['atordoado'] });
    });

    it('baseline vazia ({}) + ficha local recém-criada igual à baseline (tudo undefined) adota o remoto inteiro', () => {
        // Cenário do primeiro snapshot real chegando via listener antes de qualquer edição local.
        const base = {};
        const local = {};
        const remoto = { status: 'vivo', vida: { atual: 100 } };
        expect(mesclarComRemoto(base, local, remoto)).toEqual({ status: 'vivo', vida: { atual: 100 } });
    });

    it('campo ausente tanto na baseline quanto no remoto, mas presente localmente (recém-criado pelo jogador), NÃO é removido', () => {
        const base = { proficiencias: {} };
        const local = { proficiencias: { esgrima: true } }; // jogador acabou de marcar, ainda não salvou
        const remoto = { proficiencias: {} };
        expect(mesclarComRemoto(base, local, remoto)).toEqual({ proficiencias: { esgrima: true } });
    });

    it('campo intocado em profundidade arbitrária (acoes.padrao.max) recebe o remoto normalmente', () => {
        const base = { acoes: { padrao: { max: 1, atual: 1 } } };
        const local = { acoes: { padrao: { max: 1, atual: 1 } } };
        const remoto = { acoes: { padrao: { max: 3, atual: 1 } } };
        expect(mesclarComRemoto(base, local, remoto)).toEqual({ acoes: { padrao: { max: 3, atual: 1 } } });
    });

    it('mapa dinâmico: chave nova adicionada só no remoto (Mestre concede uma nova proficiência) é adotada', () => {
        const base = { proficiencias: { esgrima: true } };
        const local = { proficiencias: { esgrima: true } };
        const remoto = { proficiencias: { esgrima: true, arco: true } };
        expect(mesclarComRemoto(base, local, remoto)).toEqual({ proficiencias: { esgrima: true, arco: true } });
    });

    it('mudança de tipo (número -> string) no remoto para um campo intocado localmente é adotada sem lançar exceção', () => {
        const base = { nivel: 10 };
        const local = { nivel: 10 };
        const remoto = { nivel: '10' };
        expect(mesclarComRemoto(base, local, remoto)).toEqual({ nivel: '10' });
    });

    // 🔥 REGRESSÃO: quando o Mestre (ou o próprio jogador em outra aba) REMOVE uma
    // chave de um mapa dinâmico (proficiencias/dominios/statusPoolAlocado) no
    // Firebase, e este cliente não mexeu naquele campo localmente (local ===
    // base), a chave precisa sumir do resultado do merge — é o mesmo caso "campo
    // intocado recebe o remoto livremente" do comentário de `mesclarComRemoto`,
    // só que com o remoto sendo `undefined` (chave ausente = removida). Uma
    // versão anterior desta função tinha `if (remoto === undefined) return
    // local;` no topo, que interceptava esse caso ANTES de checar se o campo
    // foi alterado localmente — a chave nunca era removida, e pior: como
    // `ultimoEstadoSincronizado` passa a refletir o remoto real (sem a chave), o
    // PRÓXIMO save deste cliente recalculava o diff contra essa baseline e
    // "ressuscitava" a chave apagada de volta no Firebase.
    it('chave de mapa dinâmico removida remotamente, mas intocada localmente, é removida do merge', () => {
        const base = { proficiencias: { esgrima: true, furtividade: true } };
        const local = { proficiencias: { esgrima: true, furtividade: true } }; // jogador não mexeu
        const remoto = { proficiencias: { esgrima: true } }; // Mestre removeu "furtividade" no Firebase
        const resultado = mesclarComRemoto(base, local, remoto);
        expect(resultado).toEqual({ proficiencias: { esgrima: true } });
    });

    it('a remoção propagada acima NÃO ressuscita a chave apagada no próximo diff local', () => {
        const base = { proficiencias: { esgrima: true, furtividade: true } };
        const local = { proficiencias: { esgrima: true, furtividade: true } };
        const remoto = { proficiencias: { esgrima: true } };
        const merged = mesclarComRemoto(base, local, remoto);
        // Após o merge, `ultimoEstadoSincronizado` (a baseline) passa a ser o `remoto` real.
        const diffDoProximoSave = calcularDiffFirebase(remoto, merged);
        expect(diffDoProximoSave).toEqual({});
    });
});
