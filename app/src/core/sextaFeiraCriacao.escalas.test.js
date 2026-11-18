import { describe, it, expect } from 'vitest';
import { normalizarPoder, normalizarProposta } from './sextaFeiraCriacao';
import { rascunhoVazio, completarRascunho, rascunhoDoPoder, resumirSecoes } from './rascunhoPoder';

const CONT = [{ id: 'c1', nome: 'Carga Acumulada' }, { id: 'c2', nome: 'Fúria' }];
const poder = (extra = {}, opc = { contadores: CONT }) => normalizarPoder({ nome: 'X', categoria: 'habilidade', ...extra }, opc);
const ef = (extra = {}) => ({ nome: 'E', atributo: 'forca', propriedade: 'base', valor: 5, ...extra });

describe('Sexta-Feira: cobrarAoAtivar', () => {
    const custo = { custoPorTurno: { modo: 'fixo', valor: 5, energia: 'mana' } };
    it('true com custoPorTurno valido persiste', () => {
        expect(poder({ ...custo, cobrarAoAtivar: true }).objeto.cobrarAoAtivar).toBe(true);
    });
    it('sem custoPorTurno, ou valor nao booleano true: nao cria o campo', () => {
        expect('cobrarAoAtivar' in poder({ cobrarAoAtivar: true }).objeto).toBe(false);
        ['true', 1, 'sim', false, null, undefined].forEach(v => expect('cobrarAoAtivar' in poder({ ...custo, cobrarAoAtivar: v }).objeto).toBe(false));
    });
    it('poder antigo sem o campo permanece intacto', () => {
        const { objeto } = poder({ ...custo });
        expect('cobrarAoAtivar' in objeto).toBe(false);
        expect(objeto.custoPorTurno).toBeTruthy();
    });
});

describe('Sexta-Feira: escalaContador', () => {
    it('id existente', () => {
        const { objeto } = poder({ efeitos: [ef({ escalaContador: { contadorId: 'c1', fator: 2 } })] });
        expect(objeto.efeitos[0].escalaContador).toEqual({ contadorId: 'c1', fator: 2 });
    });
    it('nome do contador (sem acento/caixa) mapeado para id; fator string numerica', () => {
        const { objeto } = poder({ efeitos: [ef({ escalaContador: { contadorId: 'furia', fator: '1.5' } })], efeitosPassivos: [ef({ atributo: 'evasiva', escalaContador: { contadorId: 'CARGA ACUMULADA', fator: -1 } })] });
        expect(objeto.efeitos[0].escalaContador).toEqual({ contadorId: 'c2', fator: 1.5 });
        expect(objeto.efeitosPassivos[0].escalaContador).toEqual({ contadorId: 'c1', fator: -1 });
    });
    it('contador inexistente: descartado com aviso, efeito mantido', () => {
        const { objeto, avisos } = poder({ efeitos: [ef({ escalaContador: { contadorId: 'nada', fator: 2 } })] });
        expect(objeto.efeitos).toHaveLength(1);
        expect('escalaContador' in objeto.efeitos[0]).toBe(false);
        expect(avisos.join(' ')).toMatch(/contador/i);
    });
    it('sem lista de contadores (nenhuma opcao) = descartado', () => {
        const { objeto } = normalizarPoder({ nome: 'X', efeitos: [ef({ escalaContador: { contadorId: 'c1', fator: 2 } })] });
        expect('escalaContador' in objeto.efeitos[0]).toBe(false);
    });
    it.each([[0], [1e7], [-1e7], [Infinity], [NaN], ['abc'], [undefined]])('fator absurdo %s descartado com aviso', (fator) => {
        const { objeto, avisos } = poder({ efeitos: [ef({ escalaContador: { contadorId: 'c1', fator } })] });
        expect('escalaContador' in objeto.efeitos[0]).toBe(false);
        expect(avisos.length).toBeGreaterThan(0);
    });
    it('__proto__ como contadorId nao polui nem passa', () => {
        const bruto = JSON.parse('{"nome":"X","efeitos":[{"atributo":"forca","valor":1,"escalaContador":{"contadorId":"__proto__","fator":2}}]}');
        const { objeto } = normalizarPoder(bruto, { contadores: CONT });
        expect('escalaContador' in objeto.efeitos[0]).toBe(false);
        expect({}.fator).toBeUndefined();
        const b2 = JSON.parse('{"nome":"X","efeitos":[{"atributo":"forca","valor":1,"__proto__":{"escalaContador":{"contadorId":"c1","fator":9}}}]}');
        expect('escalaContador' in normalizarPoder(b2, { contadores: CONT }).objeto.efeitos[0]).toBe(false);
        expect({}.escalaContador).toBeUndefined();
    });
    it('escalaContador nao objeto e ignorado', () => {
        ['x', 5, null, []].forEach((v) => {
            const { objeto } = poder({ efeitos: [ef({ escalaContador: v })] });
            expect('escalaContador' in objeto.efeitos[0]).toBe(false);
        });
    });
    it('dado de dano nao escala', () => {
        const { objeto } = poder({ efeitos: [{ atributo: 'dano_dados', valor: '2d6', escalaContador: { contadorId: 'c1', fator: 2 }, escalaAliados: { fator: 1 } }] });
        expect(objeto.efeitos[0].valor).toBe('2d6');
        expect('escalaContador' in objeto.efeitos[0]).toBe(false);
        expect('escalaAliados' in objeto.efeitos[0]).toBe(false);
    });
    it('poder antigo sem os campos: efeito identico ao antigo', () => {
        const { objeto } = poder({ efeitos: [ef()] });
        expect(Object.keys(objeto.efeitos[0]).sort()).toEqual(['atributo', 'nome', 'propriedade', 'valor']);
    });
    it('via normalizarProposta aceita os contadores da ficha', () => {
        const r = normalizarProposta('poder', { nome: 'X', efeitos: [ef({ escalaContador: { contadorId: 'Fúria', fator: 3 } })] }, { contadores: CONT });
        expect(r.objeto.efeitos[0].escalaContador).toEqual({ contadorId: 'c2', fator: 3 });
    });
});

