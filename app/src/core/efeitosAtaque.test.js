import { describe, it, expect, afterEach, vi } from 'vitest';
import { calcularAcerto, calcularDano } from './engine';
import { desvantagemImpostaAoAtacante, temAcertoAutomatico, multiplicadoresCriticoExtra, ATRIBUTOS_COM_QUANDO } from './efeitosCondicionais';
import { resolverAcertoNoAlvo, marcaNaturalAcerto } from './disputaPoder';
import { escalarPorFator } from './estagios';
import { ATRIBUTOS_EFEITO, normalizarPoder } from './sextaFeiraCriacao';
import { montarPromptImportacao } from './importadorIA';
import { ATRIBUTOS_AGRUPADOS, ATRIBUTOS_AGRUPADOS_SEM_ESTADO, getPropriedadesDoAtributo } from './efeitos-constants';

afterEach(() => { vi.restoreAllMocks(); });

const ef = (atributo, valor = 1, extra = {}) => ({ nome: 'E', atributo, propriedade: 'base', valor, ...extra });
const attr = (base) => ({ nome: '', base, atual: base });
const base = (extra = {}) => ({ forca: { ...attr(10), nome: 'Força' }, destreza: { ...attr(10), nome: 'Destreza' }, bio: {}, ...extra });
// Um personagem-alvo no formato de core/alvoCombate.js.
const alvoPersonagem = (ficha, extra = {}) => ({ isPersonagem: true, ficha, nome: 'Alvo', ...extra });
const acerto = (atacante, alvo, extra = {}) => calcularAcerto({ qD: 1, fD: 20, prof: 0, bonus: 0, sels: ['forca'], minhaFicha: atacante, itensEquipados: [], alvo, ...extra });
const sequencia = (valores) => { let i = 0; vi.spyOn(Math, 'random').mockImplementation(() => valores[i++ % valores.length]); };

// Fontes do efeito: poder ativo, poder passivo, passiva da ficha, item equipado e forma.
const fontes = (efeito) => ({
    'poder ativo': { poderes: [{ id: 1, ativa: true, efeitos: [efeito] }] },
    'poder passivo': { poderes: [{ id: 1, ativa: false, efeitosPassivos: [efeito] }] },
    'passiva': { passivas: [{ id: 1, efeitos: [efeito] }] },
    'item equipado': { inventario: [{ id: 'i', nome: 'Capa', equipado: true, efeitosPassivos: [efeito] }] },
    'forma ativa': { poderes: [{ id: 1, ativa: true, efeitos: [], formaAtivaId: 'f', formas: [{ id: 'f', nome: 'F', efeitos: [efeito], efeitosPassivos: [] }] }] },
});

