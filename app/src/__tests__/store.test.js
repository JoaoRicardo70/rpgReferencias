import { describe, it, expect, beforeEach } from 'vitest';
import useStore, { sanitizarNome, fichaPadrao } from '../stores/useStore.js';

function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
}

// ==========================================
// sanitizarNome
// ==========================================
describe('sanitizarNome', () => {
    it('replaces forbidden Firebase characters with underscore', () => {
        expect(sanitizarNome('test.name')).toBe('test_name');
        expect(sanitizarNome('test#name')).toBe('test_name');
        expect(sanitizarNome('test$name')).toBe('test_name');
        expect(sanitizarNome('test[name]')).toBe('test_name_');
        expect(sanitizarNome('test/name')).toBe('test_name');
    });

    it('replaces multiple forbidden chars', () => {
        expect(sanitizarNome('a.b#c$d[e]f/g')).toBe('a_b_c_d_e_f_g');
    });

    it('trims whitespace', () => {
        expect(sanitizarNome('  hello  ')).toBe('hello');
    });

    it('returns empty string for falsy input', () => {
        expect(sanitizarNome(null)).toBe('');
        expect(sanitizarNome(undefined)).toBe('');
        expect(sanitizarNome('')).toBe('');
        expect(sanitizarNome(0)).toBe('');
    });

    it('keeps valid characters untouched', () => {
        expect(sanitizarNome('NomeNormal123')).toBe('NomeNormal123');
        expect(sanitizarNome('nome-com-hifen')).toBe('nome-com-hifen');
        expect(sanitizarNome('nome_com_under')).toBe('nome_com_under');
    });

    it('handles strings with only forbidden characters', () => {
        expect(sanitizarNome('..##$$')).toBe('______');
    });
});

// ==========================================
// fichaPadrao
// ==========================================
describe('fichaPadrao', () => {
    it('has ascensaoBase defaulting to 1', () => {
        expect(fichaPadrao.ascensaoBase).toBe(1);
    });

    it('has empty arrays for poderes, inventario, ataquesElementais, passivas', () => {
        expect(fichaPadrao.poderes).toEqual([]);
        expect(fichaPadrao.inventario).toEqual([]);
        expect(fichaPadrao.ataquesElementais).toEqual([]);
        expect(fichaPadrao.passivas).toEqual([]);
    });

    it('has default vida base of 100,000,000', () => {
        expect(fichaPadrao.vida.base).toBe(100000000);
        expect(fichaPadrao.vida.atual).toBe(100000000);
    });

    it('has default physical stats base of 100,000', () => {
        const fisicos = ['forca', 'destreza', 'inteligencia', 'sabedoria', 'energiaEsp', 'carisma', 'stamina', 'constituicao'];
        fisicos.forEach(s => {
            expect(fichaPadrao[s].base).toBe(100000);
            expect(fichaPadrao[s].mBase).toBe(1.0);
            expect(fichaPadrao[s].mGeral).toBe(1.0);
        });
    });

    it('has default energy stats base of 100,000,000', () => {
        const energias = ['mana', 'aura', 'chakra', 'corpo'];
        energias.forEach(s => {
            expect(fichaPadrao[s].base).toBe(100000000);
            expect(fichaPadrao[s].atual).toBe(100000000);
        });
    });

    it('has default ataqueConfig', () => {
        expect(fichaPadrao.ataqueConfig.armaStatusUsados).toEqual(['forca']);
        expect(fichaPadrao.ataqueConfig.armaEnergiaCombustao).toBe('mana');
        expect(fichaPadrao.ataqueConfig.armaPercEnergia).toBe(0);
    });

    it('has default dano stat', () => {
        expect(fichaPadrao.dano.mBase).toBe(1.0);
        expect(fichaPadrao.dano.mGeral).toBe(1.0);
        expect(fichaPadrao.dano.mPotencial).toBe(1.0);
    });

    it('has default divisores all set to 1', () => {
        Object.values(fichaPadrao.divisores).forEach(v => expect(v).toBe(1));
    });

    it('has default bio fields as empty strings', () => {
        Object.values(fichaPadrao.bio).forEach(v => expect(v).toBe(''));
    });

    it('has compendioOverrides as an empty object', () => {
        expect(fichaPadrao.compendioOverrides).toBeDefined();
        expect(fichaPadrao.compendioOverrides).toEqual({});
        expect(typeof fichaPadrao.compendioOverrides).toBe('object');
        expect(Array.isArray(fichaPadrao.compendioOverrides)).toBe(false);
    });

    // ------------------------------------------------------------------
    // hierarquia default values
    // ------------------------------------------------------------------

    it('has hierarquia field defined', () => {
        expect(fichaPadrao.hierarquia).toBeDefined();
        expect(typeof fichaPadrao.hierarquia).toBe('object');
    });

    it('has hierarquia.poder defaulting to false', () => {
        expect(fichaPadrao.hierarquia.poder).toBe(false);
    });

    it('has hierarquia.infinity defaulting to false', () => {
        expect(fichaPadrao.hierarquia.infinity).toBe(false);
    });

    it('has hierarquia string fields defaulting to empty string', () => {
        expect(fichaPadrao.hierarquia.singularidade).toBe('');
        expect(fichaPadrao.hierarquia.poderNome).toBe('');
        expect(fichaPadrao.hierarquia.poderDesc).toBe('');
        expect(fichaPadrao.hierarquia.infinityNome).toBe('');
        expect(fichaPadrao.hierarquia.infinityDesc).toBe('');
        expect(fichaPadrao.hierarquia.singularidadeNome).toBe('');
        expect(fichaPadrao.hierarquia.singularidadeDesc).toBe('');
    });

    it('has hierarquia with all expected keys', () => {
        const expectedKeys = [
            'poder', 'infinity', 'singularidade',
            'poderNome', 'poderDesc',
            'infinityNome', 'infinityDesc',
            'singularidadeNome', 'singularidadeDesc'
        ];
        expectedKeys.forEach(key => {
            expect(fichaPadrao.hierarquia).toHaveProperty(key);
        });
    });
});