describe('Sexta-Feira: escalaAliados e valeParaAliados', () => {
    it('escalaAliados valida, com filtro normalizado', () => {
        const { objeto } = poder({ efeitos: [ef({ escalaAliados: { fator: 2, filtro: 'Raca=Elfo' } }), ef({ escalaAliados: { fator: '1.5' } })] });
        expect(objeto.efeitos[0].escalaAliados).toEqual({ fator: 2, filtro: 'raca=elfo' });
        expect(objeto.efeitos[1].escalaAliados).toEqual({ fator: 1.5 });
    });
    it('filtro invalido ou fator invalido: ignora so a escala, com aviso', () => {
        const ruins = [{ fator: 2, filtro: 'cor=azul' }, { fator: 0 }, { fator: 1e9 }, { fator: 'x' }, { fator: NaN }];
        ruins.forEach((esc) => {
            const { objeto, avisos } = poder({ efeitos: [ef({ escalaAliados: esc })] });
            expect(objeto.efeitos).toHaveLength(1);
            expect('escalaAliados' in objeto.efeitos[0]).toBe(false);
            expect(avisos.join(' ')).toMatch(/aliado/i);
        });
    });
    it('valeParaAliados so em atributo de ataque e so com true', () => {
        const { objeto, avisos } = poder({ efeitos: [
            { atributo: 'dano_dados', valor: '1d6', valeParaAliados: true },
            ef({ atributo: 'acerto', valeParaAliados: true }),
            ef({ atributo: 'forca', valeParaAliados: true }),
            ef({ atributo: 'acerto', valeParaAliados: 'true' }),
        ] });
        expect(objeto.efeitos[0].valeParaAliados).toBe(true);
        expect(objeto.efeitos[1].valeParaAliados).toBe(true);
        expect('valeParaAliados' in objeto.efeitos[2]).toBe(false);
        expect(avisos.join(' ')).toMatch(/não vale para aliados/);
        expect('valeParaAliados' in objeto.efeitos[3]).toBe(false);
    });
    it('condicao aliados_em_campo no efeito: valida e invalida', () => {
        const ok = poder({ efeitos: [ef({ atributo: 'acerto', quando: 'aliados_em_campo:2:Classe=Mago' })] }).objeto.efeitos;
        expect(ok[0].quando).toBe('aliados_em_campo:2:classe=mago');
        const ruim = poder({ efeitos: [ef({ atributo: 'acerto', quando: 'aliados_em_campo:0' })] });
        expect(ruim.objeto.efeitos).toHaveLength(0);
        expect(ruim.avisos.length).toBeGreaterThan(0);
    });
    it('evento armaTrocada em gatilho da Sexta-Feira', () => {
        const { objeto } = poder({ gatilhos: [{ nome: 'T', evento: { tipo: 'armaTrocada', armaTipo: 'Espada' }, acoes: [{ tipo: 'mensagem', texto: 'oi' }] }] });
        expect(objeto.gatilhos[0].evento).toEqual({ tipo: 'armaTrocada', armaTipo: 'espada' });
    });
});