describe('desvantagem_atacante', () => {
    Object.entries(fontes(ef('desvantagem_atacante', 2))).forEach(([nome, f]) => {
        it(`fonte: ${nome} impoe 2 dados`, () => expect(desvantagemImpostaAoAtacante(f)).toBe(2));
    });
    it('poder desligado, item no inventario e ficha nula/vazia nao impoem nada', () => {
        expect(desvantagemImpostaAoAtacante({ poderes: [{ id: 1, ativa: false, efeitos: [ef('desvantagem_atacante')] }] })).toBe(0);
        expect(desvantagemImpostaAoAtacante({ inventario: [{ id: 'i', equipado: false, efeitosPassivos: [ef('desvantagem_atacante')] }] })).toBe(0);
        expect(desvantagemImpostaAoAtacante(null)).toBe(0);
        expect(desvantagemImpostaAoAtacante({})).toBe(0);
    });
    it('soma fontes, ignora negativo/lixo e limita a 10', () => {
        const f = { passivas: [{ id: 1, efeitos: [ef('desvantagem_atacante', 1), ef('desvantagem_atacante', '1'), ef('desvantagem_atacante', -3), ef('desvantagem_atacante', 'abc')] }] };
        expect(desvantagemImpostaAoAtacante(f)).toBe(2);
        expect(desvantagemImpostaAoAtacante({ passivas: [{ id: 1, efeitos: [ef('desvantagem_atacante', 99)] }] })).toBe(10);
    });
    it('aceita quando: em_combate so vale com iniciativa', () => {
        const f = (ini) => ({ iniciativa: ini, passivas: [{ id: 1, efeitos: [ef('desvantagem_atacante', 1, { quando: 'em_combate' })] }] });
        expect(desvantagemImpostaAoAtacante(f(0))).toBe(0);
        expect(desvantagemImpostaAoAtacante(f(12))).toBe(1);
        expect(ATRIBUTOS_COM_QUANDO).toContain('desvantagem_atacante');
    });
    it('quando alvo_com_estado olha o atacante (o "outro lado")', () => {
        const f = { passivas: [{ id: 1, efeitos: [ef('desvantagem_atacante', 1, { quando: 'alvo_com_estado:surpreso' })] }] };
        expect(desvantagemImpostaAoAtacante(f, { condicoes: [{ id: 'surpreso', stacks: 1 }] })).toBe(1);
        expect(desvantagemImpostaAoAtacante(f, {})).toBe(0);
    });

    describe('na rolagem de acerto', () => {
        const defensor = (n) => base({ passivas: [{ id: 1, efeitos: [ef('desvantagem_atacante', n)] }] });
        it('sem efeito nada muda: 1 d20, sem texto extra', () => {
            const r = acerto(base(), alvoPersonagem(base()));
            expect(r.desvantagemDoAlvo).toBeUndefined();
            expect(r.rolagem).not.toContain('DESVANTAGEM');
            expect(r.profBonusTexto).not.toContain('desvantagem');
        });
        it('Dummie (sem ficha) nao impoe nada', () => {
            const r = acerto(base(), { nome: 'Saco', valorDefesa: 10 });
            expect(r.desvantagemDoAlvo).toBeUndefined();
            expect(r.rolagem).not.toContain('DESVANTAGEM');
        });
        it('dupla desvantagem rola 3 d20 e fica com o menor', () => {
            sequencia([0.9, 0.5, 0.1]); // 19, 11, 3
            const r = acerto(base(), alvoPersonagem(defensor(2)));
            expect(r.desvantagemDoAlvo).toBe(2);
            expect(r.rolagem).toContain('DESVANTAGEM');
            expect(r.dadoNatural).toBe(3);
            expect(r.profBonusTexto).toContain('Alvo impõe 2 dado(s) de desvantagem');
        });
        it('soma a desvantagem que o proprio atacante ja tinha (marcada na mao)', () => {
            sequencia([0.9, 0.5, 0.1]);
            const r = acerto(base(), alvoPersonagem(defensor(1)), { desvantagens: 1 }); // 1 + 1 = 2 dados extras => 3 d20
            expect(r.rolagem.match(/<strong>|<strike/g)).toHaveLength(3);
            expect(r.dadoNatural).toBe(3);
        });
        it('desvantagem do alvo cancela vantagem do atacante um por um', () => {
            sequencia([0.9]);
            const r = acerto(base(), alvoPersonagem(defensor(1)), { vantagens: 1 });
            expect(r.rolagem).not.toContain('VANTAGEM');
            expect(r.rolagem).not.toContain('DESVANTAGEM');
        });
    });
});

