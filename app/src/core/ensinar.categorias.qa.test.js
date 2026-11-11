import { describe, it, expect } from 'vitest';
import { montarOferta, aceitarOferta, motivoRecusaOferta, ofertasRecebidas } from './ensinar';
import { MENSAGEM_SINGULARIDADE_NAO_COPIA } from './categoriasPoder';

const base = (categoria, extra = {}) => ({ id: 9, nome: 'X', categoria, ...extra });
const ofertaDe = (item, id = 'o1', nivel = 60) => ({ id, de: 'Mestre', tipo: 'poder', nivel, em: 1, item });
const fichaAluno = (hier = {}, extra = {}) => ({ hierarquia: hier, poderes: [], ensinamentos: {}, ...extra });
const comOferta = (f, o) => { f.ensinamentos[o.id] = o; return f; };

describe('montarOferta com categorias', () => {
    it('recusa Singularidade com a mensagem exata', () => {
        const r = montarOferta({ professor: 'Ana', tipo: 'poder', item: base('singularidade') });
        expect(r.ok).toBe(false);
        expect(r.erro).toBe('Singularidade é impossível de copiar ou ensinar (regra absoluta da Hierarquia da Alma).');
        expect(r.erro).toBe(MENSAGEM_SINGULARIDADE_NAO_COPIA);
    });
    it('recusa Singularidade em plural/zero-width/caixa', () => {
        ['Singularidades', 'SINGULARIDADE', 'singularidade​'].forEach((c) => {
            expect(montarOferta({ professor: 'Ana', tipo: 'poder', item: base(c) }).ok).toBe(false);
        });
    });
    it('Infinity e Ocular sao copiaveis', () => {
        ['infinity', 'ocular', 'habilidade', 'forma', 'poder'].forEach((c) => {
            const r = montarOferta({ professor: 'Ana', tipo: 'poder', item: base(c), nivel: 30 });
            expect(r.ok).toBe(true);
            expect(r.oferta.item.categoria).toBe(c);
            expect(r.oferta.nivel).toBe(30);
        });
    });
    it('tecnica com categoria singularidade (campo estranho) nao e bloqueada', () => {
        expect(montarOferta({ professor: 'Ana', tipo: 'tecnica', item: base('singularidade') }).ok).toBe(true);
    });
});

describe('aceitarOferta', () => {
    it('Singularidade forjada: descarta a oferta e nao cria nada', () => {
        const o = ofertaDe(base('singularidade'));
        const f = comOferta(fichaAluno({ singularidade: '3' }), o);
        expect(aceitarOferta(f, o, 77)).toBeNull();
        expect(f.poderes).toHaveLength(0);
        expect(f.ensinamentos.o1).toBeUndefined();
    });
    it('Singularidade forjada em plural tambem e descartada', () => {
        const o = ofertaDe(base('Singularidades'));
        const f = comOferta(fichaAluno({ singularidade: '3' }), o);
        expect(aceitarOferta(f, o, 1)).toBeNull();
        expect(f.poderes).toHaveLength(0);
        expect(f.ensinamentos.o1).toBeUndefined();
    });
    it.each(['ocular', 'infinity'])('%s NAO liberada no aluno: null, nada criado e oferta permanece', (cat) => {
        const o = ofertaDe(base(cat));
        const f = comOferta(fichaAluno({}), o);
        expect(aceitarOferta(f, o, 5)).toBeNull();
        expect(f.poderes).toHaveLength(0);
        expect(f.ensinamentos.o1).toBeDefined();
        expect(ofertasRecebidas(f, 'poder')).toHaveLength(1);
        expect(motivoRecusaOferta(f, o)).not.toBe('');
    });
    it('aluno sem hierarquia nenhuma: tambem nao recebe, sem lancar', () => {
        const o = ofertaDe(base('ocular'));
        const f = { poderes: [], ensinamentos: { o1: o } };
        expect(() => aceitarOferta(f, o, 5)).not.toThrow();
        expect(f.poderes).toHaveLength(0);
        expect(f.ensinamentos.o1).toBeDefined();
    });
    it('depois de liberar, aceita: cria com maestria = nivel, categoria e origem; remove a oferta', () => {
        const o = ofertaDe(base('ocular', { notasIA: 'nota' }), 'o1', 45);
        const f = comOferta(fichaAluno({}), o);
        expect(aceitarOferta(f, o, 5)).toBeNull();
        f.hierarquia.ocular = true;
        const item = aceitarOferta(f, o, 6);
        expect(item).toMatchObject({ id: 6, categoria: 'ocular', maestria: 45, ensinadoPor: 'Mestre' });
        expect(item.notasIA).toContain('Aprendido com Mestre');
        expect(f.poderes).toHaveLength(1);
        expect(f.ensinamentos.o1).toBeUndefined();
    });
    it('Infinity liberada e copiavel (maestria do nivel)', () => {
        const o = ofertaDe(base('infinity'), 'o2', 100);
        const f = comOferta(fichaAluno({ infinity: true }), o);
        const item = aceitarOferta(f, o, 8);
        expect(item.categoria).toBe('infinity');
        expect(item.maestria).toBe(100);
    });
    it('aluno com singularidade liberada nao muda a regra de copia', () => {
        const o = ofertaDe(base('singularidade'));
        const f = comOferta(fichaAluno({ singularidade: '1' }), o);
        expect(aceitarOferta(f, o, 1)).toBeNull();
        expect(f.poderes).toHaveLength(0);
    });
    it('Forma nao exige liberacao e ganha fadigaPorUso', () => {
        const o = ofertaDe(base('forma'));
        const f = comOferta(fichaAluno({}), o);
        const item = aceitarOferta(f, o, 2);
        expect(item.fadigaPorUso).toBe(0);
        expect(item.maestria).toBe(60);
    });
    it('oferta ja removida nao duplica', () => {
        const o = ofertaDe(base('habilidade'));
        const f = fichaAluno({});
        expect(aceitarOferta(f, o, 1)).toBeNull();
    });
    it('nivel e limitado a 0-100', () => {
        const o = ofertaDe(base('infinity'), 'o3', 999);
        const f = comOferta(fichaAluno({ infinity: true }), o);
        expect(aceitarOferta(f, o, 1).maestria).toBe(100);
    });
    it('motivoRecusaOferta: tecnica, null e item ausente = ""', () => {
        expect(motivoRecusaOferta({}, null)).toBe('');
        expect(motivoRecusaOferta({}, { tipo: 'tecnica', item: base('ocular') })).toBe('');
        expect(motivoRecusaOferta({}, { tipo: 'poder' })).toBe('');
    });
});