describe('Rascunho: novoEscala / novoEscalaPassivo', () => {
    const vazia = { contadorId: '', fator: '', aliFator: '', aliTipo: '', aliValor: '', paraAliados: false };
    it('rascunhoVazio tem os campos de escala e cobrarAoAtivar=false', () => {
        const r = rascunhoVazio();
        expect(r.novoEscala).toEqual(vazia);
        expect(r.novoEscalaPassivo).toEqual(vazia);
        expect(r.cobrarAoAtivar).toBe(false);
    });
    it('instancias independentes entre rascunhos', () => {
        const a = rascunhoVazio(); const b = rascunhoVazio();
        a.novoEscala.fator = '9';
        expect(b.novoEscala.fator).toBe('');
        expect(a.novoEscalaPassivo).not.toBe(a.novoEscala);
    });
    it('completarRascunho persiste valores e completa campos faltantes', () => {
        const r = completarRascunho({ novoEscala: { contadorId: 'c1', fator: '2' }, novoEscalaPassivo: { paraAliados: true } });
        expect(r.novoEscala).toEqual({ ...vazia, contadorId: 'c1', fator: '2' });
        expect(r.novoEscalaPassivo).toEqual({ ...vazia, paraAliados: true });
    });
    it('completarRascunho com rascunho antigo (sem os campos) ou lixo', () => {
        [{}, null, undefined, 'x', 5].forEach((v) => {
            const r = completarRascunho(v);
            expect(r.novoEscala).toEqual(vazia);
            expect(r.novoEscalaPassivo).toEqual(vazia);
        });
        expect(completarRascunho({ novoEscala: null }).novoEscala).toEqual(vazia);
    });
    it('completarRascunho nao compartilha referencia com a entrada', () => {
        const entrada = { novoEscala: { contadorId: 'c1' } };
        const r = completarRascunho(entrada);
        r.novoEscala.fator = '5';
        expect(entrada.novoEscala.fator).toBeUndefined();
    });
    it('rascunhoDoPoder carrega cobrarAoAtivar so quando true', () => {
        const p = { id: 'p', nome: 'X', custoPorTurno: { modo: 'fixo', valor: 5, energia: 'mana' } };
        expect(rascunhoDoPoder({ ...p, cobrarAoAtivar: true }, []).cobrarAoAtivar).toBe(true);
        expect(rascunhoDoPoder(p, []).cobrarAoAtivar).toBe(false);
        expect(rascunhoDoPoder({ ...p, cobrarAoAtivar: 'true' }, []).cobrarAoAtivar).toBe(false);
    });
    it('resumo da secao avancada cita custo ao ativar', () => {
        const r = rascunhoDoPoder({ id: 'p', nome: 'X', custoPorTurno: { modo: 'fixo', valor: 5, energia: 'mana' }, cobrarAoAtivar: true }, []);
        const r2 = rascunhoDoPoder({ id: 'p', nome: 'X', custoPorTurno: { modo: 'fixo', valor: 5, energia: 'mana' } }, []);
        expect(JSON.stringify(resumirSecoes(r))).toMatch(/custo por turno e ao ativar/);
        expect(JSON.stringify(resumirSecoes(r2))).not.toMatch(/ao ativar/);
    });
});

describe('Importador de IA', () => {
    it('prepararItemImportado preserva cobrarAoAtivar e valeParaAliados; antigo segue igual', async () => {
        const { prepararItemImportado } = await import('./importadorIA');
        const r = prepararItemImportado({ nome: 'X', categoria: 'habilidade', custoPorTurno: { modo: 'fixo', valor: 5, energia: 'mana' }, cobrarAoAtivar: true, efeitos: [{ atributo: 'acerto', propriedade: 'base', valor: 2, valeParaAliados: true }] });
        const obj = r.objeto || r.dados || r;
        expect(JSON.stringify(obj)).toMatch(/cobrarAoAtivar/);
        expect(JSON.stringify(obj)).toMatch(/valeParaAliados/);
        const antigo = prepararItemImportado({ nome: 'Y', categoria: 'habilidade', efeitos: [{ atributo: 'forca', propriedade: 'base', valor: 2 }] });
        expect(JSON.stringify(antigo)).not.toMatch(/cobrarAoAtivar|valeParaAliados|escala/);
    });
});