describe('mult_critico e mult_critico_fatal', () => {
    Object.entries(fontes(ef('mult_critico', 1))).forEach(([nome, f]) => {
        it(`fonte: ${nome} soma 1`, () => expect(multiplicadoresCriticoExtra(f)).toEqual({ normal: 1, fatal: 0 }));
    });
    it('fatal separado, fracao somada, negativo ignorado, teto 100', () => {
        const f = { passivas: [{ id: 1, efeitos: [ef('mult_critico', 0.5), ef('mult_critico', '1.5'), ef('mult_critico', -4), ef('mult_critico_fatal', 3), ef('mult_critico_fatal', 'x')] }] };
        expect(multiplicadoresCriticoExtra(f)).toEqual({ normal: 2, fatal: 3 });
        expect(multiplicadoresCriticoExtra({ passivas: [{ id: 1, efeitos: [ef('mult_critico', 500)] }] }).normal).toBe(100);
        expect(multiplicadoresCriticoExtra(null)).toEqual({ normal: 0, fatal: 0 });
    });

    describe('no dano', () => {
        const ficha = (efeitos = [], extra = {}) => ({
            armaEspiritual: { acessoArma: true, nome: 'Excalibur', danoBase: '10d8' },
            forca: { ...attr(0), nome: 'Força' }, destreza: { ...attr(0), nome: 'Destreza' }, sabedoria: { ...attr(0), nome: 'Sabedoria' }, bio: {},
            passivas: [{ id: 1, efeitos }], ...extra,
        });
        const dano = (f, crit = {}) => {
            vi.spyOn(Math, 'random').mockReturnValue(0.5);
            return calcularDano({ minhaFicha: f, configArma: null, configHabilidades: [], itensEquipados: [], isCriticoNormal: false, isCriticoFatal: false, ...crit });
        };
        it('sem critico o efeito nao muda nada', () => {
            expect(dano(ficha([ef('mult_critico', 5), ef('mult_critico_fatal', 5)])).dano).toBe(dano(ficha()).dano);
        });
        it('Critico passa de x2 para x3 e o Fatal de x4 para x7', () => {
            const semEfeito = dano(ficha(), { isCriticoNormal: true });
            const normal = dano(ficha([ef('mult_critico', 1)]), { isCriticoNormal: true });
            expect(semEfeito.detalheConta).toContain('x2');
            expect(normal.dano / semEfeito.dano).toBeCloseTo(1.5, 1);
            expect(normal.detalheConta).toContain('x3');
            const fatalBase = dano(ficha(), { isCriticoFatal: true });
            const fatal = dano(ficha([ef('mult_critico_fatal', 3)]), { isCriticoFatal: true });
            expect(fatal.dano / fatalBase.dano).toBeCloseTo(7 / 4, 1);
            expect(fatal.detalheConta).toContain('x7');
        });
        it('mult_critico nao afeta o Fatal e vice-versa', () => {
            expect(dano(ficha([ef('mult_critico', 10)]), { isCriticoFatal: true }).dano).toBe(dano(ficha(), { isCriticoFatal: true }).dano);
            expect(dano(ficha([ef('mult_critico_fatal', 10)]), { isCriticoNormal: true }).dano).toBe(dano(ficha(), { isCriticoNormal: true }).dano);
        });
        it('Assassin soma sobre a base dele (x3 vira x4)', () => {
            const f = ficha([ef('mult_critico', 1)], { bio: { classe: 'Assassin' } });
            expect(dano(f, { isCriticoNormal: true }).detalheConta).toContain('x4');
        });
        it('multiplicador fracionario aparece com casas (x2.5)', () => {
            expect(dano(ficha([ef('mult_critico', 0.5)]), { isCriticoNormal: true }).detalheConta).toContain('x2.5');
        });
    });
});

describe('acerto_automatico', () => {
    Object.entries(fontes(ef('acerto_automatico'))).forEach(([nome, f]) => {
        it(`fonte: ${nome}`, () => expect(temAcertoAutomatico(f)).toBe(true));
    });
    it('sem efeito, valor 0/negativo ou poder desligado nao garantem', () => {
        expect(temAcertoAutomatico({})).toBe(false);
        expect(temAcertoAutomatico(null)).toBe(false);
        expect(temAcertoAutomatico({ passivas: [{ id: 1, efeitos: [ef('acerto_automatico', 0), ef('acerto_automatico', -1)] }] })).toBe(false);
        expect(temAcertoAutomatico({ poderes: [{ id: 1, ativa: false, efeitos: [ef('acerto_automatico')] }] })).toBe(false);
    });
    it('quando alvo_com_estado so vale contra alvo com o estado', () => {
        const f = { passivas: [{ id: 1, efeitos: [ef('acerto_automatico', 1, { quando: 'alvo_com_estado:surpreso' })] }] };
        expect(temAcertoAutomatico(f, { condicoes: [{ id: 'surpreso', stacks: 1 }] })).toBe(true);
        expect(temAcertoAutomatico(f, {})).toBe(false);
        expect(temAcertoAutomatico(f, null)).toBe(false);
        expect(ATRIBUTOS_COM_QUANDO).toContain('acerto_automatico');
    });
    it('resolverAcertoNoAlvo: defesa altissima, acerto baixo e ate 1 natural acertam', () => {
        const comum = { nome: 'Alvo', defesa: 999999, acertoTotal: 3, poderAtacante: 1, poderAlvo: 1 };
        expect(resolverAcertoNoAlvo(comum).acertou).toBe(false);
        const auto = resolverAcertoNoAlvo({ ...comum, acertoAutomatico: true });
        expect(auto.acertou).toBe(true);
        expect(auto.automatico).toBe(true);
        expect(resolverAcertoNoAlvo({ ...comum, naturalD20: 1, acertoAutomatico: true }).acertou).toBe(true);
        expect(marcaNaturalAcerto(auto)).toContain('acerto automático');
        expect(marcaNaturalAcerto(resolverAcertoNoAlvo(comum))).toBe('');
    });
    it('calcularAcerto sinaliza o acerto automatico no resultado e no texto do feed; sem efeito nao sinaliza', () => {
        const comEfeito = base({ passivas: [{ id: 1, efeitos: [ef('acerto_automatico')] }] });
        const r = acerto(comEfeito, { nome: 'Saco', valorDefesa: 99999 });
        expect(r.acertoAutomatico).toBe(true);
        expect(r.profBonusTexto).toContain('acerto automático');
        const sem = acerto(base(), { nome: 'Saco', valorDefesa: 99999 });
        expect(sem.acertoAutomatico).toBeUndefined();
        expect(sem.profBonusTexto).not.toContain('automático');
    });
    it('o efeito nao cria critico: o d20 natural segue valendo', () => {
        sequencia([0.1]); // d20 = 3
        const r = acerto(base({ passivas: [{ id: 1, efeitos: [ef('acerto_automatico')] }] }), { nome: 'Saco' });
        expect(r.dadoNatural).toBe(3);
    });
    it('quando condicionado, o resultado "Geral" (area) nao depende do alvo', () => {
        const f = base({ passivas: [{ id: 1, efeitos: [ef('acerto_automatico', 1, { quando: 'alvo_com_estado:surpreso' })] }] });
        const r = acerto(f, { nome: 'X', condicoes: [{ id: 'surpreso', stacks: 1 }] });
        expect(r.acertoAutomatico).toBe(true);
        expect(r.acertoAutomaticoGeral).toBeUndefined();
    });
});