// ==========================================
// Zustand store actions
// ==========================================
describe('useStore actions', () => {
    beforeEach(() => {
        // Reset store state before each test
        useStore.getState().resetFicha();
        useStore.getState().setMeuNome('');
        useStore.setState({ feedCombate: [], isMestre: false, abaAtiva: 'aba-status' });
    });

    describe('setMeuNome', () => {
        it('sets the name in state', () => {
            useStore.getState().setMeuNome('Goku');
            expect(useStore.getState().meuNome).toBe('Goku');
        });

        it('can set empty name', () => {
            useStore.getState().setMeuNome('Goku');
            useStore.getState().setMeuNome('');
            expect(useStore.getState().meuNome).toBe('');
        });
    });

    describe('resetFicha', () => {
        it('resets ficha to default values', () => {
            useStore.getState().updateFicha(f => { f.forca.base = 999; });
            expect(useStore.getState().minhaFicha.forca.base).toBe(999);

            useStore.getState().resetFicha();
            expect(useStore.getState().minhaFicha.forca.base).toBe(100000);
        });

        it('produces a new object (not shared reference with fichaPadrao)', () => {
            useStore.getState().resetFicha();
            // Immer freezes state, so we verify independence by checking
            // that mutating via updateFicha doesn't affect fichaPadrao
            useStore.getState().updateFicha(f => { f.forca.base = 1; });
            expect(useStore.getState().minhaFicha.forca.base).toBe(1);
            expect(fichaPadrao.forca.base).toBe(100000);
        });

        it('resets compendioOverrides to empty object', () => {
            useStore.getState().carregarDadosFicha({
                compendioOverrides: {
                    saber: { passiva: 'test', iconeUrl: 'data:image/png;base64,abc' }
                }
            });
            expect(useStore.getState().minhaFicha.compendioOverrides).not.toEqual({});

            useStore.getState().resetFicha();
            expect(useStore.getState().minhaFicha.compendioOverrides).toEqual({});
        });

        it('resets compendioOverrides does not share reference with fichaPadrao', () => {
            useStore.getState().resetFicha();
            useStore.getState().updateFicha(f => {
                f.compendioOverrides.saber = { passiva: 'mutated' };
            });
            expect(fichaPadrao.compendioOverrides).toEqual({});
        });
    });

    describe('updateFicha', () => {
        it('mutates ficha via immer callback', () => {
            useStore.getState().updateFicha(f => {
                f.vida.base = 500;
                f.vida.atual = 500;
            });
            expect(useStore.getState().minhaFicha.vida.base).toBe(500);
            expect(useStore.getState().minhaFicha.vida.atual).toBe(500);
        });

        it('can add poderes', () => {
            useStore.getState().updateFicha(f => {
                f.poderes.push({ nome: 'Super Saiyan', ativa: true, efeitos: [] });
            });
            expect(useStore.getState().minhaFicha.poderes).toHaveLength(1);
            expect(useStore.getState().minhaFicha.poderes[0].nome).toBe('Super Saiyan');
        });

        it('can set hierarquia.poder to true', () => {
            useStore.getState().updateFicha(f => { f.hierarquia.poder = true; });
            expect(useStore.getState().minhaFicha.hierarquia.poder).toBe(true);
        });

        it('can set hierarquia.infinity to true', () => {
            useStore.getState().updateFicha(f => { f.hierarquia.infinity = true; });
            expect(useStore.getState().minhaFicha.hierarquia.infinity).toBe(true);
        });

        it('can set all hierarquia string fields', () => {
            useStore.getState().updateFicha(f => {
                f.hierarquia.singularidade = 'omega';
                f.hierarquia.poderNome = 'Kaio-ken';
                f.hierarquia.poderDesc = 'Multiplica poder';
                f.hierarquia.infinityNome = 'Mugen';
                f.hierarquia.infinityDesc = 'Sem fim';
                f.hierarquia.singularidadeNome = 'Ponto Zero';
                f.hierarquia.singularidadeDesc = 'Origem absoluta';
            });
            const h = useStore.getState().minhaFicha.hierarquia;
            expect(h.singularidade).toBe('omega');
            expect(h.poderNome).toBe('Kaio-ken');
            expect(h.poderDesc).toBe('Multiplica poder');
            expect(h.infinityNome).toBe('Mugen');
            expect(h.infinityDesc).toBe('Sem fim');
            expect(h.singularidadeNome).toBe('Ponto Zero');
            expect(h.singularidadeDesc).toBe('Origem absoluta');
        });

        it('hierarquia changes are independent per call (no state leak between tests)', () => {
            useStore.getState().updateFicha(f => { f.hierarquia.poderNome = 'Getsuga'; });
            expect(useStore.getState().minhaFicha.hierarquia.poderNome).toBe('Getsuga');
            // resetFicha in beforeEach ensures next test starts clean
        });
    });

    describe('addFeedEntry', () => {
        it('appends entry to feedCombate', () => {
            useStore.getState().addFeedEntry({ tipo: 'dano', valor: 1000 });
            useStore.getState().addFeedEntry({ tipo: 'cura', valor: 500 });
            expect(useStore.getState().feedCombate).toHaveLength(2);
            expect(useStore.getState().feedCombate[0].tipo).toBe('dano');
            expect(useStore.getState().feedCombate[1].tipo).toBe('cura');
        });
    });

    describe('carregarDadosFicha', () => {
        it('does nothing for null dados', () => {
            const before = deepClone(useStore.getState().minhaFicha);
            useStore.getState().carregarDadosFicha(null);
            expect(useStore.getState().minhaFicha).toEqual(before);
        });

        it('loads ascensaoBase', () => {
            useStore.getState().carregarDadosFicha({ ascensaoBase: 5 });
            expect(useStore.getState().minhaFicha.ascensaoBase).toBe(5);
        });

        it('restaura ficha.divisorPoder salvo (sobrevive ao F5, presente em fichaPadrao)', () => {
            useStore.getState().carregarDadosFicha({ divisorPoder: 3 });
            expect(useStore.getState().minhaFicha.divisorPoder).toBe(3);
        });

        it('carregarDadosFicha({}) nao mexe em divisorPoder quando ausente nos dados (generico so age se dados[chave] !== undefined)', () => {
            useStore.getState().updateFicha(f => { f.divisorPoder = 7; });
            useStore.getState().carregarDadosFicha({});
            expect(useStore.getState().minhaFicha.divisorPoder).toBe(7);
        });

        it('resetFicha() volta divisorPoder para o padrao (0, sem override) de fichaPadrao', () => {
            useStore.getState().updateFicha(f => { f.divisorPoder = 7; });
            useStore.getState().resetFicha();
            expect(useStore.getState().minhaFicha.divisorPoder).toBe(0);
        });

        it('loads poderes array', () => {
            const poderes = [{ nome: 'Bankai', ativa: false, efeitos: [] }];
            useStore.getState().carregarDadosFicha({ poderes });
            expect(useStore.getState().minhaFicha.poderes).toEqual(poderes);
        });

        it('defaults poderes to empty array when not present', () => {
            useStore.getState().updateFicha(f => { f.poderes.push({ nome: 'x' }); });
            useStore.getState().carregarDadosFicha({});
            expect(useStore.getState().minhaFicha.poderes).toEqual([]);
        });

        it('migra ficha.passivas legadas para ficha.poderes (categoria habilidade) e limpa ficha.passivas', () => {
            const passivas = [{ nome: 'Instinto Superior', tipo: 'Habilidade', efeitos: [
                { nome: 'Bonus', atributo: 'dano', propriedade: 'mgeral', valor: 50 },
            ] }];
            useStore.getState().carregarDadosFicha({ poderes: [{ nome: 'Angra', ativa: true }], passivas });

            const { poderes, passivas: passivasRestantes } = useStore.getState().minhaFicha;
            expect(passivasRestantes).toEqual([]);
            expect(poderes).toHaveLength(2);
            expect(poderes[0].nome).toBe('Angra');
            const migrado = poderes.find(p => p.nome === 'Instinto Superior');
            expect(migrado).toBeDefined();
            expect(migrado.categoria).toBe('habilidade');
            expect(migrado.efeitosPassivos).toEqual(passivas[0].efeitos);
        });

        it('sem ficha.passivas, carregarDadosFicha nao adiciona nada extra a poderes', () => {
            const poderes = [{ nome: 'Bankai', ativa: false, efeitos: [] }];
            useStore.getState().carregarDadosFicha({ poderes });
            expect(useStore.getState().minhaFicha.poderes).toEqual(poderes);
            expect(useStore.getState().minhaFicha.passivas).toEqual([]);
        });

        it('mantem poder nativo e passiva migrada como entradas separadas mesmo com nomes colidindo', () => {
            const poderes = [{ id: 1, nome: 'Instinto Superior', ativa: true, efeitos: [] }];
            const passivas = [{ nome: 'Instinto Superior', efeitos: [{ nome: 'Bonus', atributo: 'dano', propriedade: 'mgeral', valor: 10 }] }];
            useStore.getState().carregarDadosFicha({ poderes, passivas });

            const { poderes: resultado } = useStore.getState().minhaFicha;
            expect(resultado).toHaveLength(2);
            const nativo = resultado.find(p => p.id === 1);
            const migrado = resultado.find(p => p.id !== 1);
            expect(nativo).toBeDefined();
            expect(migrado).toBeDefined();
            expect(nativo.nome).toBe('Instinto Superior');
            expect(migrado.nome).toBe('Instinto Superior');
            // ids de tipos diferentes (numero do nativo vs string legado) nao colidem em ===
            expect(nativo.id === migrado.id).toBe(false);
            expect(typeof nativo.id).toBe('number');
            expect(typeof migrado.id).toBe('string');
        });

        it('chamar carregarDadosFicha duas vezes com o mesmo objeto dados NAO duplica poderes (poderes e sempre recalculado do zero a partir de dados, nao acumulado)', () => {
            // carregarDadosFicha faz `state.minhaFicha.poderes = [...(dados.poderes||[]), ...migrado]`
            // — ou seja, SUBSTITUI ficha.poderes inteiramente a cada chamada, em vez de
            // concatenar com o que já está no state. Por isso, chamar a função de novo com o
            // MESMO objeto `dados` (mesmo `dados.passivas` ainda não-vazio) não faz a lista
            // crescer: o resultado de cada chamada é sempre `dados.poderes` + uma migração
            // fresca de `dados.passivas`, descartando o que veio da chamada anterior.
            // O persist-back (salvarFirebaseImediato/precisaSalvarCarimbo) não existe para
            // evitar duplicação dentro da mesma sessão — ele existe para gravar a migração de
            // volta no Firebase, para que o PRÓXIMO carregamento (com `dados` vindo fresco do
            // Firebase) já receba `dados.passivas` vazio e não precise migrar de novo.
            const dados = { poderes: [], passivas: [{ nome: 'Instinto Superior', efeitos: [] }] };
            useStore.getState().carregarDadosFicha(dados);
            const idAposPrimeiraChamada = useStore.getState().minhaFicha.poderes.find(p => p.nome === 'Instinto Superior').id;

            useStore.getState().carregarDadosFicha(dados);

            const { poderes } = useStore.getState().minhaFicha;
            const migrados = poderes.filter(p => p.nome === 'Instinto Superior');
            expect(migrados).toHaveLength(1);
            // o id muda a cada chamada (nova migração gerada), mas isso é inofensivo pois
            // não há acumulo de entradas duplicadas
            expect(migrados[0].id).not.toBe(idAposPrimeiraChamada);
        });

        it('merges divisores with defaults', () => {
            useStore.getState().carregarDadosFicha({ divisores: { vida: 10 } });
            expect(useStore.getState().minhaFicha.divisores.vida).toBe(10);
            expect(useStore.getState().minhaFicha.divisores.status).toBe(1); // from default
        });

        it('loads stat objects with defaults for missing numeric fields', () => {
            useStore.getState().carregarDadosFicha({
                forca: { base: 50000 }
            });
            const f = useStore.getState().minhaFicha.forca;
            expect(f.base).toBe(50000);
            expect(f.mBase).toBe(1.0); // filled from fichaPadrao
            expect(f.mGeral).toBe(1.0);
        });

        it('loads inventario', () => {
            const inv = [{ nome: 'Espada', tipo: 'arma' }];
            useStore.getState().carregarDadosFicha({ inventario: inv });
            expect(useStore.getState().minhaFicha.inventario).toEqual(inv);
        });

        it('loads bio with defaults', () => {
            useStore.getState().carregarDadosFicha({ bio: { raca: 'Saiyan' } });
            expect(useStore.getState().minhaFicha.bio.raca).toBe('Saiyan');
            expect(useStore.getState().minhaFicha.bio.classe).toBe(''); // default
        });

        it('loads iniciativa', () => {
            useStore.getState().carregarDadosFicha({ iniciativa: 15 });
            expect(useStore.getState().minhaFicha.iniciativa).toBe(15);
        });

        it('loads avatar or defaults to empty', () => {
            useStore.getState().carregarDadosFicha({});
            expect(useStore.getState().minhaFicha.avatar).toEqual({ base: '' });
        });

        it('loads ataqueConfig with defaults', () => {
            useStore.getState().carregarDadosFicha({ ataqueConfig: { armaPercEnergia: 15 } });
            expect(useStore.getState().minhaFicha.ataqueConfig.armaPercEnergia).toBe(15);
            expect(useStore.getState().minhaFicha.ataqueConfig.armaStatusUsados).toEqual(['forca']); // default
        });

        it('restores compendioOverrides when dados contains it', () => {
            const overrides = {
                saber: { passiva: 'test', iconeUrl: 'data:image/png;base64,abc' }
            };
            useStore.getState().carregarDadosFicha({ compendioOverrides: overrides });
            expect(useStore.getState().minhaFicha.compendioOverrides).toEqual(overrides);
            expect(useStore.getState().minhaFicha.compendioOverrides.saber.passiva).toBe('test');
            expect(useStore.getState().minhaFicha.compendioOverrides.saber.iconeUrl).toBe('data:image/png;base64,abc');
        });

        it('keeps compendioOverrides as empty object when dados does not contain it', () => {
            useStore.getState().carregarDadosFicha({ forca: { base: 50000 } });
            expect(useStore.getState().minhaFicha.compendioOverrides).toEqual({});
        });

        it('restores multiple entries in compendioOverrides', () => {
            const overrides = {
                saber: { passiva: 'sabedoria mistica', iconeUrl: 'data:image/png;base64,abc' },
                forca: { passiva: 'forca bruta', iconeUrl: 'data:image/png;base64,xyz' }
            };
            useStore.getState().carregarDadosFicha({ compendioOverrides: overrides });
            const result = useStore.getState().minhaFicha.compendioOverrides;
            expect(result.saber.passiva).toBe('sabedoria mistica');
            expect(result.saber.iconeUrl).toBe('data:image/png;base64,abc');
            expect(result.forca.passiva).toBe('forca bruta');
            expect(result.forca.iconeUrl).toBe('data:image/png;base64,xyz');
        });

        // ------------------------------------------------------------------
        // hierarquia tests
        // ------------------------------------------------------------------

        it('loads hierarquia fully when present in Firebase data', () => {
            const hierarquia = {
                poder: true,
                infinity: true,
                singularidade: 'omega',
                poderNome: 'Ultra Instinto',
                poderDesc: 'Reflexo divino',
                infinityNome: 'Infinity Break',
                infinityDesc: 'Transcende limites',
                singularidadeNome: 'Omega Singularity',
                singularidadeDesc: 'Ponto de colapso'
            };
            useStore.getState().carregarDadosFicha({ hierarquia });
            const h = useStore.getState().minhaFicha.hierarquia;
            expect(h.poder).toBe(true);
            expect(h.infinity).toBe(true);
            expect(h.singularidade).toBe('omega');
            expect(h.poderNome).toBe('Ultra Instinto');
            expect(h.poderDesc).toBe('Reflexo divino');
            expect(h.infinityNome).toBe('Infinity Break');
            expect(h.infinityDesc).toBe('Transcende limites');
            expect(h.singularidadeNome).toBe('Omega Singularity');
            expect(h.singularidadeDesc).toBe('Ponto de colapso');
        });

        it('keeps hierarquia defaults when hierarquia is absent from Firebase data', () => {
            useStore.getState().carregarDadosFicha({ ascensaoBase: 3 });
            const h = useStore.getState().minhaFicha.hierarquia;
            expect(h.poder).toBe(false);
            expect(h.infinity).toBe(false);
            expect(h.singularidade).toBe('');
            expect(h.poderNome).toBe('');
            expect(h.poderDesc).toBe('');
            expect(h.infinityNome).toBe('');
            expect(h.infinityDesc).toBe('');
            expect(h.singularidadeNome).toBe('');
            expect(h.singularidadeDesc).toBe('');
        });

        it('merges partial hierarquia with defaults for missing fields', () => {
            useStore.getState().carregarDadosFicha({ hierarquia: { poder: true, poderNome: 'Bankai' } });
            const h = useStore.getState().minhaFicha.hierarquia;
            expect(h.poder).toBe(true);
            expect(h.poderNome).toBe('Bankai');
            // fields not provided should fall back to fichaPadrao defaults
            expect(h.infinity).toBe(false);
            expect(h.singularidade).toBe('');
            expect(h.infinityNome).toBe('');
            expect(h.infinityDesc).toBe('');
            expect(h.singularidadeNome).toBe('');
            expect(h.singularidadeDesc).toBe('');
        });

        it('does not share hierarquia reference with fichaPadrao after carregarDadosFicha', () => {
            useStore.getState().carregarDadosFicha({ hierarquia: { poderNome: 'Test' } });
            useStore.getState().updateFicha(f => { f.hierarquia.poderNome = 'Mutated'; });
            expect(useStore.getState().minhaFicha.hierarquia.poderNome).toBe('Mutated');
            // fichaPadrao is the static import at the top — must remain pristine
            expect(fichaPadrao.hierarquia.poderNome).toBe('');
        });
    });

    describe('other setters', () => {
        it('setIsMestre', () => {
            useStore.getState().setIsMestre(true);
            expect(useStore.getState().isMestre).toBe(true);
        });

        it('setAbaAtiva', () => {
            useStore.getState().setAbaAtiva('aba-poderes');
            expect(useStore.getState().abaAtiva).toBe('aba-poderes');
        });

        it('setPersonagens', () => {
            const p = { goku: {}, vegeta: {} };
            useStore.getState().setPersonagens(p);
            expect(useStore.getState().personagens).toEqual(p);
        });

        it('setPoderEditandoId', () => {
            useStore.getState().setPoderEditandoId('abc123');
            expect(useStore.getState().poderEditandoId).toBe('abc123');
        });

        it('setDivisorPoderMesa aceita um valor positivo', () => {
            useStore.getState().setDivisorPoderMesa(4);
            expect(useStore.getState().divisorPoderMesa).toBe(4);
        });

        it('setDivisorPoderMesa aceita string numerica e converte para number', () => {
            useStore.getState().setDivisorPoderMesa('2.5');
            expect(useStore.getState().divisorPoderMesa).toBe(2.5);
        });

        it('setDivisorPoderMesa trata valores invalidos, zero ou negativos como "sem divisao" (cai para 1)', () => {
            useStore.getState().setDivisorPoderMesa(-3);
            expect(useStore.getState().divisorPoderMesa).toBe(1);

            useStore.getState().setDivisorPoderMesa(0);
            expect(useStore.getState().divisorPoderMesa).toBe(1);

            useStore.getState().setDivisorPoderMesa('abc');
            expect(useStore.getState().divisorPoderMesa).toBe(1);
        });
    });
});