describe('registro dos atributos', () => {
    const novos = ['desvantagem_atacante', 'mult_critico', 'mult_critico_fatal', 'acerto_automatico'];
    it('estao no grupo de rolagens/critico e em ATRIBUTOS_EFEITO (Sexta-Feira)', () => {
        const g = ATRIBUTOS_AGRUPADOS.find(x => x.label.includes('ROLAGENS'));
        novos.forEach(a => expect(g.options).toContain(a));
        novos.forEach(a => expect(ATRIBUTOS_EFEITO).toContain(a));
    });
    it('aparecem tambem nas listas sem estado (Arsenal, Formas, Pactos) e so aceitam base', () => {
        const planos = ATRIBUTOS_AGRUPADOS_SEM_ESTADO.flatMap(g => g.options);
        novos.forEach(a => { expect(planos).toContain(a); expect(getPropriedadesDoAtributo(a)).toEqual(['base']); });
    });
    it('nao escalam com o estagio', () => {
        escalarPorFator(novos.map(a => ef(a, 2)), 3).forEach(e => expect(e.valor).toBe(2));
    });
    it('normalizarPoder mantem os efeitos; "quando" so nos que aceitam', () => {
        const r = normalizarPoder({ nome: 'P', efeitos: [
            ef('desvantagem_atacante', 2, { quando: 'em_combate' }), ef('mult_critico', 1), ef('mult_critico_fatal', 3), ef('acerto_automatico', 1, { quando: 'em_combate' }),
        ] });
        expect(r.objeto.efeitos.map(e => e.atributo)).toEqual(['desvantagem_atacante', 'mult_critico', 'mult_critico_fatal', 'acerto_automatico']);
        expect(r.objeto.efeitos[0].quando).toBe('em_combate');
        const sem = normalizarPoder({ nome: 'P', efeitos: [ef('mult_critico', 1, { quando: 'em_combate' })] });
        expect(sem.objeto.efeitos).toHaveLength(0); // sem suporte a "quando": descartado (falha fechada)
    });
    it('o prompt do importador conhece os quatro ids', () => {
        const p = montarPromptImportacao('texto');
        novos.forEach(a => expect(p).toContain(a));
        expect(p).toContain('dupla desvantagem');
    });
});

describe('aplicarDesvantagemDoAlvo (golpe em area no Mapa)', () => {
    it('com false, a desvantagem imposta pelo personagem-alvo nao entra no d20 unico', () => {
        const defensor = base({ passivas: [{ id: 1, efeitos: [ef('desvantagem_atacante', 2)] }] });
        sequencia([0.9]);
        const r = acerto(base(), alvoPersonagem(defensor), { aplicarDesvantagemDoAlvo: false });
        expect(r.desvantagemDoAlvo).toBeUndefined();
        expect(r.rolagem).not.toContain('DESVANTAGEM');
        expect(r.profBonusTexto).not.toContain('desvantagem');
        const unico = acerto(base(), alvoPersonagem(defensor));
        expect(unico.desvantagemDoAlvo).toBe(2);
    });
    it('o acerto automatico por alvo segue valendo mesmo sem a desvantagem', () => {
        const atacante = base({ passivas: [{ id: 1, efeitos: [ef('acerto_automatico')] }] });
        expect(acerto(atacante, alvoPersonagem(base()), { aplicarDesvantagemDoAlvo: false }).acertoAutomatico).toBe(true);
    });
});
